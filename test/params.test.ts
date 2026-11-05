// The bag contract: 23 keys under one stage id, five per channel then the
// switches; params round-trip; missing or foreign values read as GIMP's
// defaults and out-of-range ones clamp to GIMP's ranges, except the input
// points on version 2 photos, which may sit outside 0..1.

import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, withChannel } from "../src/model";
import {
  FULL_INPUT_RANGE,
  KEY_SPECS,
  STAGE_ID,
  UNIFORM_KEYS,
  bagPatch,
  inputRange,
  processVersion,
  qualified,
  readParams,
  resetPatch,
} from "../src/params";
import { versionedParams } from "./support/fake-api";

describe("bag contract", () => {
  it("names 23 keys under one stage: five per channel, then the switches", () => {
    expect(STAGE_ID).toBe("tone-levels.levels");
    expect(UNIFORM_KEYS.length).toBe(23);
    expect(UNIFORM_KEYS.slice(0, 5)).toEqual(["valueLowInput", "valueHighInput", "valueGamma", "valueLowOutput", "valueHighOutput"]);
    expect(UNIFORM_KEYS.slice(5, 7)).toEqual(["redLowInput", "redHighInput"]);
    expect(UNIFORM_KEYS.slice(20)).toEqual(["clampInput", "clampOutput", "linear"]);
    expect(KEY_SPECS.map((s) => s.key)).toEqual([...UNIFORM_KEYS]);
    expect(qualified("redGamma")).toBe("tone-levels.levels.redGamma");
  });

  it("round-trips params through the bag", () => {
    const p = withChannel({ ...DEFAULT_PARAMS, clampOutput: true, linear: true }, "green", {
      lowInput: 0.1,
      highInput: 0.8,
      gamma: 1.7,
      lowOutput: 0.05,
      highOutput: 0.9,
    });
    expect(readParams(bagPatch(p))).toEqual(p);
  });

  it("reads GIMP's defaults for missing or foreign values and clamps to GIMP's ranges", () => {
    expect(readParams({})).toEqual(DEFAULT_PARAMS);
    const q = readParams({
      [qualified("redGamma")]: 40,
      [qualified("redLowInput")]: -1,
      [qualified("blueHighOutput")]: "x",
      [qualified("greenHighInput")]: Number.NaN,
      [qualified("linear")]: 1,
    });
    expect(q.channels.red.gamma).toBe(10);
    expect(q.channels.red.lowInput).toBe(0);
    expect(q.channels.blue.highOutput).toBe(1);
    expect(q.channels.green.highInput).toBe(1);
    expect(q.linear).toBe(true);
  });

  it("clamps downward too: a zero gamma reads as the range floor, a negative output as zero", () => {
    const q = readParams({ [qualified("redGamma")]: 0, [qualified("valueLowOutput")]: -0.5 });
    expect(q.channels.red.gamma).toBe(0.1);
    expect(q.channels.value.lowOutput).toBe(0);
  });

  it("lets the input points leave 0..1 on version 2 and later, and nothing else", () => {
    const bag = {
      [qualified("redHighInput")]: 1.6,
      [qualified("greenLowInput")]: -0.05,
      [qualified("blueHighInput")]: 1e6,
      [qualified("valueHighOutput")]: 1.4,
      [qualified("valueLowOutput")]: -0.3,
    };
    for (const version of [2, 3]) {
      const q = readParams(bag, version);
      expect(q.channels.red.highInput).toBe(1.6);
      expect(q.channels.green.lowInput).toBe(-0.05);
      expect(q.channels.blue.highInput).toBe(FULL_INPUT_RANGE.max);
      expect(q.channels.value.highOutput).toBe(1);
      expect(q.channels.value.lowOutput).toBe(0);
    }
    const v1 = readParams(bag);
    expect([v1.channels.red.highInput, v1.channels.green.lowInput, v1.channels.blue.highInput]).toEqual([1, 0, 1]);
    expect(readParams(bag, 1)).toEqual(v1);
  });

  it("round-trips over-range input points through the bag on version 2", () => {
    const p = withChannel(DEFAULT_PARAMS, "red", { lowInput: -0.1, highInput: 1.6, gamma: 1, lowOutput: 0, highOutput: 1 });
    expect(readParams(bagPatch(p), 2)).toEqual(p);
  });

  it("reads the process version from the develop params, 1 when missing", () => {
    expect(processVersion(versionedParams(2))).toBe(2);
    expect(processVersion(versionedParams(3))).toBe(3);
    expect(processVersion(versionedParams(Number.NaN))).toBe(1);
    expect(processVersion({} as ReturnType<typeof versionedParams>)).toBe(1);
    expect(inputRange(1)).toEqual({ min: 0, max: 1 });
    expect(inputRange(2)).toEqual(FULL_INPUT_RANGE);
  });

  it("resets every key", () => {
    const r = resetPatch();
    expect(Object.keys(r).length).toBe(23);
    expect(readParams(r)).toEqual(DEFAULT_PARAMS);
    expect(r[qualified("valueGamma")]).toBe(1);
    expect(r[qualified("linear")]).toBe(0);
  });
});
