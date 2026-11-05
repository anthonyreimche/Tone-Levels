// The eyedroppers. While one is armed it holds the canvas's pick-drag tool,
// so core routes a press on the image to it, keeps Ctrl/⌘/Space for pan and
// zoom, lets go on Esc and stands it aside while a canvas tool (crop mode, a
// mask brush) holds the canvas. A press captures the pre-Levels view, averages
// the 5×5 patch around the pixel (the core white-balance eyedropper rule) in
// the active TRC and applies GIMP's pick. The float frame keeps the colour
// unquantized and signed; a host or GPU without float capture reads the 8-bit
// frame instead.

import { applyPick } from "./config";
import { capturePreLevels, capturePreLevelsFloat } from "./capture";
import { decodePerceptual, type Rgb } from "./model";
import { bagPatch, processVersion, readParams } from "./params";
import { api } from "./runtime";
import type { CanvasPoint, FloatFrame, PickDragTool } from "./safelight";
import { store, type PickTarget } from "./store";

export const PATCH = 5;

export interface Uv {
  x: number;
  y: number;
}

/** A press in the canvas's pixels → UV of a `width`×`height` frame aligned
 *  1:1 with the canvas. Null off the frame or for the host's blank 1×1 frame. */
export function pointToUv(point: CanvasPoint, width: number, height: number): Uv | null {
  if (width < 2 || height < 2) return null;
  const x = point.x / width;
  const y = point.y / height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

function patchMean(
  data: ArrayLike<number>,
  width: number,
  height: number,
  cx: number,
  cy: number,
  value: (v: number) => number,
): Rgb | null {
  const half = PATCH >> 1;
  const sum: [number, number, number] = [0, 0, 0];
  let n = 0;
  for (let y = Math.max(0, cy - half); y <= Math.min(height - 1, cy + half); y++) {
    for (let x = Math.max(0, cx - half); x <= Math.min(width - 1, cx + half); x++) {
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) sum[c] += value(data[o + c]);
      n++;
    }
  }
  return n === 0 ? null : [sum[0] / n, sum[1] / n, sum[2] / n];
}

/** The PATCH×PATCH average around (cx, cy) of an 8-bit sRGB frame, clipped to
 *  the frame, in the active TRC: Linear decodes each value first. */
export function patchColor(
  data: ArrayLike<number>,
  width: number,
  height: number,
  cx: number,
  cy: number,
  linear: boolean,
): Rgb | null {
  return patchMean(data, width, height, cx, cy, linear ? (v) => decodePerceptual(v / 255) : (v) => v / 255);
}

const pixelAt = (uv: Uv, width: number, height: number) => ({
  px: Math.min(width - 1, Math.floor(uv.x * width)),
  py: Math.min(height - 1, Math.floor(uv.y * height)),
});

/** The PATCH×PATCH average at `uv` of a float frame captured in the active
 *  TRC's encoding, so its values are used as they are. */
export function floatPatchColor(frame: FloatFrame, uv: Uv): Rgb | null {
  const { px, py } = pixelAt(uv, frame.width, frame.height);
  return patchMean(frame.data, frame.width, frame.height, px, py, (v) => v);
}

const PICK_LABEL = { black: "black point", grey: "grey point", white: "white point" } as const;

export function commitPick(target: PickTarget, rgb: Rgb): void {
  const dev = api().stores.useDevelopStore.getState();
  const ui = store().getState();
  const p = readParams(dev.paramBag, processVersion(dev.params));
  dev.setDynParams(bagPatch(applyPick(p, target.point, target.scope, ui.channel, rgb)));
  void dev.commitEdit(`Tone Levels pick ${PICK_LABEL[target.point]}`);
  ui.setPicking(null);
}

interface Patch {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

/** Read just the patch box out of a captured frame. */
function readPatch(bitmap: ImageBitmap, uv: Uv): Patch | null {
  const { width: w, height: hgt } = bitmap;
  const { px, py } = pixelAt(uv, w, hgt);
  const half = PATCH >> 1;
  const x0 = Math.max(0, px - half);
  const y0 = Math.max(0, py - half);
  const bw = Math.min(w - 1, px + half) - x0 + 1;
  const bh = Math.min(hgt - 1, py + half) - y0 + 1;
  const ctx = new OffscreenCanvas(bw, bh).getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, x0, y0, bw, bh, 0, 0, bw, bh);
  return { data: ctx.getImageData(0, 0, bw, bh).data, width: bw, height: bh, cx: px - x0, cy: py - y0 };
}

/** Checked once the capture lands: an Esc, a commit or a photo switch in the
 *  meantime must drop the pick. */
export function pickStillWanted(target: PickTarget, photoId: string | null): boolean {
  return store().getState().picking === target && api().stores.useDevelopStore.getState().photoId === photoId;
}

/** The pre-Levels colour at a press. The press is in the canvas's pixels,
 *  which only captureFrame's bitmap (1:1 with the canvas) measures, so it is
 *  captured even when the float frame supplies the colour. */
async function sampleAt(point: CanvasPoint, linear: boolean): Promise<Rgb | null> {
  const [bitmap, frame] = await Promise.all([capturePreLevels(), capturePreLevelsFloat(linear)]);
  try {
    const uv = pointToUv(point, bitmap.width, bitmap.height);
    if (!uv) return null;
    if (frame) return floatPatchColor(frame, uv);
    const patch = readPatch(bitmap, uv);
    return patch && patchColor(patch.data, patch.width, patch.height, patch.cx, patch.cy, linear);
  } finally {
    bitmap.close();
  }
}

async function pickAt(point: CanvasPoint, target: PickTarget): Promise<void> {
  try {
    const dev = api().stores.useDevelopStore.getState();
    const rgb = await sampleAt(point, readParams(dev.paramBag).linear);
    if (rgb && pickStillWanted(target, dev.photoId)) commitPick(target, rgb);
  } catch (err) {
    console.warn("[tone-levels] pick failed:", err);
  }
}

function pickTool(target: PickTarget): PickDragTool {
  return { onPress: (point) => void pickAt(point, target) };
}

/** Hold the canvas's pick-drag tool while a picker is armed, and let go when
 *  it disarms. Returns the stop function. */
export function syncPickDrag(): () => void {
  return store().subscribe((state, prev) => {
    if (state.picking !== prev.picking) api().develop.setPickDrag(state.picking ? pickTool(state.picking) : null);
  });
}
