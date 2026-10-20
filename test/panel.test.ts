// @vitest-environment jsdom
// The Levels panel in a DOM: GIMP's dialog sections, a handle drag writing
// live and committing once, black held at or below white, crossing output
// handles, the grey handle following black and white, Reset Channel, the
// 0–255 fields applying and committing once on Enter or blur (typing changes
// only the draft), Auto Input Levels from the newest frame of the current
// signature, the pickers arming and reporting it, Clamp output, and
// Linear/Perceptual.

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { measureSignature } from "../src/capture";
import { autoInputLevels } from "../src/config";
import { gammaHandlePosition } from "../src/handles";
import { histogramsFromRgba } from "../src/histogram";
import { DEFAULT_CHANNEL, DEFAULT_PARAMS } from "../src/model";
import { LevelsPanel } from "../src/Panel";
import { qualified, readParams } from "../src/params";
import { initRuntime } from "../src/runtime";
import type { DevelopParams } from "../src/safelight";
import { initStore, store, type MeasureSignature } from "../src/store";
import { fakeApi, fakeBitmap, type Rig } from "./support/fake-api";

beforeAll(() => {
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

let rig: Rig;

function mount(bag: Record<string, unknown> = {}, bitmap?: () => Promise<ImageBitmap>) {
  rig = fakeApi(bag, bitmap);
  initRuntime(rig.api);
  initStore();
  render(React.createElement(LevelsPanel));
}

const params = () => readParams(rig.develop.getState().paramBag);

/** The signature a measure of the open photo carries now, with `over` changed. */
function signature(over: Partial<MeasureSignature> = {}): MeasureSignature {
  const current = measureSignature(rig.develop.getState());
  if (!current) throw new Error("no photo open");
  return { ...current, ...over };
}

/** A handle bar 255 px wide at the origin, so clientX is the 0–255 value. */
function bar(label: string): HTMLElement {
  const el = screen.getByLabelText(label);
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 255, height: 10, right: 255, bottom: 10, x: 0, y: 0, toJSON: () => ({}) });
  return el;
}

/** Sixteen pixels ramping up in each channel at its own rate. */
function gradient(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(16 * 4);
  for (let i = 0; i < 16; i++) data.set([40 + i * 10, 20 + i * 12, 60 + i * 8, 255], i * 4);
  return data;
}

describe("LevelsPanel", () => {
  it("lays out GIMP's dialog", () => {
    mount();
    expect(screen.getByLabelText("Channel")).toBeTruthy();
    for (const title of ["Input Levels", "Output Levels", "All Channels"]) expect(screen.getByText(title)).toBeTruthy();
    expect(screen.getByText("Auto Input Levels")).toBeTruthy();
    expect(screen.getByLabelText("Pick black point for the selected channel")).toBeTruthy();
    expect(screen.getByLabelText("Pick grey point for all channels")).toBeTruthy();
  });

  it("writes a handle drag live and commits it once on release", () => {
    mount();
    const el = bar("Input levels handles");
    fireEvent.pointerDown(el, { clientX: 51, pointerId: 1, button: 0 });
    expect(params().channels.value.lowInput).toBeCloseTo(0.2, 12);
    fireEvent.pointerMove(el, { clientX: 76.5, pointerId: 1 });
    expect(params().channels.value.lowInput).toBeCloseTo(0.3, 12);
    expect(rig.commits).toEqual([]);
    fireEvent.pointerUp(el, { pointerId: 1 });
    expect(rig.commits).toEqual(["Tone Levels input levels"]);
  });

  it("holds black at or below white", () => {
    mount({ [qualified("valueHighInput")]: 0.4 });
    const el = bar("Input levels handles");
    fireEvent.pointerDown(el, { clientX: 5, pointerId: 1, button: 0 });
    fireEvent.pointerMove(el, { clientX: 200, pointerId: 1 });
    fireEvent.pointerUp(el, { pointerId: 1 });
    expect(params().channels.value.lowInput).toBe(0.4);
  });

  it("lets the output handles cross, which inverts", () => {
    mount({ [qualified("valueLowOutput")]: 0.2 });
    const el = bar("Output levels handles");
    fireEvent.pointerDown(el, { clientX: 250, pointerId: 1, button: 0 });
    fireEvent.pointerMove(el, { clientX: 0, pointerId: 1 });
    fireEvent.pointerUp(el, { pointerId: 1 });
    expect(params().channels.value.highOutput).toBe(0);
    expect(params().channels.value.lowOutput).toBe(0.2);
  });

  it("moves the grey handle with black and white", () => {
    mount({ [qualified("valueGamma")]: 2 });
    const low = screen.getByLabelText("Low input");
    fireEvent.change(low, { target: { value: "102" } });
    fireEvent.keyDown(low, { key: "Enter" });
    const grey = screen.getByLabelText("Input levels handles").querySelector('[data-handle="1"]');
    const expected = gammaHandlePosition({ ...DEFAULT_CHANNEL, lowInput: 0.4, gamma: 2 });
    expect(Number(grey?.getAttribute("data-pos"))).toBeCloseTo(expected, 12);
  });

  it("shows the fields on GIMP's 0–255 scale and applies a typed value once, on Enter", () => {
    mount();
    const low = screen.getByLabelText<HTMLInputElement>("Low input");
    expect(low.value).toBe("0");
    expect(screen.getByLabelText<HTMLInputElement>("High input").value).toBe("255");
    fireEvent.change(low, { target: { value: "51" } });
    expect(low.value).toBe("51");
    expect(params().channels.value.lowInput).toBe(0);
    expect(rig.commits).toEqual([]);
    fireEvent.keyDown(low, { key: "Enter" });
    expect(params().channels.value.lowInput).toBeCloseTo(0.2, 12);
    expect(rig.commits).toEqual(["Tone Levels low input"]);
  });

  it("applies a typed value on blur", () => {
    mount();
    const low = screen.getByLabelText<HTMLInputElement>("Low input");
    fireEvent.change(low, { target: { value: "51" } });
    expect(params().channels.value.lowInput).toBe(0);
    fireEvent.blur(low);
    expect(params().channels.value.lowInput).toBeCloseTo(0.2, 12);
    expect(rig.commits).toEqual(["Tone Levels low input"]);
  });

  it("commits nothing more when the field blurs after Enter", () => {
    mount();
    const low = screen.getByLabelText<HTMLInputElement>("Low input");
    fireEvent.change(low, { target: { value: "51" } });
    fireEvent.keyDown(low, { key: "Enter" });
    const bag = rig.develop.getState().paramBag;
    fireEvent.blur(low);
    expect(rig.commits).toEqual(["Tone Levels low input"]);
    expect(rig.develop.getState().paramBag).toBe(bag);
  });

  it("writes and commits nothing when Enter or blur follows no edit", () => {
    mount();
    const bag = rig.develop.getState().paramBag;
    const low = screen.getByLabelText<HTMLInputElement>("Low input");
    fireEvent.focus(low);
    fireEvent.keyDown(low, { key: "Enter" });
    fireEvent.blur(low);
    expect(rig.commits).toEqual([]);
    expect(rig.develop.getState().paramBag).toBe(bag);
  });

  it("leaves the bag alone while digits are typed and shows the draft", () => {
    mount({ [qualified("valueLowInput")]: 60 / 255 });
    const bag = rig.develop.getState().paramBag;
    const high = screen.getByLabelText<HTMLInputElement>("High input");
    for (const typed of ["2", "20", "200"]) {
      fireEvent.change(high, { target: { value: typed } });
      expect(high.value).toBe(typed);
      expect(rig.develop.getState().paramBag).toBe(bag);
    }
    expect(rig.commits).toEqual([]);
    fireEvent.blur(high);
    expect(params().channels.value.highInput).toBeCloseTo(200 / 255, 12);
    expect(high.value).toBe("200");
    expect(rig.commits).toEqual(["Tone Levels high input"]);
  });

  it("clamps High input typed below Low input to Low input when it applies", () => {
    mount({ [qualified("valueLowInput")]: 60 / 255 });
    const high = screen.getByLabelText<HTMLInputElement>("High input");
    fireEvent.change(high, { target: { value: "20" } });
    expect(high.value).toBe("20");
    expect(params().channels.value.highInput).toBe(1);
    fireEvent.keyDown(high, { key: "Enter" });
    expect(params().channels.value.highInput).toBeCloseTo(60 / 255, 12);
    expect(high.value).toBe("60");
    fireEvent.blur(high);
    expect(rig.commits).toEqual(["Tone Levels high input"]);
  });

  it("clamps Low input typed above High input to High input when it applies", () => {
    mount({ [qualified("valueHighInput")]: 100 / 255 });
    const low = screen.getByLabelText<HTMLInputElement>("Low input");
    fireEvent.change(low, { target: { value: "200" } });
    expect(params().channels.value.lowInput).toBe(0);
    fireEvent.keyDown(low, { key: "Enter" });
    expect(params().channels.value.lowInput).toBeCloseTo(100 / 255, 12);
    expect(low.value).toBe("100");
  });

  it("clamps the output fields to 0–255 when they apply", () => {
    mount();
    const out = screen.getByLabelText<HTMLInputElement>("High output");
    fireEvent.change(out, { target: { value: "300" } });
    expect(params().channels.value.highOutput).toBe(1);
    fireEvent.keyDown(out, { key: "Enter" });
    expect(params().channels.value.highOutput).toBe(1);
    expect(out.value).toBe("255");
    const low = screen.getByLabelText<HTMLInputElement>("Low output");
    fireEvent.change(low, { target: { value: "-5" } });
    fireEvent.blur(low);
    expect(params().channels.value.lowOutput).toBe(0);
    expect(low.value).toBe("0");
  });

  it("lets gamma be typed through a value below its range without applying it", () => {
    mount();
    const gamma = screen.getByLabelText<HTMLInputElement>("Gamma");
    fireEvent.change(gamma, { target: { value: "0" } });
    expect(gamma.value).toBe("0");
    expect(params().channels.value.gamma).toBe(1);
    fireEvent.change(gamma, { target: { value: "0.5" } });
    expect(gamma.value).toBe("0.5");
    expect(params().channels.value.gamma).toBe(1);
    fireEvent.blur(gamma);
    expect(params().channels.value.gamma).toBe(0.5);
    expect(gamma.value).toBe("0.5");
    expect(rig.commits).toEqual(["Tone Levels gamma"]);
  });

  it("applies gamma typed as 0 as the lowest gamma", () => {
    mount();
    const gamma = screen.getByLabelText<HTMLInputElement>("Gamma");
    fireEvent.change(gamma, { target: { value: "0" } });
    fireEvent.keyDown(gamma, { key: "Enter" });
    expect(params().channels.value.gamma).toBe(0.1);
    expect(gamma.value).toBe("0.1");
    expect(rig.commits).toEqual(["Tone Levels gamma"]);
  });

  it("resets only the selected channel", () => {
    mount({ [qualified("redGamma")]: 1.5, [qualified("valueLowInput")]: 0.1 });
    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: "red" } });
    fireEvent.click(screen.getByText("Reset Channel"));
    expect(params().channels.red).toEqual(DEFAULT_CHANNEL);
    expect(params().channels.value.lowInput).toBe(0.1);
    expect(rig.commits).toEqual(["Tone Levels reset channel"]);
  });

  it("runs Auto Input Levels on the stored frame when its signature is the current one", () => {
    mount();
    const data = gradient();
    act(() => store().getState().setFrame({ photoId: "p1", readback: { data, width: 16, height: 1 }, signature: signature() }));
    fireEvent.click(screen.getByText("Auto Input Levels"));
    expect(rig.measures).toEqual([]);
    expect(params()).toEqual(autoInputLevels(DEFAULT_PARAMS, histogramsFromRgba(data, 16, 1, false)));
    expect(rig.commits).toEqual(["Tone Levels auto input levels"]);
  });

  it("still uses the stored frame after an edit that only Levels' own keys made", () => {
    mount();
    const data = gradient();
    act(() => store().getState().setFrame({ photoId: "p1", readback: { data, width: 16, height: 1 }, signature: signature() }));
    act(() => rig.develop.setState({ paramBag: { [qualified("valueGamma")]: 2 } }));
    fireEvent.click(screen.getByText("Auto Input Levels"));
    expect(rig.measures).toEqual([]);
    expect(rig.commits).toEqual(["Tone Levels auto input levels"]);
  });

  it("draws the histogram only from a frame of the open photo", () => {
    mount();
    const readback = { data: gradient(), width: 16, height: 1 };
    const path = () => screen.getByLabelText("Histogram").querySelector("path");
    act(() => store().getState().setFrame({ photoId: "p0", readback, signature: signature({ photoId: "p0" }) }));
    expect(path()).toBeNull();
    act(() => store().getState().setFrame({ photoId: "p1", readback, signature: signature() }));
    expect(path()).not.toBeNull();
    act(() => rig.develop.setState({ photoId: "p2" }));
    expect(path()).toBeNull();
  });

  it("arms a picker and disarms it on a second click", () => {
    mount();
    const grey = screen.getByLabelText("Pick grey point for all channels");
    fireEvent.click(grey);
    expect(store().getState().picking).toEqual({ point: "grey", scope: "all" });
    fireEvent.click(grey);
    expect(store().getState().picking).toBeNull();
  });

  it("reports the armed picker to assistive tech", () => {
    mount();
    const grey = screen.getByLabelText("Pick grey point for all channels");
    const black = screen.getByLabelText("Pick black point for the selected channel");
    expect(grey.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(grey);
    expect(grey.getAttribute("aria-pressed")).toBe("true");
    expect(black.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(grey);
    expect(grey.getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles Clamp output and commits", () => {
    mount();
    fireEvent.click(screen.getByLabelText("Clamp output"));
    expect(params().clampOutput).toBe(true);
    expect(rig.commits).toEqual(["Tone Levels clamp output"]);
  });

  it("switches to Linear and commits, and ignores a click on the active mode", () => {
    mount();
    fireEvent.click(screen.getByText("Linear"));
    expect(params().linear).toBe(true);
    expect(rig.commits).toEqual(["Tone Levels linear"]);
    fireEvent.click(screen.getByText("Linear"));
    expect(rig.commits.length).toBe(1);
  });
});

describe("Auto Input Levels before a sample has landed", () => {
  /** Every renderPhotoFrame stays pending until the test settles it. */
  function pendingFrames() {
    const settle: ((bitmap: ImageBitmap) => void)[] = [];
    const bitmap = () => new Promise<ImageBitmap>((resolve) => settle.push(resolve));
    return { settle, bitmap };
  }

  /** A 2×2 photo read back through OffscreenCanvas, which jsdom lacks. */
  const PIXELS = [40, 20, 60, 255, 90, 80, 100, 255, 160, 140, 150, 255, 220, 230, 200, 255];
  class FakeCanvas {
    getContext() {
      return {
        clearRect: () => undefined,
        drawImage: () => undefined,
        getImageData: () => ({ data: new Uint8ClampedArray(PIXELS) }),
      };
    }
  }
  function stubReadback() {
    vi.stubGlobal("OffscreenCanvas", FakeCanvas);
    return histogramsFromRgba(new Uint8ClampedArray(PIXELS), 2, 2, false);
  }

  /** Let the sampler's first capture go out, so the next one is Auto's. */
  const settleSampler = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));

  it("measures the photo and applies the result", async () => {
    const { settle, bitmap } = pendingFrames();
    const bins = stubReadback();
    mount({}, bitmap);
    await settleSampler();
    expect(settle.length).toBe(1);

    fireEvent.click(screen.getByText("Auto Input Levels"));
    expect(settle.length).toBe(2);
    await act(async () => {
      settle[1](fakeBitmap(2, 2));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(params()).toEqual(autoInputLevels(DEFAULT_PARAMS, bins));
    expect(rig.commits).toEqual(["Tone Levels auto input levels"]);
  });

  it("ignores a stored frame of another photo and measures afresh", async () => {
    const { settle, bitmap } = pendingFrames();
    const bins = stubReadback();
    mount({}, bitmap);
    await settleSampler();

    const stale = gradient();
    act(() =>
      store().getState().setFrame({ photoId: "p0", readback: { data: stale, width: 16, height: 1 }, signature: signature({ photoId: "p0" }) }),
    );
    const staleResult = autoInputLevels(DEFAULT_PARAMS, histogramsFromRgba(stale, 16, 1, false));
    const freshResult = autoInputLevels(DEFAULT_PARAMS, bins);
    expect(staleResult).not.toEqual(freshResult);

    const before = rig.measures.length;
    fireEvent.click(screen.getByText("Auto Input Levels"));
    expect(rig.measures.length).toBe(before + 1);
    expect(params()).toEqual(DEFAULT_PARAMS);
    expect(rig.commits).toEqual([]);

    await act(async () => {
      settle[1](fakeBitmap(2, 2));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(params()).toEqual(freshResult);
    expect(rig.commits).toEqual(["Tone Levels auto input levels"]);
  });

  it.each([
    ["the params", () => signature({ params: { exposure: 1 } as unknown as DevelopParams })],
    ["another stage's key", () => signature({ bag: { "other.stage.amount": 0.1 } })],
  ])("measures afresh when the stored frame was measured under other %s", async (_name, stale) => {
    const { settle, bitmap } = pendingFrames();
    const bins = stubReadback();
    mount({}, bitmap);
    await settleSampler();

    const old = gradient();
    act(() => store().getState().setFrame({ photoId: "p1", readback: { data: old, width: 16, height: 1 }, signature: stale() }));
    const before = rig.measures.length;
    fireEvent.click(screen.getByText("Auto Input Levels"));
    expect(rig.measures.length).toBe(before + 1);
    expect(params()).toEqual(DEFAULT_PARAMS);

    await act(async () => {
      settle[1](fakeBitmap(2, 2));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(params()).toEqual(autoInputLevels(DEFAULT_PARAMS, bins));
    expect(rig.commits).toEqual(["Tone Levels auto input levels"]);
  });

  it("drops a measurement made under params that changed while it rendered", async () => {
    const { settle, bitmap } = pendingFrames();
    stubReadback();
    mount({}, bitmap);
    await settleSampler();

    fireEvent.click(screen.getByText("Auto Input Levels"));
    act(() => rig.develop.setState({ params: { exposure: 1 } as unknown as DevelopParams }));
    await act(async () => {
      settle[1](fakeBitmap(2, 2));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(params()).toEqual(DEFAULT_PARAMS);
    expect(rig.commits).toEqual([]);
  });

  it("drops a measurement of a photo that is no longer open", async () => {
    const { settle, bitmap } = pendingFrames();
    stubReadback();
    mount({}, bitmap);
    await settleSampler();

    fireEvent.click(screen.getByText("Auto Input Levels"));
    expect(rig.measures.map((m) => m.photoId)).toEqual(["p1", "p1"]);
    act(() => rig.develop.setState({ photoId: "p2" }));
    await act(async () => {
      settle[1](fakeBitmap(2, 2));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(params()).toEqual(DEFAULT_PARAMS);
    expect(rig.commits).toEqual([]);
  });
});
