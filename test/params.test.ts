// The bag contract: 23 keys under one stage id, five per channel then the
// switches; params round-trip; missing or foreign values read as GIMP's
// defaults and out-of-range ones clamp to GIMP's ranges.

import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMS, withChannel } from "../src/model";
import { KEY_SPECS, STAGE_ID, UNIFORM_KEYS, bagPatch, qualified, readParams, resetPatch } from "../src/params";

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

  it("resets every key", () => {
    const r = resetPatch();
    expect(Object.keys(r).length).toBe(23);
    expect(readParams(r)).toEqual(DEFAULT_PARAMS);
    expect(r[qualified("valueGamma")]).toBe(1);
    expect(r[qualified("linear")]).toBe(0);
  });
});
