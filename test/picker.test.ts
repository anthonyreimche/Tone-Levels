// The eyedroppers: an armed picker holds the canvas's pick-drag tool, a press
// in the canvas's pixels mapped to frame UV, the 5×5 patch of the pre-Levels
// float frame (8-bit where the host has none) averaged in the active TRC, and
// a pick written to the bag as one commit that disarms the picker.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CHANNEL, decodePerceptual } from "../src/model";
import { qualified, readParams, resetPatch } from "../src/params";
import { commitPick, patchColor, pickStillWanted, pointToUv, syncPickDrag } from "../src/picker";
import { initRuntime } from "../src/runtime";
import type { FloatFrame } from "../src/safelight";
import { initStore, store, type PickTarget } from "../src/store";
import { fakeApi, fakeBitmap, type Rig } from "./support/fake-api";

function frame(w: number, h: number, at: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data.set([...at(x, y), 255], (y * w + x) * 4);
  }
  return data;
}

function floatFrame(w: number, h: number, at: (x: number, y: number) => [number, number, number]): FloatFrame {
  const data = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data.set([...at(x, y), 1], (y * w + x) * 4);
  }
  return { data, width: w, height: h, space: { encoding: "perceptual", primaries: "rec709" }, point: "pre-output" };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("pointToUv", () => {
  it("maps a point in the canvas's pixels to 0..1 of its frame", () => {
    expect(pointToUv({ x: 20, y: 5 }, 40, 20)).toEqual({ x: 0.5, y: 0.25 });
  });

  it("returns null off the frame and for the host's blank 1×1 frame", () => {
    expect(pointToUv({ x: 41, y: 5 }, 40, 20)).toBeNull();
    expect(pointToUv({ x: -1, y: 5 }, 40, 20)).toBeNull();
    expect(pointToUv({ x: 0, y: 0 }, 1, 1)).toBeNull();
  });
});

describe("patchColor", () => {
  it("averages the 5×5 box as encoded in Perceptual mode", () => {
    const uniform = patchColor(frame(9, 9, () => [51, 102, 204]), 9, 9, 4, 4, false);
    expect(uniform).not.toBeNull();
    expect(uniform?.[0]).toBeCloseTo(0.2, 12);
    expect(uniform?.[1]).toBeCloseTo(0.4, 12);
    expect(uniform?.[2]).toBeCloseTo(0.8, 12);
    const split = frame(9, 9, (x) => (x < 4 ? [0, 0, 0] : [188, 188, 188]));
    expect(patchColor(split, 9, 9, 4, 4, false)?.[0]).toBeCloseTo((3 * 188) / 255 / 5, 12);
  });

  it("decodes each value before averaging in Linear mode", () => {
    const split = frame(9, 9, (x) => (x < 4 ? [0, 0, 0] : [188, 188, 188]));
    expect(patchColor(split, 9, 9, 4, 4, true)?.[0]).toBeCloseTo((3 * decodePerceptual(188 / 255)) / 5, 12);
  });

  it("clips the box at the frame edge", () => {
    const corner = frame(9, 9, (x, y) => (x === 0 && y === 0 ? [255, 255, 255] : [0, 0, 0]));
    expect(patchColor(corner, 9, 9, 0, 0, false)?.[0]).toBeCloseTo(1 / 9, 12);
  });
});

describe("commitPick", () => {
  let rig: Rig;
  beforeEach(() => {
    rig = fakeApi();
    initRuntime(rig.api);
    initStore();
  });

  it("writes an All Channels pick to the bag, commits once and disarms", () => {
    store().getState().setPicking({ point: "white", scope: "all" });
    commitPick({ point: "white", scope: "all" }, [0.9, 0.8, 0.7]);
    const p = readParams(rig.develop.getState().paramBag);
    expect([p.channels.red.highInput, p.channels.green.highInput, p.channels.blue.highInput]).toEqual([0.9, 0.8, 0.7]);
    expect(rig.commits).toEqual(["Tone Levels pick white point"]);
    expect(store().getState().picking).toBeNull();
  });

  it("applies a selected-channel pick to the channel the dialog shows", () => {
    store().getState().setChannel("blue");
    commitPick({ point: "black", scope: "channel" }, [0.1, 0.2, 0.3]);
    const p = readParams(rig.develop.getState().paramBag);
    expect(p.channels.blue.lowInput).toBe(0.3);
    expect(p.channels.red).toEqual(DEFAULT_CHANNEL);
  });
});

describe("pickStillWanted", () => {
  let rig: Rig;
  beforeEach(() => {
    rig = fakeApi();
    initRuntime(rig.api);
    initStore();
  });

  it("holds while the same pick is still armed on the open photo", () => {
    const target: PickTarget = { point: "white", scope: "all" };
    store().getState().setPicking(target);
    expect(pickStillWanted(target, "p1")).toBe(true);
  });

  it("drops the pick once Esc disarms it or a first commit does", () => {
    const target: PickTarget = { point: "white", scope: "all" };
    store().getState().setPicking(target);
    store().getState().setPicking(null);
    expect(pickStillWanted(target, "p1")).toBe(false);
    store().getState().setPicking(target);
    commitPick(target, [0.9, 0.8, 0.7]);
    expect(pickStillWanted(target, "p1")).toBe(false);
  });

  it("drops the pick when the target was re-armed as a different object", () => {
    const target: PickTarget = { point: "white", scope: "all" };
    store().getState().setPicking(target);
    store().getState().setPicking({ point: "white", scope: "all" });
    expect(pickStillWanted(target, "p1")).toBe(false);
  });

  it("drops the pick when the open photo changed during the capture", () => {
    const target: PickTarget = { point: "black", scope: "channel" };
    store().getState().setPicking(target);
    rig.develop.setState({ photoId: "p2" });
    expect(pickStillWanted(target, "p1")).toBe(false);
  });
});

describe("the pick-drag tool", () => {
  let rig: Rig;
  let stop: () => void;
  const WHITE: PickTarget = { point: "white", scope: "all" };

  /** A 40×20 canvas whose pre-Levels float frame is 20×10: dark on the left
   *  half, a colour on the right half. */
  function arm(bag: Record<string, unknown> = {}, float?: () => Promise<FloatFrame | null>) {
    rig = fakeApi(bag, async () => fakeBitmap(40, 20), float);
    initRuntime(rig.api);
    initStore();
    stop = syncPickDrag();
    store().getState().setPicking(WHITE);
  }
  const halves = (right: [number, number, number]) => async () =>
    floatFrame(20, 10, (x) => (x < 10 ? [0.05, 0.05, 0.05] : right));
  const highInputs = () => {
    const p = readParams(rig.develop.getState().paramBag);
    return [p.channels.red.highInput, p.channels.green.highInput, p.channels.blue.highInput];
  };

  afterEach(() => {
    stop();
    vi.unstubAllGlobals();
  });

  it("is held while a picker is armed and let go when it disarms", () => {
    arm();
    expect(rig.held()?.onPress).toBeTypeOf("function");
    store().getState().setPicking(null);
    expect(rig.held()).toBeNull();
  });

  it("picks from the pre-Levels float frame at the pressed canvas pixel", async () => {
    arm({}, halves([0.7337, 0.6113, 0.5249]));
    rig.held()?.onPress?.({ x: 30, y: 10 });
    await settle();
    const [r, g, b] = highInputs();
    expect(r).toBeCloseTo(0.7337, 6);
    expect(g).toBeCloseTo(0.6113, 6);
    expect(b).toBeCloseTo(0.5249, 6);
    expect(rig.floatCaptures).toEqual([
      { point: "pre-output", space: { encoding: "perceptual", primaries: "rec709" }, paramBag: resetPatch() },
    ]);
    expect(rig.commits).toEqual(["Tone Levels pick white point"]);
    expect(store().getState().picking).toBeNull();
    expect(rig.held()).toBeNull();
  });

  it("reads linear floats in Linear mode, as they are", async () => {
    arm({ [qualified("linear")]: 1 }, halves([0.5, 0.4, 0.3]));
    rig.held()?.onPress?.({ x: 30, y: 10 });
    await settle();
    expect(rig.floatCaptures[0].space).toEqual({ encoding: "linear", primaries: "rec709" });
    expect(highInputs()[0]).toBeCloseTo(0.5, 6);
  });

  /** jsdom has no OffscreenCanvas: one that reads back `value` in every channel. */
  function stubReadback(value: number) {
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return {
            drawImage: () => undefined,
            getImageData: (_x: number, _y: number, w: number, h: number) => ({
              data: new Uint8ClampedArray(w * h * 4).fill(value),
            }),
          };
        }
      },
    );
  }

  it("falls back to the 8-bit frame on a host without float capture", async () => {
    stubReadback(128);
    arm();
    rig.held()?.onPress?.({ x: 30, y: 10 });
    await settle();
    expect(highInputs()[0]).toBeCloseTo(128 / 255, 12);
    expect(rig.commits).toEqual(["Tone Levels pick white point"]);
  });

  it("falls back to the 8-bit frame when the GPU has no float targets", async () => {
    stubReadback(64);
    arm({}, async () => null);
    rig.held()?.onPress?.({ x: 30, y: 10 });
    await settle();
    expect(highInputs()[0]).toBeCloseTo(64 / 255, 12);
  });

  it("ignores a press off the frame and stays armed", async () => {
    arm({}, halves([0.7, 0.7, 0.7]));
    rig.held()?.onPress?.({ x: 45, y: 10 });
    await settle();
    expect(rig.commits).toEqual([]);
    expect(store().getState().picking).toBe(WHITE);
  });

  it("drops a press whose capture lands after the picker disarmed", async () => {
    arm({}, halves([0.7, 0.7, 0.7]));
    rig.held()?.onPress?.({ x: 30, y: 10 });
    store().getState().setPicking(null);
    await settle();
    expect(rig.commits).toEqual([]);
  });
});
