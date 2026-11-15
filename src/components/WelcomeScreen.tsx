import React, { useRef, useState } from 'react';
import {
  Copy,
  Film,
  FolderOpen,
  HardDriveDownload,
  Layers,
  Pencil,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { Project } from '../types/project';
import { CANVAS_PRESETS } from '../constants/presets';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { PWAInstallButton } from './PWAInstallButton';

interface WelcomeScreenProps {
  projects: Project[];
  onCreateProject: (name: string, width: number, height: number, fps: number) => void;
  onCreateSampleProject: () => void;
  onOpenProject: (id: string) => void;
  onRenameProject: (id: string, newName: string) => void;
  onDuplicateProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onExportBackup: (project: Project) => void;
  onImportBackup: (file: File) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  projects,
  onCreateProject,
  onCreateSampleProject,
  onOpenProject,
  onRenameProject,
  onDuplicateProject,
  onDeleteProject,
  onExportBackup,
  onImportBackup,
}) => {
  const isOnline = useOnlineStatus();
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('My 2D Animation');
  const [selectedPreset, setSelectedPreset] = useState(CANVAS_PRESETS[0].id);
  const [newFps, setNewFps] = useState<24 | 30 | 60>(30);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDeleteProject, setConfirmDeleteProject] = useState<Project | null>(null);

  const backupInputRef = useRef<HTMLInputElement>(null);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const preset = CANVAS_PRESETS.find((p) => p.id === selectedPreset) || CANVAS_PRESETS[0];
    onCreateProject(newName.trim() || 'Untitled Project', preset.width, preset.height, newFps);
    setShowNewModal(false);
    setNewName('My 2D Animation');
  };

  const formatDate = (ts: number) => {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-[#0B0E14] text-slate-100 flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-slate-800/80 bg-[#0F131C]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="AniCut 2D" className="h-9 w-9 rounded-lg" />
            <span className="font-display text-lg font-bold tracking-tight text-white whitespace-nowrap">
              AniCut 2D
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div
              className="flex items-center gap-1.5 text-xs font-medium text-slate-300 whitespace-nowrap"
              title={
                isOnline
                  ? 'Connected · App assets cached for offline editing'
                  : 'Offline Mode · Editing and export work locally'
              }
            >
              {isOnline ? (
                <>
                  <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Online · Offline Ready</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-amber-300">Offline Mode</span>
                </>
              )}
            </div>

            <PWAInstallButton />

            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" />
              New Project
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {/* Hero / Quick Start */}
        <section className="rounded-2xl border border-slate-800 bg-[#121722] p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-3">
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white [text-wrap:balance]">
                2D Animation &amp; Video Studio, 100% Local on Your Device
              </h1>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Import your own transparent PNG characters, sprite sheets, GIFs, backgrounds, and music.
                Animate with keyframes, onion-skinning, and motion presets, then export real MP4 or WebM
                videos completely offline.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setShowNewModal(true)}
                className="flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                Create New Project
              </button>
              <button
                type="button"
                onClick={onCreateSampleProject}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-sm font-medium text-slate-100 transition hover:bg-slate-800 whitespace-nowrap"
              >
                <Play className="h-4 w-4 text-orange-400" />
                Open Sample Project
              </button>
              <button
                type="button"
                onClick={() => backupInputRef.current?.click()}
                className="flex items-center gap-2 rounded-xl border border-slate-700 bg-transparent px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-slate-800/60 hover:text-white whitespace-nowrap"
              >
                <Upload className="h-4 w-4" />
                Import Backup
              </button>
              <input
                ref={backupInputRef}
                type="file"
                accept=".zip,.anicut.zip"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onImportBackup(file);
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 border-t border-slate-800/80 pt-6 sm:grid-cols-3 text-xs text-slate-400">
            <div className="flex items-start gap-2.5">
              <Layers className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
              <div>
                <p className="font-medium text-slate-200">Multi-Track &amp; Keyframes</p>
                <p className="mt-0.5">Animate position, size, rotation, opacity, sprite sheets, and onion-skin frames.</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Film className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
              <div>
                <p className="font-medium text-slate-200">Local 720p / 1080p Export</p>
                <p className="mt-0.5">WebCodecs hardware encoding &amp; local FFmpeg.wasm fallback with audio mixdown.</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <div>
                <p className="font-medium text-slate-200">Private IndexedDB Vault</p>
                <p className="mt-0.5">All assets and projects stay in your browser with full ZIP backup support.</p>
              </div>
            </div>
          </div>
        </section>

        {/* Saved Projects List */}
        <section className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-white">
              Saved Projects
            </h2>
            <span className="text-xs text-slate-400 tabular-nums">
              {projects.length} {projects.length === 1 ? 'project' : 'projects'} stored locally
            </span>
          </div>

          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-[#10141E] py-14 px-6 text-center">
              <FolderOpen className="h-10 w-10 text-slate-600 mb-3" />
              <p className="text-sm font-medium text-slate-200">No projects saved yet</p>
              <p className="mt-1 max-w-md text-xs text-slate-400">
                Start a blank canvas or open the built-in sample project to explore keyframe animations and timeline editing.
              </p>
              <div className="mt-5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewModal(true)}
                  className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  New Project
                </button>
                <button
                  type="button"
                  onClick={onCreateSampleProject}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
                >
                  Try Sample Project
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((proj) => (
                <div
                  key={proj.id}
                  className="group flex flex-col justify-between rounded-xl border border-slate-800 bg-[#121722] p-5 transition hover:border-slate-700"
                >
                  <div>
                    {renamingId === proj.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (renameValue.trim()) onRenameProject(proj.id, renameValue.trim());
                          setRenamingId(null);
                        }}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="text"
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => {
                            if (renameValue.trim()) onRenameProject(proj.id, renameValue.trim());
                            setRenamingId(null);
                          }}
                          className="w-full rounded-lg border border-cyan-500 bg-[#0B0E14] px-2.5 py-1 text-sm text-white outline-none"
                        />
                      </form>
                    ) : (
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenProject(proj.id)}
                          className="text-left font-display text-base font-semibold text-white hover:text-cyan-300 transition truncate"
                        >
                          {proj.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(proj.id);
                            setRenameValue(proj.name);
                          }}
                          title="Rename project"
                          className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-200 shrink-0"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
                      <span>{proj.width}×{proj.height}</span>
                      <span aria-hidden="true">·</span>
                      <span>{proj.fps} fps</span>
                      <span aria-hidden="true">·</span>
                      <span>{proj.duration.toFixed(1)}s</span>
                      <span aria-hidden="true">·</span>
                      <span>{proj.clips.length} clips</span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      Updated {formatDate(proj.updatedAt)}
                    </p>
                  </div>

                  <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-800/80 pt-3">
                    <button
                      type="button"
                      onClick={() => onOpenProject(proj.id)}
                      className="rounded-lg bg-slate-800 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-500 hover:text-slate-950"
                    >
                      Open Editor
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => onExportBackup(proj)}
                        title="Export complete ZIP backup with assets"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-cyan-300"
                      >
                        <HardDriveDownload className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDuplicateProject(proj.id)}
                        title="Duplicate project"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteProject(proj)}
                        title="Delete project"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/15 hover:text-rose-400"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* New Project Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreateSubmit}
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#121722] p-6 shadow-2xl"
          >
            <h3 className="font-display text-lg font-semibold text-white">Create New Project</h3>
            <p className="mt-1 text-xs text-slate-400">
              Choose your project name, canvas resolution, and target frame rate.
            </p>

            <div className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Project Name
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My 2D Animation"
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0E14] px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Canvas Aspect &amp; Size
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {CANVAS_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setSelectedPreset(preset.id)}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs transition ${
                        selectedPreset === preset.id
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-200'
                          : 'border-slate-800 bg-[#0B0E14] text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span className="font-medium">{preset.label}</span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {preset.width}×{preset.height}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Frame Rate (FPS)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([24, 30, 60] as const).map((fpsVal) => (
                    <button
                      key={fpsVal}
                      type="button"
                      onClick={() => setNewFps(fpsVal)}
                      className={`rounded-lg border py-2 text-xs font-semibold tabular-nums transition ${
                        newFps === fpsVal
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-200'
                          : 'border-slate-800 bg-[#0B0E14] text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {fpsVal} FPS
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowNewModal(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-cyan-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
              >
                Create Project
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDeleteProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-[#121722] p-6 shadow-2xl">
            <h3 className="font-display text-base font-semibold text-white">Delete Project?</h3>
            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong className="text-white">{confirmDeleteProject.name}</strong>? Your timeline and
              animations in this project cannot be recovered unless you exported a backup.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteProject(null)}
                className="rounded-lg border border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteProject(confirmDeleteProject.id);
                  setConfirmDeleteProject(null);
                }}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500"
              >
                Delete Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
