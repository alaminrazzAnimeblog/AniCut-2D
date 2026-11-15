import React, { useRef, useState } from 'react';
import {
  FolderArchive,
  Grid2x2,
  Image as ImageIcon,
  Layers,
  Music,
  Plus,
  Shapes,
  Sparkles,
  Trash2,
  Type,
  Upload,
  UserSquare2,
  Video,
} from 'lucide-react';
import type { Asset, AssetCategory, ShapeType, SpriteConfig } from '../types/project';
import { SHAPE_CATALOG } from '../constants/presets';

export type LeftTab =
  | 'media'
  | 'characters'
  | 'backgrounds'
  | 'stickers'
  | 'text'
  | 'audio'
  | 'assets';

interface AssetLibraryPanelProps {
  assets: Asset[];
  onImportFiles: (files: FileList | File[], category: AssetCategory, spriteConfig?: SpriteConfig) => Promise<void>;
  onAddAssetToScene: (asset: Asset) => void;
  onAddTextPreset: (preset: 'title' | 'subtitle' | 'callout') => void;
  onAddShape: (shapeType: ShapeType) => void;
  onDeleteAsset: (assetId: string) => void;
  onUpdateAssetSprite: (assetId: string, spriteConfig: SpriteConfig) => void;
}

const TABS: { id: LeftTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'media', label: 'Media', icon: Video },
  { id: 'characters', label: 'Characters', icon: UserSquare2 },
  { id: 'backgrounds', label: 'Scenes', icon: ImageIcon },
  { id: 'stickers', label: 'Stickers', icon: Shapes },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'audio', label: 'Audio', icon: Music },
  { id: 'assets', label: 'Library', icon: FolderArchive },
];

export const AssetLibraryPanel: React.FC<AssetLibraryPanelProps> = ({
  assets,
  onImportFiles,
  onAddAssetToScene,
  onAddTextPreset,
  onAddShape,
  onDeleteAsset,
  onUpdateAssetSprite,
}) => {
  const [activeTab, setActiveTab] = useState<LeftTab>('characters');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [spriteModalOpen, setSpriteModalOpen] = useState(false);
  const [spriteRows, setSpriteRows] = useState(2);
  const [spriteCols, setSpriteCols] = useState(4);
  const [spriteFps, setSpriteFps] = useState(10);
  const [editingSpriteAsset, setEditingSpriteAsset] = useState<Asset | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const spriteInputRef = useRef<HTMLInputElement>(null);

  const currentImportCategory: AssetCategory = (() => {
    if (activeTab === 'characters') return 'character';
    if (activeTab === 'backgrounds') return 'background';
    if (activeTab === 'stickers') return 'sticker';
    if (activeTab === 'audio') return 'audio';
    return 'media';
  })();

  const filteredAssets = assets.filter((a) => {
    if (activeTab === 'assets') return true;
    if (activeTab === 'characters') return a.category === 'character';
    if (activeTab === 'backgrounds') return a.category === 'background';
    if (activeTab === 'stickers') return a.category === 'sticker';
    if (activeTab === 'audio') return a.mediaType === 'audio' || a.category === 'audio';
    if (activeTab === 'media') return a.mediaType === 'video' || a.category === 'media' || a.mediaType === 'gif';
    return true;
  });

  const acceptAttr =
    activeTab === 'audio'
      ? 'audio/*'
      : activeTab === 'characters' || activeTab === 'backgrounds' || activeTab === 'stickers'
        ? 'image/*,.svg,.gif,.png,.webp,.jpg'
        : 'image/*,video/*,audio/*';

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await onImportFiles(e.dataTransfer.files, currentImportCategory);
    }
  };

  return (
    <aside className="flex h-full w-full lg:w-[300px] shrink-0 flex-col border-r border-slate-800/90 bg-[#10141E]">
      {/* Vertical/Grid Navigation Tabs */}
      <div className="grid grid-cols-4 sm:grid-cols-7 lg:grid-cols-4 gap-1 border-b border-slate-800/80 p-2 bg-[#0D1119]">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[11px] font-medium transition ${
                active
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                  : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate max-w-full">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Body */}
      <div
        className="flex-1 overflow-y-auto p-3 space-y-3"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
      >
        {/* Text Presets Tab */}
        {activeTab === 'text' && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-slate-300">Add Text Overlay</p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => onAddTextPreset('title')}
                className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-[#151B28] px-3.5 py-3 text-left transition hover:border-cyan-500/50 hover:bg-[#192132]"
              >
                <div>
                  <p className="font-display text-sm font-bold text-white">Headline Title</p>
                  <p className="text-[11px] text-slate-400">Bold 52px display text with outline</p>
                </div>
                <Plus className="h-4 w-4 text-cyan-400 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => onAddTextPreset('subtitle')}
                className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-[#151B28] px-3.5 py-3 text-left transition hover:border-cyan-500/50 hover:bg-[#192132]"
              >
                <div>
                  <p className="text-sm font-medium text-slate-100">Caption / Subtitle</p>
                  <p className="text-[11px] text-slate-400">Lower-frame caption with backdrop</p>
                </div>
                <Plus className="h-4 w-4 text-cyan-400 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => onAddTextPreset('callout')}
                className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-[#151B28] px-3.5 py-3 text-left transition hover:border-cyan-500/50 hover:bg-[#192132]"
              >
                <div>
                  <p className="text-sm font-semibold text-orange-300">Comic / Pop Callout</p>
                  <p className="text-[11px] text-slate-400">Animated pop-in action text</p>
                </div>
                <Plus className="h-4 w-4 text-cyan-400 shrink-0" />
              </button>
            </div>
          </div>
        )}

        {/* Built-in Original Shapes & Imported Stickers */}
        {activeTab === 'stickers' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-300">Vector Shapes</p>
              <span className="text-[11px] text-slate-500">Click to insert</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {SHAPE_CATALOG.map((shape) => (
                <button
                  key={shape.type}
                  type="button"
                  onClick={() => onAddShape(shape.type)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-800 bg-[#151B28] p-2.5 text-[11px] font-medium text-slate-200 transition hover:border-cyan-500/50 hover:bg-[#1A2233]"
                >
                  <div
                    className="h-7 w-7 rounded-md flex items-center justify-center"
                    style={{ backgroundColor: shape.defaultFill + '22', color: shape.defaultFill }}
                  >
                    <Shapes className="h-4 w-4" />
                  </div>
                  <span className="truncate w-full text-center">{shape.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Import Controls (for all asset tabs except Text) */}
        {activeTab !== 'text' && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                <Upload className="h-3.5 w-3.5" />
                Import {activeTab === 'audio' ? 'Audio' : activeTab === 'characters' ? 'Characters' : 'Files'}
              </button>

              {(activeTab === 'characters' || activeTab === 'media' || activeTab === 'assets') && (
                <button
                  type="button"
                  onClick={() => setSpriteModalOpen(true)}
                  title="Import Sprite Sheet with Rows/Cols/FPS"
                  className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 px-2.5 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
                >
                  <Grid2x2 className="h-3.5 w-3.5 text-orange-400" />
                  <span>Sprite</span>
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={acceptAttr}
              className="hidden"
              onChange={async (e) => {
                if (e.target.files && e.target.files.length > 0) {
                  await onImportFiles(e.target.files, currentImportCategory);
                }
                e.target.value = '';
              }}
            />

            <div
              className={`rounded-xl border border-dashed px-3 py-2.5 text-center text-[11px] transition ${
                isDraggingOver
                  ? 'border-cyan-400 bg-cyan-500/10 text-cyan-200'
                  : 'border-slate-800 bg-[#0D1119] text-slate-400'
              }`}
            >
              Drop PNG, SVG, GIF, WebP, MP4, or MP3/WAV files here
            </div>
          </div>
        )}

        {/* Asset Grid */}
        {activeTab !== 'text' && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>
                {activeTab === 'assets' ? 'All Saved Assets' : 'Imported Items'} ({filteredAssets.length})
              </span>
              {filteredAssets.length > 0 && <span>Drag to timeline or +</span>}
            </div>

            {filteredAssets.length === 0 ? (
              <div className="rounded-xl border border-slate-800/80 bg-[#0D1119] p-4 text-center">
                <Layers className="mx-auto h-6 w-6 text-slate-600 mb-2" />
                <p className="text-xs font-medium text-slate-300">No items here yet</p>
                <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
                  Import your own transparent PNG characters, sprite sheets, backgrounds, or audio files. They stay saved offline in your library.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {filteredAssets.map((asset) => (
                  <div
                    key={asset.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/x-anicut-asset', asset.id);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    className="group relative flex flex-col rounded-xl border border-slate-800 bg-[#141A26] overflow-hidden transition hover:border-cyan-500/50 cursor-grab active:cursor-grabbing"
                  >
                    {asset.mediaType === 'audio' ? (
                      <div className="flex h-20 items-center justify-center bg-[#0F141F]">
                        <Music className="h-7 w-7 text-emerald-400" />
                      </div>
                    ) : (
                      <div className="relative h-20 w-full bg-checkerboard flex items-center justify-center overflow-hidden p-1.5">
                        {asset.thumbnailDataUrl ? (
                          <img
                            src={asset.thumbnailDataUrl}
                            alt={asset.name}
                            referrerPolicy="no-referrer"
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <ImageIcon className="h-6 w-6 text-slate-600" />
                        )}
                      </div>
                    )}

                    <div className="p-2 flex flex-col gap-1">
                      <p className="truncate text-[11px] font-medium text-slate-100" title={asset.name}>
                        {asset.name}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 tabular-nums">
                        <span className="uppercase">{asset.mediaType}</span>
                        <span>
                          {asset.duration
                            ? `${asset.duration.toFixed(1)}s`
                            : `${asset.width}×${asset.height}`}
                        </span>
                      </div>

                      <div className="mt-1 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onAddAssetToScene(asset)}
                          className="flex flex-1 items-center justify-center gap-1 rounded-md bg-slate-800 py-1 text-[10px] font-semibold text-cyan-300 hover:bg-cyan-500 hover:text-slate-950 transition"
                        >
                          <Plus className="h-3 w-3" />
                          Add
                        </button>
                        {(asset.mediaType === 'spritesheet' || asset.mediaType === 'image') && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSpriteAsset(asset);
                              setSpriteRows(asset.spriteConfig?.rows || 1);
                              setSpriteCols(asset.spriteConfig?.cols || 4);
                              setSpriteFps(asset.spriteConfig?.fps || 10);
                            }}
                            title="Configure Sprite Sheet Grid"
                            className="rounded-md bg-slate-800 p-1 text-slate-400 hover:text-orange-300"
                          >
                            <Grid2x2 className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onDeleteAsset(asset.id)}
                          title="Delete asset from library"
                          className="rounded-md bg-slate-800 p-1 text-slate-400 hover:text-rose-400"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Import Sprite Sheet Modal */}
      {spriteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-[#121722] p-5 shadow-2xl">
            <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-orange-400" />
              Import Sprite Sheet
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Specify the grid layout of your sprite sheet image, then choose the PNG/WebP file.
            </p>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Rows</label>
                <input
                  type="number"
                  min={1}
                  max={32}
                  value={spriteRows}
                  onChange={(e) => setSpriteRows(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0E14] px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Columns</label>
                <input
                  type="number"
                  min={1}
                  max={32}
                  value={spriteCols}
                  onChange={(e) => setSpriteCols(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0E14] px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">FPS</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={spriteFps}
                  onChange={(e) => setSpriteFps(Math.max(1, Number(e.target.value) || 12))}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0E14] px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            <input
              ref={spriteInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                if (e.target.files && e.target.files.length > 0) {
                  await onImportFiles(e.target.files, 'character', {
                    rows: spriteRows,
                    cols: spriteCols,
                    fps: spriteFps,
                    loop: true,
                  });
                  setSpriteModalOpen(false);
                }
                e.target.value = '';
              }}
            />

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSpriteModalOpen(false)}
                className="rounded-lg border border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => spriteInputRef.current?.click()}
                className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
              >
                Choose Image File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Existing Asset Sprite Config */}
      {editingSpriteAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-[#121722] p-5 shadow-2xl">
            <h3 className="font-display text-base font-semibold text-white">
              Configure Sprite Sheet
            </h3>
            <p className="mt-1 text-xs text-slate-400 truncate">{editingSpriteAsset.name}</p>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Rows</label>
                <input
                  type="number"
                  min={1}
                  max={32}
                  value={spriteRows}
                  onChange={(e) => setSpriteRows(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0E14] px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">Columns</label>
                <input
                  type="number"
                  min={1}
                  max={32}
                  value={spriteCols}
                  onChange={(e) => setSpriteCols(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0E14] px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-300 mb-1">FPS</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={spriteFps}
                  onChange={(e) => setSpriteFps(Math.max(1, Number(e.target.value) || 12))}
                  className="w-full rounded-lg border border-slate-700 bg-[#0B0E14] px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingSpriteAsset(null)}
                className="rounded-lg border border-slate-700 px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onUpdateAssetSprite(editingSpriteAsset.id, {
                    rows: spriteRows,
                    cols: spriteCols,
                    fps: spriteFps,
                    loop: true,
                  });
                  setEditingSpriteAsset(null);
                }}
                className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
              >
                Save Grid
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
