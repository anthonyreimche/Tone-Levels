// GIMP's histogram over an 8-bit sRGB frame: 256 bins per channel, Value as
// max(r, g, b), bins in the active TRC; spike heights by GIMP's linear and
// logarithmic scales; and the SVG path the panel draws.

import { describe, expect, it } from "vitest";
import { BINS, histogramPath, histogramsFromRgba, spikeHeights } from "../src/histogram";
import { decodePerceptual } from "../src/model";

const total = (bins: ArrayLike<number>) => Array.from(bins).reduce((a, b) => a + b, 0);

describe("histogramsFromRgba", () => {
  it("bins each channel at its 8-bit value and Value at max(r, g, b)", () => {
    const data = Uint8ClampedArray.from([10, 200, 30, 255, 10, 10, 10, 255]);
    const h = histogramsFromRgba(data, 2, 1, false);
    expect(h.red.length).toBe(BINS);
    expect(h.red[10]).toBe(2);
    expect(h.green[200]).toBe(1);
    expect(h.green[10]).toBe(1);
    expect(h.blue[30]).toBe(1);
    expect(h.value[200]).toBe(1);
    expect(h.value[10]).toBe(1);
    expect(total(h.value)).toBe(2);
  });

  it("bins linear light in Linear mode, as GIMP's histogram follows the TRC", () => {
    const h = histogramsFromRgba(Uint8ClampedArray.from([188, 0, 255, 255]), 1, 1, true);
    expect(Math.round(decodePerceptual(188 / 255) * 255)).toBe(128);
    expect(h.red[128]).toBe(1);
    expect(h.green[0]).toBe(1);
    expect(h.blue[255]).toBe(1);
    expect(h.value[255]).toBe(1);
  });
});

describe("spikeHeights", () => {
  it("scales by the tallest bin, linearly or logarithmically", () => {
    const bins = [0, 1, 10, 100];
    expect(Array.from(spikeHeights(bins, "linear"))).toEqual([0, 0.01, 0.1, 1]);
    const log = spikeHeights(bins, "log");
    expect(log[0]).toBe(0);
    expect(log[1]).toBe(0);
    expect(log[2]).toBeCloseTo(0.5, 12);
    expect(log[3]).toBe(1);
  });

  it("draws bins of one at full height when one is also the tallest", () => {
    expect(Array.from(spikeHeights([0, 1, 1], "log"))).toEqual([0, 1, 1]);
  });

  it("is flat for an empty histogram", () => {
    expect(Array.from(spikeHeights([0, 0], "linear"))).toEqual([0, 0]);
    expect(Array.from(spikeHeights([0, 0], "log"))).toEqual([0, 0]);
  });
});

describe("histogramPath", () => {
  it("draws one closed bar per non-empty bin from the baseline", () => {
    expect(histogramPath([0, 0.5], 2, 10)).toBe("M1 10V5H2V10Z");
    expect(histogramPath([1, 0, 0.25], 3, 8)).toBe("M0 8V0H1V8ZM2 8V6H3V8Z");
    expect(histogramPath([0, 0], 2, 10)).toBe("");
  });

  it("rounds coordinates to a tenth", () => {
    expect(histogramPath([0.123456, 0, 0], 10, 7)).toBe("M0 7V6.1H3.3V7Z");
    expect(histogramPath([0, 0, 0.5], 10, 7)).toBe("M6.7 7V3.5H10V7Z");
  });
});
