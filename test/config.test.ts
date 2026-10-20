// Auto Input Levels and the eyedroppers against GIMP's own C, plus the tool's
// rules around them: All Channels resets Value's matching point and sets R, G
// and B separately; a selected-channel pick touches one channel; a neutral
// grey pick stays neutral (the GIMP 2.10 lightness rule).

import { describe, expect, it } from "vitest";
import vectors from "./reference/vectors.json";
import { adjustByColor, applyPick, autoInputLevels, resetChannel, stretchChannel } from "../src/config";
import { CHANNELS, DEFAULT_CHANNEL, DEFAULT_PARAMS, levelsPixel, withChannel, type ChannelLevels } from "../src/model";

const expectNear = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(expected)));

const levels = ([lowInput, highInput, gamma, lowOutput, highOutput]: number[]): ChannelLevels => ({
  lowInput,
  highInput,
  gamma,
  lowOutput,
  highOutput,
});

const flat = (lo: number, hi: number) => {
  const bins = new Float64Array(256);
  for (let i = lo; i <= hi; i++) bins[i] = 10;
  return bins;
};

describe("stretchChannel", () => {
  it("matches gimp_levels_config_stretch_channel, keeping a point GIMP never sets", () => {
    expect(vectors.stretch.length).toBe(8);
    for (const s of vectors.stretch) {
      const out = stretchChannel(levels(s.prior), s.bins);
      expect([out.lowInput, out.highInput, out.gamma, out.lowOutput, out.highOutput]).toEqual(s.out);
    }
  });

  it("puts black one bin above the first occupied bin and white one below the last", () => {
    const out = stretchChannel(DEFAULT_CHANNEL, flat(20, 200));
    expect(out.lowInput).toBe(21 / 255);
    expect(out.highInput).toBe(199 / 255);
  });
});

describe("autoInputLevels", () => {
  it("stretches red, green and blue separately and resets Value, as GIMP does on an RGB image", () => {
    const p = withChannel({ ...DEFAULT_PARAMS, clampInput: true }, "value", { ...DEFAULT_CHANNEL, gamma: 1.8, lowInput: 0.1 });
    const bins = { value: flat(0, 255), red: flat(20, 200), green: flat(40, 220), blue: flat(10, 250) };
    const out = autoInputLevels(p, bins);
    expect(out.channels.value).toEqual(DEFAULT_CHANNEL);
    expect(out.channels.red).toEqual(stretchChannel(p.channels.red, bins.red));
    expect(out.channels.green).toEqual(stretchChannel(p.channels.green, bins.green));
    expect(out.channels.blue).toEqual(stretchChannel(p.channels.blue, bins.blue));
    expect(out.clampInput).toBe(true);
  });
});

describe("adjustByColor", () => {
  it("matches gimp_levels_config_adjust_by_colors with GIMP 2.10's grey lightness", () => {
    expect(vectors.pick.length).toBe(384);
    const points = ["black", "grey", "white"] as const;
    for (const [c, which, r, g, b, lo0, hi0, g0, lo, hi, gm] of vectors.pick) {
      const out = adjustByColor(levels([lo0, hi0, g0, 0, 1]), CHANNELS[c], points[which], [r, g, b]);
      expectNear(out.lowInput, lo);
      expectNear(out.highInput, hi);
      expectNear(out.gamma, gm);
    }
  });

  it("leaves a neutral grey unchanged when it picks one", () => {
    for (const v of [0.18, 0.5, 0.73]) {
      const p = applyPick(DEFAULT_PARAMS, "grey", "all", "value", [v, v, v]);
      for (const out of levelsPixel([v, v, v], p)) expect(out).toBeCloseTo(v, 9);
    }
  });
});

describe("applyPick", () => {
  const start = withChannel(DEFAULT_PARAMS, "value", { ...DEFAULT_CHANNEL, lowInput: 0.2, gamma: 1.5, highInput: 0.8 });

  it("All Channels resets Value's matching point, then sets R, G and B from the colour", () => {
    const black = applyPick(start, "black", "all", "value", [0.1, 0.2, 0.3]);
    expect(black.channels.value).toEqual({ ...start.channels.value, lowInput: 0 });
    expect([black.channels.red.lowInput, black.channels.green.lowInput, black.channels.blue.lowInput]).toEqual([0.1, 0.2, 0.3]);

    const grey = applyPick(start, "grey", "all", "value", [0.4, 0.5, 0.6]);
    expect(grey.channels.value).toEqual({ ...start.channels.value, gamma: 1 });
    expect(grey.channels.red.gamma).toBe(adjustByColor(DEFAULT_CHANNEL, "red", "grey", [0.4, 0.5, 0.6]).gamma);

    const white = applyPick(start, "white", "all", "value", [0.9, 0.8, 0.7]);
    expect(white.channels.value).toEqual({ ...start.channels.value, highInput: 1 });
    expect(white.channels.blue.highInput).toBe(0.7);
  });

  it("a selected-channel pick touches only that channel, Value reading max(r, g, b)", () => {
    const value = applyPick(DEFAULT_PARAMS, "white", "channel", "value", [0.6, 0.9, 0.3]);
    expect(value.channels.value.highInput).toBe(0.9);
    expect(value.channels.red).toEqual(DEFAULT_CHANNEL);
    const green = applyPick(DEFAULT_PARAMS, "black", "channel", "green", [0.6, 0.1, 0.3]);
    expect(green.channels.green.lowInput).toBe(0.1);
    expect(green.channels.value).toEqual(DEFAULT_CHANNEL);
  });
});

describe("resetChannel", () => {
  it("restores one channel and nothing else", () => {
    const p = withChannel(withChannel({ ...DEFAULT_PARAMS, linear: true }, "red", { ...DEFAULT_CHANNEL, gamma: 2 }), "blue", {
      ...DEFAULT_CHANNEL,
      lowInput: 0.3,
    });
    const out = resetChannel(p, "red");
    expect(out.channels.red).toEqual(DEFAULT_CHANNEL);
    expect(out.channels.blue.lowInput).toBe(0.3);
    expect(out.linear).toBe(true);
  });
});
