// The handle bars as GIMP runs them: where the grey handle sits for a gamma
// and the gamma a grey handle stands for (against GIMP's C), which handle a
// press takes (gimphandlebar.c), and the bounds GIMP's adjustments put on a
// drag, inside 0..1 or the wider range a version 2 photo allows, on a bar
// whose axis grows to show input points past 0..1.

import { describe, expect, it } from "vitest";
import vectors from "./reference/vectors.json";
import {
  barPosition,
  dragInput,
  dragOutput,
  fromBar,
  gammaFromHandle,
  gammaHandlePosition,
  inputAxis,
  inputHandlePositions,
  outputHandlePositions,
  pickHandle,
  toBar,
} from "../src/handles";
import { DEFAULT_CHANNEL } from "../src/model";
import { FULL_INPUT_RANGE } from "../src/params";

const expectNear = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(expected)));

describe("grey handle", () => {
  it("sits where gimplevelstool.c puts it", () => {
    for (const [lo, hi, g, pos] of vectors.gammaHandle) {
      expectNear(gammaHandlePosition({ ...DEFAULT_CHANNEL, lowInput: lo, highInput: hi, gamma: g }) * 255, pos);
    }
  });

  it("stands for GIMP's rounded gamma, and for none below one display step", () => {
    for (const [lo, hi, pos, g0, g] of vectors.gammaFromHandle) {
      expect(gammaFromHandle({ ...DEFAULT_CHANNEL, lowInput: lo, highInput: hi, gamma: g0 }, pos) ?? g0).toBe(g);
    }
    expect(gammaFromHandle({ ...DEFAULT_CHANNEL, lowInput: 0.3, highInput: 0.3 }, 0.3)).toBeNull();
  });
});

describe("pickHandle", () => {
  it("takes the nearest visible handle", () => {
    expect(pickHandle([0.1, 0.5, 0.9], 0.2)).toBe(0);
    expect(pickHandle([0.1, 0.5, 0.9], 0.6)).toBe(1);
    expect(pickHandle([0.1, null, 0.9], 0.6)).toBe(2);
    expect(pickHandle([null, null, null], 0.6)).toBe(-1);
  });

  it("on stacked handles takes the last one left of the pointer", () => {
    expect(pickHandle([0.5, 0.5, 0.5], 0.7)).toBe(2);
    expect(pickHandle([0.5, 0.5, 0.5], 0.3)).toBe(0);
  });

  it.each([
    [0.16562298982978163, 1.7],
    [0.03947086461562055, 1],
  ])("pinned at %s, gamma %s: the grey handle is exact, so presses split the stack", (v, gamma) => {
    const ch = { ...DEFAULT_CHANNEL, lowInput: v, highInput: v, gamma };
    expect(pickHandle(inputHandlePositions(ch), v + 0.01)).toBe(2);
    expect(pickHandle(inputHandlePositions(ch), v - 0.01)).toBe(0);
    expect(gammaHandlePosition(ch)).toBe(v);
  });
});

describe("dragInput", () => {
  const ch = { ...DEFAULT_CHANNEL, lowInput: 0.2, highInput: 0.6 };

  it("keeps black at or below white, white at or above black, both inside 0..1", () => {
    expect(dragInput(ch, "low", 0.8).lowInput).toBe(0.6);
    expect(dragInput(ch, "high", 0.1).highInput).toBe(0.2);
    expect(dragInput(ch, "low", -0.3).lowInput).toBe(0);
    expect(dragInput(ch, "high", 1.4).highInput).toBe(1);
  });

  it("lets black and white leave 0..1 inside a wider range", () => {
    expect(dragInput(ch, "high", 1.6, FULL_INPUT_RANGE).highInput).toBe(1.6);
    expect(dragInput(ch, "low", -0.2, FULL_INPUT_RANGE).lowInput).toBe(-0.2);
    expect(dragInput(ch, "high", 1e6, FULL_INPUT_RANGE).highInput).toBe(FULL_INPUT_RANGE.max);
    expect(dragInput(ch, "low", 0.8, FULL_INPUT_RANGE).lowInput).toBe(0.6);
  });

  it("moves the grey handle with black and white and leaves gamma alone", () => {
    const moved = dragInput({ ...DEFAULT_CHANNEL, gamma: 2 }, "low", 0.5);
    expect(moved.gamma).toBe(2);
    expect(gammaHandlePosition(moved)).toBeCloseTo(0.75 + 0.25 * Math.log10(0.5), 12);
  });

  it("sets gamma from the grey handle, which stays between black and white", () => {
    expect(dragInput(DEFAULT_CHANNEL, "gamma", 0.5).gamma).toBe(1);
    expect(dragInput(DEFAULT_CHANNEL, "gamma", 0).gamma).toBe(10);
    expect(dragInput(DEFAULT_CHANNEL, "gamma", -0.4).gamma).toBe(10);
    expect(dragInput(DEFAULT_CHANNEL, "gamma", 1).gamma).toBe(0.1);
    expect(dragInput(DEFAULT_CHANNEL, "gamma", 0.25).gamma).toBe(3.16);
    const pinched = { ...DEFAULT_CHANNEL, lowInput: 0.4, highInput: 0.4, gamma: 1.7 };
    expect(dragInput(pinched, "gamma", 0.9)).toEqual(pinched);
  });
});

describe("dragOutput", () => {
  it("lets the output handles cross, which inverts", () => {
    const out = dragOutput({ ...DEFAULT_CHANNEL, lowOutput: 0.2 }, "high", 0);
    expect(out.highOutput).toBe(0);
    expect(out.lowOutput).toBe(0.2);
    expect(dragOutput(DEFAULT_CHANNEL, "low", 1.3).lowOutput).toBe(1);
  });
});

describe("positions and pointer mapping", () => {
  it("puts the input handles at black, grey and white and hides the output bar's middle", () => {
    expect(inputHandlePositions(DEFAULT_CHANNEL)).toEqual([0, 0.5, 1]);
    expect(outputHandlePositions({ ...DEFAULT_CHANNEL, lowOutput: 0.1 })).toEqual([0.1, null, 1]);
  });

  it("widens the input axis from 0..1 to take in points outside it", () => {
    expect(inputAxis(DEFAULT_CHANNEL)).toEqual({ min: 0, max: 1 });
    expect(inputAxis({ ...DEFAULT_CHANNEL, highInput: 1.6 })).toEqual({ min: 0, max: 1.6 });
    expect(inputAxis({ ...DEFAULT_CHANNEL, lowInput: -0.2, highInput: 0.5 })).toEqual({ min: -0.2, max: 1 });
    expect(inputAxis({ ...DEFAULT_CHANNEL, lowInput: 1.3, highInput: 0.4 })).toEqual({ min: 0, max: 1.3 });
  });

  it("maps values to and from the bar through its axis", () => {
    const axis = { min: -0.4, max: 1.6 };
    expect(toBar(axis, 0.6)).toBeCloseTo(0.5, 12);
    expect(fromBar(axis, 0.5)).toBeCloseTo(0.6, 12);
    expect(fromBar(axis, 1)).toBe(1.6);
    expect(toBar({ min: 0, max: 1 }, 0.25)).toBe(0.25);
  });

  it("maps a client x through the bar's own box, clamped to 0..1", () => {
    expect(barPosition(150, { left: 100, width: 200 })).toBe(0.25);
    expect(barPosition(50, { left: 100, width: 200 })).toBe(0);
    expect(barPosition(400, { left: 100, width: 200 })).toBe(1);
    expect(barPosition(10, { left: 0, width: 0 })).toBe(0);
  });
});
