import type { Asset, Clip, Project, Track } from '../types/project';

class AudioEngine {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private activeNodes: { source: AudioBufferSourceNode; gain: GainNode }[] = [];

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  async decodeAsset(asset: Asset): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(asset.id);
    if (cached) return cached;
    if (asset.mediaType !== 'audio' && asset.mediaType !== 'video') return null;

    try {
      const ctx = this.ensureContext();
      const arrayBuf = await asset.blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
      this.buffers.set(asset.id, decoded);
      return decoded;
    } catch {
      return null;
    }
  }

  evictAsset(assetId: string) {
    this.buffers.delete(assetId);
  }

  stop() {
    for (const node of this.activeNodes) {
      try {
        node.source.stop();
        node.source.disconnect();
        node.gain.disconnect();
      } catch {
        // ignore already stopped nodes
      }
    }
    this.activeNodes = [];
  }

  async playFrom(project: Project, playheadTime: number, assetMap: Map<string, Asset>) {
    this.stop();
    const ctx = this.ensureContext();
    const trackMap = new Map<string, Track>();
    project.tracks.forEach((t) => trackMap.set(t.id, t));

    const audioClips = project.clips.filter((c) => {
      if (!c.assetId) return false;
      const asset = assetMap.get(c.assetId);
      if (!asset || (asset.mediaType !== 'audio' && asset.mediaType !== 'video')) return false;
      const track = trackMap.get(c.trackId);
      if (!track || track.muted || !track.visible) return false;
      if (c.audioData?.muted) return false;
      return c.startTime + c.duration > playheadTime;
    });

    const now = ctx.currentTime;

    for (const clip of audioClips) {
      const asset = clip.assetId ? assetMap.get(clip.assetId) : undefined;
      if (!asset) continue;
      const buffer = await this.decodeAsset(asset);
      if (!buffer) continue;

      this.scheduleClip(ctx, buffer, clip, playheadTime, now);
    }
  }

  private scheduleClip(
    ctx: BaseAudioContext,
    buffer: AudioBuffer,
    clip: Clip,
    playheadTime: number,
    baseCtxTime: number
  ) {
    const rate = Math.max(0.25, Math.min(4, clip.playbackRate || 1));
    const volume = Math.max(0, Math.min(2, clip.audioData?.volume ?? 1));
    if (volume <= 0.001) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;

    const gain = ctx.createGain();
    source.connect(gain);
    gain.connect(ctx.destination);

    const clipEnd = clip.startTime + clip.duration;
    const delayUntilStart = Math.max(0, clip.startTime - playheadTime);
    const offsetInTimeline = Math.max(0, playheadTime - clip.startTime);
    const bufferOffset = Math.min(
      Math.max(0, buffer.duration - 0.05),
      (clip.sourceOffset || 0) + offsetInTimeline * rate
    );
    const remainingTimelineDur = Math.max(0.01, clipEnd - Math.max(playheadTime, clip.startTime));
    const whenStart = baseCtxTime + delayUntilStart;

    // Fade in / Fade out gain scheduling
    const fadeIn = Math.min(clip.fadeIn || 0, clip.duration * 0.45);
    const fadeOut = Math.min(clip.fadeOut || 0, clip.duration * 0.45);

    if (fadeIn > 0 && offsetInTimeline < fadeIn) {
      const startVol = volume * (offsetInTimeline / fadeIn);
      gain.gain.setValueAtTime(startVol, whenStart);
      gain.gain.linearRampToValueAtTime(volume, whenStart + (fadeIn - offsetInTimeline));
    } else {
      gain.gain.setValueAtTime(volume, whenStart);
    }

    if (fadeOut > 0) {
      const fadeOutStartRel = clip.duration - fadeOut;
      if (offsetInTimeline < fadeOutStartRel) {
        const fadeOutAt = baseCtxTime + Math.max(0, fadeOutStartRel - playheadTime + clip.startTime);
        gain.gain.setValueAtTime(volume, fadeOutAt);
        gain.gain.linearRampToValueAtTime(0, baseCtxTime + (clipEnd - playheadTime));
      } else {
        const remainingFade = Math.max(0.01, clipEnd - Math.max(playheadTime, clip.startTime));
        const curVol = volume * Math.max(0, (clip.duration - offsetInTimeline) / fadeOut);
        gain.gain.setValueAtTime(curVol, whenStart);
        gain.gain.linearRampToValueAtTime(0, whenStart + remainingFade);
      }
    }

    source.start(whenStart, bufferOffset, remainingTimelineDur * rate);
    if (ctx instanceof AudioContext) {
      this.activeNodes.push({ source, gain });
    }
  }

  async renderMixdown(
    project: Project,
    assetMap: Map<string, Asset>,
    sampleRate = 48000
  ): Promise<AudioBuffer | null> {
    const trackMap = new Map<string, Track>();
    project.tracks.forEach((t) => trackMap.set(t.id, t));

    const audioClips = project.clips.filter((c) => {
      if (!c.assetId) return false;
      const asset = assetMap.get(c.assetId);
      if (!asset || (asset.mediaType !== 'audio' && asset.mediaType !== 'video')) return false;
      const track = trackMap.get(c.trackId);
      if (!track || track.muted || !track.visible) return false;
      if (c.audioData?.muted) return false;
      return c.duration > 0;
    });

    if (audioClips.length === 0) return null;

    const totalSamples = Math.max(1, Math.ceil(project.duration * sampleRate));
    const offline = new OfflineAudioContext(2, totalSamples, sampleRate);

    for (const clip of audioClips) {
      const asset = clip.assetId ? assetMap.get(clip.assetId) : undefined;
      if (!asset) continue;
      const buf = await this.decodeAsset(asset);
      if (!buf) continue;
      this.scheduleClip(offline, buf, clip, 0, 0);
    }

    return offline.startRendering();
  }
}

export const audioEngine = new AudioEngine();
