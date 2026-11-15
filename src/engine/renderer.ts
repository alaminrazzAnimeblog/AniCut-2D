import type {
  Asset,
  Clip,
  EasingType,
  Keyframe,
  Project,
  Track,
} from '../types/project';
import { mediaCache } from './mediaCache';

export interface EvaluatedTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  wipeProgress: number; // 0..1 (1 = fully revealed)
}

function applyEasing(t: number, easing: EasingType): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (easing) {
    case 'ease-in':
      return clamped * clamped * clamped;
    case 'ease-out': {
      const inv = 1 - clamped;
      return 1 - inv * inv * inv;
    }
    case 'ease-in-out':
      return clamped < 0.5
        ? 4 * clamped * clamped * clamped
        : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
    case 'linear':
    default:
      return clamped;
  }
}

type NumericProp = 'x' | 'y' | 'width' | 'height' | 'rotation' | 'opacity';

function interpolateProp(
  keyframes: Keyframe[],
  prop: NumericProp,
  localTime: number,
  fallback: number
): number {
  const relevant = keyframes
    .filter((k) => typeof k[prop] === 'number')
    .sort((a, b) => a.time - b.time);

  if (relevant.length === 0) return fallback;
  if (localTime <= relevant[0].time) return relevant[0][prop] as number;
  if (localTime >= relevant[relevant.length - 1].time) {
    return relevant[relevant.length - 1][prop] as number;
  }

  for (let i = 0; i < relevant.length - 1; i++) {
    const k0 = relevant[i];
    const k1 = relevant[i + 1];
    if (localTime >= k0.time && localTime <= k1.time) {
      const span = k1.time - k0.time;
      if (span <= 0.0001) return k1[prop] as number;
      const rawT = (localTime - k0.time) / span;
      const easedT = applyEasing(rawT, k1.easing || k0.easing || 'linear');
      const v0 = k0[prop] as number;
      const v1 = k1[prop] as number;
      return v0 + (v1 - v0) * easedT;
    }
  }
  return fallback;
}

export function evaluateClipTransform(
  clip: Clip,
  localTime: number,
  projectWidth: number,
  projectHeight: number
): EvaluatedTransform {
  let x = interpolateProp(clip.keyframes, 'x', localTime, clip.x);
  let y = interpolateProp(clip.keyframes, 'y', localTime, clip.y);
  let width = interpolateProp(clip.keyframes, 'width', localTime, clip.width);
  let height = interpolateProp(clip.keyframes, 'height', localTime, clip.height);
  let rotation = interpolateProp(clip.keyframes, 'rotation', localTime, clip.rotation);
  let opacity = interpolateProp(clip.keyframes, 'opacity', localTime, clip.opacity);
  let wipeProgress = 1;

  // Fade In / Fade Out envelopes
  if (clip.fadeIn > 0 && localTime < clip.fadeIn) {
    opacity *= Math.max(0, Math.min(1, localTime / clip.fadeIn));
  }
  const timeFromEnd = clip.duration - localTime;
  if (clip.fadeOut > 0 && timeFromEnd < clip.fadeOut) {
    opacity *= Math.max(0, Math.min(1, timeFromEnd / clip.fadeOut));
  }

  // Transition In
  const trDur = Math.max(0.1, clip.transitionDuration || 0.4);
  if (clip.transitionIn !== 'none' && localTime < trDur) {
    const p = applyEasing(localTime / trDur, 'ease-out');
    switch (clip.transitionIn) {
      case 'fade':
        opacity *= p;
        break;
      case 'slide-up':
        y += (1 - p) * (projectHeight * 0.2);
        opacity *= p;
        break;
      case 'zoom-in':
        width *= 0.35 + 0.65 * p;
        height *= 0.35 + 0.65 * p;
        opacity *= p;
        break;
      case 'wipe-left':
        wipeProgress = p;
        break;
    }
  }

  // Motion Presets
  switch (clip.motionPreset) {
    case 'bounce':
      y -= Math.abs(Math.sin(localTime * Math.PI * 2.2)) * 28;
      break;
    case 'float':
      y += Math.sin(localTime * Math.PI * 1.4) * 14;
      break;
    case 'pulse': {
      const s = 1 + Math.sin(localTime * Math.PI * 2.4) * 0.08;
      width *= s;
      height *= s;
      break;
    }
    case 'spin':
      rotation += localTime * 120;
      break;
    case 'wiggle':
      rotation += Math.sin(localTime * Math.PI * 5) * 8;
      break;
    case 'slide-in-left': {
      const p = applyEasing(Math.min(1, localTime / 0.6), 'ease-out');
      x = -width * 0.6 + (x + width * 0.6) * p;
      break;
    }
    case 'slide-in-right': {
      const p = applyEasing(Math.min(1, localTime / 0.6), 'ease-out');
      const startX = projectWidth + width * 0.6;
      x = startX + (x - startX) * p;
      break;
    }
    case 'pop-in': {
      const t = Math.min(1, localTime / 0.45);
      // Elastic overshoot
      const s = t === 1 ? 1 : 1 - Math.pow(2, -10 * t) * Math.cos((t * 10 - 0.75) * ((2 * Math.PI) / 3));
      width *= Math.max(0.05, s);
      height *= Math.max(0.05, s);
      break;
    }
    case 'none':
    default:
      break;
  }

  return {
    x,
    y,
    width: Math.max(4, width),
    height: Math.max(4, height),
    rotation,
    opacity: Math.max(0, Math.min(1, opacity)),
    wipeProgress,
  };
}

function drawShapePath(
  ctx: CanvasRenderingContext2D,
  shapeType: string,
  w: number,
  h: number,
  cornerRadius: number
) {
  const hw = w / 2;
  const hh = h / 2;
  ctx.beginPath();

  switch (shapeType) {
    case 'circle':
      ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
      break;
    case 'triangle':
      ctx.moveTo(0, -hh);
      ctx.lineTo(hw, hh);
      ctx.lineTo(-hw, hh);
      ctx.closePath();
      break;
    case 'star': {
      const spikes = 5;
      const outerR = Math.min(hw, hh);
      const innerR = outerR * 0.45;
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (i * Math.PI) / spikes - Math.PI / 2;
        const px = Math.cos(angle) * r * (hw / outerR);
        const py = Math.sin(angle) * r * (hh / outerR);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      break;
    }
    case 'arrow': {
      ctx.moveTo(-hw, -hh * 0.35);
      ctx.lineTo(hw * 0.25, -hh * 0.35);
      ctx.lineTo(hw * 0.25, -hh);
      ctx.lineTo(hw, 0);
      ctx.lineTo(hw * 0.25, hh);
      ctx.lineTo(hw * 0.25, hh * 0.35);
      ctx.lineTo(-hw, hh * 0.35);
      ctx.closePath();
      break;
    }
    case 'speech-bubble': {
      const r = Math.min(cornerRadius || 16, hw * 0.4, hh * 0.4);
      const bodyBottom = hh * 0.65;
      ctx.moveTo(-hw + r, -hh);
      ctx.lineTo(hw - r, -hh);
      ctx.quadraticCurveTo(hw, -hh, hw, -hh + r);
      ctx.lineTo(hw, bodyBottom - r);
      ctx.quadraticCurveTo(hw, bodyBottom, hw - r, bodyBottom);
      ctx.lineTo(-hw * 0.15, bodyBottom);
      ctx.lineTo(-hw * 0.42, hh);
      ctx.lineTo(-hw * 0.4, bodyBottom);
      ctx.lineTo(-hw + r, bodyBottom);
      ctx.quadraticCurveTo(-hw, bodyBottom, -hw, bodyBottom - r);
      ctx.lineTo(-hw, -hh + r);
      ctx.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
      ctx.closePath();
      break;
    }
    case 'rect':
    default: {
      const r = Math.min(cornerRadius || 0, hw, hh);
      if (r <= 0) {
        ctx.rect(-hw, -hh, w, h);
      } else {
        ctx.moveTo(-hw + r, -hh);
        ctx.lineTo(hw - r, -hh);
        ctx.quadraticCurveTo(hw, -hh, hw, -hh + r);
        ctx.lineTo(hw, hh - r);
        ctx.quadraticCurveTo(hw, hh, hw - r, hh);
        ctx.lineTo(-hw + r, hh);
        ctx.quadraticCurveTo(-hw, hh, -hw, hh - r);
        ctx.lineTo(-hw, -hh + r);
        ctx.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
        ctx.closePath();
      }
      break;
    }
  }
}

function drawTextClip(ctx: CanvasRenderingContext2D, clip: Clip, w: number, h: number) {
  const td = clip.textData;
  if (!td) return;

  if (td.backgroundColor && td.backgroundColor !== 'transparent') {
    ctx.fillStyle = td.backgroundColor;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 14);
    ctx.fill();
  }

  const fontStyle = `${td.italic ? 'italic ' : ''}${td.bold ? '700 ' : '500 '}${td.fontSize}px "${td.fontFamily}", sans-serif`;
  ctx.font = fontStyle;
  ctx.textAlign = td.align || 'center';
  ctx.textBaseline = 'middle';

  const lines = (td.content || '').split('\n');
  const lineHeight = td.fontSize * 1.25;
  const totalHeight = lines.length * lineHeight;
  const startY = -totalHeight / 2 + lineHeight / 2;
  const xPos = td.align === 'left' ? -w / 2 + 16 : td.align === 'right' ? w / 2 - 16 : 0;

  lines.forEach((line, idx) => {
    const ly = startY + idx * lineHeight;
    if (td.strokeWidth > 0) {
      ctx.lineWidth = td.strokeWidth;
      ctx.strokeStyle = td.strokeColor || '#000000';
      ctx.lineJoin = 'round';
      ctx.strokeText(line, xPos, ly, w - 16);
    }
    ctx.fillStyle = td.color || '#FFFFFF';
    ctx.fillText(line, xPos, ly, w - 16);
  });
}

export function getSortedActiveClips(project: Project, time: number): { clip: Clip; track: Track }[] {
  const trackMap = new Map<string, Track>();
  project.tracks.forEach((t) => trackMap.set(t.id, t));

  const active: { clip: Clip; track: Track }[] = [];
  for (const clip of project.clips) {
    if (clip.kind === 'audio') continue;
    const track = trackMap.get(clip.trackId);
    if (!track || !track.visible) continue;
    if (time >= clip.startTime && time <= clip.startTime + clip.duration) {
      active.push({ clip, track });
    }
  }

  // Higher track.order renders first (background at bottom of stack, lower track.order on top)
  active.sort((a, b) => {
    if (b.track.order !== a.track.order) return b.track.order - a.track.order;
    return a.clip.zIndex - b.clip.zIndex;
  });

  return active;
}

export interface RenderOptions {
  onionSkin?: boolean;
  selectedClipId?: string | null;
  showSelectionGuides?: boolean;
  showGrid?: boolean;
}

export function renderClipToContext(
  ctx: CanvasRenderingContext2D,
  clip: Clip,
  localTime: number,
  project: Project,
  assetMap: Map<string, Asset>,
  opacityMultiplier = 1,
  tintOverlay?: string
) {
  const t = evaluateClipTransform(clip, localTime, project.width, project.height);
  const effectiveOpacity = t.opacity * opacityMultiplier;
  if (effectiveOpacity <= 0.005) return;

  ctx.save();
  ctx.globalAlpha = effectiveOpacity;
  ctx.translate(t.x, t.y);
  ctx.rotate((t.rotation * Math.PI) / 180);

  const f = clip.filters;
  if (f) {
    const scaleX = f.flipX ? -1 : 1;
    const scaleY = f.flipY ? -1 : 1;
    if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);

    const filterParts: string[] = [];
    if (f.brightness !== 100) filterParts.push(`brightness(${f.brightness}%)`);
    if (f.contrast !== 100) filterParts.push(`contrast(${f.contrast}%)`);
    if (f.saturation !== 100) filterParts.push(`saturate(${f.saturation}%)`);
    if (f.blur > 0) filterParts.push(`blur(${f.blur}px)`);
    if (filterParts.length > 0 && 'filter' in ctx) {
      ctx.filter = filterParts.join(' ');
    }
  }

  if (t.wipeProgress < 0.999) {
    ctx.beginPath();
    ctx.rect(-t.width / 2, -t.height / 2, t.width * t.wipeProgress, t.height);
    ctx.clip();
  }

  const hw = t.width / 2;
  const hh = t.height / 2;

  if (clip.kind === 'shape' && clip.shapeData) {
    drawShapePath(ctx, clip.shapeData.shapeType, t.width, t.height, clip.shapeData.cornerRadius);
    ctx.fillStyle = tintOverlay || clip.shapeData.fillColor;
    ctx.fill();
    if (clip.shapeData.strokeWidth > 0) {
      ctx.lineWidth = clip.shapeData.strokeWidth;
      ctx.strokeStyle = clip.shapeData.strokeColor;
      ctx.stroke();
    }
  } else if (clip.kind === 'text') {
    drawTextClip(ctx, clip, t.width, t.height);
  } else if (clip.assetId) {
    const asset = assetMap.get(clip.assetId);
    if (asset) {
      if (asset.mediaType === 'gif') {
        const decoded = mediaCache.getGifSync(asset.id);
        if (decoded) {
          const frameCanvas = mediaCache.getGifFrameAt(decoded, localTime * (clip.playbackRate || 1));
          if (frameCanvas) {
            ctx.drawImage(frameCanvas, -hw, -hh, t.width, t.height);
          }
        }
      } else if (asset.mediaType === 'video') {
        const video = mediaCache.getVideoSync(asset.id);
        if (video && video.readyState >= 2) {
          ctx.drawImage(video, -hw, -hh, t.width, t.height);
        }
      } else if (asset.mediaType === 'spritesheet' || clip.kind === 'spritesheet') {
        const img = mediaCache.getImageSync(asset.id);
        const cfg = clip.spriteOverride || asset.spriteConfig || { rows: 1, cols: 1, fps: 12, loop: true };
        if (img && img.complete && img.naturalWidth > 0) {
          const rows = Math.max(1, cfg.rows);
          const cols = Math.max(1, cfg.cols);
          const total = rows * cols;
          const rawFrame = Math.floor(localTime * (cfg.fps || 12));
          const frameIdx = cfg.loop === false ? Math.min(total - 1, rawFrame) : ((rawFrame % total) + total) % total;
          const col = frameIdx % cols;
          const row = Math.floor(frameIdx / cols);
          const sw = img.naturalWidth / cols;
          const sh = img.naturalHeight / rows;
          ctx.drawImage(img, col * sw, row * sh, sw, sh, -hw, -hh, t.width, t.height);
        }
      } else {
        const img = mediaCache.getImageSync(asset.id);
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, -hw, -hh, t.width, t.height);
        }
      }

      if (f?.tintAmount && f.tintAmount > 0 && f.tintColor) {
        ctx.globalCompositeOperation = 'source-atop';
        ctx.globalAlpha = effectiveOpacity * f.tintAmount;
        ctx.fillStyle = f.tintColor;
        ctx.fillRect(-hw, -hh, t.width, t.height);
      }
    }
  }

  ctx.restore();
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  project: Project,
  time: number,
  assetMap: Map<string, Asset>,
  options: RenderOptions = {}
) {
  ctx.save();
  ctx.clearRect(0, 0, project.width, project.height);
  ctx.fillStyle = project.backgroundColor || '#111827';
  ctx.fillRect(0, 0, project.width, project.height);

  // Subtle stage grid (only in editor preview if toggled)
  if (options.showGrid) {
    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    const step = 80;
    for (let x = step; x < project.width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, project.height);
      ctx.stroke();
    }
    for (let y = step; y < project.height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(project.width, y);
      ctx.stroke();
    }
    // Center crosshair
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.22)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(project.width / 2, 0);
    ctx.lineTo(project.width / 2, project.height);
    ctx.moveTo(0, project.height / 2);
    ctx.lineTo(project.width, project.height / 2);
    ctx.stroke();
    ctx.restore();
  }

  // Onion-skin previous & next frames
  if (options.onionSkin) {
    const dt = 1 / Math.max(12, project.fps || 30);
    const prevTimes = [time - dt * 2, time - dt];
    const nextTimes = [time + dt];

    prevTimes.forEach((pt, idx) => {
      if (pt < 0) return;
      const activePrev = getSortedActiveClips(project, pt);
      for (const { clip } of activePrev) {
        if (clip.keyframes.length === 0 && clip.motionPreset === 'none' && clip.kind !== 'spritesheet') continue;
        renderClipToContext(ctx, clip, pt - clip.startTime, project, assetMap, idx === 0 ? 0.14 : 0.26, 'rgba(34, 211, 238, 0.45)');
      }
    });

    nextTimes.forEach((nt) => {
      if (nt > project.duration) return;
      const activeNext = getSortedActiveClips(project, nt);
      for (const { clip } of activeNext) {
        if (clip.keyframes.length === 0 && clip.motionPreset === 'none' && clip.kind !== 'spritesheet') continue;
        renderClipToContext(ctx, clip, nt - clip.startTime, project, assetMap, 0.2, 'rgba(251, 146, 60, 0.45)');
      }
    });
  }

  // Main active clips
  const active = getSortedActiveClips(project, time);
  for (const { clip } of active) {
    renderClipToContext(ctx, clip, time - clip.startTime, project, assetMap, 1);
  }

  // Selection bounding box & transform handles
  if (options.showSelectionGuides && options.selectedClipId) {
    const selectedItem = active.find((item) => item.clip.id === options.selectedClipId);
    if (selectedItem) {
      const t = evaluateClipTransform(
        selectedItem.clip,
        time - selectedItem.clip.startTime,
        project.width,
        project.height
      );
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate((t.rotation * Math.PI) / 180);

      const hw = t.width / 2;
      const hh = t.height / 2;

      ctx.strokeStyle = '#22D3EE';
      ctx.lineWidth = 2;
      ctx.strokeRect(-hw, -hh, t.width, t.height);

      // Rotation stem + knob
      ctx.beginPath();
      ctx.moveTo(0, -hh);
      ctx.lineTo(0, -hh - 28);
      ctx.stroke();

      ctx.fillStyle = '#F97316';
      ctx.beginPath();
      ctx.arc(0, -hh - 28, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0B0E14';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Corner resize handles
      const corners = [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh],
      ];
      for (const [cx, cy] of corners) {
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#22D3EE';
        ctx.lineWidth = 2;
        ctx.fillRect(cx - 5, cy - 5, 10, 10);
        ctx.strokeRect(cx - 5, cy - 5, 10, 10);
      }

      ctx.restore();
    }
  }

  ctx.restore();
}

export async function syncVideosForTime(
  project: Project,
  time: number,
  assetMap: Map<string, Asset>,
  exactSeek: boolean
): Promise<void> {
  const active = getSortedActiveClips(project, time);
  const promises: Promise<void>[] = [];

  for (const { clip } of active) {
    if (!clip.assetId) continue;
    const asset = assetMap.get(clip.assetId);
    if (!asset || asset.mediaType !== 'video') continue;
    const video = await mediaCache.loadVideo(asset).catch(() => undefined);
    if (!video) continue;

    const targetTime = Math.max(
      0,
      Math.min(
        video.duration || 999,
        (clip.sourceOffset || 0) + (time - clip.startTime) * (clip.playbackRate || 1)
      )
    );

    if (exactSeek) {
      if (Math.abs(video.currentTime - targetTime) > 0.01) {
        promises.push(
          new Promise<void>((resolve) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              resolve();
            };
            video.addEventListener('seeked', onSeeked, { once: true });
            video.currentTime = targetTime;
            window.setTimeout(resolve, 150);
          })
        );
      }
    } else if (Math.abs(video.currentTime - targetTime) > 0.18) {
      video.currentTime = targetTime;
    }
  }

  await Promise.all(promises);
}
