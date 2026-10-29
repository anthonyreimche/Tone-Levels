// The eyedroppers. While one is armed, a click-through overlay over the
// Develop canvas takes one plain left click, maps it to image UV through the
// overlay rect (interface-scale aware), captures the pre-Levels view, averages
// the 5×5 patch around the pixel (the core white-balance eyedropper rule) in
// the active TRC and applies GIMP's pick. Esc or closing the panel disarms;
// core's Ctrl/⌘/Space passthrough keeps pan and zoom working. The overlay
// draws nothing, and the pick stays armed, while the Crop tool, another core
// tool or a core picker owns the canvas: the core enables its own pickers only
// when no tool is active.

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { applyPick } from "./config";
import { capturePreLevels } from "./capture";
import { decodePerceptual, type Rgb } from "./model";
import { bagPatch, readParams } from "./params";
import { api, h } from "./runtime";
import type { OverlayRect } from "./safelight";
import { store, type PickTarget } from "./store";

export const PATCH = 5;

export interface ClientBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Uv {
  x: number;
  y: number;
}

/** Client point → image UV through the displayed image rect. `clientWidth /
 *  box.width` is the interface scale (the body zoom), so a zoomed UI still
 *  lands on the pixel under the pointer. Null outside the image. */
export function pointToUv(
  clientX: number,
  clientY: number,
  box: ClientBox,
  clientWidth: number,
  rect: OverlayRect | null,
): Uv | null {
  if (!rect || box.width <= 0 || box.height <= 0 || rect.w <= 0 || rect.h <= 0) return null;
  const scale = clientWidth / box.width;
  const x = ((clientX - box.left) * scale - rect.x) / rect.w;
  const y = ((clientY - box.top) * scale - rect.y) / rect.h;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
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
): [number, number, number] | null {
  const half = PATCH >> 1;
  const sum: [number, number, number] = [0, 0, 0];
  let n = 0;
  for (let y = Math.max(0, cy - half); y <= Math.min(height - 1, cy + half); y++) {
    for (let x = Math.max(0, cx - half); x <= Math.min(width - 1, cx + half); x++) {
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const v = data[o + c] / 255;
        sum[c] += linear ? decodePerceptual(v) : v;
      }
      n++;
    }
  }
  return n === 0 ? null : [sum[0] / n, sum[1] / n, sum[2] / n];
}

const PICK_LABEL = { black: "black point", grey: "grey point", white: "white point" } as const;

export function commitPick(target: PickTarget, rgb: Rgb): void {
  const dev = api().stores.useDevelopStore.getState();
  const ui = store().getState();
  const p = readParams(dev.paramBag);
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

/** Read just the patch box out of a captured frame; closes the bitmap. */
function readPatch(bitmap: ImageBitmap, uv: Uv): Patch | null {
  try {
    const { width: w, height: hgt } = bitmap;
    if (w < 2 || hgt < 2) return null;
    const px = Math.min(w - 1, Math.floor(uv.x * w));
    const py = Math.min(hgt - 1, Math.floor(uv.y * hgt));
    const half = PATCH >> 1;
    const x0 = Math.max(0, px - half);
    const y0 = Math.max(0, py - half);
    const bw = Math.min(w - 1, px + half) - x0 + 1;
    const bh = Math.min(hgt - 1, py + half) - y0 + 1;
    const ctx = new OffscreenCanvas(bw, bh).getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, x0, y0, bw, bh, 0, 0, bw, bh);
    return { data: ctx.getImageData(0, 0, bw, bh).data, width: bw, height: bh, cx: px - x0, cy: py - y0 };
  } finally {
    bitmap.close();
  }
}

/** Checked once the capture lands: an Esc, a commit or a photo switch in the
 *  meantime must drop the pick. */
export function pickStillWanted(target: PickTarget, photoId: string | null): boolean {
  return store().getState().picking === target && api().stores.useDevelopStore.getState().photoId === photoId;
}

async function pickAt(
  clientX: number,
  clientY: number,
  el: HTMLElement | null,
  rect: OverlayRect | null,
  target: PickTarget,
): Promise<void> {
  try {
    if (!el) return;
    const photoId = api().stores.useDevelopStore.getState().photoId;
    const uv = pointToUv(clientX, clientY, el.getBoundingClientRect(), el.clientWidth, rect);
    if (!uv) return;
    const patch = readPatch(await capturePreLevels(), uv);
    if (!patch || !pickStillWanted(target, photoId)) return;
    const { linear } = readParams(api().stores.useDevelopStore.getState().paramBag);
    const rgb = patchColor(patch.data, patch.width, patch.height, patch.cx, patch.cy, linear);
    if (rgb) commitPick(target, rgb);
  } catch (err) {
    console.warn("[tone-levels] pick failed:", err);
  }
}

export function PickerOverlay() {
  const { useEffect, useRef } = api().react;
  const picking = store()((s) => s.picking);
  const cropping = api().stores.useDevelopStore((s) => s.cropping);
  const activeTool = api().stores.useDevelopStore((s) => s.activeTool);
  const wbPicking = api().stores.useDevelopStore((s) => s.wbPicking);
  const hslPicking = api().stores.useDevelopStore((s) => s.hslPicking);
  const overlay = api().develop.useDevelopOverlay();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (picking === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") store().getState().setPicking(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking]);

  if (picking === null || cropping || activeTool !== "none" || wbPicking || hslPicking) return null;
  const style: CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "auto",
    cursor: api().cursors.resolve("pick"),
  };
  return h("div", {
    ref,
    style,
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      void pickAt(e.clientX, e.clientY, ref.current, overlay.rect, picking);
    },
  });
}
