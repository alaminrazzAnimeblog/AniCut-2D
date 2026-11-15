export type AssetCategory =
  | 'character'
  | 'background'
  | 'sticker'
  | 'media'
  | 'audio';

export type MediaType =
  | 'image'
  | 'svg'
  | 'gif'
  | 'spritesheet'
  | 'video'
  | 'audio';

export interface SpriteConfig {
  rows: number;
  cols: number;
  fps: number;
  loop?: boolean;
}

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  mediaType: MediaType;
  mimeType: string;
  blob: Blob;
  thumbnailDataUrl: string;
  width: number;
  height: number;
  duration?: number;
  spriteConfig?: SpriteConfig;
  createdAt: number;
}

export type TrackType = 'video' | 'character' | 'image' | 'text' | 'audio';

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  visible: boolean;
  locked: boolean;
  muted: boolean;
  order: number;
}

export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export interface Keyframe {
  id: string;
  time: number; // seconds relative to clip.startTime (0 .. clip.duration)
  easing: EasingType;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
}

export type MotionPreset =
  | 'none'
  | 'bounce'
  | 'float'
  | 'pulse'
  | 'spin'
  | 'wiggle'
  | 'slide-in-left'
  | 'slide-in-right'
  | 'pop-in';

export type TransitionType =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'zoom-in'
  | 'wipe-left';

export interface VisualFilter {
  brightness: number; // 0..200, default 100
  contrast: number; // 0..200, default 100
  saturation: number; // 0..200, default 100
  blur: number; // 0..20, default 0
  tintColor?: string;
  tintAmount?: number; // 0..1
  flipX?: boolean;
  flipY?: boolean;
}

export interface TextData {
  content: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  strokeColor: string;
  strokeWidth: number;
  backgroundColor: string;
  align: 'left' | 'center' | 'right';
  bold: boolean;
  italic: boolean;
}

export type ShapeType =
  | 'rect'
  | 'circle'
  | 'star'
  | 'triangle'
  | 'arrow'
  | 'speech-bubble';

export interface ShapeData {
  shapeType: ShapeType;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  cornerRadius: number;
}

export interface AudioData {
  volume: number; // 0..2, 1 is 100%
  muted: boolean;
}

export type ClipKind =
  | 'character'
  | 'image'
  | 'spritesheet'
  | 'gif'
  | 'video'
  | 'text'
  | 'shape'
  | 'audio';

export interface Clip {
  id: string;
  trackId: string;
  assetId?: string;
  kind: ClipKind;
  name: string;
  startTime: number;
  duration: number;
  sourceOffset: number;
  playbackRate: number;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  keyframes: Keyframe[];
  fadeIn: number;
  fadeOut: number;
  transitionIn: TransitionType;
  transitionDuration: number;
  motionPreset: MotionPreset;
  filters: VisualFilter;
  spriteOverride?: SpriteConfig;
  textData?: TextData;
  shapeData?: ShapeData;
  audioData?: AudioData;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  width: number;
  height: number;
  fps: number;
  duration: number;
  backgroundColor: string;
  tracks: Track[];
  clips: Clip[];
}

export type CanvasPresetId = '16:9-hd' | '16:9-fhd' | '9:16-vertical' | '1:1-square' | '4:3-classic';

export interface CanvasPreset {
  id: CanvasPresetId;
  label: string;
  width: number;
  height: number;
}

export interface ExportSettings {
  resolution: '720p' | '1080p';
  fps: 24 | 30 | 60;
  format: 'mp4' | 'webm';
}

export interface ExportProgress {
  stage: 'preparing' | 'rendering-audio' | 'encoding-video' | 'transcoding' | 'finalizing' | 'done' | 'error' | 'cancelled';
  percent: number;
  currentFrame: number;
  totalFrames: number;
  message: string;
}
