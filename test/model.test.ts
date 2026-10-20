// The levels maths against GIMP's own C (test/reference): the map with every
// clamp, inversion and degenerate range, the input bar's map_input, and the
// per-pixel process (each channel, then Value). Linear mode goes through the
// core's signed sRGB curve.

import { describe, expect, it } from "vitest";
import vectors from "./reference/vectors.json";
import {
  DEFAULT_CHANNEL,
  DEFAULT_PARAMS,
  decodePerceptual,
  encodePerceptual,
  isDefault,
  levelsMap,
  levelsPixel,
  mapInput,
  withChannel,
  type ChannelLevels,
  type LevelsParams,
} from "../src/model";

const expectNear = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(expected)));

const levels = ([lowInput, highInput, gamma, lowOutput, highOutput]: number[]): ChannelLevels => ({
  lowInput,
  highInput,
  gamma,
  lowOutput,
  highOutput,
});

describe("levelsMap", () => {
  it("matches gimp_operation_levels_map across clamps, inversions and degenerate ranges", () => {
    expect(vectors.map.length).toBe(680);
    for (const [v, lo, hi, ci, ig, olo, ohi, co, out] of vectors.map) {
      expectNear(levelsMap(v, lo, hi, ci === 1, ig, olo, ohi, co === 1), out);
    }
  });
});

describe("mapInput", () => {
  it("matches gimp_operation_levels_map_input", () => {
    for (const [lo, hi, g, v, out] of vectors.mapInput) expectNear(mapInput(levels([lo, hi, g, 0, 1]), v), out);
  });
});

describe("levelsPixel", () => {
  it("runs each channel's levels and then Value's, as gimp_operation_levels_process", () => {
    expect(vectors.process.length).toBe(56);
    for (const c of vectors.process) {
      const p: LevelsParams = {
        channels: {
          value: levels(c.levels[0]),
          red: levels(c.levels[1]),
          green: levels(c.levels[2]),
          blue: levels(c.levels[3]),
        },
        clampInput: c.clampInput === 1,
        clampOutput: c.clampOutput === 1,
        linear: false,
      };
      const out = levelsPixel([c.rgb[0], c.rgb[1], c.rgb[2]], p);
      out.forEach((v, i) => expectNear(v, c.out[i]));
    }
  });

  it("is the identity at GIMP's defaults and applies Value per channel, not as luminance", () => {
    expect(isDefault(DEFAULT_PARAMS)).toBe(true);
    expect(isDefault({ ...DEFAULT_PARAMS, clampOutput: true })).toBe(false);
    expect(levelsPixel([0.2, -0.1, 1.4], DEFAULT_PARAMS)).toEqual([0.2, -0.1, 1.4]);
    const lifted = withChannel(DEFAULT_PARAMS, "value", { ...DEFAULT_CHANNEL, gamma: 2 });
    const [r, g, b] = levelsPixel([0.25, 0.25, 0.81], lifted);
    expect(r).toBeCloseTo(0.5, 12);
    expect(g).toBeCloseTo(0.5, 12);
    expect(b).toBeCloseTo(0.9, 12);
  });

  it("works on linear light when linear is set", () => {
    const p = { ...withChannel(DEFAULT_PARAMS, "value", { ...DEFAULT_CHANNEL, gamma: 2 }), linear: true };
    expect(levelsPixel([0.5, 0.5, 0.5], p)[0]).toBeCloseTo(encodePerceptual(Math.sqrt(decodePerceptual(0.5))), 12);
    expect(levelsPixel([0.37, 0, 0], { ...DEFAULT_PARAMS, linear: true })[0]).toBeCloseTo(0.37, 12);
  });

  it("keeps the sign through the perceptual curve and has no ceiling", () => {
    expect(encodePerceptual(-0.2)).toBe(-encodePerceptual(0.2));
    expect(decodePerceptual(encodePerceptual(1.7))).toBeCloseTo(1.7, 12);
    expect(decodePerceptual(0.5)).toBeCloseTo(0.214041140482232, 12);
  });
});

describe("withChannel", () => {
  it("replaces one channel and keeps the rest", () => {
    const red = { ...DEFAULT_CHANNEL, gamma: 3 };
    const p = withChannel(DEFAULT_PARAMS, "red", red);
    expect(p.channels.red).toEqual(red);
    expect(p.channels.value).toBe(DEFAULT_PARAMS.channels.value);
    expect(DEFAULT_PARAMS.channels.red).toEqual(DEFAULT_CHANNEL);
  });
});
