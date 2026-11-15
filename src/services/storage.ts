import JSZip from 'jszip';
import type { Asset, Project } from '../types/project';
import { createId } from '../constants/presets';

const DB_NAME = 'anicut_2d_db';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_ASSETS = 'assets';
const STORE_SETTINGS = 'settings';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_ASSETS)) {
        db.createObjectStore(STORE_ASSETS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Projects
export async function listProjects(): Promise<Project[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_PROJECTS, 'readonly');
  const all = await idbReq(tx.objectStore(STORE_PROJECTS).getAll());
  return (all as Project[]).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<Project | undefined> {
  const db = await openDB();
  const tx = db.transaction(STORE_PROJECTS, 'readonly');
  return idbReq(tx.objectStore(STORE_PROJECTS).get(id));
}

export async function saveProject(project: Project): Promise<Project> {
  const db = await openDB();
  const updated: Project = { ...project, updatedAt: Date.now() };
  const tx = db.transaction(STORE_PROJECTS, 'readwrite');
  await idbReq(tx.objectStore(STORE_PROJECTS).put(updated));
  return updated;
}

export async function duplicateProject(id: string): Promise<Project | undefined> {
  const existing = await getProject(id);
  if (!existing) return undefined;
  const now = Date.now();
  const copy: Project = {
    ...structuredClone(existing),
    id: createId('proj'),
    name: `${existing.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
  };
  return saveProject(copy);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_PROJECTS, 'readwrite');
  await idbReq(tx.objectStore(STORE_PROJECTS).delete(id));
}

// Assets
export async function listAssets(): Promise<Asset[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_ASSETS, 'readonly');
  const all = await idbReq(tx.objectStore(STORE_ASSETS).getAll());
  return (all as Asset[]).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getAsset(id: string): Promise<Asset | undefined> {
  const db = await openDB();
  const tx = db.transaction(STORE_ASSETS, 'readonly');
  return idbReq(tx.objectStore(STORE_ASSETS).get(id));
}

export async function saveAsset(asset: Asset): Promise<Asset> {
  const db = await openDB();
  const tx = db.transaction(STORE_ASSETS, 'readwrite');
  await idbReq(tx.objectStore(STORE_ASSETS).put(asset));
  return asset;
}

export async function updateAsset(id: string, patch: Partial<Asset>): Promise<Asset | undefined> {
  const existing = await getAsset(id);
  if (!existing) return undefined;
  const updated = { ...existing, ...patch };
  return saveAsset(updated);
}

export async function deleteAsset(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_ASSETS, 'readwrite');
  await idbReq(tx.objectStore(STORE_ASSETS).delete(id));
}

// App Settings
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await openDB();
  const tx = db.transaction(STORE_SETTINGS, 'readonly');
  const rec = await idbReq(tx.objectStore(STORE_SETTINGS).get(key));
  return rec ? (rec.value as T) : fallback;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_SETTINGS, 'readwrite');
  await idbReq(tx.objectStore(STORE_SETTINGS).put({ key, value }));
}

// Complete Project Backup (.anicut.zip) preserving imported media assets, animation data & timeline
export async function exportProjectBackup(project: Project): Promise<Blob> {
  const zip = new JSZip();
  const allAssets = await listAssets();
  const referencedIds = new Set(
    project.clips.map((c) => c.assetId).filter((id): id is string => Boolean(id))
  );

  const usedAssets = allAssets.filter((a) => referencedIds.has(a.id));
  const assetsMeta = usedAssets.map(({ blob: _blob, ...rest }) => rest);

  zip.file('project.json', JSON.stringify(project, null, 2));
  zip.file('assets_manifest.json', JSON.stringify(assetsMeta, null, 2));

  const mediaFolder = zip.folder('media');
  if (mediaFolder) {
    for (const asset of usedAssets) {
      mediaFolder.file(asset.id, asset.blob);
    }
  }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function importProjectBackup(file: File): Promise<Project> {
  const zip = await JSZip.loadAsync(file);
  const projectFile = zip.file('project.json');
  if (!projectFile) {
    throw new Error('Invalid backup archive: missing project.json');
  }

  const rawProject = JSON.parse(await projectFile.async('string')) as Project;
  const manifestFile = zip.file('assets_manifest.json');
  const idMap = new Map<string, string>();

  if (manifestFile) {
    const assetsMeta = JSON.parse(await manifestFile.async('string')) as Omit<Asset, 'blob'>[];
    for (const meta of assetsMeta) {
      const mediaFile = zip.file(`media/${meta.id}`);
      if (!mediaFile) continue;
      const arrayBuf = await mediaFile.async('arraybuffer');
      const blob = new Blob([arrayBuf], { type: meta.mimeType });
      const newAssetId = meta.id; // preserve ID or keep reusable if already present
      const existing = await getAsset(newAssetId);
      if (!existing) {
        await saveAsset({ ...meta, id: newAssetId, blob });
      }
      idMap.set(meta.id, newAssetId);
    }
  }

  const now = Date.now();
  const restoredProject: Project = {
    ...rawProject,
    id: createId('proj'),
    name: `${rawProject.name} (Imported)`,
    createdAt: now,
    updatedAt: now,
    clips: rawProject.clips.map((clip) => ({
      ...clip,
      assetId: clip.assetId ? idMap.get(clip.assetId) ?? clip.assetId : undefined,
    })),
  };

  return saveProject(restoredProject);
}
