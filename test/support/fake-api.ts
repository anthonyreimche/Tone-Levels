// A stand-in Safelight API over real React and zustand: the develop store
// holds a param bag and records commits, registrations and captures are
// recorded, and the ui kit is plain DOM so Testing Library can find controls
// by their labels.

import * as React from "react";
import { create } from "zustand";
import type {
  ButtonProps,
  DevelopParams,
  DevelopStoreState,
  NumberInputProps,
  PanelContribution,
  ParamScope,
  ProcessingStageContribution,
  RowProps,
  SafelightAPI,
  SectionProps,
  SegmentedControlProps,
  SelectProps,
  SlotContribution,
  StackProps,
  StateCreator,
  StoreApi,
  ToggleProps,
  UiKit,
} from "../../src/safelight";

const e = React.createElement;

const ui: UiKit = {
  Button: ({ children, onClick, disabled, title, "aria-label": ariaLabel, "aria-pressed": ariaPressed }: ButtonProps) =>
    e("button", { type: "button", onClick, disabled, title, "aria-label": ariaLabel, "aria-pressed": ariaPressed }, children),
  Select: ({ value, onChange, options, ariaLabel }: SelectProps) =>
    e(
      "select",
      { value, "aria-label": ariaLabel, onChange: (ev: React.ChangeEvent<HTMLSelectElement>) => onChange(ev.target.value) },
      ...(options ?? []).map((o) => e("option", { key: o.value, value: o.value }, o.label)),
    ),
  SegmentedControl: ({ value, onChange, options }: SegmentedControlProps) =>
    e(
      "div",
      { role: "group" },
      ...options.map((o) =>
        e("button", { key: o.value, type: "button", title: o.title, "aria-pressed": o.value === value, onClick: () => onChange(o.value) }, o.label),
      ),
    ),
  Toggle: ({ checked, onChange, label, ariaLabel }: ToggleProps) =>
    e(
      "label",
      null,
      e("input", {
        type: "checkbox",
        checked,
        "aria-label": ariaLabel ?? (typeof label === "string" ? label : undefined),
        onChange: (ev: React.ChangeEvent<HTMLInputElement>) => onChange(ev.target.checked),
      }),
      label,
    ),
  NumberInput: ({ value, onChange, onBlur, onKeyDown, step, title, "aria-label": ariaLabel }: NumberInputProps) =>
    e("input", {
      type: "number",
      value,
      step,
      title,
      "aria-label": ariaLabel,
      onBlur,
      onKeyDown,
      onChange: (ev: React.ChangeEvent<HTMLInputElement>) => {
        const n = Number(ev.target.value);
        if (ev.target.value !== "" && Number.isFinite(n)) onChange(n);
      },
    }),
  Section: ({ title, right, children }: SectionProps) => e("section", null, e("h3", null, title), right, children),
  Row: ({ children }: RowProps) => e("div", null, children),
  Stack: ({ children }: StackProps) => e("div", null, children),
  tokens: {
    surface0: "#525252",
    surface2: "#666666",
    border: "#3b3b3b",
    textPrimary: "#f0f0f0",
    textSecondary: "#c4c4c4",
    textMuted: "#9c9c9c",
    accent: "#4a90d9",
  },
};

// The core's develop params are opaque to the extension; any object stands in.
const PARAMS = {} as DevelopParams;

export function fakeBitmap(width = 2, height = 2): ImageBitmap {
  return { width, height, close: () => undefined };
}

export interface Rig {
  api: SafelightAPI;
  develop: StoreApi<DevelopStoreState>;
  commits: string[];
  /** The paramBag option of each captureFrame call. */
  captures: Record<string, unknown>[];
  /** The photo id and paramBag argument of each renderPhotoFrame call. */
  measures: { photoId: string; paramBag: Record<string, unknown> }[];
  stages: ProcessingStageContribution[];
  panels: PanelContribution[];
  slots: SlotContribution[];
  unregisteredStages: string[];
  unregisteredSlots: string[];
  /** Puts what renders from here on inside a mask holding `bag`, as the core's
   *  Masking panel does; returns the mask's store. */
  inMask(bag?: Record<string, unknown>): StoreApi<{ bag: Record<string, unknown> }>;
}

/** `bitmap` answers captureFrame and renderPhotoFrame; without it they never settle. */
export function fakeApi(bag: Record<string, unknown> = {}, bitmap?: () => Promise<ImageBitmap>): Rig {
  const commits: string[] = [];
  const captures: Record<string, unknown>[] = [];
  const measures: { photoId: string; paramBag: Record<string, unknown> }[] = [];
  const stages: ProcessingStageContribution[] = [];
  const panels: PanelContribution[] = [];
  const slots: SlotContribution[] = [];
  const unregisteredStages: string[] = [];
  const unregisteredSlots: string[] = [];
  let mask: StoreApi<{ bag: Record<string, unknown> }> | null = null;
  const develop: StoreApi<DevelopStoreState> = create<DevelopStoreState>()((set) => ({
    photoId: "p1",
    params: PARAMS,
    previewParams: null,
    paramBag: bag,
    histogram: null,
    cropping: false,
    activeTool: "none",
    wbPicking: false,
    hslPicking: false,
    setDynParams: (patch) => set((s) => ({ paramBag: { ...s.paramBag, ...patch } })),
    commitEdit: async (label) => {
      commits.push(label);
    },
  }));
  const photoScope: ParamScope = {
    maskId: null,
    getParam: (key) => develop.getState().paramBag[key],
    getParams: () => develop.getState().paramBag,
    setParams: (patch) => develop.getState().setDynParams(patch),
    commit: (label) => void develop.getState().commitEdit(label),
  };
  const maskScope = (store: StoreApi<{ bag: Record<string, unknown> }>): ParamScope => ({
    maskId: "mask-1",
    getParam: (key) => store.getState().bag[key],
    getParams: () => store.getState().bag,
    setParams: (patch) => store.setState((s) => ({ bag: { ...s.bag, ...patch } })),
    commit: (label) => void commits.push(`mask: ${label}`),
  });
  const api: SafelightAPI = {
    version: 1,
    extensionId: "tone-levels",
    react: React,
    registerProcessingStage: (c) => void stages.push(c),
    unregisterProcessingStage: (id) => void unregisteredStages.push(id),
    registerPanel: (c) => void panels.push(c),
    registerSlot: (c) => void slots.push(c),
    unregisterSlot: (id) => void unregisteredSlots.push(id),
    ui,
    stores: {
      create: <T,>(init: StateCreator<T>) => create<T>()(init),
      useDevelopStore: develop,
    },
    cursors: { resolve: (token) => token },
    develop: {
      useDevelopOverlay: () => ({ rect: null, nonce: 0 }),
      captureFrame: (_params, options) => {
        captures.push(options?.paramBag ?? {});
        return bitmap ? bitmap() : new Promise<ImageBitmap>(() => undefined);
      },
      renderPhotoFrame: (photoId, _params, paramBag) => {
        measures.push({ photoId, paramBag: paramBag ?? {} });
        return bitmap ? bitmap() : new Promise<ImageBitmap | null>(() => undefined);
      },
      // Subscribed, as the core's scopes are, so a write re-renders. A rig is
      // inside a mask or not for every render it makes, so the hook called is too.
      useParamScope: () => {
        if (mask) {
          mask((s) => s.bag);
          return maskScope(mask);
        }
        develop((s) => s.paramBag);
        return photoScope;
      },
    },
  };
  const inMask = (bag: Record<string, unknown> = {}) => {
    mask = create<{ bag: Record<string, unknown> }>()(() => ({ bag }));
    return mask;
  };
  return { api, develop, commits, captures, measures, stages, panels, slots, unregisteredStages, unregisteredSlots, inMask };
}
