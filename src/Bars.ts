// The Levels dialog's drawn parts: the histogram, the input and output bars
// and the handle bars under them, as plain DOM and SVG so theme colours apply
// through CSS variables (in `style`: presentation attributes don't resolve
// them). The geometry and the handle rules live in histogram.ts and handles.ts.

import type { PointerEvent as ReactPointerEvent } from "react";
import { barPosition, pickHandle } from "./handles";
import { BINS, histogramPath, spikeHeights, type HistogramScale } from "./histogram";
import { clamp, mapInput, type Channel, type LevelsParams } from "./model";
import { api, h } from "./runtime";

/** GIMP's channel colours (gimp_color_bar_set_channel). */
export const CHANNEL_COLOR: Record<Channel, string> = {
  value: "#ffffff",
  red: "#ff0000",
  green: "#00ff00",
  blue: "#0000ff",
};

const byte = (v: number) => Math.floor(clamp(v, 0, 1) * 255.999);

/** levels_update_input_bar: map_input across the bar, grey for Value and all
 *  three channels' maps for a colour channel. */
export function inputBarGradient(p: LevelsParams, channel: Channel, stops = 33): string {
  const parts: string[] = [];
  for (let i = 0; i < stops; i++) {
    const x = i / (stops - 1);
    const [r, g, b] =
      channel === "value"
        ? [0, 0, 0].map(() => mapInput(p.channels.value, x))
        : [mapInput(p.channels.red, x), mapInput(p.channels.green, x), mapInput(p.channels.blue, x)];
    parts.push(`rgb(${byte(r)}, ${byte(g)}, ${byte(b)}) ${(x * 100).toFixed(2)}%`);
  }
  return `linear-gradient(to right, ${parts.join(", ")})`;
}

export function outputBarGradient(channel: Channel): string {
  return `linear-gradient(to right, #000000, ${CHANNEL_COLOR[channel]})`;
}

const PLOT_HEIGHT = 64;

export function HistogramView({ bins, scale, channel }: { bins: ArrayLike<number> | null; scale: HistogramScale; channel: Channel }) {
  const { useMemo } = api().react;
  const { tokens } = api().ui;
  const fill = channel === "value" ? tokens.textSecondary : CHANNEL_COLOR[channel];
  const path = useMemo(() => (bins ? histogramPath(spikeHeights(bins, scale), BINS, PLOT_HEIGHT) : null), [bins, scale]);
  return h(
    "svg",
    {
      role: "img",
      "aria-label": "Histogram",
      viewBox: `0 0 ${BINS} ${PLOT_HEIGHT}`,
      preserveAspectRatio: "none",
      style: {
        display: "block",
        width: "100%",
        height: PLOT_HEIGHT,
        background: tokens.surface0,
        border: `1px solid ${tokens.border}`,
        boxSizing: "border-box",
      },
    },
    path === null ? null : h("path", { d: path, style: { fill } }),
  );
}

export function GradientBar({ background, label }: { background: string; label: string }) {
  return h("div", { role: "img", "aria-label": label, style: { height: 8, background, border: `1px solid ${api().ui.tokens.border}` } });
}

export interface HandleBarProps {
  label: string;
  positions: readonly (number | null)[];
  onDrag(index: number, pos: number): void;
  onRelease(): void;
}

const HANDLE_FILL = ["#000000", "#808080", "#ffffff"];

/** GIMP's handle bar: a press takes the nearest handle and moves it to the
 *  pointer, the drag follows, release ends the gesture. Handles at 0 and 1
 *  overhang the bar by half their width, so its parent leaves a 5 px gutter. */
export function HandleBar({ label, positions, onDrag, onRelease }: HandleBarProps) {
  const { useRef } = api().react;
  const { tokens } = api().ui;
  const active = useRef<number | null>(null);
  const at = (e: ReactPointerEvent<HTMLDivElement>) => barPosition(e.clientX, e.currentTarget.getBoundingClientRect());
  const finish = () => {
    if (active.current === null) return;
    active.current = null;
    onRelease();
  };

  return h(
    "div",
    {
      role: "group",
      "aria-label": label,
      style: { position: "relative", height: 10, touchAction: "none" },
      onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
        if (e.button !== 0) return;
        const pos = at(e);
        const index = pickHandle(positions, pos);
        if (index < 0) return;
        active.current = index;
        e.currentTarget.setPointerCapture(e.pointerId);
        onDrag(index, pos);
      },
      onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
        if (active.current !== null) onDrag(active.current, at(e));
      },
      onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => {
        if (active.current === null) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        finish();
      },
      onLostPointerCapture: finish,
    },
    ...positions.map((pos, i) =>
      pos === null
        ? null
        : h(
            "svg",
            {
              key: i,
              "data-handle": i,
              "data-pos": pos,
              width: 10,
              height: 9,
              viewBox: "0 0 10 9",
              style: { position: "absolute", top: 0, left: `${pos * 100}%`, marginLeft: -5, overflow: "visible", pointerEvents: "none" },
            },
            h("path", { d: "M5 0.5L9.5 8.5H0.5Z", style: { fill: HANDLE_FILL[i], stroke: tokens.textSecondary, strokeWidth: 1 } }),
          ),
    ),
  );
}
