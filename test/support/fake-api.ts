// A stand-in Safelight API over real React and zustand: the develop store
// holds a param bag and records commits, registrations and captures are
// recorded, the pick-drag tool is held as core holds it, and the ui kit is
// plain DOM so Testing Library can find controls by their labels.

import * as React from "react";
import { create } from "zustand";
import type {
  ButtonProps,
  DevelopParams,
  DevelopStoreState,
  FloatCaptureOptions,
  FloatFrame,
  NumberInputProps,
  PanelContribution,
  ParamScope,
  PickDragTool,
  ProcessingStageContribution,
  RowProps,
  SafelightAPI,
  SectionProps,
  SegmentedControlProps,
  SelectProps,
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

/** Develop params carrying only a process version. */
export const versionedParams = (processVersion: number): DevelopParams =>
  ({ processVersion }) as Record<string, unknown> as DevelopParams;

export function fakeBitmap(width = 2, height = 2): ImageBitmap {
  return { width, height, close: () => undefined };
}

export interface Rig {
  api: SafelightAPI;
  develop: StoreApi<DevelopStoreState>;
  commits: string[];
  /** The paramBag option of each captureFrame call. */
  captures: Record<string, unknown>[];
  /** The options of each captureFloatFrame call. */
  floatCaptures: FloatCaptureOptions[];
  /** The photo id and paramBag argument of each renderPhotoFrame call. */
  measures: { photoId: string; paramBag: Record<string, unknown> }[];
  stages: ProcessingStageContribution[];
  panels: PanelContribution[];
  unregisteredStages: string[];
  /** The pick-drag tool this extension holds. */
  held(): PickDragTool | null;
  /** Core letting go of the tool: Escape, or another extension taking it. */
  dropPickDrag(): void;
  /** Puts what renders from here on inside a mask holding `bag`, as the core's
   *  Masking panel does; returns the mask's store. */
  inMask(bag?: Record<string, unknown>): StoreApi<{ bag: Record<string, unknown> }>;
}

/** `bitmap` answers captureFrame and renderPhotoFrame; without it they never
 *  settle. `float` answers captureFloatFrame; without it the host has none, as
 *  a build before 3.1.0. */
export function fakeApi(
  bag: Record<string, unknown> = {},
  bitmap?: () => Promise<ImageBitmap>,
  float?: () => Promise<FloatFrame | null>,
): Rig {
  const commits: string[] = [];
  const captures: Record<string, unknown>[] = [];
  const floatCaptures: FloatCaptureOptions[] = [];
  const measures: { photoId: string; paramBag: Record<string, unknown> }[] = [];
  const stages: ProcessingStageContribution[] = [];
  const panels: PanelContribution[] = [];
  const unregisteredStages: string[] = [];
  const pick = create<{ tool: PickDragTool | null }>()(() => ({ tool: null }));
  let mask: StoreApi<{ bag: Record<string, unknown> }> | null = null;
  const develop: StoreApi<DevelopStoreState> = create<DevelopStoreState>()((set) => ({
    photoId: "p1",
    params: PARAMS,
    previewParams: null,
    paramBag: bag,
    histogram: null,
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
    ui,
    stores: {
      create: <T,>(init: StateCreator<T>) => create<T>()(init),
      useDevelopStore: develop,
    },
    develop: {
      captureFrame: (_params, options) => {
        captures.push(options?.paramBag ?? {});
        return bitmap ? bitmap() : new Promise<ImageBitmap>(() => undefined);
      },
      ...(float
        ? {
            captureFloatFrame: (_params: DevelopParams, options?: FloatCaptureOptions) => {
              floatCaptures.push(options ?? {});
              return float();
            },
          }
        : {}),
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
      setPickDrag: (tool) => pick.setState({ tool }),
      usePickDragHeld: () => pick((s) => s.tool !== null),
    },
  };
  const inMask = (bag: Record<string, unknown> = {}) => {
    mask = create<{ bag: Record<string, unknown> }>()(() => ({ bag }));
    return mask;
  };
  return {
    api,
    develop,
    commits,
    captures,
    floatCaptures,
    measures,
    stages,
    panels,
    unregisteredStages,
    held: () => pick.getState().tool,
    dropPickDrag: () => pick.setState({ tool: null }),
    inMask,
  };
}
