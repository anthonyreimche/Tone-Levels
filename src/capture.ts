// Pre-Levels frames for the histogram, Auto Input Levels and the pickers.
// GIMP draws the histogram of its own input, so every frame is rendered with
// this stage's keys at their defaults (the stage then skips its block). The
// histogram and Auto measure the whole photo (renderPhotoFrame, off-screen);
// the pickers read the view (captureFrame), because they sample what is under
// the cursor. Stages after Levels still run in both: the frame includes
// effects-phase Vignette and Grain. The sampler takes one capture per settled
// render (the core histogram's identity changing), throttled, one in flight
// and at most one queued, and only while the panel is mounted. A render that
// only this stage's own keys caused would measure the frame already held, so
// it takes none: a measure is identified by its signature (below), and a
// histogram change is skipped only when the signature is unchanged and those
// keys explain it.

import { STAGE_ID, resetPatch } from "./params";
import { api } from "./runtime";
import type { DevelopParams, DevelopStoreState, StoreApi } from "./safelight";
import { store, type MeasureSignature, type MeasuredFrame, type Readback } from "./store";

/** The long edge of renderPhotoFrame's output. Its frames are read back at
 *  native size; a larger one would be scaled down to this. */
export const SAMPLE_LONG_EDGE = 640;
export const CAPTURE_THROTTLE_MS = 150;

const STAGE_KEY_PREFIX = `${STAGE_ID}.`;

/** What a measure of the open photo would render: null without a photo. The
 *  params are the object the develop store holds (it replaces them on change),
 *  compared by identity. */
export function measureSignature(
  state: Pick<DevelopStoreState, "photoId" | "params" | "previewParams" | "paramBag">,
): MeasureSignature | null {
  if (!state.photoId) return null;
  const bag: Record<string, unknown> = {};
  for (const key of Object.keys(state.paramBag)) {
    if (!key.startsWith(STAGE_KEY_PREFIX)) bag[key] = state.paramBag[key];
  }
  return { photoId: state.photoId, params: state.previewParams ?? state.params, bag };
}

export function sameSignature(a: MeasureSignature, b: MeasureSignature): boolean {
  if (a.photoId !== b.photoId || a.params !== b.params) return false;
  const keys = Object.keys(a.bag);
  return (
    keys.length === Object.keys(b.bag).length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(b.bag, key) && a.bag[key] === b.bag[key])
  );
}

/** View-aligned (captureFrame: the visible window when zoomed), for the pickers. */
export function capturePreLevels(params?: DevelopParams): Promise<ImageBitmap> {
  const a = api();
  const dev = a.stores.useDevelopStore.getState();
  return a.develop.captureFrame(params ?? dev.previewParams ?? dev.params, { paramBag: resetPatch() });
}

/** The whole open photo, off-screen and small, for measuring; null without a
 *  photo. renderPhotoFrame's bag replaces the photo's, so pass all of it. */
export function measurePreLevels(params?: DevelopParams): Promise<ImageBitmap | null> {
  const a = api();
  const dev = a.stores.useDevelopStore.getState();
  if (!dev.photoId) return Promise.resolve(null);
  return a.develop.renderPhotoFrame(dev.photoId, params ?? dev.previewParams ?? dev.params, {
    ...dev.paramBag,
    ...resetPatch(),
  });
}

let scratch: OffscreenCanvas | null = null;

function scratchContext(width: number, height: number): OffscreenCanvasRenderingContext2D | null {
  scratch ??= new OffscreenCanvas(width, height);
  if (scratch.width !== width) scratch.width = width;
  if (scratch.height !== height) scratch.height = height;
  return scratch.getContext("2d", { willReadFrequently: true });
}

/** Draw a captured frame at ≤ longEdge and read it back; null for a blank
 *  (the host's "no renderer" 1×1 bitmap). */
export function readbackBitmap(bitmap: ImageBitmap, longEdge = SAMPLE_LONG_EDGE): Readback | null {
  const { width: bw, height: bh } = bitmap;
  if (bw < 2 || bh < 2) return null;
  const scale = Math.min(1, longEdge / Math.max(bw, bh));
  const w = Math.max(1, Math.round(bw * scale));
  const h = Math.max(1, Math.round(bh * scale));
  const ctx = scratchContext(w, h);
  if (!ctx) return null;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
}

/** One whole-photo pre-Levels frame now, for Auto Input Levels when the stored
 *  one is not of the current signature; tagged with the photo and signature in
 *  force when the render started. */
export async function capturePreLevelsFrame(): Promise<MeasuredFrame | null> {
  const signature = measureSignature(api().stores.useDevelopStore.getState());
  if (!signature) return null;
  const bitmap = await measurePreLevels();
  if (!bitmap) return null;
  try {
    const readback = readbackBitmap(bitmap);
    return readback ? { photoId: signature.photoId, readback, signature } : null;
  } finally {
    bitmap.close();
  }
}

export interface SamplerDeps {
  develop: StoreApi<DevelopStoreState>;
  capture(params: DevelopParams): Promise<ImageBitmap | null>;
  readback(bitmap: ImageBitmap): Readback | null;
  publish(frame: MeasuredFrame | null): void;
  throttleMs?: number;
}

/** Follow the develop store and publish a fresh frame per settled render.
 *  Returns the stop function. */
export function startSampler(deps: SamplerDeps): () => void {
  const throttle = deps.throttleMs ?? CAPTURE_THROTTLE_MS;
  let stopped = false;
  let inFlight = false;
  let queued = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastStart = -Infinity;
  let published: MeasureSignature | null = null;
  let seen = deps.develop.getState();
  let unexplained = false;

  const publish = (frame: MeasuredFrame | null) => {
    published = frame?.signature ?? null;
    deps.publish(frame);
  };

  /** Levels' own keys account for a histogram change only when they are all
   *  that changed since `seen`. A new bag is the proof: with the same params
   *  and bag the cause lies outside the signature (a decode landed, a
   *  transform changed, a stage registered), and the frame must be measured. */
  const explainedByLevels = (state: DevelopStoreState) => {
    const now = measureSignature(state);
    const before = measureSignature(seen);
    return state.paramBag !== seen.paramBag && !!now && !!before && sameSignature(now, before);
  };

  const run = () => {
    timer = null;
    const state = deps.develop.getState();
    const signature = measureSignature(state);
    if (stopped || !signature) return;
    if (!unexplained && published && sameSignature(published, signature)) return;
    unexplained = false;
    seen = state;
    const photoId = signature.photoId;
    const current = () => !stopped && deps.develop.getState().photoId === photoId;
    inFlight = true;
    lastStart = Date.now();
    deps
      .capture(signature.params)
      .then((bitmap) => {
        if (!bitmap) {
          if (current()) publish(null);
          return;
        }
        try {
          if (current()) {
            const readback = deps.readback(bitmap);
            publish(readback ? { photoId, readback, signature } : null);
          }
        } finally {
          bitmap.close();
        }
      })
      .catch((err: unknown) => {
        console.warn("[tone-levels] histogram capture failed:", err);
        if (current()) publish(null);
      })
      .finally(() => {
        inFlight = false;
        if (queued && !stopped) {
          queued = false;
          request();
        }
      });
  };

  const request = () => {
    if (stopped) return;
    if (inFlight) {
      queued = true;
      return;
    }
    if (timer !== null) return;
    timer = setTimeout(run, Math.max(0, throttle - (Date.now() - lastStart)));
  };

  const unsubscribe = deps.develop.subscribe((state, prev) => {
    if (state.photoId !== prev.photoId && !state.photoId) {
      queued = false;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      publish(null);
      return;
    }
    if (state.photoId && (state.histogram !== prev.histogram || state.photoId !== prev.photoId)) {
      if (!explainedByLevels(state)) unexplained = true;
      seen = state;
      request();
    }
  });

  request();

  return () => {
    stopped = true;
    unsubscribe();
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
}

export function startLiveSampler(): () => void {
  return startSampler({
    develop: api().stores.useDevelopStore,
    capture: (params) => measurePreLevels(params),
    readback: (bitmap) => readbackBitmap(bitmap),
    publish: (frame) => store().getState().setFrame(frame),
  });
}
