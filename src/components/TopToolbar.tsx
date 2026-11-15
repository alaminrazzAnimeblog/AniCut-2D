import React, { useState } from 'react';
import {
  Download,
  FilePlus2,
  FolderOpen,
  Redo2,
  Save,
  Settings,
  Undo2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { PWAInstallButton } from './PWAInstallButton';

interface TopToolbarProps {
  projectName: string;
  lastSavedText: string;
  canUndo: boolean;
  canRedo: boolean;
  onRenameProject: (name: string) => void;
  onGoHome: () => void;
  onNewProject: () => void;
  onOpenProjects: () => void;
  onSaveProject: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenSettings: () => void;
  onOpenExport: () => void;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  projectName,
  lastSavedText,
  canUndo,
  canRedo,
  onRenameProject,
  onGoHome,
  onNewProject,
  onOpenProjects,
  onSaveProject,
  onUndo,
  onRedo,
  onOpenSettings,
  onOpenExport,
}) => {
  const isOnline = useOnlineStatus();
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(projectName);

  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/90 bg-[#0F131C] px-3 py-2">
      {/* Left: Brand & Project Name */}
      <div className="flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onClick={onGoHome}
          title="Back to Home Screen"
          className="flex items-center gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-slate-800/80 shrink-0"
        >
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="AniCut 2D" className="h-6 w-6 rounded" />
          <span className="font-display text-sm font-bold tracking-tight text-white whitespace-nowrap">
            AniCut 2D
          </span>
        </button>

        <span className="text-slate-700 select-none">/</span>

        {editingName ? (
          <input
            type="text"
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => {
              if (draftName.trim()) onRenameProject(draftName.trim());
              setEditingName(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (draftName.trim()) onRenameProject(draftName.trim());
                setEditingName(false);
              } else if (e.key === 'Escape') {
                setDraftName(projectName);
                setEditingName(false);
              }
            }}
            className="w-44 rounded border border-cyan-500 bg-[#0B0E14] px-2 py-0.5 text-xs font-medium text-white outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraftName(projectName);
              setEditingName(true);
            }}
            title="Click to rename project"
            className="max-w-[180px] truncate rounded px-2 py-1 text-xs font-medium text-slate-200 hover:bg-slate-800/80"
          >
            {projectName}
          </button>
        )}

        <span className="hidden xl:inline text-[11px] text-slate-500 whitespace-nowrap">
          {lastSavedText}
        </span>
      </div>

      {/* Center: Project & History Actions */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onNewProject}
          title="Create New Project"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white whitespace-nowrap"
        >
          <FilePlus2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New</span>
        </button>

        <button
          type="button"
          onClick={onOpenProjects}
          title="Open Saved Project"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white whitespace-nowrap"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Open</span>
        </button>

        <button
          type="button"
          onClick={onSaveProject}
          title="Save Project Locally (Ctrl + S)"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white whitespace-nowrap"
        >
          <Save className="h-3.5 w-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Save</span>
        </button>

        <div className="mx-1 h-4 w-px bg-slate-800" />

        <button
          type="button"
          disabled={!canUndo}
          onClick={onUndo}
          title="Undo (Ctrl + Z)"
          className="rounded-lg p-1.5 text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
        >
          <Undo2 className="h-4 w-4" />
        </button>

        <button
          type="button"
          disabled={!canRedo}
          onClick={onRedo}
          title="Redo (Ctrl + Y)"
          className="rounded-lg p-1.5 text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:pointer-events-none"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </div>

      {/* Right: Settings, Offline Status, Install, Export */}
      <div className="flex items-center gap-2 shrink-0">
        <div
          className="hidden md:flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-slate-400 whitespace-nowrap"
          title={isOnline ? 'Online · Local cache active' : 'Offline Mode · Working from local device'}
        >
          {isOnline ? (
            <>
              <Wifi className="h-3.5 w-3.5 text-emerald-400" />
              <span>Online</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-amber-300">Offline</span>
            </>
          )}
        </div>

        <PWAInstallButton />

        <button
          type="button"
          onClick={onOpenSettings}
          title="Project Settings & Backup"
          className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:text-white whitespace-nowrap"
        >
          <Settings className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Settings</span>
        </button>

        <button
          type="button"
          onClick={onOpenExport}
          className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-orange-400 whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5" />
          Export Video
        </button>
      </div>
    </header>
  );
};
