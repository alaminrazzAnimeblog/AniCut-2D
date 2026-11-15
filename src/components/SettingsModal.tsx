import React, { useRef, useState } from 'react';
import { HardDriveDownload, Settings, Upload, X } from 'lucide-react';
import type { Project } from '../types/project';
import { CANVAS_PRESETS } from '../constants/presets';

interface SettingsModalProps {
  project: Project;
  onUpdateSettings: (patch: { name: string; width: number; height: number; fps: number; backgroundColor: string }) => void;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  project,
  onUpdateSettings,
  onExportBackup,
  onImportBackup,
  onClose,
}) => {
  const [name, setName] = useState(project.name);
  const [width, setWidth] = useState(project.width);
  const [height, setHeight] = useState(project.height);
  const [fps, setFps] = useState(project.fps);
  const [bgColor, setBgColor] = useState(project.backgroundColor);

  const importRef = useRef<HTMLInputElement>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings({
      name: name.trim() || 'Untitled Project',
      width: Math.max(320, width),
      height: Math.max(240, height),
      fps,
      backgroundColor: bgColor,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-[#121722] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-cyan-400" />
            <h3 className="font-display text-lg font-semibold text-white">Project Settings</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-[#0B0E14] px-3 py-2 text-sm text-white outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Canvas Preset</label>
            <select
              value={`${width}x${height}`}
              onChange={(e) => {
                const [w, h] = e.target.value.split('x').map(Number);
                if (w && h) {
                  setWidth(w);
                  setHeight(h);
                }
              }}
              className="w-full rounded-lg border border-slate-700 bg-[#0B0E14] px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
            >
              {CANVAS_PRESETS.map((p) => (
                <option key={p.id} value={`${p.width}x${p.height}`}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Project FPS</label>
              <select
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-[#0B0E14] px-3 py-2 text-xs text-white"
              >
                <option value={24}>24 FPS</option>
                <option value={30}>30 FPS</option>
                <option value={60}>60 FPS</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Stage Color</label>
              <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-[#0B0E14] px-3 py-1.5">
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="h-5 w-6 bg-transparent border-0 cursor-pointer"
                />
                <span className="font-mono text-xs text-slate-300">{bgColor}</span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-4 space-y-2">
            <p className="text-xs font-medium text-slate-300">Offline Project Backup (.anicut.zip)</p>
            <p className="text-[11px] text-slate-400">
              Backups bundle your timeline, keyframes, and all imported media files for safekeeping or moving devices.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={onExportBackup}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 py-2 text-xs font-medium text-cyan-300 hover:bg-slate-800"
              >
                <HardDriveDownload className="h-3.5 w-3.5" />
                Export Backup
              </button>
              <button
                type="button"
                onClick={() => importRef.current?.click()}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
              >
                <Upload className="h-3.5 w-3.5" />
                Import Backup
              </button>
              <input
                ref={importRef}
                type="file"
                accept=".zip,.anicut.zip"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    onImportBackup(file);
                    onClose();
                  }
                  e.target.value = '';
                }}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-cyan-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
            >
              Apply Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
