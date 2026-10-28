// The stage on the real renderer. Run via `npm run test:gpu` (test/gpu/run.cjs
// copies this file into a SafeLight checkout and runs it under its headless
// Chromium + SwiftShader rig). What the CPU suite cannot check:
//
//  • the inline GLSL compiles and links inside the develop shader on a real
//    GLSL ES 3.00 driver, with the host's uniform/helper namespacing applied;
//  • at the defaults the stage is a bit-exact no-op, on both process versions;
//  • the rendered pixels equal the model's levelsPixel for GIMP's edits;
//  • a mask's copy of the stage applies the mask's levels inside the mask
//    only, leaving every pixel outside it as the photo's own levels left it.
//
// The stage's input is the display colour after the host's tone chain, which
// carries an 8-bit tone-curve LUT (about 1/512 of drift even at identity), so
// the reference starts from the captured idle frame rather than the scene.
// That capture is RGBA16F, so the GPU's true input sits within half a
// half-float step of it: each pixel is evaluated at the corners of that box,
// clipped to [0, 1] as the probe pipeline's output is, and the GPU result is
// measured against the hull. What remains is the output capture's own step.

import { describe, expect, it } from "vitest";
import { levelsStage } from "@tl/stage";
import { DEFAULT_PARAMS, levelsPixel, withChannel, type Channel, type ChannelLevels, type LevelsParams } from "@tl/model";
import { bagPatch } from "@tl/params";
import { defaultMaskAdjustments, type Mask } from "@/catalog/types";
import {
  LINEAR_PROBE_PIPELINE,
  type Frame,
  builtinStages,
  floatImage,
  identityParams,
  withRenderer,
} from "@/rendering/webgl/webgl.test-support";

const W = 128;
const H = 128;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Luminance ramps left→right under the host's filmic knee (0.85 at default
// params); the top rows stay neutral, below them a hue sweep with growing
// chroma, so every channel's levels see the whole range.
const SCENE = floatImage(W, H, (x, y) => {
  const t = x / (W - 1);
  const u = y / (H - 1);
  const L = 0.02 + 0.68 * t;
  const chroma = u < 0.15 ? 0 : 0.2 * Math.min(1, (u - 0.15) / 0.3);
  const ang = u * Math.PI * 2 * 1.7;
  return [
    clamp01(L + chroma * Math.cos(ang)),
    clamp01(L + chroma * Math.cos(ang - 2.094)),
    clamp01(L + chroma * Math.cos(ang + 2.094)),
  ];
});

// Half the spacing of the half-float grid around v. Below 2^-14 the grid stops
// getting finer (subnormals), so the exponent is floored there.
function halfStep(v: number): number {
  return 2 ** (Math.max(Math.floor(Math.log2(Math.abs(v))), -14) - 11);
}

interface Comparison {
  max: number;
  rmse: number;
  changeRms: number;
  worst: string;
}

const CORNERS = [-1, 1];
const reference = (rgb: [number, number, number], p: LevelsParams) => levelsPixel(rgb, p).map(clamp01);

/** The GPU frame against the model, over the columns `inside` picks (all by default). */
function compare(on: Frame, off: Frame, params: LevelsParams, inside = (_x: number) => true): Comparison {
  let se = 0;
  let max = 0;
  let change = 0;
  let worst = "";
  let n = 0;
  for (let p = 0; p < W * H; p++) {
    if (!inside(p % W)) continue;
    n += 3;
    const o = p * 4;
    const c: [number, number, number] = [off.data[o], off.data[o + 1], off.data[o + 2]];
    const centre = reference(c, params);
    const lo = [...centre];
    const hi = [...centre];
    for (const sx of CORNERS) {
      for (const sy of CORNERS) {
        for (const sz of CORNERS) {
          const r = reference(
            [c[0] + sx * halfStep(c[0]), c[1] + sy * halfStep(c[1]), c[2] + sz * halfStep(c[2])],
            params,
          );
          for (let ch = 0; ch < 3; ch++) {
            if (r[ch] < lo[ch]) lo[ch] = r[ch];
            if (r[ch] > hi[ch]) hi[ch] = r[ch];
          }
        }
      }
    }
    for (let ch = 0; ch < 3; ch++) {
      const g = on.data[o + ch];
      const e = g < lo[ch] ? lo[ch] - g : g > hi[ch] ? g - hi[ch] : 0;
      se += e * e;
      change += (centre[ch] - c[ch]) ** 2;
      if (e > max) {
        max = e;
        worst =
          `(${p % W},${Math.floor(p / W)}) ch${ch}: in ${c.map((v) => v.toFixed(5)).join("/")} ` +
          `gpu ${g.toFixed(5)} ref ${centre[ch].toFixed(5)} [${lo[ch].toFixed(5)}, ${hi[ch].toFixed(5)}]`;
      }
    }
  }
  return { max, rmse: Math.sqrt(se / n), changeRms: Math.sqrt(change / n), worst };
}

function edit(channels: Partial<Record<Channel, Partial<ChannelLevels>>>, rest: Partial<LevelsParams> = {}): LevelsParams {
  let p: LevelsParams = { ...DEFAULT_PARAMS, ...rest };
  for (const [c, over] of Object.entries(channels) as [Channel, Partial<ChannelLevels>][]) {
    p = withChannel(p, c, { ...p.channels[c], ...over });
  }
  return p;
}

const cases: [string, LevelsParams][] = [
  ["value black, white and gamma", edit({ value: { lowInput: 0.1, highInput: 0.85, gamma: 1.6 } })],
  ["per-channel gammas", edit({ red: { gamma: 0.8 }, green: { gamma: 1.1 }, blue: { gamma: 1.4 } })],
  ["output range and an inverted blue", edit({ value: { lowOutput: 0.05, highOutput: 0.9 }, blue: { lowOutput: 1, highOutput: 0 } })],
  ["equal black and white on red", edit({ red: { lowInput: 0.4, highInput: 0.4 } })],
  ["clamp input and output", edit({ value: { lowInput: 0.2, highInput: 0.6, gamma: 0.5 } }, { clampInput: true, clampOutput: true })],
  ["linear light, gamma 2.2", edit({ value: { gamma: 2.2 } }, { linear: true })],
  ["extreme gammas", edit({ red: { gamma: 0.1 }, blue: { gamma: 10 } })],
];

const MAX_ABS_ERROR = 1e-3;
const MAX_RMS_ERROR = 2e-4;

function frameOf(stages: ReturnType<typeof builtinStages>, processVersion: number, bag?: Record<string, number>) {
  return withRenderer({ stages, pipeline: LINEAR_PROBE_PIPELINE }, (r) => {
    r.setImage(SCENE);
    r.setParams(identityParams({ processVersion }));
    if (bag) r.setContributedParams(bag);
    return r.captureFloatFrame();
  });
}

// A linear gradient whose step sits at u = 0.5: the right half is covered.
const RIGHT_HALF: Mask["components"][number] = {
  id: "right",
  kind: "linear",
  mode: "add",
  invert: false,
  linear: { x0: 0.5, y0: 0, x1: 0.5001, y1: 0 },
};

describe("Tone Levels stage on the real renderer", () => {
  it("is a bit-exact no-op at the defaults on both process versions", () => {
    // Renderers share one context and a nested one's dispose() tears down GL
    // state the outer one relies on, so the frames are taken in sequence.
    for (const version of [1, 2]) {
      const bare = frameOf(builtinStages(), version);
      const idle = frameOf([...builtinStages(), levelsStage()], version, bagPatch(DEFAULT_PARAMS));
      expect(bare).not.toBeNull();
      expect(idle).not.toBeNull();
      for (let i = 0; i < idle!.data.length; i++) expect(idle!.data[i]).toBe(bare!.data[i]);
    }
  });

  it("renders GIMP's levels for every edit", () => {
    withRenderer({ stages: [...builtinStages(), levelsStage()], pipeline: LINEAR_PROBE_PIPELINE }, (renderer) => {
      renderer.setImage(SCENE);
      renderer.setParams(identityParams());
      renderer.setContributedParams(bagPatch(DEFAULT_PARAMS));
      const off = renderer.captureFloatFrame();
      expect(off).not.toBeNull();

      for (const [name, params] of cases) {
        renderer.setContributedParams(bagPatch(params));
        const t0 = performance.now();
        const on = renderer.captureFloatFrame();
        const ms = performance.now() - t0;
        expect(on).not.toBeNull();
        const s = compare(on!, off!, params);
        console.log(
          `[tl-gpu] ${name}: ${ms.toFixed(0)} ms; change rms ${s.changeRms.toExponential(2)}; ` +
            `error rms ${s.rmse.toExponential(2)}, max ${s.max.toExponential(2)} at ${s.worst}`,
        );
        expect(s.changeRms).toBeGreaterThan(1e-3);
        expect(s.max).toBeLessThan(MAX_ABS_ERROR);
        expect(s.rmse).toBeLessThan(MAX_RMS_ERROR);
      }
    });
  });

  it("applies a mask's levels inside the mask, and the photo's everywhere else", () => {
    const [name, params] = cases[0];
    const mask: Mask = {
      id: "m",
      name: "Mask",
      visible: true,
      invert: false,
      opacity: 100,
      adj: defaultMaskAdjustments(),
      panels: ["tone-levels.panel"],
      bag: bagPatch(params),
      components: [RIGHT_HALF],
    };
    withRenderer({ stages: [...builtinStages(), levelsStage()], pipeline: LINEAR_PROBE_PIPELINE }, (renderer) => {
      renderer.setImage(SCENE);
      renderer.setContributedParams(bagPatch(DEFAULT_PARAMS));
      renderer.setParams(identityParams({ processVersion: 2 }));
      const off = renderer.captureFloatFrame();
      renderer.setParams(identityParams({ processVersion: 2, masks: [mask] }));
      const on = renderer.captureFloatFrame();
      expect(off).not.toBeNull();
      expect(on).not.toBeNull();

      // Columns either side of the step, clear of the pixel it straddles.
      const left = (x: number) => x < W / 2 - 1;
      const right = (x: number) => x > W / 2;
      for (let p = 0; p < W * H; p++) {
        if (!left(p % W)) continue;
        for (let ch = 0; ch < 3; ch++) expect(on!.data[p * 4 + ch]).toBe(off!.data[p * 4 + ch]);
      }
      const s = compare(on!, off!, params, right);
      console.log(`[tl-gpu] masked ${name}: error rms ${s.rmse.toExponential(2)}, max ${s.max.toExponential(2)} at ${s.worst}`);
      expect(s.changeRms).toBeGreaterThan(1e-3);
      expect(s.max).toBeLessThan(MAX_ABS_ERROR);
      expect(s.rmse).toBeLessThan(MAX_RMS_ERROR);
    });
  });
});
