// GIMP's Levels maths, line for line from app/operations/gimpoperationlevels.c
// (GNOME/gimp master d7ea51b2). Each of R, G and B passes through its own
// channel's levels and then through the Value channel's: Value is one curve on
// all three channels, not a luminance curve.
//
// GIMP - The GNU Image Manipulation Program
// Copyright (C) 1995 Spencer Kimball and Peter Mattis
// gimpoperationlevels.c: Copyright (C) 2007 Michael Natterer <mitch@gimp.org>

export const CHANNELS = ["value", "red", "green", "blue"] as const;
export type Channel = (typeof CHANNELS)[number];
export type Rgb = readonly [number, number, number];

export interface ChannelLevels {
  readonly lowInput: number;
  readonly highInput: number;
  readonly gamma: number;
  readonly lowOutput: number;
  readonly highOutput: number;
}

export interface LevelsParams {
  readonly channels: Readonly<Record<Channel, ChannelLevels>>;
  readonly clampInput: boolean;
  readonly clampOutput: boolean;
  /** GIMP's "trc": true works on linear light, false (Perceptual, the
   *  default GIMP 3's tool forces) on the display-encoded value. */
  readonly linear: boolean;
}

export const GAMMA_MIN = 0.1;
export const GAMMA_MAX = 10;

export const DEFAULT_CHANNEL: ChannelLevels = Object.freeze({
  lowInput: 0,
  highInput: 1,
  gamma: 1,
  lowOutput: 0,
  highOutput: 1,
});

export const DEFAULT_PARAMS: LevelsParams = Object.freeze({
  channels: Object.freeze({
    value: DEFAULT_CHANNEL,
    red: DEFAULT_CHANNEL,
    green: DEFAULT_CHANNEL,
    blue: DEFAULT_CHANNEL,
  }),
  clampInput: false,
  clampOutput: false,
  linear: false,
});

/** GLib's CLAMP, argument order and all. */
export const clamp = (v: number, lo: number, hi: number): number => (v > hi ? hi : v < lo ? lo : v);

/** gimp_operation_levels_map. */
export function levelsMap(
  value: number,
  lowInput: number,
  highInput: number,
  clampInput: boolean,
  invGamma: number,
  lowOutput: number,
  highOutput: number,
  clampOutput: boolean,
): number {
  let v = highInput !== lowInput ? (value - lowInput) / (highInput - lowInput) : value - lowInput;
  if (clampInput) v = clamp(v, 0, 1);
  if (invGamma !== 1 && v > 0) v = Math.pow(v, invGamma);
  v = highOutput >= lowOutput ? v * (highOutput - lowOutput) + lowOutput : lowOutput - v * (lowOutput - highOutput);
  if (clampOutput) v = clamp(v, 0, 1);
  return v;
}

export function mapChannel(value: number, ch: ChannelLevels, clampInput: boolean, clampOutput: boolean): number {
  return levelsMap(value, ch.lowInput, ch.highInput, clampInput, 1 / ch.gamma, ch.lowOutput, ch.highOutput, clampOutput);
}

/** gimp_operation_levels_map_input: what the input bar previews. */
export function mapInput(ch: ChannelLevels, value: number): number {
  let v = ch.highInput !== ch.lowInput ? (value - ch.lowInput) / (ch.highInput - ch.lowInput) : value - ch.lowInput;
  if (ch.gamma !== 0 && v > 0) v = Math.pow(v, 1 / ch.gamma);
  return v;
}

/** The sRGB curve on |x| with the sign put back and no ceiling: the core's
 *  perceptual stage encoding (src/rendering/stage-space.ts). */
export function encodePerceptual(x: number): number {
  const a = Math.abs(x);
  const e = a < 0.0031308 ? a * 12.92 : 1.055 * Math.pow(a, 1 / 2.4) - 0.055;
  return Math.sign(x) * e;
}

export function decodePerceptual(y: number): number {
  const a = Math.abs(y);
  const d = a < 0.04045 ? a / 12.92 : Math.pow((a + 0.055) / 1.055, 2.4);
  return Math.sign(y) * d;
}

export function channelIsDefault(ch: ChannelLevels): boolean {
  return ch.lowInput === 0 && ch.highInput === 1 && ch.gamma === 1 && ch.lowOutput === 0 && ch.highOutput === 1;
}

/** At the defaults the stage skips its block, so the photo renders unchanged. */
export function isDefault(p: LevelsParams): boolean {
  return !p.clampInput && !p.clampOutput && !p.linear && CHANNELS.every((c) => channelIsDefault(p.channels[c]));
}

/** One pixel as the stage renders it. */
export function levelsPixel(rgb: Rgb, p: LevelsParams): [number, number, number] {
  if (isDefault(p)) return [rgb[0], rgb[1], rgb[2]];
  const { channels, clampInput, clampOutput } = p;
  const own = [channels.red, channels.green, channels.blue];
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const v = p.linear ? decodePerceptual(rgb[i]) : rgb[i];
    const m = mapChannel(mapChannel(v, own[i], clampInput, clampOutput), channels.value, clampInput, clampOutput);
    out[i] = p.linear ? encodePerceptual(m) : m;
  }
  return out;
}

export function withChannel(p: LevelsParams, channel: Channel, ch: ChannelLevels): LevelsParams {
  return { ...p, channels: { ...p.channels, [channel]: ch } };
}
