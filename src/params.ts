// The bag contract: one stage whose qualified keys are its uniforms. Two places
// clamp to GIMP's ranges, both taken from KEY_SPECS. readParams (the panel and
// the CPU model) reads a missing or foreign value as GIMP's default and clamps a
// number into range. The shader clamps the same ranges itself (src/stage.ts),
// because the host binds bag values to uniforms as stored, with no range check.

import { CHANNELS, DEFAULT_CHANNEL, GAMMA_MAX, GAMMA_MIN, clamp, type Channel, type ChannelLevels, type LevelsParams } from "./model";

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

const FIELD_SPEC: Record<LevelField, { min: number; max: number; step: number; label: string }> = {
  LowInput: { min: 0, max: 1, step: 0.001, label: "low input" },
  HighInput: { min: 0, max: 1, step: 0.001, label: "high input" },
  Gamma: { min: GAMMA_MIN, max: GAMMA_MAX, step: 0.01, label: "gamma" },
  LowOutput: { min: 0, max: 1, step: 0.001, label: "low output" },
  HighOutput: { min: 0, max: 1, step: 0.001, label: "high output" },
};

const CHANNEL_LABEL: Record<Channel, string> = { value: "Value", red: "Red", green: "Green", blue: "Blue" };
const SWITCH_LABEL: Record<Switch, string> = { clampInput: "Clamp input", clampOutput: "Clamp output", linear: "Linear" };

export const channelKey = (channel: Channel, field: LevelField): string => `${channel}${field}`;

export interface KeySpec {
  readonly key: string;
  readonly default: number;
  readonly min: number;
  readonly max: number;
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
      step: FIELD_SPEC[f].step,
      label: `${CHANNEL_LABEL[c]} ${FIELD_SPEC[f].label}`,
    })),
  ),
  ...SWITCHES.map((s) => ({ key: s, default: 0, min: 0, max: 1, step: 1, label: SWITCH_LABEL[s] })),
];

export const UNIFORM_KEYS: readonly string[] = KEY_SPECS.map((s) => s.key);
const SPEC = new Map(KEY_SPECS.map((s) => [s.key, s]));

export const qualified = (key: string): string => `${STAGE_ID}.${key}`;

/** Bag values come back from sidecar JSON and presets: a runtime boundary. */
export type Bag = Readonly<Record<string, unknown>>;
export type Patch = Record<string, number>;

function read(bag: Bag, key: string): number {
  const spec = SPEC.get(key);
  if (!spec) throw new Error(`[tone-levels] unknown key ${key}`);
  const v = bag[qualified(key)];
  return typeof v === "number" && Number.isFinite(v) ? clamp(v, spec.min, spec.max) : spec.default;
}

export function readParams(bag: Bag): LevelsParams {
  const channel = (c: Channel): ChannelLevels => ({
    lowInput: read(bag, channelKey(c, "LowInput")),
    highInput: read(bag, channelKey(c, "HighInput")),
    gamma: read(bag, channelKey(c, "Gamma")),
    lowOutput: read(bag, channelKey(c, "LowOutput")),
    highOutput: read(bag, channelKey(c, "HighOutput")),
  });
  return {
    channels: { value: channel("value"), red: channel("red"), green: channel("green"), blue: channel("blue") },
    clampInput: read(bag, "clampInput") > 0.5,
    clampOutput: read(bag, "clampOutput") > 0.5,
    linear: read(bag, "linear") > 0.5,
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
