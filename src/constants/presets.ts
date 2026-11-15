import type {
  CanvasPreset,
  Clip,
  MotionPreset,
  Project,
  ShapeType,
  Track,
  TransitionType,
  VisualFilter,
} from '../types/project';

export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: '16:9-hd', label: '16:9 HD (1280×720)', width: 1280, height: 720 },
  { id: '16:9-fhd', label: '16:9 Full HD (1920×1080)', width: 1920, height: 1080 },
  { id: '9:16-vertical', label: '9:16 Vertical (1080×1920)', width: 1080, height: 1920 },
  { id: '1:1-square', label: '1:1 Square (1080×1080)', width: 1080, height: 1080 },
  { id: '4:3-classic', label: '4:3 Classic (1200×900)', width: 1200, height: 900 },
];

export const DEFAULT_FILTERS: VisualFilter = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  blur: 0,
  tintColor: '#000000',
  tintAmount: 0,
  flipX: false,
  flipY: false,
};

export const MOTION_PRESETS: { id: MotionPreset; label: string; hint: string }[] = [
  { id: 'none', label: 'None', hint: 'Use manual keyframes only' },
  { id: 'bounce', label: 'Bounce', hint: 'Playful vertical hop' },
  { id: 'float', label: 'Float', hint: 'Gentle hovering motion' },
  { id: 'pulse', label: 'Pulse', hint: 'Rhythmic scale breathing' },
  { id: 'spin', label: 'Spin', hint: 'Continuous 360° rotation' },
  { id: 'wiggle', label: 'Wiggle', hint: 'Snappy tilt oscillation' },
  { id: 'slide-in-left', label: 'Slide In Left', hint: 'Enters from left edge' },
  { id: 'slide-in-right', label: 'Slide In Right', hint: 'Enters from right edge' },
  { id: 'pop-in', label: 'Pop In', hint: 'Elastic scale entrance' },
];

export const TRANSITIONS: { id: TransitionType; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'fade', label: 'Cross Dissolve' },
  { id: 'slide-up', label: 'Slide Up' },
  { id: 'zoom-in', label: 'Zoom In' },
  { id: 'wipe-left', label: 'Wipe Left' },
];

export const SHAPE_CATALOG: {
  type: ShapeType;
  label: string;
  defaultFill: string;
  defaultStroke: string;
}[] = [
  { type: 'circle', label: 'Circle', defaultFill: '#22D3EE', defaultStroke: '#083344' },
  { type: 'rect', label: 'Rounded Box', defaultFill: '#F97316', defaultStroke: '#431407' },
  { type: 'star', label: 'Star', defaultFill: '#FACC15', defaultStroke: '#422006' },
  { type: 'triangle', label: 'Triangle', defaultFill: '#34D399', defaultStroke: '#064E3B' },
  { type: 'arrow', label: 'Arrow', defaultFill: '#38BDF8', defaultStroke: '#0C4A6E' },
  { type: 'speech-bubble', label: 'Speech Bubble', defaultFill: '#F8FAFC', defaultStroke: '#1E293B' },
];

export const DEFAULT_FONT_FAMILIES = [
  'Plus Jakarta Sans',
  'DM Sans',
  'JetBrains Mono',
  'Georgia',
  'Impact',
];

export function createId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createBlankProject(name = 'Untitled Project', width = 1280, height = 720, fps = 30): Project {
  const now = Date.now();
  const tracks: Track[] = [
    { id: createId('trk'), name: 'Text Overlay', type: 'text', visible: true, locked: false, muted: false, order: 0 },
    { id: createId('trk'), name: 'Character Layer', type: 'character', visible: true, locked: false, muted: false, order: 1 },
    { id: createId('trk'), name: 'Props & Stickers', type: 'image', visible: true, locked: false, muted: false, order: 2 },
    { id: createId('trk'), name: 'Video & Backdrop', type: 'video', visible: true, locked: false, muted: false, order: 3 },
    { id: createId('trk'), name: 'Audio & Music', type: 'audio', visible: true, locked: false, muted: false, order: 4 },
  ];

  return {
    id: createId('proj'),
    name,
    createdAt: now,
    updatedAt: now,
    width,
    height,
    fps,
    duration: 10,
    backgroundColor: '#111827',
    tracks,
    clips: [],
  };
}

export function createSampleProject(): Project {
  const now = Date.now();
  const trkText: Track = { id: 'trk_sample_text', name: 'Title Overlay', type: 'text', visible: true, locked: false, muted: false, order: 0 };
  const trkChar: Track = { id: 'trk_sample_char', name: 'Hero Shapes', type: 'character', visible: true, locked: false, muted: false, order: 1 };
  const trkProps: Track = { id: 'trk_sample_props', name: 'Orbiting Accents', type: 'image', visible: true, locked: false, muted: false, order: 2 };
  const trkBg: Track = { id: 'trk_sample_bg', name: 'Stage Backdrop', type: 'video', visible: true, locked: false, muted: false, order: 3 };
  const trkAudio: Track = { id: 'trk_sample_audio', name: 'Audio Track', type: 'audio', visible: true, locked: false, muted: false, order: 4 };

  const clips: Clip[] = [
    {
      id: 'clip_sample_bg_panel',
      trackId: trkBg.id,
      kind: 'shape',
      name: 'Horizon Stage Card',
      startTime: 0,
      duration: 6,
      sourceOffset: 0,
      playbackRate: 1,
      zIndex: 1,
      x: 640,
      y: 590,
      width: 1120,
      height: 180,
      rotation: 0,
      opacity: 0.9,
      keyframes: [],
      fadeIn: 0.4,
      fadeOut: 0.4,
      transitionIn: 'none',
      transitionDuration: 0.4,
      motionPreset: 'none',
      filters: { ...DEFAULT_FILTERS },
      shapeData: {
        shapeType: 'rect',
        fillColor: '#1E293B',
        strokeColor: '#334155',
        strokeWidth: 3,
        cornerRadius: 28,
      },
    },
    {
      id: 'clip_sample_star',
      trackId: trkProps.id,
      kind: 'shape',
      name: 'Spinning Star',
      startTime: 0.2,
      duration: 5.6,
      sourceOffset: 0,
      playbackRate: 1,
      zIndex: 2,
      x: 240,
      y: 230,
      width: 140,
      height: 140,
      rotation: 0,
      opacity: 1,
      keyframes: [
        { id: 'kf_s1', time: 0, easing: 'ease-out', x: 200, y: 260, rotation: 0, opacity: 0 },
        { id: 'kf_s2', time: 1.2, easing: 'ease-in-out', x: 280, y: 200, rotation: 180, opacity: 1 },
        { id: 'kf_s3', time: 4.5, easing: 'ease-in-out', x: 1020, y: 200, rotation: 540, opacity: 1 },
        { id: 'kf_s4', time: 5.6, easing: 'ease-in', x: 1080, y: 250, rotation: 720, opacity: 0 },
      ],
      fadeIn: 0.3,
      fadeOut: 0.4,
      transitionIn: 'pop-in' as unknown as TransitionType,
      transitionDuration: 0.3,
      motionPreset: 'pulse',
      filters: { ...DEFAULT_FILTERS },
      shapeData: {
        shapeType: 'star',
        fillColor: '#FACC15',
        strokeColor: '#CA8A04',
        strokeWidth: 4,
        cornerRadius: 0,
      },
    },
    {
      id: 'clip_sample_hero_orb',
      trackId: trkChar.id,
      kind: 'shape',
      name: 'Bouncing Core',
      startTime: 0,
      duration: 6,
      sourceOffset: 0,
      playbackRate: 1,
      zIndex: 3,
      x: 220,
      y: 420,
      width: 170,
      height: 170,
      rotation: 0,
      opacity: 1,
      keyframes: [
        { id: 'kf_o1', time: 0, easing: 'ease-out', x: 220, y: 420, width: 140, height: 140 },
        { id: 'kf_o2', time: 1.5, easing: 'ease-in-out', x: 640, y: 310, width: 190, height: 190 },
        { id: 'kf_o3', time: 3.0, easing: 'ease-in-out', x: 1040, y: 420, width: 150, height: 150 },
        { id: 'kf_o4', time: 4.5, easing: 'ease-in-out', x: 640, y: 360, width: 180, height: 180 },
        { id: 'kf_o5', time: 6.0, easing: 'ease-in', x: 640, y: 360, width: 180, height: 180 },
      ],
      fadeIn: 0.4,
      fadeOut: 0.5,
      transitionIn: 'zoom-in',
      transitionDuration: 0.4,
      motionPreset: 'bounce',
      filters: { ...DEFAULT_FILTERS },
      shapeData: {
        shapeType: 'circle',
        fillColor: '#22D3EE',
        strokeColor: '#F8FAFC',
        strokeWidth: 6,
        cornerRadius: 0,
      },
    },
    {
      id: 'clip_sample_bubble',
      trackId: trkChar.id,
      kind: 'shape',
      name: 'Speech Callout',
      startTime: 1.2,
      duration: 4.4,
      sourceOffset: 0,
      playbackRate: 1,
      zIndex: 4,
      x: 840,
      y: 230,
      width: 240,
      height: 130,
      rotation: -4,
      opacity: 1,
      keyframes: [
        { id: 'kf_b1', time: 0, easing: 'ease-out', rotation: -12, opacity: 0 },
        { id: 'kf_b2', time: 0.6, easing: 'ease-in-out', rotation: -3, opacity: 1 },
        { id: 'kf_b3', time: 3.8, easing: 'ease-in', rotation: 3, opacity: 1 },
      ],
      fadeIn: 0.3,
      fadeOut: 0.4,
      transitionIn: 'slide-up',
      transitionDuration: 0.35,
      motionPreset: 'float',
      filters: { ...DEFAULT_FILTERS },
      shapeData: {
        shapeType: 'speech-bubble',
        fillColor: '#F97316',
        strokeColor: '#FFF7ED',
        strokeWidth: 4,
        cornerRadius: 18,
      },
    },
    {
      id: 'clip_sample_title',
      trackId: trkText.id,
      kind: 'text',
      name: 'Sample Title',
      startTime: 0.3,
      duration: 5.5,
      sourceOffset: 0,
      playbackRate: 1,
      zIndex: 5,
      x: 640,
      y: 590,
      width: 840,
      height: 100,
      rotation: 0,
      opacity: 1,
      keyframes: [
        { id: 'kf_t1', time: 0, easing: 'ease-out', y: 630, opacity: 0 },
        { id: 'kf_t2', time: 0.7, easing: 'ease-out', y: 590, opacity: 1 },
      ],
      fadeIn: 0.35,
      fadeOut: 0.45,
      transitionIn: 'fade',
      transitionDuration: 0.35,
      motionPreset: 'none',
      filters: { ...DEFAULT_FILTERS },
      textData: {
        content: 'AniCut 2D · Keyframe Motion Demo',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 42,
        color: '#F8FAFC',
        strokeColor: '#0F172A',
        strokeWidth: 4,
        backgroundColor: 'transparent',
        align: 'center',
        bold: true,
        italic: false,
      },
    },
  ];

  // Fix transitionIn typo on star clip
  clips[1].transitionIn = 'zoom-in';

  return {
    id: createId('proj'),
    name: 'Sample · Keyframe Motion',
    createdAt: now,
    updatedAt: now,
    width: 1280,
    height: 720,
    fps: 30,
    duration: 6,
    backgroundColor: '#0B1120',
    tracks: [trkText, trkChar, trkProps, trkBg, trkAudio],
    clips,
  };
}
