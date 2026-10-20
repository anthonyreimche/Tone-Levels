// Session state the panel and the eyedropper share: the newest pre-Levels
// frame, the channel the dialog shows, the histogram scale and the armed
// picker. None of it is part of the edit. Built on the host's zustand
// `create` so the components subscribe like core's.

import type { PickPoint, PickScope } from "./config";
import type { HistogramScale } from "./histogram";
import type { Channel } from "./model";
import { api } from "./runtime";
import type { DevelopParams, StoreApi } from "./safelight";

export interface Readback {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

/** What a measure rendered: the photo, the develop params object it used (the
 *  develop store replaces it on change, never mutates it) and the param bag
 *  without this stage's keys, which every measure resets. */
export interface MeasureSignature {
  readonly photoId: string;
  readonly params: DevelopParams;
  readonly bag: Readonly<Record<string, unknown>>;
}

/** A readback with the photo and signature it was measured under: a frame is
 *  only ever used for that photo, never for the one open when it is read, and
 *  only for that signature when the photo has been edited since. */
export interface MeasuredFrame {
  readonly photoId: string;
  readonly readback: Readback;
  readonly signature: MeasureSignature;
}

export interface PickTarget {
  readonly point: PickPoint;
  readonly scope: PickScope;
}

export interface LevelsUiState {
  frame: MeasuredFrame | null;
  channel: Channel;
  scale: HistogramScale;
  picking: PickTarget | null;
  setFrame(frame: MeasuredFrame | null): void;
  setChannel(channel: Channel): void;
  setScale(scale: HistogramScale): void;
  setPicking(target: PickTarget | null): void;
}

let current: StoreApi<LevelsUiState> | null = null;

export function initStore(): void {
  current = api().stores.create<LevelsUiState>((set) => ({
    frame: null,
    channel: "value",
    scale: "linear",
    picking: null,
    setFrame: (frame) => set({ frame }),
    setChannel: (channel) => set({ channel }),
    setScale: (scale) => set({ scale }),
    setPicking: (picking) => set({ picking }),
  }));
}

export function store(): StoreApi<LevelsUiState> {
  if (!current) throw new Error("[tone-levels] store() called before activate()");
  return current;
}
