// The bag contract: one stage whose qualified keys are its uniforms. Two places
// clamp to GIMP's ranges, both taken from KEY_SPECS. readParams (the panel and
// the CPU model) reads a missing or foreign value as GIMP's default and clamps a
// number into range. The shader clamps the same ranges itself (src/stage.ts),
// because the host binds bag values to uniforms as stored, with no range check.
//
// On process version 2 and later the image runs past 0..1, so the input points
// may too: an eyedropper on a highlight at 1.6 keeps 1.6, and one on a pixel
// with a negative channel keeps that. The output points stay 0..1, the range
// the levels map onto. Version 1 keeps GIMP's ranges, so its photos render as
// they were edited.

import { CHANNELS, DEFAULT_CHANNEL, GAMMA_MAX, GAMMA_MIN, clamp, type Channel, type ChannelLevels, type LevelsParams } from "./model";
import type { DevelopParams } from "./safelight";

export const EXT_ID = "tone-levels";
export const STAGE_ID = `${EXT_ID}.levels`;

export const LEVEL_FIELDS = ["LowInput", "HighInput", "Gamma", "LowOutput", "HighOutput"] as const;
export type LevelField = (typeof LEVEL_FIELDS)[number];
export const SWITCHES = ["clampInput", "clampOutput", "linear"] as const;
type Switch = (typeof SWITCHES)[number];

const FIELD: Record<LevelField, keyof ChannelLevels> = {
  LowInput: "lowInput",
  HighInput: "highInput",
  Gamma: "gamma",
  LowOutput: "lowOutput",
  HighOutput: "highOutput",
};

export interface Range {
  readonly min: number;
  readonly max: number;
}

export const UNIT: Range = { min: 0, max: 1 };

/** The input points' range on version 2 and later. Any pick lands well inside
 *  it, in Linear mode too; the bound only keeps a stray value finite. */
export const FULL_INPUT_RANGE: Range = { min: -64, max: 64 };

const FIELD_SPEC: Record<LevelField, Range & { full: Range; step: number; label: string }> = {
  LowInput: { ...UNIT, full: FULL_INPUT_RANGE, step: 0.001, label: "low input" },
  HighInput: { ...UNIT, full: FULL_INPUT_RANGE, step: 0.001, label: "high input" },
  Gamma: { min: GAMMA_MIN, max: GAMMA_MAX, full: { min: GAMMA_MIN, max: GAMMA_MAX }, step: 0.01, label: "gamma" },
  LowOutput: { ...UNIT, full: UNIT, step: 0.001, label: "low output" },
  HighOutput: { ...UNIT, full: UNIT, step: 0.001, label: "high output" },
};

const CHANNEL_LABEL: Record<Channel, string> = { value: "Value", red: "Red", green: "Green", blue: "Blue" };
const SWITCH_LABEL: Record<Switch, string> = { clampInput: "Clamp input", clampOutput: "Clamp output", linear: "Linear" };

export const channelKey = (channel: Channel, field: LevelField): string => `${channel}${field}`;

/** `min` and `max` are version 1's range, `full` version 2's and later's. */
export interface KeySpec extends Range {
  readonly key: string;
  readonly default: number;
  readonly full: Range;
  readonly step: number;
  readonly label: string;
}

export const KEY_SPECS: readonly KeySpec[] = [
  ...CHANNELS.flatMap((c) =>
    LEVEL_FIELDS.map((f) => ({
      key: channelKey(c, f),
      default: DEFAULT_CHANNEL[FIELD[f]],
      min: FIELD_SPEC[f].min,
      max: FIELD_SPEC[f].max,
      full: FIELD_SPEC[f].full,
      step: FIELD_SPEC[f].step,
      label: `${CHANNEL_LABEL[c]} ${FIELD_SPEC[f].label}`,
    })),
  ),
  ...SWITCHES.map((s) => ({ key: s, default: 0, ...UNIT, full: UNIT, step: 1, label: SWITCH_LABEL[s] })),
];

export const UNIFORM_KEYS: readonly string[] = KEY_SPECS.map((s) => s.key);
const SPEC = new Map(KEY_SPECS.map((s) => [s.key, s]));

export const qualified = (key: string): string => `${STAGE_ID}.${key}`;

/** Bag values come back from sidecar JSON and presets: a runtime boundary. */
export type Bag = Readonly<Record<string, unknown>>;
export type Patch = Record<string, number>;

/** The photo's process version; params without one are version 1. */
export function processVersion(params: DevelopParams): number {
  const v = params.processVersion;
  return typeof v === "number" && Number.isFinite(v) ? v : 1;
}

export const keyRange = (spec: KeySpec, version: number): Range => (version >= 2 ? spec.full : spec);

/** Where the input points may sit on a photo of `version`. */
export const inputRange = (version: number): Range => (version >= 2 ? FULL_INPUT_RANGE : UNIT);

function read(bag: Bag, key: string, version: number): number {
  const spec = SPEC.get(key);
  if (!spec) throw new Error(`[tone-levels] unknown key ${key}`);
  const v = bag[qualified(key)];
  const { min, max } = keyRange(spec, version);
  return typeof v === "number" && Number.isFinite(v) ? clamp(v, min, max) : spec.default;
}

export function readParams(bag: Bag, version = 1): LevelsParams {
  const channel = (c: Channel): ChannelLevels => ({
    lowInput: read(bag, channelKey(c, "LowInput"), version),
    highInput: read(bag, channelKey(c, "HighInput"), version),
    gamma: read(bag, channelKey(c, "Gamma"), version),
    lowOutput: read(bag, channelKey(c, "LowOutput"), version),
    highOutput: read(bag, channelKey(c, "HighOutput"), version),
  });
  return {
    channels: { value: channel("value"), red: channel("red"), green: channel("green"), blue: channel("blue") },
    clampInput: read(bag, "clampInput", version) > 0.5,
    clampOutput: read(bag, "clampOutput", version) > 0.5,
    linear: read(bag, "linear", version) > 0.5,
  };
}

export function bagPatch(p: LevelsParams): Patch {
  const out: Patch = {};
  for (const c of CHANNELS) for (const f of LEVEL_FIELDS) out[qualified(channelKey(c, f))] = p.channels[c][FIELD[f]];
  out[qualified("clampInput")] = p.clampInput ? 1 : 0;
  out[qualified("clampOutput")] = p.clampOutput ? 1 : 0;
  out[qualified("linear")] = p.linear ? 1 : 0;
  return out;
}

export function resetPatch(): Patch {
  const out: Patch = {};
  for (const s of KEY_SPECS) out[qualified(s.key)] = s.default;
  return out;
}
