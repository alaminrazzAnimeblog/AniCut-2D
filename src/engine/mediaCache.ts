import { decompressFrames, parseGIF } from 'gifuct-js';
import type { Asset } from '../types/project';

export interface DecodedGif {
  width: number;
  height: number;
  totalDuration: number; // seconds
  frames: {
    canvas: HTMLCanvasElement;
    startTime: number;
    endTime: number;
  }[];
}

class MediaCache {
  private images = new Map<string, HTMLImageElement>();
  private imagePromises = new Map<string, Promise<HTMLImageElement>>();
  private gifs = new Map<string, DecodedGif>();
  private gifPromises = new Map<string, Promise<DecodedGif>>();
  private videos = new Map<string, HTMLVideoElement>();
  private videoPromises = new Map<string, Promise<HTMLVideoElement>>();
  private objectUrls = new Map<string, string>();

  getObjectUrl(asset: Asset): string {
    const existing = this.objectUrls.get(asset.id);
    if (existing) return existing;
    const url = URL.createObjectURL(asset.blob);
    this.objectUrls.set(asset.id, url);
    return url;
  }

  getImageSync(assetId: string): HTMLImageElement | undefined {
    return this.images.get(assetId);
  }

  async loadImage(asset: Asset): Promise<HTMLImageElement> {
    const cached = this.images.get(asset.id);
    if (cached && cached.complete) return cached;
    const pending = this.imagePromises.get(asset.id);
    if (pending) return pending;

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.images.set(asset.id, img);
        this.imagePromises.delete(asset.id);
        resolve(img);
      };
      img.onerror = () => {
        this.imagePromises.delete(asset.id);
        reject(new Error(`Failed to load image asset: ${asset.name}`));
      };
      img.src = this.getObjectUrl(asset);
    });

    this.imagePromises.set(asset.id, promise);
    return promise;
  }

  getGifSync(assetId: string): DecodedGif | undefined {
    return this.gifs.get(assetId);
  }

  async loadGif(asset: Asset): Promise<DecodedGif> {
    const cached = this.gifs.get(asset.id);
    if (cached) return cached;
    const pending = this.gifPromises.get(asset.id);
    if (pending) return pending;

    const promise = (async () => {
      const buf = await asset.blob.arrayBuffer();
      const parsed = parseGIF(buf);
      const rawFrames = decompressFrames(parsed, true);
      const width = parsed.lsd.width || asset.width || 256;
      const height = parsed.lsd.height || asset.height || 256;

      const compCanvas = document.createElement('canvas');
      compCanvas.width = width;
      compCanvas.height = height;
      const compCtx = compCanvas.getContext('2d')!;

      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d')!;

      const frames: DecodedGif['frames'] = [];
      let cursor = 0;

      for (const f of rawFrames) {
        let prevSnapshot: ImageData | null = null;
        if (f.disposalType === 3) {
          prevSnapshot = compCtx.getImageData(0, 0, width, height);
        }

        if (f.dims.width > 0 && f.dims.height > 0) {
          tempCanvas.width = f.dims.width;
          tempCanvas.height = f.dims.height;
          const imgData = new ImageData(
            new Uint8ClampedArray(f.patch),
            f.dims.width,
            f.dims.height
          );
          tempCtx.putImageData(imgData, 0, 0);
          compCtx.drawImage(tempCanvas, f.dims.left, f.dims.top);
        }

        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = width;
        frameCanvas.height = height;
        frameCanvas.getContext('2d')!.drawImage(compCanvas, 0, 0);

        const delaySec = Math.max(0.02, (f.delay || 100) / 1000);
        frames.push({
          canvas: frameCanvas,
          startTime: cursor,
          endTime: cursor + delaySec,
        });
        cursor += delaySec;

        if (f.disposalType === 2) {
          compCtx.clearRect(f.dims.left, f.dims.top, f.dims.width, f.dims.height);
        } else if (f.disposalType === 3 && prevSnapshot) {
          compCtx.putImageData(prevSnapshot, 0, 0);
        }
      }

      const decoded: DecodedGif = {
        width,
        height,
        totalDuration: Math.max(0.1, cursor),
        frames,
      };
      this.gifs.set(asset.id, decoded);
      this.gifPromises.delete(asset.id);
      return decoded;
    })();

    this.gifPromises.set(asset.id, promise);
    return promise;
  }

  getGifFrameAt(decoded: DecodedGif, localTime: number): HTMLCanvasElement | undefined {
    if (decoded.frames.length === 0) return undefined;
    const t = ((localTime % decoded.totalDuration) + decoded.totalDuration) % decoded.totalDuration;
    for (let i = 0; i < decoded.frames.length; i++) {
      if (t <= decoded.frames[i].endTime) {
        return decoded.frames[i].canvas;
      }
    }
    return decoded.frames[decoded.frames.length - 1].canvas;
  }

  getVideoSync(assetId: string): HTMLVideoElement | undefined {
    return this.videos.get(assetId);
  }

  async loadVideo(asset: Asset): Promise<HTMLVideoElement> {
    const cached = this.videos.get(asset.id);
    if (cached && cached.readyState >= 2) return cached;
    const pending = this.videoPromises.get(asset.id);
    if (pending) return pending;

    const promise = new Promise<HTMLVideoElement>((resolve, reject) => {
      const video = document.createElement('video');
      video.preload = 'auto';
      video.muted = true; // WebAudio handles sound cleanly; keep element muted
      video.playsInline = true;
      video.crossOrigin = 'anonymous';
      video.src = this.getObjectUrl(asset);
      video.onloadeddata = () => {
        this.videos.set(asset.id, video);
        this.videoPromises.delete(asset.id);
        resolve(video);
      };
      video.onerror = () => {
        this.videoPromises.delete(asset.id);
        reject(new Error(`Failed to decode video asset: ${asset.name}`));
      };
    });

    this.videoPromises.set(asset.id, promise);
    return promise;
  }

  async preloadProjectAssets(assets: Asset[]): Promise<void> {
    await Promise.all(
      assets.map((a) => {
        if (a.mediaType === 'gif') return this.loadGif(a).catch(() => undefined);
        if (a.mediaType === 'video') return this.loadVideo(a).catch(() => undefined);
        if (a.mediaType === 'audio') return Promise.resolve();
        return this.loadImage(a).catch(() => undefined);
      })
    );
  }

  evictAsset(assetId: string): void {
    this.images.delete(assetId);
    this.gifs.delete(assetId);
    const video = this.videos.get(assetId);
    if (video) {
      video.src = '';
      this.videos.delete(assetId);
    }
    const url = this.objectUrls.get(assetId);
    if (url) {
      URL.revokeObjectURL(url);
      this.objectUrls.delete(assetId);
    }
  }
}

export const mediaCache = new MediaCache();
