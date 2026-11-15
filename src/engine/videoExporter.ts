import { FFmpeg } from '@ffmpeg/ffmpeg';
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';
import type { Asset, ExportProgress, ExportSettings, Project } from '../types/project';
import { audioEngine } from './audioEngine';
import { mediaCache } from './mediaCache';
import { renderFrame, syncVideosForTime } from './renderer';

export interface ExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  method: string;
}

function computeExportDimensions(
  projW: number,
  projH: number,
  resolution: '720p' | '1080p'
): { width: number; height: number } {
  const targetShort = resolution === '1080p' ? 1080 : 720;
  const aspect = projW / projH;
  let w: number;
  let h: number;

  if (projW >= projH) {
    h = targetShort;
    w = Math.round(h * aspect);
  } else {
    w = targetShort;
    h = Math.round(w / aspect);
  }

  // Video codecs (H.264/VP8) require even dimensions
  w = Math.max(16, w + (w % 2));
  h = Math.max(16, h + (h % 2));
  return { width: w, height: h };
}

async function pickSupportedAvcCodec(width: number, height: number, fps: number): Promise<string | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  const candidates = [
    'avc1.640028', // High Profile L4.0
    'avc1.4d002a', // Main Profile L4.2
    'avc1.4d001f', // Main Profile L3.1
    'avc1.42001f', // Baseline L3.1
  ];
  for (const codec of candidates) {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate: width * height * 4,
        framerate: fps,
      });
      if (res.supported) return codec;
    } catch {
      // try next
    }
  }
  return null;
}

async function pickSupportedWebmVideoCodec(width: number, height: number, fps: number): Promise<string | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  const candidates = ['vp8', 'vp09.00.10.08'];
  for (const codec of candidates) {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec,
        width,
        height,
        bitrate: width * height * 3,
        framerate: fps,
      });
      if (res.supported) return codec;
    } catch {
      // try next
    }
  }
  return null;
}

async function isAudioCodecSupported(codec: string, sampleRate: number, numberOfChannels: number): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined') return false;
  try {
    const res = await AudioEncoder.isConfigSupported({
      codec,
      sampleRate,
      numberOfChannels,
      bitrate: 128000,
    });
    return Boolean(res.supported);
  } catch {
    return false;
  }
}

async function encodeAudioBufferWithWebCodecs(
  audioBuffer: AudioBuffer,
  codec: 'mp4a.40.2' | 'opus',
  onChunk: (chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata) => void
): Promise<void> {
  const sampleRate = audioBuffer.sampleRate;
  const numberOfChannels = Math.min(2, audioBuffer.numberOfChannels);

  const encoder = new AudioEncoder({
    output: (chunk, meta) => onChunk(chunk, meta),
    error: (err) => {
      throw err;
    },
  });

  encoder.configure({
    codec,
    sampleRate,
    numberOfChannels,
    bitrate: 128000,
  });

  const frameSize = 1024;
  const totalFrames = audioBuffer.length;
  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = numberOfChannels > 1 ? audioBuffer.getChannelData(1) : ch0;

  for (let offset = 0; offset < totalFrames; offset += frameSize) {
    const count = Math.min(frameSize, totalFrames - offset);
    const planar = new Float32Array(count * numberOfChannels);
    planar.set(ch0.subarray(offset, offset + count), 0);
    if (numberOfChannels > 1) {
      planar.set(ch1.subarray(offset, offset + count), count);
    }

    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames: count,
      numberOfChannels,
      timestamp: Math.round((offset / sampleRate) * 1_000_000),
      data: planar,
    });
    encoder.encode(audioData);
    audioData.close();
  }

  await encoder.flush();
  encoder.close();
}

function audioBufferToWavBytes(buffer: AudioBuffer): Uint8Array {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const ch0 = buffer.getChannelData(0);
  const ch1 = numChannels > 1 ? buffer.getChannelData(1) : ch0;
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, c === 0 ? ch0[i] : ch1[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Uint8Array(arrayBuffer);
}

let cachedFFmpeg: FFmpeg | null = null;

async function getLocalFFmpeg(): Promise<FFmpeg> {
  if (cachedFFmpeg && cachedFFmpeg.loaded) return cachedFFmpeg;
  const ffmpeg = new FFmpeg();
  const base = import.meta.env.BASE_URL || '/';
  await ffmpeg.load({
    coreURL: `${base}ffmpeg/ffmpeg-core.js`,
    wasmURL: `${base}ffmpeg/ffmpeg-core.wasm`,
  });
  cachedFFmpeg = ffmpeg;
  return ffmpeg;
}

export async function detectExportCapabilities(): Promise<{
  webCodecsMp4: boolean;
  webCodecsWebm: boolean;
  mediaRecorderWebm: boolean;
}> {
  const avc = await pickSupportedAvcCodec(1280, 720, 30);
  const vp = await pickSupportedWebmVideoCodec(1280, 720, 30);
  const mediaRecorderWebm = typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined';
  return {
    webCodecsMp4: Boolean(avc),
    webCodecsWebm: Boolean(vp),
    mediaRecorderWebm,
  };
}

export async function exportProjectVideo(
  project: Project,
  assets: Asset[],
  settings: ExportSettings,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal
): Promise<ExportResult> {
  const assetMap = new Map<string, Asset>();
  assets.forEach((a) => assetMap.set(a.id, a));

  const { width, height } = computeExportDimensions(project.width, project.height, settings.resolution);
  const fps = settings.fps;
  const duration = Math.max(0.5, project.duration);
  const totalFrames = Math.max(1, Math.ceil(duration * fps));
  const safeName = (project.name || 'anicut-project').replace(/[^a-zA-Z0-9_-]+/g, '_');

  onProgress({
    stage: 'preparing',
    percent: 2,
    currentFrame: 0,
    totalFrames,
    message: 'Preloading project media...',
  });

  await mediaCache.preloadProjectAssets(assets);
  if (signal.aborted) throw new Error('Export cancelled');

  onProgress({
    stage: 'rendering-audio',
    percent: 6,
    currentFrame: 0,
    totalFrames,
    message: 'Mixing audio tracks locally...',
  });

  const mixedAudio = await audioEngine.renderMixdown(project, assetMap, 48000);
  if (signal.aborted) throw new Error('Export cancelled');

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create offscreen 2D export canvas.');

  const scaleX = width / project.width;
  const scaleY = height / project.height;

  const drawFrameAt = async (frameIdx: number) => {
    const t = Math.min(duration, frameIdx / fps);
    await syncVideosForTime(project, t, assetMap, true);
    ctx.save();
    ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
    renderFrame(ctx, project, t, assetMap, {
      onionSkin: false,
      showSelectionGuides: false,
      showGrid: false,
    });
    ctx.restore();
  };

  // Path 1: WebCodecs MP4 (fast hardware-accelerated H.264 + AAC)
  if (settings.format === 'mp4') {
    const avcCodec = await pickSupportedAvcCodec(width, height, fps);
    const hasAac = mixedAudio ? await isAudioCodecSupported('mp4a.40.2', mixedAudio.sampleRate, Math.min(2, mixedAudio.numberOfChannels)) : true;

    if (avcCodec && hasAac) {
      const target = new Mp4Target();
      const muxer = new Mp4Muxer({
        target,
        video: {
          codec: 'avc',
          width,
          height,
          frameRate: fps,
        },
        audio: mixedAudio
          ? {
              codec: 'aac',
              numberOfChannels: Math.min(2, mixedAudio.numberOfChannels),
              sampleRate: mixedAudio.sampleRate,
            }
          : undefined,
        fastStart: 'in-memory',
      });

      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (err) => {
          throw err;
        },
      });

      videoEncoder.configure({
        codec: avcCodec,
        width,
        height,
        bitrate: settings.resolution === '1080p' ? 8_000_000 : 4_500_000,
        framerate: fps,
      });

      const frameDurationUs = Math.round(1_000_000 / fps);
      for (let i = 0; i < totalFrames; i++) {
        if (signal.aborted) {
          videoEncoder.close();
          throw new Error('Export cancelled');
        }
        await drawFrameAt(i);
        const frame = new VideoFrame(canvas, {
          timestamp: i * frameDurationUs,
          duration: frameDurationUs,
        });
        const keyFrame = i % (fps * 2) === 0;
        videoEncoder.encode(frame, { keyFrame });
        frame.close();

        // Yield occasionally to keep UI responsive and prevent encoder queue overflow
        if (videoEncoder.encodeQueueSize > 8) {
          await new Promise((r) => setTimeout(r, 8));
        } else if (i % 5 === 0) {
          await new Promise((r) => setTimeout(r, 0));
        }

        const pct = 10 + Math.round(((i + 1) / totalFrames) * 78);
        onProgress({
          stage: 'encoding-video',
          percent: pct,
          currentFrame: i + 1,
          totalFrames,
          message: `Encoding MP4 frame ${i + 1} / ${totalFrames}`,
        });
      }

      await videoEncoder.flush();
      videoEncoder.close();

      if (mixedAudio) {
        onProgress({
          stage: 'finalizing',
          percent: 92,
          currentFrame: totalFrames,
          totalFrames,
          message: 'Encoding AAC audio track...',
        });
        await encodeAudioBufferWithWebCodecs(mixedAudio, 'mp4a.40.2', (chunk, meta) =>
          muxer.addAudioChunk(chunk, meta)
        );
      }

      muxer.finalize();
      return {
        blob: new Blob([target.buffer], { type: 'video/mp4' }),
        filename: `${safeName}_${settings.resolution}_${fps}fps.mp4`,
        mimeType: 'video/mp4',
        method: 'WebCodecs H.264 + MP4 Muxer',
      };
    }
  }

  // Path 2: WebCodecs WebM (either directly requested or intermediate for FFmpeg MP4 fallback)
  const webmCodec = await pickSupportedWebmVideoCodec(width, height, fps);
  const hasOpus = mixedAudio
    ? await isAudioCodecSupported('opus', mixedAudio.sampleRate, Math.min(2, mixedAudio.numberOfChannels))
    : true;

  let webmBlob: Blob | null = null;

  if (webmCodec) {
    const target = new WebmTarget();
    const muxer = new WebmMuxer({
      target,
      video: {
        codec: webmCodec === 'vp8' ? 'V_VP8' : 'V_VP9',
        width,
        height,
        frameRate: fps,
      },
      audio:
        mixedAudio && hasOpus && settings.format === 'webm'
          ? {
              codec: 'A_OPUS',
              numberOfChannels: Math.min(2, mixedAudio.numberOfChannels),
              sampleRate: mixedAudio.sampleRate,
            }
          : undefined,
    });

    const videoEncoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (err) => {
        throw err;
      },
    });

    videoEncoder.configure({
      codec: webmCodec,
      width,
      height,
      bitrate: settings.resolution === '1080p' ? 6_000_000 : 3_500_000,
      framerate: fps,
    });

    const frameDurationUs = Math.round(1_000_000 / fps);
    for (let i = 0; i < totalFrames; i++) {
      if (signal.aborted) {
        videoEncoder.close();
        throw new Error('Export cancelled');
      }
      await drawFrameAt(i);
      const frame = new VideoFrame(canvas, {
        timestamp: i * frameDurationUs,
        duration: frameDurationUs,
      });
      videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();

      if (videoEncoder.encodeQueueSize > 8) {
        await new Promise((r) => setTimeout(r, 8));
      } else if (i % 5 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }

      const maxPct = settings.format === 'mp4' ? 65 : 88;
      const pct = 10 + Math.round(((i + 1) / totalFrames) * (maxPct - 10));
      onProgress({
        stage: 'encoding-video',
        percent: pct,
        currentFrame: i + 1,
        totalFrames,
        message: `Encoding frame ${i + 1} / ${totalFrames}`,
      });
    }

    await videoEncoder.flush();
    videoEncoder.close();

    if (mixedAudio && hasOpus && settings.format === 'webm') {
      await encodeAudioBufferWithWebCodecs(mixedAudio, 'opus', (chunk, meta) =>
        muxer.addAudioChunk(chunk, meta)
      );
    }

    muxer.finalize();
    webmBlob = new Blob([target.buffer], { type: 'video/webm' });

    if (settings.format === 'webm') {
      return {
        blob: webmBlob,
        filename: `${safeName}_${settings.resolution}_${fps}fps.webm`,
        mimeType: 'video/webm',
        method: 'WebCodecs VP8/VP9 + WebM Muxer',
      };
    }
  }

  // Path 3: Local FFmpeg.wasm fallback (for MP4 when WebCodecs H.264 unavailable, or full frame-sequence encode)
  if (settings.format === 'mp4') {
    onProgress({
      stage: 'transcoding',
      percent: 68,
      currentFrame: totalFrames,
      totalFrames,
      message: 'Loading local FFmpeg.wasm encoder...',
    });

    const ffmpeg = await getLocalFFmpeg();
    if (signal.aborted) throw new Error('Export cancelled');

    const handleProgress = ({ progress }: { progress: number }) => {
      onProgress({
        stage: 'transcoding',
        percent: Math.min(97, 70 + Math.round(progress * 27)),
        currentFrame: totalFrames,
        totalFrames,
        message: `Transcoding MP4 locally (${Math.round(progress * 100)}%)...`,
      });
    };
    ffmpeg.on('progress', handleProgress);

    try {
      if (webmBlob) {
        await ffmpeg.writeFile('input.webm', new Uint8Array(await webmBlob.arrayBuffer()));
        if (mixedAudio) {
          await ffmpeg.writeFile('audio.wav', audioBufferToWavBytes(mixedAudio));
          await ffmpeg.exec([
            '-i',
            'input.webm',
            '-i',
            'audio.wav',
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-shortest',
            'output.mp4',
          ]);
        } else {
          await ffmpeg.exec([
            '-i',
            'input.webm',
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-pix_fmt',
            'yuv420p',
            'output.mp4',
          ]);
        }
      } else {
        // Pure FFmpeg frame-by-frame PNG sequence fallback when WebCodecs is completely absent
        for (let i = 0; i < totalFrames; i++) {
          if (signal.aborted) throw new Error('Export cancelled');
          await drawFrameAt(i);
          const pngBlob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas frame failed'))), 'image/png')
          );
          const idxStr = String(i).padStart(5, '0');
          await ffmpeg.writeFile(`f_${idxStr}.png`, new Uint8Array(await pngBlob.arrayBuffer()));
          onProgress({
            stage: 'encoding-video',
            percent: 10 + Math.round(((i + 1) / totalFrames) * 55),
            currentFrame: i + 1,
            totalFrames,
            message: `Rendering frame ${i + 1} / ${totalFrames}`,
          });
        }

        const args = ['-framerate', String(fps), '-i', 'f_%05d.png'];
        if (mixedAudio) {
          await ffmpeg.writeFile('audio.wav', audioBufferToWavBytes(mixedAudio));
          args.push('-i', 'audio.wav', '-c:a', 'aac', '-shortest');
        }
        args.push('-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', 'output.mp4');
        await ffmpeg.exec(args);
      }

      const mp4Data = (await ffmpeg.readFile('output.mp4')) as Uint8Array;
      const copyBuf = new Uint8Array(mp4Data.byteLength);
      copyBuf.set(mp4Data);
      return {
        blob: new Blob([copyBuf], { type: 'video/mp4' }),
        filename: `${safeName}_${settings.resolution}_${fps}fps.mp4`,
        mimeType: 'video/mp4',
        method: 'Local FFmpeg.wasm (H.264)',
      };
    } finally {
      ffmpeg.off('progress', handleProgress);
      await ffmpeg.deleteFile('input.webm').catch(() => undefined);
      await ffmpeg.deleteFile('audio.wav').catch(() => undefined);
      await ffmpeg.deleteFile('output.mp4').catch(() => undefined);
    }
  }

  // Path 4: MediaRecorder WebM fallback (if WebCodecs unavailable and WebM selected)
  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm',
  });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start();
  const frameIntervalMs = 1000 / fps;
  for (let i = 0; i < totalFrames; i++) {
    if (signal.aborted) {
      recorder.stop();
      throw new Error('Export cancelled');
    }
    await drawFrameAt(i);
    await new Promise((r) => setTimeout(r, frameIntervalMs));
    onProgress({
      stage: 'encoding-video',
      percent: 10 + Math.round(((i + 1) / totalFrames) * 85),
      currentFrame: i + 1,
      totalFrames,
      message: `Recording WebM frame ${i + 1} / ${totalFrames}`,
    });
  }

  await new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
    recorder.stop();
  });

  return {
    blob: new Blob(chunks, { type: 'video/webm' }),
    filename: `${safeName}_${settings.resolution}_${fps}fps.webm`,
    mimeType: 'video/webm',
    method: 'Browser MediaRecorder WebM',
  };
}
