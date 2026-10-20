// GIMP's histogram as the Levels dialog shows it (app/core/gimphistogram.c,
// app/widgets/gimphistogramview.c), over an 8-bit sRGB frame: 256 bins per
// channel, each value rounded into its bin in the active TRC, Value binned at
// max(r, g, b).
//
// GIMP - The GNU Image Manipulation Program
// Copyright (C) 1995 Spencer Kimball and Peter Mattis
// gimphistogram module: Copyright (C) 1999 Jay Cox <jaycox@gimp.org>
// gimphistogramview.c: Copyright (C) 1995 Spencer Kimball and Peter Mattis

import { decodePerceptual, type Channel } from "./model";

export const BINS = 256;
export type Histograms = Readonly<Record<Channel, Float64Array>>;
export type HistogramScale = "linear" | "log";

const LINEAR_BIN = new Uint8Array(256);
for (let i = 0; i < 256; i++) LINEAR_BIN[i] = Math.round(decodePerceptual(i / 255) * (BINS - 1));

export function histogramsFromRgba(data: ArrayLike<number>, width: number, height: number, linear: boolean): Histograms {
  const value = new Float64Array(BINS);
  const red = new Float64Array(BINS);
  const green = new Float64Array(BINS);
  const blue = new Float64Array(BINS);
  for (let i = 0, n = width * height; i < n; i++) {
    const o = i * 4;
    const r = linear ? LINEAR_BIN[data[o]] : data[o];
    const g = linear ? LINEAR_BIN[data[o + 1]] : data[o + 1];
    const b = linear ? LINEAR_BIN[data[o + 2]] : data[o + 2];
    red[r]++;
    green[g]++;
    blue[b]++;
    value[Math.max(r, g, b)]++;
  }
  return { value, red, green, blue };
}

/** gimp_histogram_view_draw_spike: each bin's height as a fraction of the
 *  plot. GIMP divides by log(max) on the log scale, which is 0 when the
 *  tallest bin holds one value; those bins are drawn full height here. */
export function spikeHeights(bins: ArrayLike<number>, scale: HistogramScale): Float64Array {
  let max = 0;
  for (let i = 0; i < bins.length; i++) if (bins[i] > max) max = bins[i];
  const out = new Float64Array(bins.length);
  const top = scale === "log" ? (max > 0 ? Math.log(max) : 1) : max;
  for (let i = 0; i < bins.length; i++) {
    const v = bins[i];
    if (v <= 0) continue;
    const h = scale === "log" ? (top > 0 ? Math.log(v) / top : 1) : v / top;
    out[i] = Math.max(0, h);
  }
  return out;
}

const tenth = (v: number) => Math.round(v * 10) / 10;

/** One closed bar per non-empty bin, in a width × height box with y down;
 *  coordinates to 0.1 keep the path short. */
export function histogramPath(heights: ArrayLike<number>, width: number, height: number): string {
  const n = heights.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const h = heights[i];
    if (h <= 0) continue;
    const x0 = tenth((i * width) / n);
    const x1 = tenth(((i + 1) * width) / n);
    d += `M${x0} ${height}V${tenth(height * (1 - h))}H${x1}V${height}Z`;
  }
  return d;
}
