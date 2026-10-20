// GIMP's Levels config operations (app/operations/gimplevelsconfig.c and the
// picks gimplevelstool.c makes): Auto Input Levels and the eyedroppers. The
// grey pick takes its lightness from the picked colour in the active TRC, as
// GIMP 2.10 did; GIMP 3 reads it from linear RGB even in Perceptual mode,
// which darkens a neutral grey pick.
//
// GIMP - The GNU Image Manipulation Program
// Copyright (C) 1995 Spencer Kimball and Peter Mattis
// gimplevelsconfig.c: Copyright (C) 2007 Michael Natterer <mitch@gimp.org>
// gimplevelstool.c: Copyright (C) 1995 Spencer Kimball and Peter Mattis

import {
  DEFAULT_CHANNEL,
  GAMMA_MAX,
  GAMMA_MIN,
  clamp,
  withChannel,
  type Channel,
  type ChannelLevels,
  type LevelsParams,
  type Rgb,
} from "./model";

export const STRETCH_BIAS = 0.006;
/** GIMP_RGB_LUMINANCE: the sRGB weights adapted from D65 to D50. */
export const LUMINANCE = [0.2224884, 0.71690369, 0.06060791] as const;

export type PickPoint = "black" | "grey" | "white";
/** The pickers beside the input fields act on the selected channel; the All
 *  Channels ones set R, G and B separately. */
export type PickScope = "channel" | "all";
export type ChannelBins = Readonly<Record<Channel, ArrayLike<number>>>;

const COLOUR_CHANNELS = ["red", "green", "blue"] as const;

/** gimp_levels_config_stretch_channel. A point the loop never settles on
 *  keeps its current value, as in GIMP. */
export function stretchChannel(ch: ChannelLevels, bins: ArrayLike<number>): ChannelLevels {
  const n = bins.length;
  let count = 0;
  for (let i = 0; i < n; i++) count += bins[i];
  const base = { ...ch, gamma: 1, lowOutput: 0, highOutput: 1 };
  if (count === 0) return { ...base, lowInput: 0, highInput: 0 };

  let lowInput = ch.lowInput;
  let cumulative = 0;
  for (let i = 0; i < n - 1; i++) {
    cumulative += bins[i];
    const percentage = cumulative / count;
    const next = (cumulative + bins[i + 1]) / count;
    if (Math.abs(percentage - STRETCH_BIAS) < Math.abs(next - STRETCH_BIAS)) {
      lowInput = (i + 1) / (n - 1);
      break;
    }
  }

  let highInput = ch.highInput;
  cumulative = 0;
  for (let i = n - 1; i > 0; i--) {
    cumulative += bins[i];
    const percentage = cumulative / count;
    const next = (cumulative + bins[i - 1]) / count;
    if (Math.abs(percentage - STRETCH_BIAS) < Math.abs(next - STRETCH_BIAS)) {
      highInput = (i - 1) / (n - 1);
      break;
    }
  }

  return { ...base, lowInput, highInput };
}

/** gimp_levels_config_stretch on an RGB image. */
export function autoInputLevels(p: LevelsParams, bins: ChannelBins): LevelsParams {
  let next = withChannel(p, "value", DEFAULT_CHANNEL);
  for (const c of COLOUR_CHANNELS) next = withChannel(next, c, stretchChannel(next.channels[c], bins[c]));
  return next;
}

export function inputFromColor(channel: Channel, rgb: Rgb): number {
  switch (channel) {
    case "value":
      return Math.max(Math.max(rgb[0], rgb[1]), rgb[2]);
    case "red":
      return rgb[0];
    case "green":
      return rgb[1];
    case "blue":
      return rgb[2];
  }
}

/** gimp_levels_config_adjust_by_colors for one point; `rgb` is in the active
 *  TRC. Black and white are written as picked, so a pick can leave white below
 *  black, as GIMP's does. */
export function adjustByColor(ch: ChannelLevels, channel: Channel, point: PickPoint, rgb: Rgb): ChannelLevels {
  if (point === "black") return { ...ch, lowInput: inputFromColor(channel, rgb) };
  if (point === "white") return { ...ch, highInput: inputFromColor(channel, rgb) };

  const lightness = rgb[0] * LUMINANCE[0] + rgb[1] * LUMINANCE[1] + rgb[2] * LUMINANCE[2];
  const range = ch.highInput - ch.lowInput;
  if (range <= 0) return ch;
  const input = inputFromColor(channel, rgb) - ch.lowInput;
  if (input < 0) return ch;
  const inten = input / range;
  const outLight = lightness / range;
  if (outLight <= 0.0001 || outLight >= 0.9999) return ch;
  return { ...ch, gamma: clamp(Math.log(inten) / Math.log(outLight), GAMMA_MIN, GAMMA_MAX) };
}

/** gimp_levels_tool_color_picked. */
export function applyPick(p: LevelsParams, point: PickPoint, scope: PickScope, selected: Channel, rgb: Rgb): LevelsParams {
  if (scope === "channel") return withChannel(p, selected, adjustByColor(p.channels[selected], selected, point, rgb));
  const value = p.channels.value;
  const reset =
    point === "black" ? { ...value, lowInput: 0 } : point === "grey" ? { ...value, gamma: 1 } : { ...value, highInput: 1 };
  let next = withChannel(p, "value", reset);
  for (const c of COLOUR_CHANNELS) next = withChannel(next, c, adjustByColor(next.channels[c], c, point, rgb));
  return next;
}

/** gimp_levels_config_reset_channel. */
export function resetChannel(p: LevelsParams, channel: Channel): LevelsParams {
  return withChannel(p, channel, DEFAULT_CHANNEL);
}
