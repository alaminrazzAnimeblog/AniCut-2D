import { decompressFrames, parseGIF } from 'gifuct-js';
import type { Asset, AssetCategory, MediaType, SpriteConfig } from '../types/project';
import { createId } from '../constants/presets';

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'bmp'];
const SVG_EXTS = ['svg'];
const GIF_EXTS = ['gif'];
const VIDEO_EXTS = ['mp4', 'webm', 'mov', 'm4v', 'ogv'];
const AUDIO_EXTS = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac', 'opus'];

function getExtension(filename: string): string {
  const parts = filename.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export function detectMediaType(file: File, forceSpritesheet = false): MediaType | null {
  if (forceSpritesheet) return 'spritesheet';
  const ext = getExtension(file.name);
  const mime = file.type.toLowerCase();

  if (mime === 'image/gif' || GIF_EXTS.includes(ext)) return 'gif';
  if (mime === 'image/svg+xml' || SVG_EXTS.includes(ext)) return 'svg';
  if (mime.startsWith('image/') || IMAGE_EXTS.includes(ext)) return 'image';
  if (mime.startsWith('video/') || VIDEO_EXTS.includes(ext)) return 'video';
  if (mime.startsWith('audio/') || AUDIO_EXTS.includes(ext)) return 'audio';
  return null;
}

async function createImageThumbnail(blob: Blob): Promise<{ url: string; width: number; height: number }> {
  const objUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image file.'));
      el.src = objUrl;
    });

    const natW = img.naturalWidth || 512;
    const natH = img.naturalHeight || 512;
    const maxDim = 180;
    const scale = Math.min(1, maxDim / Math.max(natW, natH));
    const tw = Math.max(1, Math.round(natW * scale));
    const th = Math.max(1, Math.round(natH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, tw, th);
      ctx.drawImage(img, 0, 0, tw, th);
    }
    return {
      url: canvas.toDataURL('image/png'), // preserves transparency
      width: natW,
      height: natH,
    };
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

async function createGifMetadata(blob: Blob): Promise<{ url: string; width: number; height: number; duration: number }> {
  const buf = await blob.arrayBuffer();
  const parsed = parseGIF(buf);
  const frames = decompressFrames(parsed, true);
  const totalMs = frames.reduce((sum, f) => sum + Math.max(20, f.delay || 100), 0);
  const thumb = await createImageThumbnail(blob);
  return {
    url: thumb.url,
    width: parsed.lsd.width || thumb.width,
    height: parsed.lsd.height || thumb.height,
    duration: Math.max(0.5, totalMs / 1000),
  };
}

async function createVideoMetadata(blob: Blob): Promise<{ url: string; width: number; height: number; duration: number }> {
  const objUrl = URL.createObjectURL(blob);
  try {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = objUrl;

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('Timed out reading video metadata.')), 8000);
      video.onloadeddata = () => {
        window.clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        window.clearTimeout(timer);
        reject(new Error('Unsupported or corrupted video file.'));
      };
    });

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5;

    // Seek slightly in to capture a representative thumbnail
    video.currentTime = Math.min(0.2, duration * 0.1);
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      window.setTimeout(resolve, 400);
    });

    const maxDim = 180;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, tw, th);
    }

    return {
      url: canvas.toDataURL('image/jpeg', 0.82),
      width: w,
      height: h,
      duration,
    };
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

async function createAudioMetadata(blob: Blob): Promise<{ duration: number }> {
  const arrayBuf = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    return { duration: 10 };
  }
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
    return { duration: Math.max(0.5, decoded.duration) };
  } catch {
    throw new Error('Could not decode audio file. Please use MP3, WAV, OGG, AAC, or M4A.');
  } finally {
    await ctx.close().catch(() => undefined);
  }
}

export async function importMediaFile(
  file: File,
  category: AssetCategory,
  spriteConfig?: SpriteConfig
): Promise<Asset> {
  const mediaType = detectMediaType(file, Boolean(spriteConfig));
  if (!mediaType) {
    throw new Error(
      `Unsupported file format "${file.name}". Supported: PNG, JPG, WebP, SVG, GIF, MP4, WebM, MP3, WAV, OGG, M4A.`
    );
  }

  const baseName = file.name.replace(/\.[^/.]+$/, '');
  const mimeType = file.type || 'application/octet-stream';

  if (mediaType === 'audio') {
    const { duration } = await createAudioMetadata(file);
    return {
      id: createId('ast'),
      name: baseName,
      category: 'audio',
      mediaType: 'audio',
      mimeType,
      blob: file,
      thumbnailDataUrl: '',
      width: 0,
      height: 0,
      duration,
      createdAt: Date.now(),
    };
  }

  if (mediaType === 'video') {
    const meta = await createVideoMetadata(file);
    return {
      id: createId('ast'),
      name: baseName,
      category: category === 'audio' ? 'media' : category,
      mediaType: 'video',
      mimeType,
      blob: file,
      thumbnailDataUrl: meta.url,
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
      createdAt: Date.now(),
    };
  }

  if (mediaType === 'gif') {
    const meta = await createGifMetadata(file);
    return {
      id: createId('ast'),
      name: baseName,
      category,
      mediaType: 'gif',
      mimeType,
      blob: file,
      thumbnailDataUrl: meta.url,
      width: meta.width,
      height: meta.height,
      duration: meta.duration,
      createdAt: Date.now(),
    };
  }

  // Image / SVG / Spritesheet
  const meta = await createImageThumbnail(file);
  return {
    id: createId('ast'),
    name: baseName,
    category,
    mediaType,
    mimeType,
    blob: file,
    thumbnailDataUrl: meta.url,
    width: meta.width,
    height: meta.height,
    spriteConfig: spriteConfig ? { ...spriteConfig, loop: true } : undefined,
    createdAt: Date.now(),
  };
}
