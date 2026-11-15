declare module 'gifuct-js' {
  export interface GifFrame {
    dims: { width: number; height: number; top: number; left: number };
    delay: number;
    disposalType: number;
    patch: Uint8ClampedArray;
    transparentIndex?: number;
  }

  export interface ParsedGif {
    lsd: { width: number; height: number };
    frames: GifFrame[];
  }

  export function parseGIF(arrayBuffer: ArrayBuffer): ParsedGif;
  export function decompressFrames(gif: ParsedGif, buildImagePatch?: boolean): GifFrame[];
}
