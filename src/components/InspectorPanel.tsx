import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Diamond,
  FlipHorizontal,
  FlipVertical,
  Palette,
  Sliders,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  Asset,
  Clip,
  EasingType,
  Keyframe,
  MotionPreset,
  Project,
  ShapeType,
  TransitionType,
} from '../types/project';
import {
  DEFAULT_FILTERS,
  DEFAULT_FONT_FAMILIES,
  MOTION_PRESETS,
  SHAPE_CATALOG,
  TRANSITIONS,
  createId,
} from '../constants/presets';
import { evaluateClipTransform } from '../engine/renderer';

interface InspectorPanelProps {
  project: Project;
  selectedClip: Clip | null;
  selectedAsset: Asset | null;
  playheadTime: number;
  onUpdateClip: (clipId: string, updater: (clip: Clip) => Clip, recordHistory?: boolean) => void;
  onLayerOrder: (clipId: string, direction: 'forward' | 'backward') => void;
  onSeek: (time: number) => void;
}

type InspectorTab = 'transform' | 'animation' | 'style';

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  project,
  selectedClip,
  selectedAsset,
  playheadTime,
  onUpdateClip,
  onLayerOrder,
  onSeek,
}) => {
  const [tab, setTab] = useState<InspectorTab>('transform');
  const [newKfEasing, setNewKfEasing] = useState<EasingType>('ease-in-out');

  if (!selectedClip) {
    return (
      <aside className="flex h-full w-full lg:w-[300px] shrink-0 flex-col border-l border-slate-800/90 bg-[#10141E] p-4">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <Sliders className="h-8 w-8 text-slate-600 mb-3" />
          <p className="font-display text-sm font-semibold text-slate-200">Properties Inspector</p>
          <p className="mt-1.5 text-xs text-slate-400 leading-relaxed max-w-[220px]">
            Select any character, image, shape, text, or audio clip on the canvas or timeline to edit its transform, keyframes, and effects.
          </p>
          <div className="mt-6 w-full rounded-xl border border-slate-800/80 bg-[#0D1119] p-3 text-left text-[11px] text-slate-400 space-y-1.5">
            <p className="font-medium text-slate-200">Quick Shortcuts</p>
            <div className="flex justify-between"><span>Play / Pause</span><span className="font-mono text-slate-300">Space</span></div>
            <div className="flex justify-between"><span>Undo / Redo</span><span className="font-mono text-slate-300">Ctrl+Z / Y</span></div>
            <div className="flex justify-between"><span>Save Project</span><span className="font-mono text-slate-300">Ctrl+S</span></div>
            <div className="flex justify-between"><span>Delete Clip</span><span className="font-mono text-slate-300">Delete</span></div>
          </div>
        </div>
      </aside>
    );
  }

  const localTime = Math.max(0, Math.min(selectedClip.duration, playheadTime - selectedClip.startTime));
  const evaluated = evaluateClipTransform(selectedClip, localTime, project.width, project.height);
  const isAudioOnly = selectedClip.kind === 'audio';
  const hasAudio = selectedClip.kind === 'audio' || selectedClip.kind === 'video';

  const setTransformValue = (
    prop: 'x' | 'y' | 'width' | 'height' | 'rotation' | 'opacity',
    val: number
  ) => {
    onUpdateClip(selectedClip.id, (clip) => {
      if (clip.keyframes.length === 0) {
        return { ...clip, [prop]: val };
      }
      // Update keyframe near playhead or insert one
      const existingIdx = clip.keyframes.findIndex((k) => Math.abs(k.time - localTime) < 0.08);
      if (existingIdx >= 0) {
        const nextKfs = [...clip.keyframes];
        nextKfs[existingIdx] = { ...nextKfs[existingIdx], [prop]: val };
        return { ...clip, keyframes: nextKfs };
      }
      const newKf: Keyframe = {
        id: createId('kf'),
        time: Number(localTime.toFixed(3)),
        easing: newKfEasing,
        [prop]: val,
      };
      return {
        ...clip,
        keyframes: [...clip.keyframes, newKf].sort((a, b) => a.time - b.time),
      };
    });
  };

  const addFullKeyframeAtPlayhead = () => {
    onUpdateClip(selectedClip.id, (clip) => {
      const existingIdx = clip.keyframes.findIndex((k) => Math.abs(k.time - localTime) < 0.08);
      const snapshot: Keyframe = {
        id: existingIdx >= 0 ? clip.keyframes[existingIdx].id : createId('kf'),
        time: Number(localTime.toFixed(3)),
        easing: newKfEasing,
        x: Math.round(evaluated.x),
        y: Math.round(evaluated.y),
        width: Math.round(evaluated.width),
        height: Math.round(evaluated.height),
        rotation: Math.round(evaluated.rotation),
        opacity: Number(evaluated.opacity.toFixed(2)),
      };
      const nextKfs =
        existingIdx >= 0
          ? clip.keyframes.map((k, idx) => (idx === existingIdx ? snapshot : k))
          : [...clip.keyframes, snapshot].sort((a, b) => a.time - b.time);
      return { ...clip, keyframes: nextKfs };
    });
  };

  const scalePercent = Math.round((evaluated.width / Math.max(1, selectedClip.width)) * 100);

  return (
    <aside className="flex h-full w-full lg:w-[300px] shrink-0 flex-col border-l border-slate-800/90 bg-[#10141E]">
      {/* Clip Header */}
      <div className="border-b border-slate-800/80 px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <input
            type="text"
            value={selectedClip.name}
            onChange={(e) =>
              onUpdateClip(selectedClip.id, (c) => ({ ...c, name: e.target.value }), false)
            }
            className="w-full truncate rounded bg-transparent text-sm font-semibold text-white outline-none focus:bg-[#0B0E14] focus:px-1.5"
          />
          <span className="text-[10px] uppercase text-cyan-400 font-medium shrink-0">
            {selectedClip.kind}
          </span>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="grid grid-cols-3 gap-1 border-b border-slate-800/80 bg-[#0D1119] p-1.5">
        <button
          type="button"
          onClick={() => setTab('transform')}
          className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium transition ${
            tab === 'transform' ? 'bg-slate-800 text-cyan-300' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="h-3.5 w-3.5" />
          Transform
        </button>
        <button
          type="button"
          onClick={() => setTab('animation')}
          className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium transition ${
            tab === 'animation' ? 'bg-slate-800 text-orange-300' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Animate
        </button>
        <button
          type="button"
          onClick={() => setTab('style')}
          className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium transition ${
            tab === 'style' ? 'bg-slate-800 text-emerald-300' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Palette className="h-3.5 w-3.5" />
          Style
        </button>
      </div>

      {/* Scrollable Inspector Body */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
        {/* TRANSFORM TAB */}
        {tab === 'transform' && (
          <>
            {!isAudioOnly && (
              <>
                <div className="space-y-2.5">
                  <p className="text-[11px] font-semibold text-slate-300">Position &amp; Size</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[10px] text-slate-400">Position X</span>
                      <input
                        type="number"
                        value={Math.round(evaluated.x)}
                        onChange={(e) => setTransformValue('x', Number(e.target.value))}
                        className="mt-0.5 w-full rounded-lg border border-slate-800 bg-[#0B0E14] px-2.5 py-1.5 font-mono text-xs text-white outline-none focus:border-cyan-500"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-slate-400">Position Y</span>
                      <input
                        type="number"
                        value={Math.round(evaluated.y)}
                        onChange={(e) => setTransformValue('y', Number(e.target.value))}
                        className="mt-0.5 w-full rounded-lg border border-slate-800 bg-[#0B0E14] px-2.5 py-1.5 font-mono text-xs text-white outline-none focus:border-cyan-500"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-slate-400">Width</span>
                      <input
                        type="number"
                        min={8}
                        value={Math.round(evaluated.width)}
                        onChange={(e) => setTransformValue('width', Math.max(8, Number(e.target.value)))}
                        className="mt-0.5 w-full rounded-lg border border-slate-800 bg-[#0B0E14] px-2.5 py-1.5 font-mono text-xs text-white outline-none focus:border-cyan-500"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[10px] text-slate-400">Height</span>
                      <input
                        type="number"
                        min={8}
                        value={Math.round(evaluated.height)}
                        onChange={(e) => setTransformValue('height', Math.max(8, Number(e.target.value)))}
                        className="mt-0.5 w-full rounded-lg border border-slate-800 bg-[#0B0E14] px-2.5 py-1.5 font-mono text-xs text-white outline-none focus:border-cyan-500"
                      />
                    </label>
                  </div>
                </div>

                {/* Scale */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-300">Uniform Scale</span>
                    <span className="font-mono text-slate-400 tabular-nums">{scalePercent}%</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={300}
                    value={Math.min(300, Math.max(10, scalePercent))}
                    onChange={(e) => {
                      const ratio = Number(e.target.value) / 100;
                      const nw = Math.max(16, Math.round(selectedClip.width * ratio));
                      const nh = Math.max(16, Math.round(selectedClip.height * ratio));
                      onUpdateClip(selectedClip.id, (c) => ({ ...c, width: nw, height: nh }));
                    }}
                    className="studio-range w-full"
                  />
                </div>

                {/* Rotation */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-300">Rotation</span>
                    <span className="font-mono text-slate-400 tabular-nums">{Math.round(evaluated.rotation)}°</span>
                  </div>
                  <input
                    type="range"
                    min={-360}
                    max={360}
                    value={Math.max(-360, Math.min(360, Math.round(evaluated.rotation)))}
                    onChange={(e) => setTransformValue('rotation', Number(e.target.value))}
                    className="studio-range w-full"
                  />
                </div>

                {/* Opacity */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-300">Opacity</span>
                    <span className="font-mono text-slate-400 tabular-nums">
                      {Math.round(evaluated.opacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(evaluated.opacity * 100)}
                    onChange={(e) => setTransformValue('opacity', Number(e.target.value) / 100)}
                    className="studio-range w-full"
                  />
                </div>

                {/* Layer Order */}
                <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                  <span className="text-[11px] font-semibold text-slate-300">Layer Order</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => onLayerOrder(selectedClip.id, 'forward')}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-[#151B28] py-1.5 text-[11px] text-slate-200 hover:bg-slate-800"
                    >
                      <ArrowUp className="h-3.5 w-3.5 text-cyan-400" />
                      Bring Forward
                    </button>
                    <button
                      type="button"
                      onClick={() => onLayerOrder(selectedClip.id, 'backward')}
                      className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-800 bg-[#151B28] py-1.5 text-[11px] text-slate-200 hover:bg-slate-800"
                    >
                      <ArrowDown className="h-3.5 w-3.5 text-slate-400" />
                      Send Backward
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Audio Controls */}
            {hasAudio && (
              <div className="space-y-3 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-300">Audio Level</span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, (c) => ({
                        ...c,
                        audioData: {
                          volume: c.audioData?.volume ?? 1,
                          muted: !(c.audioData?.muted ?? false),
                        },
                      }))
                    }
                    className="flex items-center gap-1 rounded-md border border-slate-800 bg-[#151B28] px-2 py-1 text-[11px] text-slate-200"
                  >
                    {selectedClip.audioData?.muted ? (
                      <>
                        <VolumeX className="h-3.5 w-3.5 text-rose-400" />
                        <span>Muted</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="h-3.5 w-3.5 text-emerald-400" />
                        <span>{Math.round((selectedClip.audioData?.volume ?? 1) * 100)}%</span>
                      </>
                    )}
                  </button>
                </div>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={Math.round((selectedClip.audioData?.volume ?? 1) * 100)}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, (c) => ({
                      ...c,
                      audioData: {
                        muted: c.audioData?.muted ?? false,
                        volume: Number(e.target.value) / 100,
                      },
                    }))
                  }
                  className="studio-range w-full"
                />
              </div>
            )}

            {/* Timing & Playback Speed */}
            <div className="space-y-2 pt-2 border-t border-slate-800/80">
              <p className="text-[11px] font-semibold text-slate-300">Timing &amp; Speed</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[10px] text-slate-400">Duration (s)</span>
                  <input
                    type="number"
                    step={0.1}
                    min={0.2}
                    value={Number(selectedClip.duration.toFixed(2))}
                    onChange={(e) =>
                      onUpdateClip(selectedClip.id, (c) => ({
                        ...c,
                        duration: Math.max(0.2, Number(e.target.value) || 0.2),
                      }))
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-800 bg-[#0B0E14] px-2.5 py-1.5 font-mono text-xs text-white"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] text-slate-400">Speed</span>
                  <select
                    value={selectedClip.playbackRate || 1}
                    onChange={(e) =>
                      onUpdateClip(selectedClip.id, (c) => ({
                        ...c,
                        playbackRate: Number(e.target.value),
                      }))
                    }
                    className="mt-0.5 w-full rounded-lg border border-slate-800 bg-[#0B0E14] px-2 py-1.5 font-mono text-xs text-white"
                  >
                    <option value={0.5}>0.5x</option>
                    <option value={0.75}>0.75x</option>
                    <option value={1}>1.0x</option>
                    <option value={1.25}>1.25x</option>
                    <option value={1.5}>1.5x</option>
                    <option value={2}>2.0x</option>
                  </select>
                </label>
              </div>
            </div>
          </>
        )}

        {/* ANIMATION & KEYFRAMES TAB */}
        {tab === 'animation' && (
          <>
            {!isAudioOnly && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-slate-300">Keyframes</p>
                  <span className="font-mono text-[10px] text-slate-400">
                    @ {localTime.toFixed(2)}s
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={newKfEasing}
                    onChange={(e) => setNewKfEasing(e.target.value as EasingType)}
                    className="rounded-lg border border-slate-800 bg-[#0B0E14] px-2 py-1.5 text-[11px] text-slate-200 outline-none"
                  >
                    <option value="linear">Linear</option>
                    <option value="ease-in">Ease In</option>
                    <option value="ease-out">Ease Out</option>
                    <option value="ease-in-out">Ease In/Out</option>
                  </select>

                  <button
                    type="button"
                    onClick={addFullKeyframeAtPlayhead}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-orange-400"
                  >
                    <Diamond className="h-3.5 w-3.5 fill-current" />
                    Set Keyframe
                  </button>
                </div>

                {selectedClip.keyframes.length === 0 ? (
                  <p className="rounded-lg border border-slate-800/80 bg-[#0D1119] p-2.5 text-[11px] text-slate-400 leading-relaxed">
                    Move the playhead, click <strong>Set Keyframe</strong>, then move the playhead again and reposition your object to animate!
                  </p>
                ) : (
                  <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {selectedClip.keyframes.map((kf) => (
                      <div
                        key={kf.id}
                        className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#151B28] px-2.5 py-1.5 text-[11px]"
                      >
                        <button
                          type="button"
                          onClick={() => onSeek(selectedClip.startTime + kf.time)}
                          className="flex items-center gap-1.5 text-left text-slate-200 hover:text-cyan-300"
                        >
                          <Diamond className="h-3 w-3 text-orange-400 fill-current" />
                          <span className="font-mono tabular-nums">{kf.time.toFixed(2)}s</span>
                          <span className="text-[10px] text-slate-500">· {kf.easing}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateClip(selectedClip.id, (c) => ({
                              ...c,
                              keyframes: c.keyframes.filter((item) => item.id !== kf.id),
                            }))
                          }
                          className="text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Motion Presets & Transitions */}
            {!isAudioOnly && (
              <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
                <label className="block">
                  <span className="text-[11px] font-semibold text-slate-300">Motion Preset</span>
                  <select
                    value={selectedClip.motionPreset}
                    onChange={(e) =>
                      onUpdateClip(selectedClip.id, (c) => ({
                        ...c,
                        motionPreset: e.target.value as MotionPreset,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-[#0B0E14] px-2.5 py-2 text-xs text-white outline-none focus:border-cyan-500"
                  >
                    {MOTION_PRESETS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} — {m.hint}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-[11px] font-semibold text-slate-300">Entrance Transition</span>
                  <select
                    value={selectedClip.transitionIn}
                    onChange={(e) =>
                      onUpdateClip(selectedClip.id, (c) => ({
                        ...c,
                        transitionIn: e.target.value as TransitionType,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-800 bg-[#0B0E14] px-2.5 py-2 text-xs text-white outline-none focus:border-cyan-500"
                  >
                    {TRANSITIONS.map((tr) => (
                      <option key={tr.id} value={tr.id}>
                        {tr.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {/* Fade In / Fade Out */}
            <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
              <div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-300">Fade In</span>
                  <span className="font-mono text-slate-400">{selectedClip.fadeIn.toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.min(3, selectedClip.duration / 2)}
                  step={0.1}
                  value={selectedClip.fadeIn}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, (c) => ({ ...c, fadeIn: Number(e.target.value) }))
                  }
                  className="studio-range w-full mt-1"
                />
              </div>
              <div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-300">Fade Out</span>
                  <span className="font-mono text-slate-400">{selectedClip.fadeOut.toFixed(1)}s</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.min(3, selectedClip.duration / 2)}
                  step={0.1}
                  value={selectedClip.fadeOut}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, (c) => ({ ...c, fadeOut: Number(e.target.value) }))
                  }
                  className="studio-range w-full mt-1"
                />
              </div>
            </div>
          </>
        )}

        {/* STYLE / TEXT / SHAPE / SPRITE / FILTERS TAB */}
        {tab === 'style' && (
          <>
            {/* Text Editor */}
            {selectedClip.kind === 'text' && selectedClip.textData && (
              <div className="space-y-3">
                <p className="text-[11px] font-semibold text-slate-300">Text Content &amp; Style</p>
                <textarea
                  rows={3}
                  value={selectedClip.textData.content}
                  onChange={(e) =>
                    onUpdateClip(selectedClip.id, (c) => ({
                      ...c,
                      textData: { ...c.textData!, content: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-slate-800 bg-[#0B0E14] p-2 text-xs text-white outline-none focus:border-cyan-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[10px] text-slate-400">Font</span>
                    <select
                      value={selectedClip.textData.fontFamily}
                      onChange={(e) =>
                        onUpdateClip(selectedClip.id, (c) => ({
                          ...c,
                          textData: { ...c.textData!, fontFamily: e.target.value },
                        }))
                      }
                      className="mt-0.5 w-full rounded-lg border border-slate-800 bg-[#0B0E14] px-2 py-1.5 text-xs text-white"
                    >
                      {DEFAULT_FONT_FAMILIES.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-slate-400">Font Size</span>
                    <input
                      type="number"
                      min={12}
                      max={200}
                      value={selectedClip.textData.fontSize}
                      onChange={(e) =>
                        onUpdateClip(selectedClip.id, (c) => ({
                          ...c,
                          textData: { ...c.textData!, fontSize: Math.max(12, Number(e.target.value)) },
                        }))
                      }
                      className="mt-0.5 w-full rounded-lg border border-slate-800 bg-[#0B0E14] px-2 py-1.5 font-mono text-xs text-white"
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#0B0E14] px-2.5 py-1.5">
                    <span className="text-[11px] text-slate-300">Fill</span>
                    <input
                      type="color"
                      value={selectedClip.textData.color}
                      onChange={(e) =>
                        onUpdateClip(selectedClip.id, (c) => ({
                          ...c,
                          textData: { ...c.textData!, color: e.target.value },
                        }))
                      }
                      className="h-4 w-5 bg-transparent border-0 cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#0B0E14] px-2.5 py-1.5">
                    <span className="text-[11px] text-slate-300">Outline</span>
                    <input
                      type="color"
                      value={selectedClip.textData.strokeColor}
                      onChange={(e) =>
                        onUpdateClip(selectedClip.id, (c) => ({
                          ...c,
                          textData: { ...c.textData!, strokeColor: e.target.value },
                        }))
                      }
                      className="h-4 w-5 bg-transparent border-0 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Shape Editor */}
            {selectedClip.kind === 'shape' && selectedClip.shapeData && (
              <div className="space-y-3">
                <p className="text-[11px] font-semibold text-slate-300">Shape Style</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="col-span-2 block">
                    <span className="text-[10px] text-slate-400">Shape Type</span>
                    <select
                      value={selectedClip.shapeData.shapeType}
                      onChange={(e) =>
                        onUpdateClip(selectedClip.id, (c) => ({
                          ...c,
                          shapeData: { ...c.shapeData!, shapeType: e.target.value as ShapeType },
                        }))
                      }
                      className="mt-0.5 w-full rounded-lg border border-slate-800 bg-[#0B0E14] px-2.5 py-1.5 text-xs text-white"
                    >
                      {SHAPE_CATALOG.map((s) => (
                        <option key={s.type} value={s.type}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#0B0E14] px-2.5 py-1.5">
                    <span className="text-[11px] text-slate-300">Fill</span>
                    <input
                      type="color"
                      value={selectedClip.shapeData.fillColor}
                      onChange={(e) =>
                        onUpdateClip(selectedClip.id, (c) => ({
                          ...c,
                          shapeData: { ...c.shapeData!, fillColor: e.target.value },
                        }))
                      }
                      className="h-4 w-5 bg-transparent border-0 cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-lg border border-slate-800 bg-[#0B0E14] px-2.5 py-1.5">
                    <span className="text-[11px] text-slate-300">Stroke</span>
                    <input
                      type="color"
                      value={selectedClip.shapeData.strokeColor}
                      onChange={(e) =>
                        onUpdateClip(selectedClip.id, (c) => ({
                          ...c,
                          shapeData: { ...c.shapeData!, strokeColor: e.target.value },
                        }))
                      }
                      className="h-4 w-5 bg-transparent border-0 cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Sprite Sheet Override */}
            {(selectedClip.kind === 'spritesheet' || selectedAsset?.mediaType === 'spritesheet') && (
              <div className="space-y-2.5 pb-2 border-b border-slate-800/80">
                <p className="text-[11px] font-semibold text-orange-300">Sprite Sheet Animation</p>
                <div className="grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="text-[10px] text-slate-400">Rows</span>
                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={selectedClip.spriteOverride?.rows ?? selectedAsset?.spriteConfig?.rows ?? 1}
                      onChange={(e) =>
                        onUpdateClip(selectedClip.id, (c) => ({
                          ...c,
                          spriteOverride: {
                            rows: Math.max(1, Number(e.target.value) || 1),
                            cols: c.spriteOverride?.cols ?? selectedAsset?.spriteConfig?.cols ?? 1,
                            fps: c.spriteOverride?.fps ?? selectedAsset?.spriteConfig?.fps ?? 12,
                            loop: c.spriteOverride?.loop ?? true,
                          },
                        }))
                      }
                      className="mt-0.5 w-full rounded-lg border border-slate-800 bg-[#0B0E14] px-2 py-1 font-mono text-xs text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-slate-400">Cols</span>
                    <input
                      type="number"
                      min={1}
                      max={32}
                      value={selectedClip.spriteOverride?.cols ?? selectedAsset?.spriteConfig?.cols ?? 1}
                      onChange={(e) =>
                        onUpdateClip(selectedClip.id, (c) => ({
                          ...c,
                          spriteOverride: {
                            rows: c.spriteOverride?.rows ?? selectedAsset?.spriteConfig?.rows ?? 1,
                            cols: Math.max(1, Number(e.target.value) || 1),
                            fps: c.spriteOverride?.fps ?? selectedAsset?.spriteConfig?.fps ?? 12,
                            loop: c.spriteOverride?.loop ?? true,
                          },
                        }))
                      }
                      className="mt-0.5 w-full rounded-lg border border-slate-800 bg-[#0B0E14] px-2 py-1 font-mono text-xs text-white"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-slate-400">FPS</span>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={selectedClip.spriteOverride?.fps ?? selectedAsset?.spriteConfig?.fps ?? 12}
                      onChange={(e) =>
                        onUpdateClip(selectedClip.id, (c) => ({
                          ...c,
                          spriteOverride: {
                            rows: c.spriteOverride?.rows ?? selectedAsset?.spriteConfig?.rows ?? 1,
                            cols: c.spriteOverride?.cols ?? selectedAsset?.spriteConfig?.cols ?? 1,
                            fps: Math.max(1, Number(e.target.value) || 12),
                            loop: c.spriteOverride?.loop ?? true,
                          },
                        }))
                      }
                      className="mt-0.5 w-full rounded-lg border border-slate-800 bg-[#0B0E14] px-2 py-1 font-mono text-xs text-white"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* Color & Visual Effects */}
            {!isAudioOnly && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-slate-300">Color &amp; Filters</p>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, (c) => ({ ...c, filters: { ...DEFAULT_FILTERS } }))
                    }
                    className="text-[11px] text-cyan-400 hover:underline"
                  >
                    Reset
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, (c) => ({
                        ...c,
                        filters: { ...c.filters, flipX: !c.filters.flipX },
                      }))
                    }
                    className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-[11px] ${
                      selectedClip.filters.flipX
                        ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                        : 'border-slate-800 bg-[#151B28] text-slate-300'
                    }`}
                  >
                    <FlipHorizontal className="h-3.5 w-3.5" />
                    Flip H
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateClip(selectedClip.id, (c) => ({
                        ...c,
                        filters: { ...c.filters, flipY: !c.filters.flipY },
                      }))
                    }
                    className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-[11px] ${
                      selectedClip.filters.flipY
                        ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                        : 'border-slate-800 bg-[#151B28] text-slate-300'
                    }`}
                  >
                    <FlipVertical className="h-3.5 w-3.5" />
                    Flip V
                  </button>
                </div>

                {(
                  [
                    { key: 'brightness', label: 'Brightness', min: 20, max: 200, unit: '%' },
                    { key: 'contrast', label: 'Contrast', min: 20, max: 200, unit: '%' },
                    { key: 'saturation', label: 'Saturation', min: 0, max: 200, unit: '%' },
                    { key: 'blur', label: 'Blur', min: 0, max: 16, unit: 'px' },
                  ] as const
                ).map((item) => (
                  <div key={item.key}>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-300">{item.label}</span>
                      <span className="font-mono text-slate-400 tabular-nums">
                        {selectedClip.filters[item.key]}
                        {item.unit}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={item.min}
                      max={item.max}
                      value={selectedClip.filters[item.key]}
                      onChange={(e) =>
                        onUpdateClip(selectedClip.id, (c) => ({
                          ...c,
                          filters: { ...c.filters, [item.key]: Number(e.target.value) },
                        }))
                      }
                      className="studio-range w-full mt-1"
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
};
