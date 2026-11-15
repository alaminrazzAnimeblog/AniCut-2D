import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Diamond,
  Eye,
  Grid,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  SkipBack,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Asset, Clip, Project } from '../types/project';
import { CANVAS_PRESETS } from '../constants/presets';
import {
  evaluateClipTransform,
  getSortedActiveClips,
  renderFrame,
  syncVideosForTime,
} from '../engine/renderer';

interface CanvasStageProps {
  project: Project;
  assets: Asset[];
  playheadTime: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  onionSkin: boolean;
  showGrid: boolean;
  autoKeyframe: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSelectClip: (clipId: string | null) => void;
  onTransformClip: (
    clipId: string,
    patch: { x?: number; y?: number; width?: number; height?: number; rotation?: number },
    recordHistory: boolean
  ) => void;
  onToggleOnionSkin: () => void;
  onToggleGrid: () => void;
  onToggleAutoKeyframe: () => void;
  onChangeCanvasSize: (width: number, height: number) => void;
  onChangeBackgroundColor: (color: string) => void;
}

type DragMode =
  | { type: 'move'; clipId: string; startX: number; startY: number; origX: number; origY: number }
  | {
      type: 'resize';
      clipId: string;
      corner: 'tl' | 'tr' | 'br' | 'bl';
      startX: number;
      startY: number;
      origX: number;
      origY: number;
      origW: number;
      origH: number;
    }
  | {
      type: 'rotate';
      clipId: string;
      centerX: number;
      centerY: number;
      startAngle: number;
      origRotation: number;
    };

function formatTimecode(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export const CanvasStage: React.FC<CanvasStageProps> = ({
  project,
  assets,
  playheadTime,
  isPlaying,
  selectedClipId,
  onionSkin,
  showGrid,
  autoKeyframe,
  onTogglePlay,
  onSeek,
  onSelectClip,
  onTransformClip,
  onToggleOnionSkin,
  onToggleGrid,
  onToggleAutoKeyframe,
  onChangeCanvasSize,
  onChangeBackgroundColor,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [zoomMode, setZoomMode] = useState<'fit' | number>('fit');
  const [fitScale, setFitScale] = useState(0.5);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const dragRef = useRef<DragMode | null>(null);
  const latestTransformRef = useRef<{
    clipId: string;
    patch: { x?: number; y?: number; width?: number; height?: number; rotation?: number };
  } | null>(null);

  const assetMap = React.useMemo(() => {
    const map = new Map<string, Asset>();
    assets.forEach((a) => map.set(a.id, a));
    return map;
  }, [assets]);

  // Measure available stage space for 'fit' zoom
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const updateFit = () => {
      const pad = 40;
      const availW = Math.max(200, el.clientWidth - pad);
      const availH = Math.max(160, el.clientHeight - pad);
      const scale = Math.min(availW / project.width, availH / project.height, 1.5);
      setFitScale(Math.max(0.15, scale));
    };
    updateFit();
    const ro = new ResizeObserver(updateFit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [project.width, project.height]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const effectiveScale = zoomMode === 'fit' ? fitScale : zoomMode;

  // Render canvas whenever state changes
  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = async () => {
      await syncVideosForTime(project, playheadTime, assetMap, !isPlaying);
      if (cancelled) return;
      renderFrame(ctx, project, playheadTime, assetMap, {
        onionSkin: onionSkin && !isPlaying,
        selectedClipId: isPlaying ? null : selectedClipId,
        showSelectionGuides: !isPlaying,
        showGrid: showGrid && !isPlaying,
      });
    };

    draw();
    return () => {
      cancelled = true;
    };
  }, [project, playheadTime, assetMap, isPlaying, selectedClipId, onionSkin, showGrid]);

  const clientToCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * project.width,
        y: ((clientY - rect.top) / rect.height) * project.height,
      };
    },
    [project.width, project.height]
  );

  const hitTestPoint = useCallback(
    (px: number, py: number): { clip: Clip; handle: 'body' | 'tl' | 'tr' | 'br' | 'bl' | 'rotate' } | null => {
      const active = getSortedActiveClips(project, playheadTime);
      // Check selected clip handles first
      if (selectedClipId) {
        const sel = active.find((item) => item.clip.id === selectedClipId);
        if (sel && !sel.track.locked) {
          const t = evaluateClipTransform(
            sel.clip,
            playheadTime - sel.clip.startTime,
            project.width,
            project.height
          );
          const rad = (-t.rotation * Math.PI) / 180;
          const dx = px - t.x;
          const dy = py - t.y;
          const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
          const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
          const hw = t.width / 2;
          const hh = t.height / 2;
          const hr = 14 / Math.max(0.25, effectiveScale);

          if (Math.hypot(lx, ly - (-hh - 28)) <= hr) return { clip: sel.clip, handle: 'rotate' };
          if (Math.hypot(lx - -hw, ly - -hh) <= hr) return { clip: sel.clip, handle: 'tl' };
          if (Math.hypot(lx - hw, ly - -hh) <= hr) return { clip: sel.clip, handle: 'tr' };
          if (Math.hypot(lx - hw, ly - hh) <= hr) return { clip: sel.clip, handle: 'br' };
          if (Math.hypot(lx - -hw, ly - hh) <= hr) return { clip: sel.clip, handle: 'bl' };
        }
      }

      // Check clip bodies top-to-bottom
      for (let i = active.length - 1; i >= 0; i--) {
        const { clip, track } = active[i];
        if (track.locked) continue;
        const t = evaluateClipTransform(clip, playheadTime - clip.startTime, project.width, project.height);
        const rad = (-t.rotation * Math.PI) / 180;
        const dx = px - t.x;
        const dy = py - t.y;
        const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
        if (Math.abs(lx) <= t.width / 2 && Math.abs(ly) <= t.height / 2) {
          return { clip, handle: 'body' };
        }
      }

      return null;
    },
    [project, playheadTime, selectedClipId, effectiveScale]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isPlaying) return;
    const pt = clientToCanvas(e.clientX, e.clientY);
    const hit = hitTestPoint(pt.x, pt.y);
    if (!hit) {
      onSelectClip(null);
      return;
    }

    onSelectClip(hit.clip.id);
    const t = evaluateClipTransform(
      hit.clip,
      playheadTime - hit.clip.startTime,
      project.width,
      project.height
    );

    if (hit.handle === 'rotate') {
      const startAngle = Math.atan2(pt.y - t.y, pt.x - t.x) * (180 / Math.PI);
      dragRef.current = {
        type: 'rotate',
        clipId: hit.clip.id,
        centerX: t.x,
        centerY: t.y,
        startAngle,
        origRotation: t.rotation,
      };
    } else if (hit.handle === 'body') {
      dragRef.current = {
        type: 'move',
        clipId: hit.clip.id,
        startX: pt.x,
        startY: pt.y,
        origX: t.x,
        origY: t.y,
      };
    } else {
      dragRef.current = {
        type: 'resize',
        clipId: hit.clip.id,
        corner: hit.handle,
        startX: pt.x,
        startY: pt.y,
        origX: t.x,
        origY: t.y,
        origW: t.width,
        origH: t.height,
      };
    }

    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const pt = clientToCanvas(e.clientX, e.clientY);

    if (drag.type === 'move') {
      const patch = {
        x: Math.round(drag.origX + (pt.x - drag.startX)),
        y: Math.round(drag.origY + (pt.y - drag.startY)),
      };
      latestTransformRef.current = { clipId: drag.clipId, patch };
      onTransformClip(drag.clipId, patch, false);
    } else if (drag.type === 'rotate') {
      const curAngle = Math.atan2(pt.y - drag.centerY, pt.x - drag.centerX) * (180 / Math.PI);
      const patch = {
        rotation: Math.round(drag.origRotation + (curAngle - drag.startAngle)),
      };
      latestTransformRef.current = { clipId: drag.clipId, patch };
      onTransformClip(drag.clipId, patch, false);
    } else if (drag.type === 'resize') {
      const dx = pt.x - drag.startX;
      const dy = pt.y - drag.startY;
      const signX = drag.corner === 'tr' || drag.corner === 'br' ? 1 : -1;
      const signY = drag.corner === 'br' || drag.corner === 'bl' ? 1 : -1;
      const newW = Math.max(16, Math.round(drag.origW + dx * signX * 2));
      const newH = Math.max(16, Math.round(drag.origH + dy * signY * 2));
      const patch = { width: newW, height: newH };
      latestTransformRef.current = { clipId: drag.clipId, patch };
      onTransformClip(drag.clipId, patch, false);
    }
  };

  const handlePointerUp = () => {
    if (dragRef.current && latestTransformRef.current) {
      onTransformClip(latestTransformRef.current.clipId, latestTransformRef.current.patch, true);
    }
    dragRef.current = null;
    latestTransformRef.current = null;
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen().catch(() => undefined);
    } else {
      await document.exitFullscreen().catch(() => undefined);
    }
  };

  const frameStep = 1 / Math.max(1, project.fps || 30);

  return (
    <section
      ref={containerRef}
      className="flex flex-1 flex-col bg-[#0B0E14] min-w-0 min-h-[280px] overflow-hidden"
    >
      {/* Top Stage Utility Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-[#0E121B] px-3 py-1.5 text-xs">
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-slate-400">Canvas:</label>
          <select
            value={`${project.width}x${project.height}`}
            onChange={(e) => {
              const [w, h] = e.target.value.split('x').map(Number);
              if (w && h) onChangeCanvasSize(w, h);
            }}
            className="rounded-md border border-slate-800 bg-[#151B28] px-2 py-1 text-[11px] font-medium text-slate-200 outline-none focus:border-cyan-500"
          >
            {CANVAS_PRESETS.map((p) => (
              <option key={p.id} value={`${p.width}x${p.height}`}>
                {p.label}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-1.5 rounded-md border border-slate-800 bg-[#151B28] px-2 py-1 text-[11px] text-slate-300 cursor-pointer">
            <span>BG</span>
            <input
              type="color"
              value={project.backgroundColor}
              onChange={(e) => onChangeBackgroundColor(e.target.value)}
              className="h-3.5 w-4 cursor-pointer rounded border-0 bg-transparent p-0"
            />
          </label>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleOnionSkin}
            title="Onion Skin: Preview previous (cyan) and next (amber) animation frames"
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition ${
              onionSkin
                ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300'
                : 'border-slate-800 bg-[#151B28] text-slate-400 hover:text-slate-200'
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Onion Skin</span>
          </button>

          <button
            type="button"
            onClick={onToggleGrid}
            title="Toggle Stage Alignment Grid"
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition ${
              showGrid
                ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300'
                : 'border-slate-800 bg-[#151B28] text-slate-400 hover:text-slate-200'
            }`}
          >
            <Grid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Grid</span>
          </button>

          <button
            type="button"
            onClick={onToggleAutoKeyframe}
            title="Auto-Keyframe: Moving/resizing on canvas creates or updates keyframes at playhead"
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition ${
              autoKeyframe
                ? 'border-orange-500/50 bg-orange-500/15 text-orange-300'
                : 'border-slate-800 bg-[#151B28] text-slate-400 hover:text-slate-200'
            }`}
          >
            <Diamond className="h-3 w-3" />
            <span className="hidden sm:inline">Auto-Key</span>
          </button>
        </div>
      </div>

      {/* Canvas Viewport */}
      <div
        ref={viewportRef}
        className="relative flex flex-1 items-center justify-center overflow-auto bg-[#080B10] p-4"
      >
        <div
          className="relative shadow-2xl ring-1 ring-slate-800 bg-checkerboard"
          style={{
            width: Math.round(project.width * effectiveScale),
            height: Math.round(project.height * effectiveScale),
          }}
        >
          <canvas
            ref={canvasRef}
            width={project.width}
            height={project.height}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="block h-full w-full touch-none cursor-crosshair"
          />
        </div>
      </div>

      {/* Bottom Transport & Zoom Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 bg-[#0E121B] px-3 py-2">
        {/* Timecode */}
        <div className="font-mono text-xs tabular-nums text-slate-300 min-w-[130px]">
          <span className="text-cyan-400 font-semibold">{formatTimecode(playheadTime)}</span>
          <span className="text-slate-600 mx-1">/</span>
          <span className="text-slate-400">{formatTimecode(project.duration)}</span>
        </div>

        {/* Play / Pause / Frame Step */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSeek(0)}
            title="Jump to Start"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onSeek(Math.max(0, playheadTime - frameStep))}
            title="Previous Frame"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            title="Play / Pause (Space)"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500 text-slate-950 transition hover:bg-cyan-400"
          >
            {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => onSeek(Math.min(project.duration, playheadTime + frameStep))}
            title="Next Frame"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Zoom & Fullscreen */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              setZoomMode((z) => {
                const cur = z === 'fit' ? fitScale : z;
                return Math.max(0.2, Number((cur - 0.15).toFixed(2)));
              })
            }
            title="Zoom Out Canvas"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoomMode('fit')}
            className="rounded-md border border-slate-800 bg-[#151B28] px-2 py-0.5 font-mono text-[11px] tabular-nums text-slate-300 hover:text-white"
          >
            {zoomMode === 'fit' ? `Fit (${Math.round(fitScale * 100)}%)` : `${Math.round(zoomMode * 100)}%`}
          </button>
          <button
            type="button"
            onClick={() =>
              setZoomMode((z) => {
                const cur = z === 'fit' ? fitScale : z;
                return Math.min(2.0, Number((cur + 0.15).toFixed(2)));
              })
            }
            title="Zoom In Canvas"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            title="Toggle Fullscreen Preview"
            className="ml-1 rounded-md border border-slate-800 bg-[#151B28] p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </section>
  );
};
