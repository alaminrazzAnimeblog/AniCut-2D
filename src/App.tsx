import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Layers, Sliders, Tv } from 'lucide-react';
import type {
  Asset,
  AssetCategory,
  Clip,
  ClipKind,
  Keyframe,
  Project,
  ShapeType,
  SpriteConfig,
  Track,
  TrackType,
} from './types/project';
import {
  DEFAULT_FILTERS,
  SHAPE_CATALOG,
  createBlankProject,
  createId,
  createSampleProject,
} from './constants/presets';
import {
  deleteAsset as dbDeleteAsset,
  deleteProject as dbDeleteProject,
  duplicateProject as dbDuplicateProject,
  exportProjectBackup,
  importProjectBackup,
  listAssets,
  listProjects,
  saveAsset,
  saveProject,
  updateAsset,
} from './services/storage';
import { importMediaFile } from './services/assetImporter';
import { mediaCache } from './engine/mediaCache';
import { audioEngine } from './engine/audioEngine';
import { useHistory } from './hooks/useHistory';
import { WelcomeScreen } from './components/WelcomeScreen';
import { TopToolbar } from './components/TopToolbar';
import { AssetLibraryPanel } from './components/AssetLibraryPanel';
import { CanvasStage } from './components/CanvasStage';
import { InspectorPanel } from './components/InspectorPanel';
import { TimelinePanel } from './components/TimelinePanel';
import { ExportModal } from './components/ExportModal';
import { SettingsModal } from './components/SettingsModal';

interface ToastState {
  type: 'info' | 'error';
  message: string;
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const {
    state: project,
    commit: commitProject,
    reset: resetProjectHistory,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useHistory<Project>(createBlankProject());

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const [onionSkin, setOnionSkin] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [autoKeyframe, setAutoKeyframe] = useState(true);

  const [showExportModal, setShowExportModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [lastSavedText, setLastSavedText] = useState('Saved locally');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [mobilePanel, setMobilePanel] = useState<'stage' | 'assets' | 'inspector'>('stage');

  const playbackRef = useRef<{
    rafId: number | null;
    startWall: number;
    startPlayhead: number;
  }>({ rafId: null, startWall: 0, startPlayhead: 0 });

  const showToast = useCallback((message: string, type: 'info' | 'error' = 'info') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  // Initial load from IndexedDB
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [loadedProjects, loadedAssets] = await Promise.all([listProjects(), listAssets()]);
        if (!mounted) return;
        setProjects(loadedProjects);
        setAssets(loadedAssets);
        await mediaCache.preloadProjectAssets(loadedAssets);
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setIsLoaded(true);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const assetMap = useMemo(() => {
    const map = new Map<string, Asset>();
    assets.forEach((a) => map.set(a.id, a));
    return map;
  }, [assets]);

  // Preload newly added assets
  useEffect(() => {
    mediaCache.preloadProjectAssets(assets).catch(() => undefined);
  }, [assets]);

  // Autosave active project to IndexedDB
  useEffect(() => {
    if (!activeProjectId) return;
    const timer = window.setTimeout(async () => {
      try {
        const saved = await saveProject(project);
        setProjects((prev) => {
          const exists = prev.some((p) => p.id === saved.id);
          const next = exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [saved, ...prev];
          return next.sort((a, b) => b.updatedAt - a.updatedAt);
        });
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setLastSavedText(`Autosaved ${timeStr}`);
      } catch {
        // ignore transient errors
      }
    }, 800);
    return () => window.clearTimeout(timer);
  }, [project, activeProjectId]);

  const stopPlayback = useCallback(() => {
    if (playbackRef.current.rafId !== null) {
      cancelAnimationFrame(playbackRef.current.rafId);
      playbackRef.current.rafId = null;
    }
    audioEngine.stop();
    setIsPlaying(false);
  }, []);

  const startPlayback = useCallback(async () => {
    const startFrom = playheadTime >= project.duration - 0.03 ? 0 : playheadTime;
    if (startFrom !== playheadTime) setPlayheadTime(startFrom);

    setIsPlaying(true);
    playbackRef.current.startWall = performance.now();
    playbackRef.current.startPlayhead = startFrom;

    await audioEngine.playFrom(project, startFrom, assetMap);

    const tick = (now: number) => {
      const elapsed = (now - playbackRef.current.startWall) / 1000;
      const nextTime = playbackRef.current.startPlayhead + elapsed;
      if (nextTime >= project.duration) {
        setPlayheadTime(project.duration);
        stopPlayback();
        return;
      }
      setPlayheadTime(nextTime);
      playbackRef.current.rafId = requestAnimationFrame(tick);
    };

    playbackRef.current.rafId = requestAnimationFrame(tick);
  }, [playheadTime, project, assetMap, stopPlayback]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }, [isPlaying, startPlayback, stopPlayback]);

  const handleSeek = useCallback(
    (time: number) => {
      const clamped = Math.max(0, Math.min(project.duration, time));
      if (isPlaying) {
        stopPlayback();
      }
      setPlayheadTime(clamped);
    },
    [isPlaying, project.duration, stopPlayback]
  );

  // Stop playback when leaving editor
  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  // Project Management Handlers
  const openProjectById = useCallback(
    async (id: string) => {
      stopPlayback();
      const found = projects.find((p) => p.id === id);
      if (!found) return;
      resetProjectHistory(structuredClone(found));
      setActiveProjectId(found.id);
      setSelectedClipId(null);
      setPlayheadTime(0);
      setLastSavedText('Loaded locally');
    },
    [projects, resetProjectHistory, stopPlayback]
  );

  const handleCreateNewProject = useCallback(
    async (name: string, width: number, height: number, fps: number) => {
      stopPlayback();
      const created = await saveProject(createBlankProject(name, width, height, fps));
      setProjects((prev) => [created, ...prev]);
      resetProjectHistory(structuredClone(created));
      setActiveProjectId(created.id);
      setSelectedClipId(null);
      setPlayheadTime(0);
      setLastSavedText('New project created');
    },
    [resetProjectHistory, stopPlayback]
  );

  const handleCreateSampleProject = useCallback(async () => {
    stopPlayback();
    const created = await saveProject(createSampleProject());
    setProjects((prev) => [created, ...prev]);
    resetProjectHistory(structuredClone(created));
    setActiveProjectId(created.id);
    setSelectedClipId(created.clips[2]?.id ?? null);
    setPlayheadTime(0.8);
    setLastSavedText('Sample project loaded');
  }, [resetProjectHistory, stopPlayback]);

  const handleSaveNow = useCallback(async () => {
    if (!activeProjectId) return;
    const saved = await saveProject(project);
    setProjects((prev) =>
      prev.map((p) => (p.id === saved.id ? saved : p)).sort((a, b) => b.updatedAt - a.updatedAt)
    );
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setLastSavedText(`Saved ${timeStr}`);
    showToast('Project saved locally to IndexedDB.');
  }, [activeProjectId, project, showToast]);

  const handleRenameProjectById = async (id: string, newName: string) => {
    const target = projects.find((p) => p.id === id);
    if (!target) return;
    const saved = await saveProject({ ...target, name: newName });
    setProjects((prev) => prev.map((p) => (p.id === id ? saved : p)));
    if (activeProjectId === id) {
      commitProject((prev) => ({ ...prev, name: newName }), false);
    }
  };

  const handleDuplicateProjectById = async (id: string) => {
    const copy = await dbDuplicateProject(id);
    if (!copy) return;
    setProjects((prev) => [copy, ...prev]);
    showToast(`Duplicated "${copy.name}".`);
  };

  const handleDeleteProjectById = async (id: string) => {
    await dbDeleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (activeProjectId === id) {
      setActiveProjectId(null);
    }
    showToast('Project deleted.');
  };

  const handleExportBackup = async (proj: Project) => {
    try {
      const blob = await exportProjectBackup(proj);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const safe = (proj.name || 'anicut-project').replace(/[^a-zA-Z0-9_-]+/g, '_');
      a.href = url;
      a.download = `${safe}.anicut.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Complete project backup exported (.anicut.zip).');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Backup export failed.', 'error');
    }
  };

  const handleImportBackup = async (file: File) => {
    try {
      const restored = await importProjectBackup(file);
      const [allProjects, allAssets] = await Promise.all([listProjects(), listAssets()]);
      setProjects(allProjects);
      setAssets(allAssets);
      resetProjectHistory(structuredClone(restored));
      setActiveProjectId(restored.id);
      setSelectedClipId(null);
      setPlayheadTime(0);
      showToast(`Imported backup "${restored.name}".`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not import backup file.', 'error');
    }
  };

  // Asset Management
  const handleImportFiles = async (
    files: FileList | File[],
    category: AssetCategory,
    spriteConfig?: SpriteConfig
  ) => {
    const list = Array.from(files);
    let addedCount = 0;
    for (const file of list) {
      try {
        const asset = await importMediaFile(file, category, spriteConfig);
        await saveAsset(asset);
        setAssets((prev) => [asset, ...prev]);
        addedCount++;
      } catch (err) {
        showToast(err instanceof Error ? err.message : `Failed to import ${file.name}`, 'error');
      }
    }
    if (addedCount > 0) {
      showToast(`Imported ${addedCount} ${addedCount === 1 ? 'asset' : 'assets'} to local library.`);
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    await dbDeleteAsset(assetId);
    mediaCache.evictAsset(assetId);
    audioEngine.evictAsset(assetId);
    setAssets((prev) => prev.filter((a) => a.id !== assetId));
    showToast('Asset removed from library.');
  };

  const handleUpdateAssetSprite = async (assetId: string, spriteConfig: SpriteConfig) => {
    const updated = await updateAsset(assetId, {
      mediaType: 'spritesheet',
      spriteConfig,
    });
    if (!updated) return;
    setAssets((prev) => prev.map((a) => (a.id === assetId ? updated : a)));
    showToast('Sprite sheet grid updated.');
  };

  // Clip Creation Helpers
  const findOrCreateTrack = (proj: Project, preferredType: TrackType): { tracks: Track[]; trackId: string } => {
    const existing = proj.tracks.find((t) => t.type === preferredType && !t.locked);
    if (existing) return { tracks: proj.tracks, trackId: existing.id };
    const newTrack: Track = {
      id: createId('trk'),
      name: `${preferredType.charAt(0).toUpperCase() + preferredType.slice(1)} Track`,
      type: preferredType,
      visible: true,
      locked: false,
      muted: false,
      order: proj.tracks.length,
    };
    return { tracks: [...proj.tracks, newTrack], trackId: newTrack.id };
  };

  const buildClipFromAsset = (
    asset: Asset,
    trackId: string,
    startTime: number,
    proj: Project
  ): Clip => {
    const kind: ClipKind =
      asset.mediaType === 'audio'
        ? 'audio'
        : asset.mediaType === 'video'
          ? 'video'
          : asset.mediaType === 'gif'
            ? 'gif'
            : asset.mediaType === 'spritesheet'
              ? 'spritesheet'
              : asset.category === 'character'
                ? 'character'
                : 'image';

    const maxW = proj.width * (asset.category === 'background' ? 1 : 0.45);
    const maxH = proj.height * (asset.category === 'background' ? 1 : 0.45);
    const natW = asset.width || 360;
    const natH = asset.height || 360;
    const scale =
      asset.category === 'background'
        ? Math.max(proj.width / natW, proj.height / natH)
        : Math.min(1, maxW / natW, maxH / natH);

    const w = Math.max(40, Math.round(natW * scale));
    const h = Math.max(40, Math.round(natH * scale));
    const duration =
      asset.mediaType === 'video' || asset.mediaType === 'audio'
        ? Math.max(1, Number((asset.duration || 5).toFixed(2)))
        : 4;

    return {
      id: createId('clip'),
      trackId,
      assetId: asset.id,
      kind,
      name: asset.name,
      startTime: Number(startTime.toFixed(2)),
      duration,
      sourceOffset: 0,
      playbackRate: 1,
      zIndex: proj.clips.length + 1,
      x: Math.round(proj.width / 2),
      y: Math.round(proj.height / 2),
      width: w,
      height: h,
      rotation: 0,
      opacity: 1,
      keyframes: [],
      fadeIn: 0,
      fadeOut: 0,
      transitionIn: 'none',
      transitionDuration: 0.4,
      motionPreset: 'none',
      filters: { ...DEFAULT_FILTERS },
      spriteOverride: asset.spriteConfig ? { ...asset.spriteConfig } : undefined,
      audioData:
        asset.mediaType === 'audio' || asset.mediaType === 'video'
          ? { volume: 1, muted: false }
          : undefined,
    };
  };

  const handleAddAssetToScene = (asset: Asset) => {
    const preferredTrack: TrackType =
      asset.mediaType === 'audio'
        ? 'audio'
        : asset.mediaType === 'video' || asset.category === 'background'
          ? 'video'
          : asset.category === 'character'
            ? 'character'
            : 'image';

    commitProject((prev) => {
      const { tracks, trackId } = findOrCreateTrack(prev, preferredTrack);
      const newClip = buildClipFromAsset(asset, trackId, playheadTime, prev);
      const nextDuration = Math.max(prev.duration, newClip.startTime + newClip.duration);
      setSelectedClipId(newClip.id);
      return {
        ...prev,
        duration: nextDuration,
        tracks,
        clips: [...prev.clips, newClip],
      };
    });
  };

  const handleDropAssetOnTrack = (assetId: string, trackId: string, startTime: number) => {
    const asset = assetMap.get(assetId);
    if (!asset) return;
    commitProject((prev) => {
      const targetTrack = prev.tracks.find((t) => t.id === trackId);
      if (!targetTrack || targetTrack.locked) return prev;
      const newClip = buildClipFromAsset(asset, trackId, startTime, prev);
      const nextDuration = Math.max(prev.duration, newClip.startTime + newClip.duration);
      setSelectedClipId(newClip.id);
      return {
        ...prev,
        duration: nextDuration,
        clips: [...prev.clips, newClip],
      };
    });
  };

  const handleAddTextPreset = (preset: 'title' | 'subtitle' | 'callout') => {
    commitProject((prev) => {
      const { tracks, trackId } = findOrCreateTrack(prev, 'text');
      const isSub = preset === 'subtitle';
      const isCallout = preset === 'callout';

      const newClip: Clip = {
        id: createId('clip'),
        trackId,
        kind: 'text',
        name: isSub ? 'Caption' : isCallout ? 'Callout' : 'Headline Title',
        startTime: Number(playheadTime.toFixed(2)),
        duration: 4,
        sourceOffset: 0,
        playbackRate: 1,
        zIndex: prev.clips.length + 1,
        x: Math.round(prev.width / 2),
        y: isSub ? Math.round(prev.height * 0.84) : Math.round(prev.height * 0.35),
        width: Math.round(prev.width * 0.65),
        height: isSub ? 80 : 120,
        rotation: 0,
        opacity: 1,
        keyframes: [],
        fadeIn: 0.25,
        fadeOut: 0.25,
        transitionIn: isCallout ? 'zoom-in' : 'fade',
        transitionDuration: 0.35,
        motionPreset: isCallout ? 'pop-in' : 'none',
        filters: { ...DEFAULT_FILTERS },
        textData: {
          content: isSub
            ? 'Subtitle caption text'
            : isCallout
              ? 'POW!'
              : 'Your Title Here',
          fontFamily: 'Plus Jakarta Sans',
          fontSize: isSub ? 32 : isCallout ? 58 : 54,
          color: isCallout ? '#FACC15' : '#FFFFFF',
          strokeColor: '#0B0E14',
          strokeWidth: 4,
          backgroundColor: isSub ? 'rgba(15, 23, 42, 0.78)' : 'transparent',
          align: 'center',
          bold: true,
          italic: false,
        },
      };
      setSelectedClipId(newClip.id);
      return {
        ...prev,
        duration: Math.max(prev.duration, newClip.startTime + newClip.duration),
        tracks,
        clips: [...prev.clips, newClip],
      };
    });
  };

  const handleAddShape = (shapeType: ShapeType) => {
    const info = SHAPE_CATALOG.find((s) => s.type === shapeType) || SHAPE_CATALOG[0];
    commitProject((prev) => {
      const { tracks, trackId } = findOrCreateTrack(prev, 'image');
      const newClip: Clip = {
        id: createId('clip'),
        trackId,
        kind: 'shape',
        name: info.label,
        startTime: Number(playheadTime.toFixed(2)),
        duration: 4,
        sourceOffset: 0,
        playbackRate: 1,
        zIndex: prev.clips.length + 1,
        x: Math.round(prev.width / 2),
        y: Math.round(prev.height / 2),
        width: shapeType === 'speech-bubble' ? 260 : 180,
        height: shapeType === 'speech-bubble' ? 150 : 180,
        rotation: 0,
        opacity: 1,
        keyframes: [],
        fadeIn: 0.2,
        fadeOut: 0.2,
        transitionIn: 'none',
        transitionDuration: 0.3,
        motionPreset: 'none',
        filters: { ...DEFAULT_FILTERS },
        shapeData: {
          shapeType,
          fillColor: info.defaultFill,
          strokeColor: info.defaultStroke,
          strokeWidth: 4,
          cornerRadius: 18,
        },
      };
      setSelectedClipId(newClip.id);
      return {
        ...prev,
        duration: Math.max(prev.duration, newClip.startTime + newClip.duration),
        tracks,
        clips: [...prev.clips, newClip],
      };
    });
  };

  // Clip Editing Actions
  const handleUpdateClip = useCallback(
    (clipId: string, updater: (c: Clip) => Clip, recordHistory = true) => {
      commitProject(
        (prev) => ({
          ...prev,
          clips: prev.clips.map((c) => (c.id === clipId ? updater(c) : c)),
        }),
        recordHistory
      );
    },
    [commitProject]
  );

  const handleTransformClipFromCanvas = useCallback(
    (
      clipId: string,
      patch: { x?: number; y?: number; width?: number; height?: number; rotation?: number },
      recordHistory: boolean
    ) => {
      commitProject((prev) => {
        return {
          ...prev,
          clips: prev.clips.map((clip) => {
            if (clip.id !== clipId) return clip;
            const shouldKey = clip.keyframes.length > 0 && autoKeyframe;
            if (!shouldKey) {
              return { ...clip, ...patch };
            }
            const localT = Math.max(0, Math.min(clip.duration, playheadTime - clip.startTime));
            const existingIdx = clip.keyframes.findIndex((k) => Math.abs(k.time - localT) < 0.08);
            if (existingIdx >= 0) {
              const nextKfs = clip.keyframes.map((k, idx) =>
                idx === existingIdx ? { ...k, ...patch } : k
              );
              return { ...clip, keyframes: nextKfs };
            }
            const newKf: Keyframe = {
              id: createId('kf'),
              time: Number(localT.toFixed(3)),
              easing: 'ease-in-out',
              ...patch,
            };
            return {
              ...clip,
              keyframes: [...clip.keyframes, newKf].sort((a, b) => a.time - b.time),
            };
          }),
        };
      }, recordHistory);
    },
    [autoKeyframe, commitProject, playheadTime]
  );

  const handleMoveResizeClip = useCallback(
    (
      clipId: string,
      patch: { startTime?: number; duration?: number; sourceOffset?: number; trackId?: string },
      recordHistory: boolean
    ) => {
      commitProject((prev) => {
        const nextClips = prev.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c));
        const maxEnd = nextClips.reduce((m, c) => Math.max(m, c.startTime + c.duration), prev.duration);
        return {
          ...prev,
          duration: maxEnd,
          clips: nextClips,
        };
      }, recordHistory);
    },
    [commitProject]
  );

  const handleSplitClip = useCallback(
    (clipId: string) => {
      commitProject((prev) => {
        const target = prev.clips.find((c) => c.id === clipId);
        if (!target) return prev;
        const splitLocal = playheadTime - target.startTime;
        if (splitLocal <= 0.1 || splitLocal >= target.duration - 0.1) return prev;

        const firstHalf: Clip = {
          ...structuredClone(target),
          duration: Number(splitLocal.toFixed(3)),
          keyframes: target.keyframes.filter((k) => k.time <= splitLocal),
        };

        const secondHalf: Clip = {
          ...structuredClone(target),
          id: createId('clip'),
          name: `${target.name} (2)`,
          startTime: Number(playheadTime.toFixed(3)),
          duration: Number((target.duration - splitLocal).toFixed(3)),
          sourceOffset: Number(((target.sourceOffset || 0) + splitLocal * (target.playbackRate || 1)).toFixed(3)),
          keyframes: target.keyframes
            .filter((k) => k.time >= splitLocal)
            .map((k) => ({ ...k, id: createId('kf'), time: Number((k.time - splitLocal).toFixed(3)) })),
        };

        setSelectedClipId(secondHalf.id);
        return {
          ...prev,
          clips: prev.clips.flatMap((c) => (c.id === clipId ? [firstHalf, secondHalf] : [c])),
        };
      });
    },
    [commitProject, playheadTime]
  );

  const handleDuplicateClip = useCallback(
    (clipId: string) => {
      commitProject((prev) => {
        const target = prev.clips.find((c) => c.id === clipId);
        if (!target) return prev;
        const copy: Clip = {
          ...structuredClone(target),
          id: createId('clip'),
          name: `${target.name} Copy`,
          startTime: Number((target.startTime + target.duration).toFixed(2)),
          zIndex: prev.clips.length + 1,
          keyframes: target.keyframes.map((k) => ({ ...k, id: createId('kf') })),
        };
        setSelectedClipId(copy.id);
        return {
          ...prev,
          duration: Math.max(prev.duration, copy.startTime + copy.duration),
          clips: [...prev.clips, copy],
        };
      });
    },
    [commitProject]
  );

  const handleDeleteClip = useCallback(
    (clipId: string) => {
      commitProject((prev) => ({
        ...prev,
        clips: prev.clips.filter((c) => c.id !== clipId),
      }));
      if (selectedClipId === clipId) setSelectedClipId(null);
    },
    [commitProject, selectedClipId]
  );

  const handleLayerOrder = useCallback(
    (clipId: string, direction: 'forward' | 'backward') => {
      commitProject((prev) => {
        const target = prev.clips.find((c) => c.id === clipId);
        if (!target) return prev;
        const delta = direction === 'forward' ? 1 : -1;
        return {
          ...prev,
          clips: prev.clips.map((c) =>
            c.id === clipId ? { ...c, zIndex: Math.max(0, c.zIndex + delta) } : c
          ),
        };
      });
    },
    [commitProject]
  );

  // Track Management
  const handleAddTrack = (type: TrackType) => {
    commitProject((prev) => {
      const count = prev.tracks.filter((t) => t.type === type).length + 1;
      const newTrack: Track = {
        id: createId('trk'),
        name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${count}`,
        type,
        visible: true,
        locked: false,
        muted: false,
        order: prev.tracks.length,
      };
      return { ...prev, tracks: [...prev.tracks, newTrack] };
    });
  };

  const handleUpdateTrack = (trackId: string, patch: Partial<Track>) => {
    commitProject((prev) => ({
      ...prev,
      tracks: prev.tracks.map((t) => (t.id === trackId ? { ...t, ...patch } : t)),
    }));
  };

  const handleMoveTrack = (trackId: string, dir: 'up' | 'down') => {
    commitProject((prev) => {
      const sorted = [...prev.tracks].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((t) => t.id === trackId);
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return prev;
      const temp = sorted[idx];
      sorted[idx] = sorted[swapIdx];
      sorted[swapIdx] = temp;
      return {
        ...prev,
        tracks: sorted.map((t, i) => ({ ...t, order: i })),
      };
    });
  };

  const handleDeleteTrack = (trackId: string) => {
    commitProject((prev) => ({
      ...prev,
      tracks: prev.tracks
        .filter((t) => t.id !== trackId)
        .sort((a, b) => a.order - b.order)
        .map((t, i) => ({ ...t, order: i })),
      clips: prev.clips.filter((c) => c.trackId !== trackId),
    }));
  };

  // Global Keyboard Shortcuts
  useEffect(() => {
    if (!activeProjectId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isEditingText = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleSaveNow();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (isEditingText) return;
        e.preventDefault();
        undo();
        return;
      }

      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        if (isEditingText) return;
        e.preventDefault();
        redo();
        return;
      }

      if (isEditingText) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipId) {
        e.preventDefault();
        handleDeleteClip(selectedClipId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeProjectId, handleDeleteClip, handleSaveNow, redo, selectedClipId, togglePlay, undo]);

  const selectedClip = project.clips.find((c) => c.id === selectedClipId) || null;
  const selectedAsset = selectedClip?.assetId ? assetMap.get(selectedClip.assetId) || null : null;

  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B0E14] text-sm text-slate-400">
        Loading AniCut 2D workspace...
      </div>
    );
  }

  return (
    <>
      {!activeProjectId ? (
        <WelcomeScreen
          projects={projects}
          onCreateProject={handleCreateNewProject}
          onCreateSampleProject={handleCreateSampleProject}
          onOpenProject={openProjectById}
          onRenameProject={handleRenameProjectById}
          onDuplicateProject={handleDuplicateProjectById}
          onDeleteProject={handleDeleteProjectById}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
        />
      ) : (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0B0E14] text-slate-100">
          <TopToolbar
            projectName={project.name}
            lastSavedText={lastSavedText}
            canUndo={canUndo}
            canRedo={canRedo}
            onRenameProject={(name) => commitProject((p) => ({ ...p, name }))}
            onGoHome={() => {
              stopPlayback();
              setActiveProjectId(null);
            }}
            onNewProject={() => handleCreateNewProject('Untitled Animation', 1280, 720, 30)}
            onOpenProjects={() => {
              stopPlayback();
              setActiveProjectId(null);
            }}
            onSaveProject={handleSaveNow}
            onUndo={undo}
            onRedo={redo}
            onOpenSettings={() => setShowSettingsModal(true)}
            onOpenExport={() => {
              stopPlayback();
              setShowExportModal(true);
            }}
          />

          {/* Mobile Panel Switcher */}
          <div className="flex lg:hidden border-b border-slate-800 bg-[#0D1119] px-2 py-1 gap-1">
            {(
              [
                { id: 'stage', label: 'Canvas', icon: Tv },
                { id: 'assets', label: 'Assets', icon: Layers },
                { id: 'inspector', label: 'Properties', icon: Sliders },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMobilePanel(item.id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium ${
                    mobilePanel === item.id
                      ? 'bg-cyan-500/15 text-cyan-300'
                      : 'text-slate-400'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Main 3-Column Workspace */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <div className={`${mobilePanel === 'assets' ? 'flex w-full' : 'hidden'} lg:flex lg:w-auto`}>
              <AssetLibraryPanel
                assets={assets}
                onImportFiles={handleImportFiles}
                onAddAssetToScene={handleAddAssetToScene}
                onAddTextPreset={handleAddTextPreset}
                onAddShape={handleAddShape}
                onDeleteAsset={handleDeleteAsset}
                onUpdateAssetSprite={handleUpdateAssetSprite}
              />
            </div>

            <div className={`${mobilePanel === 'stage' ? 'flex flex-1' : 'hidden'} lg:flex lg:flex-1 min-w-0`}>
              <CanvasStage
                project={project}
                assets={assets}
                playheadTime={playheadTime}
                isPlaying={isPlaying}
                selectedClipId={selectedClipId}
                onionSkin={onionSkin}
                showGrid={showGrid}
                autoKeyframe={autoKeyframe}
                onTogglePlay={togglePlay}
                onSeek={handleSeek}
                onSelectClip={setSelectedClipId}
                onTransformClip={handleTransformClipFromCanvas}
                onToggleOnionSkin={() => setOnionSkin((o) => !o)}
                onToggleGrid={() => setShowGrid((g) => !g)}
                onToggleAutoKeyframe={() => setAutoKeyframe((a) => !a)}
                onChangeCanvasSize={(width, height) =>
                  commitProject((p) => ({ ...p, width, height }))
                }
                onChangeBackgroundColor={(backgroundColor) =>
                  commitProject((p) => ({ ...p, backgroundColor }))
                }
              />
            </div>

            <div className={`${mobilePanel === 'inspector' ? 'flex w-full' : 'hidden'} lg:flex lg:w-auto`}>
              <InspectorPanel
                project={project}
                selectedClip={selectedClip}
                selectedAsset={selectedAsset}
                playheadTime={playheadTime}
                onUpdateClip={handleUpdateClip}
                onLayerOrder={handleLayerOrder}
                onSeek={handleSeek}
              />
            </div>
          </div>

          {/* Bottom Multi-Track Timeline */}
          <TimelinePanel
            project={project}
            playheadTime={playheadTime}
            selectedClipId={selectedClipId}
            onSeek={handleSeek}
            onSelectClip={setSelectedClipId}
            onMoveResizeClip={handleMoveResizeClip}
            onSplitClip={handleSplitClip}
            onDuplicateClip={handleDuplicateClip}
            onDeleteClip={handleDeleteClip}
            onAddTrack={handleAddTrack}
            onUpdateTrack={handleUpdateTrack}
            onMoveTrack={handleMoveTrack}
            onDeleteTrack={handleDeleteTrack}
            onDropAssetOnTrack={handleDropAssetOnTrack}
            onChangeDuration={(duration) => commitProject((p) => ({ ...p, duration }))}
          />

          {showExportModal && (
            <ExportModal
              project={project}
              assets={assets}
              onClose={() => setShowExportModal(false)}
            />
          )}

          {showSettingsModal && (
            <SettingsModal
              project={project}
              onUpdateSettings={(patch) => commitProject((p) => ({ ...p, ...patch }))}
              onExportBackup={() => handleExportBackup(project)}
              onImportBackup={handleImportBackup}
              onClose={() => setShowSettingsModal(false)}
            />
          )}
        </div>
      )}

      {/* Non-intrusive Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium shadow-2xl ${
            toast.type === 'error'
              ? 'border-rose-500/50 bg-[#1B1116] text-rose-200'
              : 'border-cyan-500/40 bg-[#101826] text-slate-100'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-cyan-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </>
  );
}
