// The handle bars' rules: which handle a press takes (gimphandlebar.c), the
// bounds GIMP's adjustments put on a drag (gimplevelstool.c sets black's upper
// bound to white and white's lower bound to black; the output handles have
// none), and how the grey handle stands for gamma. GIMP does the gamma maths
// in the spinbuttons' display units, so this does too: the results then match
// its rounding exactly.
//
// GIMP - The GNU Image Manipulation Program
// Copyright (C) 1995 Spencer Kimball and Peter Mattis
// From app/tools/gimplevelstool.c and app/widgets/gimphandlebar.c.

import { GAMMA_MAX, GAMMA_MIN, clamp, type ChannelLevels } from "./model";

/** GIMP's display factor on an 8-bit image: the fields show 0–255. */
export const DISPLAY_SCALE = 255;

export const INPUT_HANDLES = ["low", "gamma", "high"] as const;
export type InputHandle = (typeof INPUT_HANDLES)[number];
export type OutputHandle = "low" | "high";

/** gimp_levels_tool_config_notify: mid + delta · log10(1 / gamma). */
export function gammaHandlePosition(ch: ChannelLevels): number {
  // Pinned black and white: the grey handle must sit exactly on them, because
  // pickHandle's tie rule needs an exact stack and the /255 round trip can miss by an ulp.
  if (ch.highInput === ch.lowInput) return ch.lowInput;
  const low = ch.lowInput * DISPLAY_SCALE;
  const high = ch.highInput * DISPLAY_SCALE;
  const delta = (high - low) / 2;
  return (low + delta + delta * Math.log10(1 / ch.gamma)) / DISPLAY_SCALE;
}

/** levels_linear_gamma_changed: the gamma a grey handle at `pos` stands for,
 *  rounded to 0.01; null while black and white sit less than one display step
 *  apart, where GIMP leaves gamma alone. */
export function gammaFromHandle(ch: ChannelLevels, pos: number): number | null {
  const low = ch.lowInput * DISPLAY_SCALE;
  const high = ch.highInput * DISPLAY_SCALE;
  const handle = clamp(pos * DISPLAY_SCALE, low, high);
  const delta = (high - low) / 2;
  if (!(delta >= 0.5)) return null;
  const mid = low + delta;
  const value = 1 / Math.pow(10, (handle - mid) / delta);
  return Math.floor(value * 100 + 0.5) / 100;
}

/** gimp_handle_bar_button_press: the nearest visible handle; on a tie the
 *  later one wins when the pointer is right of it, so stacked handles open
 *  towards the side pressed. -1 when no handle is visible. */
export function pickHandle(positions: readonly (number | null)[], x: number): number {
  let active = -1;
  let min = Infinity;
  positions.forEach((pos, i) => {
    if (pos === null) return;
    const dist = x - pos;
    if (Math.abs(dist) < min || (Math.abs(dist) === min && dist > 0)) {
      active = i;
      min = Math.abs(dist);
    }
  });
  return active;
}

export function dragInput(ch: ChannelLevels, handle: InputHandle, pos: number): ChannelLevels {
  const x = clamp(pos, 0, 1);
  if (handle === "low") return { ...ch, lowInput: Math.min(x, ch.highInput) };
  if (handle === "high") return { ...ch, highInput: Math.max(x, ch.lowInput) };
  const gamma = gammaFromHandle(ch, x);
  return gamma === null ? ch : { ...ch, gamma: clamp(gamma, GAMMA_MIN, GAMMA_MAX) };
}

export function dragOutput(ch: ChannelLevels, handle: OutputHandle, pos: number): ChannelLevels {
  const x = clamp(pos, 0, 1);
  return handle === "low" ? { ...ch, lowOutput: x } : { ...ch, highOutput: x };
}

export function inputHandlePositions(ch: ChannelLevels): [number, number, number] {
  return [ch.lowInput, gammaHandlePosition(ch), ch.highInput];
}

export function outputHandlePositions(ch: ChannelLevels): [number, null, number] {
  return [ch.lowOutput, null, ch.highOutput];
}

/** Pointer x → position along the bar. clientX and the box are both in
 *  client px, so the interface scale (body zoom) cancels out. */
export function barPosition(clientX: number, box: { left: number; width: number }): number {
  if (box.width <= 0) return 0;
  return clamp((clientX - box.left) / box.width, 0, 1);
}
