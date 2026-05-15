declare module 'svg-piano' {
  export interface KeyData {
    notes: string[];
    visible?: boolean;
    fill: string;
    stroke: string;
    strokeWidth: number;
  }

  export interface RenderedKey {
    key: KeyData;
    polygon: {
      points: string;
      style: { fill: string; stroke: string; strokeWidth: number };
    };
    circle?: unknown;
    text?: unknown;
  }

  export interface RenderedSvg {
    svg: { width: number; height: number };
    children: (RenderedKey | undefined)[];
  }

  export interface RenderOptions {
    range?: [string, string];
    palette?: [string, string];
    stroke?: string;
    strokeWidth?: number;
    scaleX?: number;
    scaleY?: number;
    upperHeight?: number;
    lowerHeight?: number;
    colorize?: { keys: string[]; color: string }[];
    labels?: Record<string, string>;
    topLabels?: boolean;
  }

  export function renderSVG(options: RenderOptions): RenderedSvg;
}
