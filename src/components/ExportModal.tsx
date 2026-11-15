import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, Film, Loader2, X, AlertCircle } from 'lucide-react';
import type { Asset, ExportProgress, ExportSettings, Project } from '../types/project';
import {
  detectExportCapabilities,
  exportProjectVideo,
  type ExportResult,
} from '../engine/videoExporter';

interface ExportModalProps {
  project: Project;
  assets: Asset[];
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ project, assets, onClose }) => {
  const [settings, setSettings] = useState<ExportSettings>({
    resolution: '720p',
    fps: project.fps === 60 ? 60 : project.fps === 24 ? 24 : 30,
    format: 'mp4',
  });
  const [caps, setCaps] = useState<{
    webCodecsMp4: boolean;
    webCodecsWebm: boolean;
    mediaRecorderWebm: boolean;
  } | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    detectExportCapabilities().then(setCaps).catch(() => undefined);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      abortRef.current?.abort();
    };
  }, [previewUrl]);

  const handleStartExport = async () => {
    setErrorMsg(null);
    setResult(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsExporting(true);
    setProgress({
      stage: 'preparing',
      percent: 1,
      currentFrame: 0,
      totalFrames: Math.ceil(project.duration * settings.fps),
      message: 'Starting local export...',
    });

    try {
      const res = await exportProjectVideo(
        project,
        assets,
        settings,
        (p) => setProgress(p),
        controller.signal
      );
      setResult(res);
      setPreviewUrl(URL.createObjectURL(res.blob));
      setProgress({
        stage: 'done',
        percent: 100,
        currentFrame: Math.ceil(project.duration * settings.fps),
        totalFrames: Math.ceil(project.duration * settings.fps),
        message: 'Video ready to download!',
      });
    } catch (err) {
      if (controller.signal.aborted) {
        setErrorMsg('Export cancelled.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Local export failed.');
      }
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload = () => {
    if (!result || !previewUrl) return;
    const a = document.createElement('a');
    a.href = previewUrl;
    a.download = result.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-[#121722] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Film className="h-5 w-5 text-orange-400" />
            <h3 className="font-display text-lg font-semibold text-white">
              Export Video Locally
            </h3>
          </div>
          <button
            type="button"
            disabled={isExporting}
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-1 text-xs text-slate-400">
          All frames and audio tracks are rendered and encoded on your device. Works completely offline.
        </p>

        {/* Export Configuration */}
        {!result && (
          <div className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Resolution</label>
              <div className="grid grid-cols-2 gap-2">
                {(['720p', '1080p'] as const).map((res) => (
                  <button
                    key={res}
                    type="button"
                    disabled={isExporting}
                    onClick={() => setSettings((s) => ({ ...s, resolution: res }))}
                    className={`rounded-xl border py-2.5 text-xs font-semibold transition ${
                      settings.resolution === res
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-200'
                        : 'border-slate-800 bg-[#0B0E14] text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {res === '720p' ? '720p HD' : '1080p Full HD'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Frame Rate</label>
              <div className="grid grid-cols-3 gap-2">
                {([24, 30, 60] as const).map((fpsVal) => (
                  <button
                    key={fpsVal}
                    type="button"
                    disabled={isExporting}
                    onClick={() => setSettings((s) => ({ ...s, fps: fpsVal }))}
                    className={`rounded-xl border py-2 text-xs font-semibold tabular-nums transition ${
                      settings.fps === fpsVal
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-200'
                        : 'border-slate-800 bg-[#0B0E14] text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {fpsVal} FPS
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Container Format</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setSettings((s) => ({ ...s, format: 'mp4' }))}
                  className={`rounded-xl border p-2.5 text-left transition ${
                    settings.format === 'mp4'
                      ? 'border-cyan-500 bg-cyan-500/10 text-cyan-200'
                      : 'border-slate-800 bg-[#0B0E14] text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <p className="text-xs font-semibold">MP4 (H.264 + AAC)</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {caps?.webCodecsMp4
                      ? 'Hardware WebCodecs MP4'
                      : 'Local FFmpeg.wasm fallback'}
                  </p>
                </button>

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => setSettings((s) => ({ ...s, format: 'webm' }))}
                  className={`rounded-xl border p-2.5 text-left transition ${
                    settings.format === 'webm'
                      ? 'border-cyan-500 bg-cyan-500/10 text-cyan-200'
                      : 'border-slate-800 bg-[#0B0E14] text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <p className="text-xs font-semibold">WebM (VP8/VP9)</p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {caps?.webCodecsWebm ? 'WebCodecs WebM' : 'MediaRecorder fallback'}
                  </p>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Progress */}
        {isExporting && progress && (
          <div className="mt-5 rounded-xl border border-slate-800 bg-[#0B0E14] p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-cyan-300 font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                {progress.message}
              </span>
              <span className="font-mono text-slate-300 tabular-nums">{progress.percent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-cyan-500 transition-all duration-150"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {errorMsg && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Export Complete + Preview */}
        {result && previewUrl && (
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">
              <span className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Rendered via {result.method}
              </span>
              <span className="font-mono tabular-nums text-[11px]">
                {(result.blob.size / (1024 * 1024)).toFixed(2)} MB
              </span>
            </div>

            <video
              src={previewUrl}
              controls
              className="w-full max-h-56 rounded-xl border border-slate-800 bg-black"
            />
          </div>
        )}

        {/* Footer Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3">
          {isExporting ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="rounded-lg border border-rose-500/50 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/20"
            >
              Cancel Export
            </button>
          ) : result ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setProgress(null);
                }}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Export Again
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
              >
                <Download className="h-4 w-4" />
                Download {settings.format.toUpperCase()}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartExport}
                className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-orange-400"
              >
                <Download className="h-4 w-4" />
                Start Export
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
