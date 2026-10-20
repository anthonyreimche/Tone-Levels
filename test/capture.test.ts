// The pre-Levels sampler: every capture renders with this stage's keys at
// their defaults (the whole photo for measuring, the live view for the
// pickers); one capture per settled render, throttled, coalesced while one is
// in flight, silent without a photo, cleared when the photo closes, a late
// result dropped after stop() or once its photo is gone, and every published
// frame tagged with the photo and the signature it was measured from. A
// histogram change that only Levels' own keys explain (same photo and params,
// a new bag that differs in those keys alone) measures the same pre-Levels
// frame, so it takes no new capture; any other change does, including a
// histogram change that no params or bag change explains (a decode landing).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAPTURE_THROTTLE_MS,
  capturePreLevels,
  capturePreLevelsFrame,
  measurePreLevels,
  measureSignature,
  readbackBitmap,
  sameSignature,
  startSampler,
  type SamplerDeps,
} from "../src/capture";
import { qualified, resetPatch } from "../src/params";
import { initRuntime } from "../src/runtime";
import type { DevelopParams, DevelopStoreState, StoreApi } from "../src/safelight";
import type { MeasureSignature, MeasuredFrame, Readback } from "../src/store";
import { fakeApi, fakeBitmap } from "./support/fake-api";

const FRAME: Readback = { data: new Uint8ClampedArray(8), width: 2, height: 1 };
const paramsOf = (exposure: number) => ({ exposure }) as unknown as DevelopParams;

/** The frame the sampler should have published for the store's current state. */
function framed(develop: StoreApi<DevelopStoreState>): MeasuredFrame {
  const signature = measureSignature(develop.getState());
  if (!signature) throw new Error("no photo open");
  return { photoId: signature.photoId, readback: FRAME, signature };
}

interface Harness {
  deps: SamplerDeps;
  develop: StoreApi<DevelopStoreState>;
  captures: DevelopParams[];
  published: (MeasuredFrame | null)[];
  resolveCapture(result?: ImageBitmap | null): void;
}

function harness(state: Partial<DevelopStoreState>): Harness {
  const rig = fakeApi();
  rig.develop.setState({ photoId: null, ...state });
  const captures: DevelopParams[] = [];
  const published: (MeasuredFrame | null)[] = [];
  let resolvers: ((result: ImageBitmap | null) => void)[] = [];
  const deps: SamplerDeps = {
    develop: rig.develop,
    capture: (params) =>
      new Promise<ImageBitmap | null>((resolve) => {
        captures.push(params);
        resolvers.push(resolve);
      }),
    readback: () => FRAME,
    publish: (frame) => void published.push(frame),
  };
  return {
    deps,
    develop: rig.develop,
    captures,
    published,
    resolveCapture: (result = fakeBitmap()) => {
      const pending = resolvers;
      resolvers = [];
      for (const r of pending) r(result);
    },
  };
}

describe("capturePreLevels", () => {
  it("renders the live view with every Levels key at its default", async () => {
    const rig = fakeApi({ [qualified("valueGamma")]: 2 }, async () => fakeBitmap());
    initRuntime(rig.api);
    await capturePreLevels();
    expect(rig.captures).toEqual([resetPatch()]);
    expect(rig.measures).toEqual([]);
  });
});

describe("measurePreLevels", () => {
  it("renders the whole open photo with its own bag kept and every Levels key reset", async () => {
    const rig = fakeApi({ [qualified("valueGamma")]: 2, "other.stage.amount": 0.5 }, async () => fakeBitmap());
    initRuntime(rig.api);
    expect(await measurePreLevels()).not.toBeNull();
    expect(rig.measures).toEqual([{ photoId: "p1", paramBag: { "other.stage.amount": 0.5, ...resetPatch() } }]);
    expect(rig.captures).toEqual([]);
  });

  it("returns null and renders nothing without a photo", async () => {
    const rig = fakeApi({}, async () => fakeBitmap());
    rig.develop.setState({ photoId: null });
    initRuntime(rig.api);
    expect(await measurePreLevels()).toBeNull();
    expect(rig.measures).toEqual([]);
  });
});

describe("capturePreLevelsFrame", () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Node has no OffscreenCanvas: a canvas that reads back fixed pixels. The
   *  readback keeps one canvas for the module's life, so every test's stub is
   *  this one class and only the pixels change. */
  let pixels: Uint8ClampedArray = new Uint8ClampedArray(0);
  const draws: unknown[][] = [];
  let constructed = 0;
  class FakeCanvas {
    width = 0;
    height = 0;
    constructor() {
      constructed++;
    }
    getContext() {
      return {
        clearRect: () => undefined,
        drawImage: (...args: unknown[]) => void draws.push(args),
        getImageData: () => ({ data: pixels }),
      };
    }
  }
  function stubReadback(data: Uint8ClampedArray) {
    pixels = data;
    vi.stubGlobal("OffscreenCanvas", FakeCanvas);
  }

  it("reads a frame within the long edge back at its native size", () => {
    stubReadback(new Uint8ClampedArray(640 * 480 * 4));
    const bitmap = fakeBitmap(640, 480);
    expect(readbackBitmap(bitmap)).toEqual({ data: pixels, width: 640, height: 480 });
    expect(draws[draws.length - 1]).toEqual([bitmap, 0, 0, 640, 480]);
  });

  it("scales a frame beyond the long edge down to it", () => {
    stubReadback(new Uint8ClampedArray(640 * 320 * 4));
    const bitmap = fakeBitmap(1280, 640);
    expect(readbackBitmap(bitmap)).toMatchObject({ width: 640, height: 320 });
    expect(draws[draws.length - 1]).toEqual([bitmap, 0, 0, 640, 320]);
  });

  it("reuses one canvas for every readback", () => {
    stubReadback(new Uint8ClampedArray(640 * 480 * 4));
    const before = constructed;
    readbackBitmap(fakeBitmap(640, 480));
    readbackBitmap(fakeBitmap(320, 240));
    readbackBitmap(fakeBitmap(640, 480));
    expect(constructed - before).toBeLessThanOrEqual(1);
  });

  it("reads nothing back from the host's blank 1×1 frame", () => {
    stubReadback(new Uint8ClampedArray(4));
    expect(readbackBitmap(fakeBitmap(1, 1))).toBeNull();
  });

  it("tags the frame with the photo it measured", async () => {
    const data = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255, 10, 11, 12, 255]);
    stubReadback(data);
    const rig = fakeApi({}, async () => fakeBitmap(2, 2));
    initRuntime(rig.api);
    expect(await capturePreLevelsFrame()).toEqual({
      photoId: "p1",
      readback: { data, width: 2, height: 2 },
      signature: measureSignature(rig.develop.getState()),
    });
  });

  it("tags the frame with the signature the render started under", async () => {
    stubReadback(new Uint8ClampedArray(16));
    let finish: (bitmap: ImageBitmap) => void = () => undefined;
    const rig = fakeApi({ "other.stage.amount": 0.5 }, () => new Promise<ImageBitmap>((resolve) => (finish = resolve)));
    initRuntime(rig.api);
    const before = measureSignature(rig.develop.getState());
    const frame = capturePreLevelsFrame();
    rig.develop.setState({ params: paramsOf(1), paramBag: { "other.stage.amount": 0.9 } });
    finish(fakeBitmap(2, 2));
    expect((await frame)?.signature).toEqual(before);
  });

  it("keeps the measured photo's id when the open photo changes during the render", async () => {
    stubReadback(new Uint8ClampedArray(16));
    let finish: (bitmap: ImageBitmap) => void = () => undefined;
    const rig = fakeApi({}, () => new Promise<ImageBitmap>((resolve) => (finish = resolve)));
    initRuntime(rig.api);
    const frame = capturePreLevelsFrame();
    rig.develop.setState({ photoId: "p2" });
    finish(fakeBitmap(2, 2));
    expect((await frame)?.photoId).toBe("p1");
  });

  it("reads back the whole-photo render and closes its bitmap", async () => {
    const blank = fakeBitmap(1, 1);
    const close = vi.spyOn(blank, "close");
    const rig = fakeApi({}, async () => blank);
    initRuntime(rig.api);
    expect(await capturePreLevelsFrame()).toBeNull();
    expect(rig.measures.length).toBe(1);
    expect(rig.captures).toEqual([]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("is null without a photo", async () => {
    const rig = fakeApi({}, async () => fakeBitmap());
    rig.develop.setState({ photoId: null });
    initRuntime(rig.api);
    expect(await capturePreLevelsFrame()).toBeNull();
    expect(rig.measures).toEqual([]);
  });
});

describe("startSampler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("captures the open photo once at start and again when the histogram changes", async () => {
    const r = harness({ photoId: "p1", histogram: { v: 1 } });
    const stop = startSampler(r.deps);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.captures.length).toBe(1);
    r.resolveCapture();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.published).toEqual([framed(r.develop)]);
    await vi.advanceTimersByTimeAsync(CAPTURE_THROTTLE_MS);
    r.develop.setState({ histogram: { v: 2 } });
    await vi.advanceTimersByTimeAsync(0);
    expect(r.captures.length).toBe(2);
    stop();
  });

  it("renders the preview params when a preview is showing", async () => {
    const preview = { exposure: 1 } as unknown as DevelopParams;
    const r = harness({ photoId: "p1", histogram: { v: 1 }, previewParams: preview });
    const stop = startSampler(r.deps);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.captures[0]).toBe(preview);
    stop();
  });

  it("coalesces changes inside the throttle window into one later capture", async () => {
    const r = harness({ photoId: "p1", histogram: { v: 1 } });
    const stop = startSampler(r.deps);
    await vi.advanceTimersByTimeAsync(0);
    r.resolveCapture();
    await vi.advanceTimersByTimeAsync(0);
    r.develop.setState({ histogram: { v: 2 } });
    r.develop.setState({ histogram: { v: 3 } });
    await vi.advanceTimersByTimeAsync(CAPTURE_THROTTLE_MS / 2);
    expect(r.captures.length).toBe(1);
    await vi.advanceTimersByTimeAsync(CAPTURE_THROTTLE_MS);
    expect(r.captures.length).toBe(2);
    stop();
  });

  it("waits for a capture in flight and then captures exactly once more", async () => {
    const r = harness({ photoId: "p1", histogram: { v: 1 } });
    const stop = startSampler(r.deps);
    await vi.advanceTimersByTimeAsync(0);
    r.develop.setState({ histogram: { v: 2 } });
    r.develop.setState({ histogram: { v: 3 } });
    await vi.advanceTimersByTimeAsync(CAPTURE_THROTTLE_MS * 2);
    expect(r.captures.length).toBe(1);
    r.resolveCapture();
    await vi.advanceTimersByTimeAsync(CAPTURE_THROTTLE_MS * 2);
    expect(r.captures.length).toBe(2);
    stop();
  });

  it("stays silent without a photo and clears the frame when the photo closes", async () => {
    const r = harness({ photoId: null, histogram: { v: 1 } });
    const stop = startSampler(r.deps);
    await vi.advanceTimersByTimeAsync(CAPTURE_THROTTLE_MS * 2);
    expect(r.captures.length).toBe(0);
    r.develop.setState({ photoId: "p1", histogram: { v: 2 } });
    await vi.advanceTimersByTimeAsync(0);
    expect(r.captures.length).toBe(1);
    r.resolveCapture();
    await vi.advanceTimersByTimeAsync(0);
    r.develop.setState({ photoId: null });
    expect(r.published[r.published.length - 1]).toBeNull();
    stop();
  });

  it("publishes null when the capture comes back empty", async () => {
    const r = harness({ photoId: "p1", histogram: { v: 1 } });
    const readback = vi.fn(() => FRAME);
    r.deps.readback = readback;
    const stop = startSampler(r.deps);
    await vi.advanceTimersByTimeAsync(0);
    r.resolveCapture(null);
    await vi.advanceTimersByTimeAsync(0);
    expect(r.published).toEqual([null]);
    expect(readback).not.toHaveBeenCalled();
    stop();
  });

  it("drops a capture that lands after its photo closed", async () => {
    const r = harness({ photoId: "p1", histogram: { v: 1 } });
    const stop = startSampler(r.deps);
    await vi.advanceTimersByTimeAsync(0);
    r.develop.setState({ photoId: null });
    r.resolveCapture();
    await vi.advanceTimersByTimeAsync(CAPTURE_THROTTLE_MS * 2);
    expect(r.published).toEqual([null]);
    stop();
  });

  it("drops a capture that lands after the photo changed, then samples the new one", async () => {
    const r = harness({ photoId: "p1", histogram: { v: 1 } });
    const stop = startSampler(r.deps);
    await vi.advanceTimersByTimeAsync(0);
    r.develop.setState({ photoId: "p2" });
    r.resolveCapture();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.published).toEqual([]);
    await vi.advanceTimersByTimeAsync(CAPTURE_THROTTLE_MS * 2);
    expect(r.captures.length).toBe(2);
    r.resolveCapture();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.published).toEqual([framed(r.develop)]);
    stop();
  });

  it("closes the bitmap, warns and publishes null when the readback throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const r = harness({ photoId: "p1", histogram: { v: 1 } });
    r.deps.readback = () => {
      throw new Error("readback failed");
    };
    const bitmap = fakeBitmap();
    const close = vi.spyOn(bitmap, "close");
    const stop = startSampler(r.deps);
    await vi.advanceTimersByTimeAsync(0);
    r.resolveCapture(bitmap);
    await vi.advanceTimersByTimeAsync(0);
    expect(close).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(r.published).toEqual([null]);
    stop();
    warn.mockRestore();
  });

  it("drops a result that lands after stop()", async () => {
    const r = harness({ photoId: "p1", histogram: { v: 1 } });
    const stop = startSampler(r.deps);
    await vi.advanceTimersByTimeAsync(0);
    stop();
    r.resolveCapture();
    await vi.advanceTimersByTimeAsync(CAPTURE_THROTTLE_MS * 2);
    expect(r.published.length).toBe(0);
    r.develop.setState({ histogram: { v: 2 } });
    await vi.advanceTimersByTimeAsync(CAPTURE_THROTTLE_MS * 2);
    expect(r.captures.length).toBe(1);
  });

  describe("skipping a re-measure of the same pre-Levels frame", () => {
    /** A sampler whose first capture has landed and published a frame. */
    async function measured(state: Partial<DevelopStoreState> = {}) {
      const r = harness({ photoId: "p1", histogram: { v: 1 }, ...state });
      const stop = startSampler(r.deps);
      await vi.advanceTimersByTimeAsync(0);
      r.resolveCapture();
      await vi.advanceTimersByTimeAsync(0);
      expect(r.captures.length).toBe(1);
      expect(r.published.length).toBe(1);
      return { r, stop };
    }
    const settle = () => vi.advanceTimersByTimeAsync(CAPTURE_THROTTLE_MS * 2);

    it("takes no capture for a render only Levels' own keys caused", async () => {
      const { r, stop } = await measured({ paramBag: { "other.stage.amount": 0.5 } });
      r.develop.setState({
        paramBag: { "other.stage.amount": 0.5, [qualified("valueGamma")]: 2, [qualified("clampOutput")]: 1 },
        histogram: { v: 2 },
      });
      await settle();
      r.develop.setState({
        paramBag: { "other.stage.amount": 0.5, [qualified("valueGamma")]: 2.5, [qualified("redLowInput")]: 0.1 },
        histogram: { v: 3 },
      });
      await settle();
      expect(r.captures.length).toBe(1);
      stop();
    });

    it("takes no capture across successive Levels-only drag steps, bag first and histogram after", async () => {
      const { r, stop } = await measured({ paramBag: { "other.stage.amount": 0.5 } });
      for (let step = 1; step <= 5; step++) {
        r.develop.setState({ paramBag: { "other.stage.amount": 0.5, [qualified("valueLowInput")]: step / 10 } });
        r.develop.setState({ histogram: { v: step + 1 } });
        await settle();
      }
      expect(r.captures.length).toBe(1);
      stop();
    });

    it("measures again when the histogram changes with no params or bag change", async () => {
      const { r, stop } = await measured({ paramBag: { "other.stage.amount": 0.5 } });
      r.develop.setState({ histogram: { v: 2 } });
      await settle();
      expect(r.captures.length).toBe(2);
      stop();
    });

    it("measures again when the histogram changes with the same bag after a Levels-only step", async () => {
      const { r, stop } = await measured();
      r.develop.setState({ paramBag: { [qualified("valueGamma")]: 2 }, histogram: { v: 2 } });
      await settle();
      expect(r.captures.length).toBe(1);
      r.develop.setState({ histogram: { v: 3 } });
      await settle();
      expect(r.captures.length).toBe(2);
      stop();
    });

    it("coalesces a Levels-only change and an unexplained histogram change into one capture", async () => {
      const { r, stop } = await measured();
      r.develop.setState({ paramBag: { [qualified("valueGamma")]: 2 }, histogram: { v: 2 } });
      r.develop.setState({ histogram: { v: 3 } });
      await settle();
      expect(r.captures.length).toBe(2);
      stop();
    });

    it("measures once for an unexplained histogram change followed by a Levels-only one", async () => {
      const { r, stop } = await measured();
      r.develop.setState({ histogram: { v: 2 } });
      r.develop.setState({ paramBag: { [qualified("valueGamma")]: 2 }, histogram: { v: 3 } });
      await settle();
      expect(r.captures.length).toBe(2);
      stop();
    });

    it("measures again for an unexplained change that lands while a capture is in flight", async () => {
      const { r, stop } = await measured();
      r.develop.setState({ params: paramsOf(1), histogram: { v: 2 } });
      await settle();
      expect(r.captures.length).toBe(2);
      r.develop.setState({ histogram: { v: 3 } });
      r.resolveCapture();
      await settle();
      expect(r.captures.length).toBe(3);
      stop();
    });

    it("takes no capture for a Levels-only change that lands while a capture is in flight", async () => {
      const { r, stop } = await measured();
      r.develop.setState({ params: paramsOf(1), histogram: { v: 2 } });
      await settle();
      expect(r.captures.length).toBe(2);
      r.develop.setState({ paramBag: { [qualified("valueGamma")]: 2 }, histogram: { v: 3 } });
      r.resolveCapture();
      await settle();
      expect(r.captures.length).toBe(2);
      stop();
    });

    it("captures again when a key of another stage changes", async () => {
      const { r, stop } = await measured({ paramBag: { "other.stage.amount": 0.5 } });
      r.develop.setState({ paramBag: { "other.stage.amount": 0.9 }, histogram: { v: 2 } });
      await settle();
      expect(r.captures.length).toBe(2);
      r.resolveCapture();
      await vi.advanceTimersByTimeAsync(0);
      r.develop.setState({ paramBag: { "other.stage.amount": 0.9, "another.stage.on": 1 }, histogram: { v: 3 } });
      await settle();
      expect(r.captures.length).toBe(3);
      stop();
    });

    it("captures again when the params object is replaced", async () => {
      const { r, stop } = await measured();
      r.develop.setState({ params: paramsOf(1), histogram: { v: 2 } });
      await settle();
      expect(r.captures.length).toBe(2);
      stop();
    });

    it("captures again when the preview params change", async () => {
      const { r, stop } = await measured({ previewParams: paramsOf(1) });
      r.develop.setState({ previewParams: paramsOf(1.5), histogram: { v: 2 } });
      await settle();
      expect(r.captures.length).toBe(2);
      stop();
    });

    it("retries after a measure that came back empty", async () => {
      const r = harness({ photoId: "p1", histogram: { v: 1 } });
      const stop = startSampler(r.deps);
      await vi.advanceTimersByTimeAsync(0);
      r.resolveCapture(null);
      await vi.advanceTimersByTimeAsync(0);
      expect(r.published).toEqual([null]);
      r.develop.setState({ histogram: { v: 2 } });
      await settle();
      expect(r.captures.length).toBe(2);
      stop();
    });

    it("retries when the only frame of this signature was replaced by an empty one", async () => {
      const { r, stop } = await measured();
      r.develop.setState({ params: paramsOf(1), histogram: { v: 2 } });
      await settle();
      r.resolveCapture(null);
      await vi.advanceTimersByTimeAsync(0);
      expect(r.published[r.published.length - 1]).toBeNull();
      r.develop.setState({ params: r.captures[0], histogram: { v: 3 } });
      await settle();
      expect(r.captures.length).toBe(3);
      stop();
    });

    it("tags a frame with the signature its render started under", async () => {
      const r = harness({ photoId: "p1", histogram: { v: 1 }, paramBag: { "other.stage.amount": 0.5 } });
      const before = measureSignature(r.develop.getState());
      const stop = startSampler(r.deps);
      await vi.advanceTimersByTimeAsync(0);
      r.develop.setState({ params: paramsOf(1) });
      r.resolveCapture();
      await vi.advanceTimersByTimeAsync(0);
      expect(r.published[0]?.signature).toEqual(before);
      stop();
    });

    it("measures again after the photo closes and reopens with the same signature", async () => {
      const { r, stop } = await measured();
      r.develop.setState({ photoId: null });
      expect(r.published[r.published.length - 1]).toBeNull();
      r.develop.setState({ photoId: "p1", histogram: { v: 2 } });
      await settle();
      expect(r.captures.length).toBe(2);
      stop();
    });
  });
});

describe("measureSignature", () => {
  const state = (over: Partial<DevelopStoreState> = {}) => {
    const rig = fakeApi({ "other.stage.amount": 0.5, [qualified("valueGamma")]: 2, [qualified("linear")]: 1 });
    rig.develop.setState(over);
    return rig.develop.getState();
  };

  it("is null without a photo", () => {
    expect(measureSignature(state({ photoId: null }))).toBeNull();
  });

  it("holds the photo, the params the render uses and the bag without this stage's keys", () => {
    const params = paramsOf(1);
    const preview = paramsOf(2);
    expect(measureSignature(state({ params }))).toEqual({ photoId: "p1", params, bag: { "other.stage.amount": 0.5 } });
    expect(measureSignature(state({ params, previewParams: preview }))?.params).toBe(preview);
  });
});

describe("sameSignature", () => {
  const params = paramsOf(1);
  const base: MeasureSignature = { photoId: "p1", params, bag: { a: 1, b: "x" } };

  it("is true for the same photo and params object and shallow-equal bags", () => {
    expect(sameSignature(base, { photoId: "p1", params, bag: { b: "x", a: 1 } })).toBe(true);
    expect(sameSignature(base, base)).toBe(true);
  });

  it("is false when the photo, the params identity or any bag entry differs", () => {
    expect(sameSignature(base, { ...base, photoId: "p2" })).toBe(false);
    expect(sameSignature(base, { ...base, params: paramsOf(1) })).toBe(false);
    expect(sameSignature(base, { ...base, bag: { a: 2, b: "x" } })).toBe(false);
    expect(sameSignature(base, { ...base, bag: { a: 1 } })).toBe(false);
    expect(sameSignature(base, { ...base, bag: { a: 1, b: "x", c: 0 } })).toBe(false);
    expect(sameSignature(base, { ...base, bag: { a: 1, c: "x" } })).toBe(false);
  });
});
