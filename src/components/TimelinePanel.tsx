import React, { useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Diamond,
  Eye,
  EyeOff,
  Film,
  Image as ImageIcon,
  Lock,
  Magnet,
  Music,
  Plus,
  Scissors,
  Trash2,
  Type,
  Unlock,
  UserSquare2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Clip, Project, Track, TrackType } from '../types/project';

interface TimelinePanelProps {
  project: Project;
  playheadTime: number;
  selectedClipId: string | null;
  onSeek: (time: number) => void;
  onSelectClip: (clipId: string | null) => void;
  onMoveResizeClip: (
    clipId: string,
    patch: { startTime?: number; duration?: number; sourceOffset?: number; trackId?: string },
    recordHistory: boolean
  ) => void;
  onSplitClip: (clipId: string) => void;
  onDuplicateClip: (clipId: string) => void;
  onDeleteClip: (clipId: string) => void;
  onAddTrack: (type: TrackType) => void;
  onUpdateTrack: (trackId: string, patch: Partial<Track>) => void;
  onMoveTrack: (trackId: string, dir: 'up' | 'down') => void;
  onDeleteTrack: (trackId: string) => void;
  onDropAssetOnTrack: (assetId: string, trackId: string, startTime: number) => void;
  onChangeDuration: (duration: number) => void;
}

type ClipDragState = {
  mode: 'move' | 'trim-left' | 'trim-right';
  clipId: string;
  startClientX: number;
  origStart: number;
  origDuration: number;
  origSourceOffset: number;
  origTrackId: string;
};

function trackColorClasses(clip: Clip): string {
  switch (clip.kind) {
    case 'character':
    case 'spritesheet':
      return 'bg-cyan-500/20 border-cyan-500/60 text-cyan-100';
    case 'text':
      return 'bg-indigo-500/20 border-indigo-400/60 text-indigo-100';
    case 'audio':
      return 'bg-emerald-500/20 border-emerald-500/60 text-emerald-100';
    case 'video':
      return 'bg-orange-500/20 border-orange-500/60 text-orange-100';
    default:
      return 'bg-sky-500/20 border-sky-500/60 text-sky-100';
  }
}

function TrackIcon({ type }: { type: TrackType }) {
  switch (type) {
    case 'character':
      return <UserSquare2 className="h-3.5 w-3.5 text-cyan-400 shrink-0" />;
    case 'text':
      return <Type className="h-3.5 w-3.5 text-indigo-400 shrink-0" />;
    case 'audio':
      return <Music className="h-3.5 w-3.5 text-emerald-400 shrink-0" />;
    case 'video':
      return <Film className="h-3.5 w-3.5 text-orange-400 shrink-0" />;
    default:
      return <ImageIcon className="h-3.5 w-3.5 text-sky-400 shrink-0" />;
  }
}

export const TimelinePanel: React.FC<TimelinePanelProps> = ({
  project,
  playheadTime,
  selectedClipId,
  onSeek,
  onSelectClip,
  onMoveResizeClip,
  onSplitClip,
  onDuplicateClip,
  onDeleteClip,
  onAddTrack,
  onUpdateTrack,
  onMoveTrack,
  onDeleteTrack,
  onDropAssetOnTrack,
  onChangeDuration,
}) => {
  const [pxPerSec, setPxPerSec] = useState(80);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [addTrackMenuOpen, setAddTrackMenuOpen] = useState(false);

  const lanesScrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<ClipDragState | null>(null);
  const latestPatchRef = useRef<{
    clipId: string;
    patch: { startTime?: number; duration?: number; sourceOffset?: number; trackId?: string };
  } | null>(null);

  const sortedTracks = [...project.tracks].sort((a, b) => a.order - b.order);
  const timelineWidth = Math.max(700, Math.ceil((project.duration + 2) * pxPerSec));

  const selectedClip = project.clips.find((c) => c.id === selectedClipId) || null;
  const canSplit =
    Boolean(selectedClip) &&
    playheadTime > selectedClip!.startTime + 0.1 &&
    playheadTime < selectedClip!.startTime + selectedClip!.duration - 0.1;

  const snapTime = (rawTime: number, excludeClipId: string): number => {
    const t = Math.max(0, rawTime);
    if (!snapEnabled) return Number(t.toFixed(3));
    const thresholdSec = 10 / pxPerSec;
    const candidates = [0, playheadTime];
    for (const c of project.clips) {
      if (c.id === excludeClipId) continue;
      candidates.push(c.startTime, c.startTime + c.duration);
    }
    let best = t;
    let bestDist = thresholdSec;
    for (const cand of candidates) {
      const dist = Math.abs(t - cand);
      if (dist < bestDist) {
        bestDist = dist;
        best = cand;
      }
    }
    return Number(best.toFixed(3));
  };

  const handleRulerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const updateFromClientX = (clientX: number) => {
      const x = Math.max(0, clientX - rect.left);
      const t = Math.min(project.duration, x / pxPerSec);
      onSeek(Number(t.toFixed(3)));
    };
    updateFromClientX(e.clientX);

    const onMove = (ev: PointerEvent) => updateFromClientX(ev.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startClipDrag = (
    e: React.PointerEvent,
    clip: Clip,
    mode: 'move' | 'trim-left' | 'trim-right'
  ) => {
    e.stopPropagation();
    onSelectClip(clip.id);
    const track = project.tracks.find((t) => t.id === clip.trackId);
    if (track?.locked) return;

    dragRef.current = {
      mode,
      clipId: clip.id,
      startClientX: e.clientX,
      origStart: clip.startTime,
      origDuration: clip.duration,
      origSourceOffset: clip.sourceOffset || 0,
      origTrackId: clip.trackId,
    };

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = ev.clientX - drag.startClientX;
      const dt = dx / pxPerSec;

      if (drag.mode === 'move') {
        const nextStart = snapTime(drag.origStart + dt, drag.clipId);
        const patch = { startTime: Math.max(0, nextStart) };
        latestPatchRef.current = { clipId: drag.clipId, patch };
        onMoveResizeClip(drag.clipId, patch, false);
      } else if (drag.mode === 'trim-right') {
        const rawEnd = drag.origStart + drag.origDuration + dt;
        const snappedEnd = snapTime(rawEnd, drag.clipId);
        const nextDur = Math.max(0.2, snappedEnd - drag.origStart);
        const patch = { duration: Number(nextDur.toFixed(3)) };
        latestPatchRef.current = { clipId: drag.clipId, patch };
        onMoveResizeClip(drag.clipId, patch, false);
      } else if (drag.mode === 'trim-left') {
        const maxTrim = drag.origDuration - 0.2;
        const clampedDt = Math.min(maxTrim, Math.max(-drag.origStart, dt));
        const nextStart = snapTime(drag.origStart + clampedDt, drag.clipId);
        const appliedDelta = nextStart - drag.origStart;
        const nextDur = Math.max(0.2, drag.origDuration - appliedDelta);
        const nextOffset = Math.max(0, drag.origSourceOffset + appliedDelta);
        const patch = {
          startTime: Number(nextStart.toFixed(3)),
          duration: Number(nextDur.toFixed(3)),
          sourceOffset: Number(nextOffset.toFixed(3)),
        };
        latestPatchRef.current = { clipId: drag.clipId, patch };
        onMoveResizeClip(drag.clipId, patch, false);
      }
    };

    const onUp = () => {
      if (dragRef.current && latestPatchRef.current) {
        onMoveResizeClip(latestPatchRef.current.clipId, latestPatchRef.current.patch, true);
      }
      dragRef.current = null;
      latestPatchRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Ruler tick marks
  const tickInterval = pxPerSec >= 120 ? 0.5 : pxPerSec >= 60 ? 1 : 2;
  const ticks: number[] = [];
  for (let t = 0; t <= project.duration + 2; t += tickInterval) {
    ticks.push(Number(t.toFixed(2)));
  }

  return (
    <section className="flex h-[260px] sm:h-[280px] shrink-0 flex-col border-t border-slate-800/90 bg-[#0E121B]">
      {/* Timeline Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 bg-[#111622] px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!canSplit}
            onClick={() => selectedClip && onSplitClip(selectedClip.id)}
            title="Split Selected Clip at Playhead"
            className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#161C2B] px-2.5 py-1 text-[11px] font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none"
          >
            <Scissors className="h-3.5 w-3.5 text-cyan-400" />
            <span>Split</span>
          </button>

          <button
            type="button"
            disabled={!selectedClip}
            onClick={() => selectedClip && onDuplicateClip(selectedClip.id)}
            title="Duplicate Selected Clip"
            className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#161C2B] px-2.5 py-1 text-[11px] font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-35 disabled:pointer-events-none"
          >
            <Copy className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Duplicate</span>
          </button>

          <button
            type="button"
            disabled={!selectedClip}
            onClick={() => selectedClip && onDeleteClip(selectedClip.id)}
            title="Delete Selected Clip (Delete)"
            className="flex items-center gap-1 rounded-lg border border-slate-800 bg-[#161C2B] px-2.5 py-1 text-[11px] font-medium text-rose-300 transition hover:bg-rose-500/15 disabled:opacity-35 disabled:pointer-events-none"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Delete</span>
          </button>

          <div className="relative ml-1">
            <button
              type="button"
              onClick={() => setAddTrackMenuOpen((o) => !o)}
              className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-700"
            >
              <Plus className="h-3.5 w-3.5 text-cyan-400" />
              <span>Add Track</span>
            </button>
            {addTrackMenuOpen && (
              <div className="absolute left-0 bottom-full mb-1 z-30 w-40 rounded-xl border border-slate-800 bg-[#141A26] p-1 shadow-xl">
                {(
                  [
                    { type: 'character', label: 'Character Track' },
                    { type: 'image', label: 'Image / Prop Track' },
                    { type: 'text', label: 'Text Track' },
                    { type: 'video', label: 'Video Track' },
                    { type: 'audio', label: 'Audio Track' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => {
                      onAddTrack(item.type);
                      setAddTrackMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800"
                  >
                    <TrackIcon type={item.type} />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <label className="flex items-center gap-1 text-[11px] text-slate-400">
            <span className="hidden sm:inline">Duration:</span>
            <input
              type="number"
              min={2}
              max={300}
              step={1}
              value={Math.round(project.duration)}
              onChange={(e) => onChangeDuration(Math.max(2, Number(e.target.value) || 10))}
              className="w-14 rounded border border-slate-800 bg-[#0B0E14] px-1.5 py-0.5 font-mono text-[11px] text-white text-center"
            />
            <span>s</span>
          </label>

          <button
            type="button"
            onClick={() => setSnapEnabled((s) => !s)}
            title="Toggle Magnetic Snapping"
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
              snapEnabled
                ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-300'
                : 'border-slate-800 bg-[#161C2B] text-slate-400'
            }`}
          >
            <Magnet className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Snap</span>
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPxPerSec((z) => Math.max(25, z - 15))}
              title="Zoom Out Timeline"
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <input
              type="range"
              min={25}
              max={220}
              value={pxPerSec}
              onChange={(e) => setPxPerSec(Number(e.target.value))}
              className="studio-range w-20"
            />
            <button
              type="button"
              onClick={() => setPxPerSec((z) => Math.min(220, z + 15))}
              title="Zoom In Timeline"
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Split: Track Headers (left) + Scrollable Time Ruler & Lanes (right) */}
      <div className="flex flex-1 overflow-hidden">
        {/* Track Headers */}
        <div className="w-[180px] sm:w-[215px] shrink-0 border-r border-slate-800/80 bg-[#0D1119] overflow-y-auto">
          {/* Spacer aligned with ruler */}
          <div className="h-7 border-b border-slate-800/80 px-3 flex items-center text-[10px] font-medium text-slate-500">
            TRACKS ({sortedTracks.length})
          </div>

          {sortedTracks.map((track, idx) => (
            <div
              key={track.id}
              className="flex h-11 items-center justify-between gap-1 border-b border-slate-800/60 px-2 text-xs hover:bg-slate-900/40"
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <TrackIcon type={track.type} />
                <span className="truncate text-[11px] font-medium text-slate-200" title={track.name}>
                  {track.name}
                </span>
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onMoveTrack(track.id, 'up')}
                  disabled={idx === 0}
                  title="Move Track Up (Front)"
                  className="rounded p-0.5 text-slate-500 hover:text-slate-200 disabled:opacity-25"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onMoveTrack(track.id, 'down')}
                  disabled={idx === sortedTracks.length - 1}
                  title="Move Track Down (Back)"
                  className="rounded p-0.5 text-slate-500 hover:text-slate-200 disabled:opacity-25"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>

                {(track.type === 'audio' || track.type === 'video') && (
                  <button
                    type="button"
                    onClick={() => onUpdateTrack(track.id, { muted: !track.muted })}
                    title={track.muted ? 'Unmute Track' : 'Mute Track'}
                    className={`rounded p-0.5 ${
                      track.muted ? 'text-rose-400' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {track.muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onUpdateTrack(track.id, { visible: !track.visible })}
                  title={track.visible ? 'Hide Track' : 'Show Track'}
                  className={`rounded p-0.5 ${
                    !track.visible ? 'text-amber-400' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {track.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                </button>

                <button
                  type="button"
                  onClick={() => onUpdateTrack(track.id, { locked: !track.locked })}
                  title={track.locked ? 'Unlock Track' : 'Lock Track'}
                  className={`rounded p-0.5 ${
                    track.locked ? 'text-orange-400' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {track.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                </button>

                {sortedTracks.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onDeleteTrack(track.id)}
                    title="Delete Track"
                    className="rounded p-0.5 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable Time Ruler & Track Lanes */}
        <div
          ref={lanesScrollRef}
          className="relative flex-1 overflow-x-auto overflow-y-auto bg-[#0A0D14]"
          onClick={() => onSelectClip(null)}
        >
          <div className="relative min-h-full" style={{ width: timelineWidth }}>
            {/* Time Ruler */}
            <div
              onPointerDown={handleRulerPointerDown}
              className="sticky top-0 z-20 h-7 border-b border-slate-800 bg-[#111622] cursor-ew-resize select-none"
            >
              {ticks.map((t) => (
                <div
                  key={t}
                  className="absolute top-0 bottom-0 border-l border-slate-700/70 pl-1 font-mono text-[10px] text-slate-400 tabular-nums"
                  style={{ left: t * pxPerSec }}
                >
                  {t}s
                </div>
              ))}
            </div>

            {/* Helpful Empty Timeline State */}
            {project.clips.length === 0 && (
              <div className="pointer-events-none absolute inset-x-0 top-12 z-10 flex justify-center px-4">
                <div className="rounded-xl border border-dashed border-slate-800 bg-[#101521]/90 px-5 py-3 text-center">
                  <p className="text-xs font-medium text-slate-200">
                    Timeline is empty
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Click <strong>Add</strong> on any character, shape, text, or audio item in the left panel — or drag an asset straight onto a track below.
                  </p>
                </div>
              </div>
            )}

            {/* Track Lanes */}
            {sortedTracks.map((track) => {
              const laneClips = project.clips.filter((c) => c.trackId === track.id);
              return (
                <div
                  key={track.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const assetId = e.dataTransfer.getData('application/x-anicut-asset');
                    if (!assetId) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const dropX = Math.max(0, e.clientX - rect.left);
                    const startT = Number((dropX / pxPerSec).toFixed(2));
                    onDropAssetOnTrack(assetId, track.id, startT);
                  }}
                  className={`relative h-11 border-b border-slate-800/60 ${
                    track.locked ? 'bg-slate-900/30' : ''
                  } ${!track.visible ? 'opacity-45' : ''}`}
                >
                  {laneClips.map((clip) => {
                    const leftPx = clip.startTime * pxPerSec;
                    const widthPx = Math.max(24, clip.duration * pxPerSec);
                    const isSelected = clip.id === selectedClipId;

                    return (
                      <div
                        key={clip.id}
                        onPointerDown={(e) => startClipDrag(e, clip, 'move')}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectClip(clip.id);
                        }}
                        style={{ left: leftPx, width: widthPx }}
                        className={`group absolute top-1 bottom-1 flex items-center rounded-md border px-2 text-[11px] font-medium select-none cursor-grab active:cursor-grabbing ${trackColorClasses(
                          clip
                        )} ${isSelected ? 'ring-2 ring-white shadow-md z-10' : 'hover:brightness-110'}`}
                      >
                        {/* Left Trim Handle */}
                        <div
                          onPointerDown={(e) => startClipDrag(e, clip, 'trim-left')}
                          title="Trim clip start"
                          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-l-md hover:bg-white/30"
                        />

                        <span className="truncate pointer-events-none">{clip.name}</span>

                        {/* Keyframe Diamond Markers */}
                        {clip.keyframes.map((kf) => (
                          <button
                            key={kf.id}
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectClip(clip.id);
                              onSeek(clip.startTime + kf.time);
                            }}
                            title={`Keyframe @ ${kf.time.toFixed(2)}s (${kf.easing})`}
                            style={{ left: Math.max(4, Math.min(widthPx - 10, kf.time * pxPerSec - 5)) }}
                            className="absolute bottom-0.5 text-orange-300 hover:text-white hover:scale-125 transition"
                          >
                            <Diamond className="h-2.5 w-2.5 fill-current" />
                          </button>
                        ))}

                        {/* Right Trim Handle */}
                        <div
                          onPointerDown={(e) => startClipDrag(e, clip, 'trim-right')}
                          title="Resize clip duration"
                          className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize rounded-r-md hover:bg-white/30"
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Playhead Indicator Line */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 z-30 w-0.5 bg-orange-400"
              style={{ left: playheadTime * pxPerSec }}
            >
              <div className=" -ml-1.5 h-3 w-3.5 rounded-b-sm bg-orange-400" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
