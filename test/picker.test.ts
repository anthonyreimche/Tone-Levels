// The eyedropper's testable parts: a click mapped to image UV through the
// overlay rect under interface scaling, the 5×5 patch averaged in the active
// TRC, and a pick written to the bag as one commit that disarms the picker.

import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_CHANNEL, decodePerceptual } from "../src/model";
import { readParams } from "../src/params";
import { commitPick, patchColor, pickStillWanted, pointToUv } from "../src/picker";
import { initRuntime } from "../src/runtime";
import { initStore, store, type PickTarget } from "../src/store";
import { fakeApi, type Rig } from "./support/fake-api";

function frame(w: number, h: number, at: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) data.set([...at(x, y), 255], (y * w + x) * 4);
  }
  return data;
}

describe("pointToUv", () => {
  const rect = { x: 100, y: 50, w: 400, h: 200 };

  it("maps a client point inside the displayed image to 0..1", () => {
    expect(pointToUv(300, 150, { left: 0, top: 0, width: 800, height: 600 }, 800, rect)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("divides by the interface scale so a zoomed UI still lands on the pixel", () => {
    expect(pointToUv(375, 187.5, { left: 0, top: 0, width: 1000, height: 750 }, 800, rect)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("returns null outside the image", () => {
    expect(pointToUv(10, 10, { left: 0, top: 0, width: 800, height: 600 }, 800, rect)).toBeNull();
    expect(pointToUv(300, 150, { left: 0, top: 0, width: 800, height: 600 }, 800, null)).toBeNull();
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
