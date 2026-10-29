// The Develop panel: GIMP's Levels dialog in the right rail. Handle drags
// write the bag live and commit on release; a field writes nothing while it is
// typed in and applies its clamped value on Enter or blur, once, with one
// commit; buttons, toggles and the mode switch commit at once. A field shows
// what is typed until it applies, because the bag only ever holds the clamped
// value and a controlled number input rewrites its text to the prop.
//
// It edits whatever useParamScope hands it: the photo's bag in the dock, a
// mask's in the Masking panel's Adjust tab. The histogram, the eyedroppers and
// Auto Input Levels measure the photo before its own Levels, so they show only
// in the dock.

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { GradientBar, HandleBar, HistogramView, inputBarGradient, outputBarGradient } from "./Bars";
import { capturePreLevelsFrame, measureSignature, sameSignature, startLiveSampler } from "./capture";
import { autoInputLevels, resetChannel, type PickPoint, type PickScope } from "./config";
import {
  DISPLAY_SCALE,
  INPUT_HANDLES,
  dragInput,
  dragOutput,
  inputHandlePositions,
  outputHandlePositions,
} from "./handles";
import { histogramsFromRgba } from "./histogram";
import { CHANNELS, GAMMA_MAX, GAMMA_MIN, clamp, withChannel, type Channel, type ChannelLevels, type LevelsParams } from "./model";
import { bagPatch, readParams } from "./params";
import { api, h } from "./runtime";
import { store } from "./store";

const CHANNEL_LABEL: Record<Channel, string> = { value: "Value", red: "Red", green: "Green", blue: "Blue" };
const POINT_FILL: Record<PickPoint, string> = { black: "#000000", grey: "#808080", white: "#ffffff" };
const POINT_LABEL: Record<PickPoint, string> = { black: "Black", grey: "Grey", white: "White" };
const PICK_TITLE: Record<PickScope, Record<PickPoint, string>> = {
  channel: {
    black: "Pick black point for the selected channel",
    grey: "Pick grey point for the selected channel",
    white: "Pick white point for the selected channel",
  },
  all: {
    black: "Pick black point for all channels",
    grey: "Pick grey point for all channels",
    white: "Pick white point for all channels",
  },
};

/** A number typed into a field and not yet applied. The ref outlives a render,
 *  so an Enter and the blur that follows it cannot apply it twice. */
interface TypedEdit {
  readonly label: string;
  readonly value: number;
  readonly set: (c: ChannelLevels, v: number) => ChannelLevels;
}

const asChannel = (v: string): Channel => CHANNELS.find((c) => c === v) ?? "value";
const shown = (v: number) => Math.round(v * DISPLAY_SCALE * 10) / 10;

export function LevelsPanel() {
  const { useEffect, useMemo, useRef, useState } = api().react;
  const { Button, NumberInput, Row, Section, SegmentedControl, Select, Stack, Toggle, tokens } = api().ui;
  const dev = api().stores.useDevelopStore;
  const scope = api().develop.useParamScope();
  const inMask = scope.maskId !== null;
  const photoId = dev((s) => s.photoId);
  const measured = store()((s) => s.frame);
  const channel = store()((s) => s.channel);
  const scale = store()((s) => s.scale);
  const picking = store()((s) => s.picking);
  const typed = useRef<TypedEdit | null>(null);
  const [draft, setDraft] = useState<{ label: string; value: number } | null>(null);

  useEffect(() => (inMask ? undefined : startLiveSampler()), [inMask]);
  useEffect(() => (inMask ? undefined : () => store().getState().setPicking(null)), [inMask]);

  const p = readParams(scope.getParams());
  const ch = p.channels[channel];
  const frame = measured && measured.photoId === photoId ? measured.readback : null;
  const hist = useMemo(
    () => (frame ? histogramsFromRgba(frame.data, frame.width, frame.height, p.linear) : null),
    [frame, p.linear],
  );

  // Drags outrun React's renders, so each change starts from the bag the
  // scope holds now rather than this render's snapshot.
  const live = (): LevelsParams => readParams(scope.getParams());
  const apply = (next: LevelsParams) => scope.setParams(bagPatch(next));
  const commit = (what: string) => scope.commit(`Tone Levels ${what}`);
  const editChannel = (update: (c: ChannelLevels) => ChannelLevels) => {
    const current = live();
    apply(withChannel(current, channel, update(current.channels[channel])));
  };

  const settleField = (label: string) => {
    const edit = typed.current;
    if (edit?.label !== label) return;
    typed.current = null;
    setDraft(null);
    editChannel((c) => edit.set(c, edit.value));
    commit(label.toLowerCase());
  };

  const field = (label: string, value: number, step: number, set: TypedEdit["set"]) =>
    h(NumberInput, {
      "aria-label": label,
      title: label,
      value: draft?.label === label ? draft.value : value,
      step,
      width: "52px",
      onChange: (v: number) => {
        typed.current = { label, value: v, set };
        setDraft({ label, value: v });
      },
      onBlur: () => settleField(label),
      onKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") settleField(label);
      },
    });

  const swatch = (point: PickPoint) =>
    h("span", {
      style: {
        display: "inline-block",
        width: 9,
        height: 9,
        marginRight: 4,
        verticalAlign: "-1px",
        background: POINT_FILL[point],
        border: `1px solid ${tokens.border}`,
      },
    });

  const pickButton = (point: PickPoint, scope: PickScope, label?: string) => {
    const armed = picking?.point === point && picking.scope === scope;
    return h(
      Button,
      {
        size: "sm",
        active: armed,
        "aria-pressed": armed,
        title: `${PICK_TITLE[scope][point]} (Esc cancels)`,
        "aria-label": PICK_TITLE[scope][point],
        onClick: () => store().getState().setPicking(armed ? null : { point, scope }),
      },
      swatch(point),
      label ?? null,
    );
  };

  const autoLevels = async () => {
    const wanted = measureSignature(dev.getState());
    if (!wanted) return;
    const stored = store().getState().frame;
    let f = stored && sameSignature(stored.signature, wanted) ? stored.readback : null;
    if (!f) {
      const fresh = await capturePreLevelsFrame();
      const now = measureSignature(dev.getState());
      if (!fresh || !now || !sameSignature(fresh.signature, now)) return;
      f = fresh.readback;
    }
    const current = live();
    apply(autoInputLevels(current, histogramsFromRgba(f.data, f.width, f.height, current.linear)));
    commit("auto input levels");
  };

  const gutter = (...children: (ReturnType<typeof h> | null)[]) =>
    h("div", { style: { padding: "0 5px", display: "flex", flexDirection: "column", gap: 2 } }, ...children);

  return h(
    Stack,
    { gap: 10, style: { padding: "6px 8px 8px" } },
    h(
      Row,
      { gap: 6 },
      h(
        "div",
        { style: { flex: "1 1 auto", minWidth: 0 } },
        h(Select, {
          value: channel,
          ariaLabel: "Channel",
          options: CHANNELS.map((c) => ({ value: c, label: CHANNEL_LABEL[c] })),
          onChange: (v: string) => store().getState().setChannel(asChannel(v)),
        }),
      ),
      h(
        Button,
        {
          size: "sm",
          title: "Reset this channel's levels",
          onClick: () => {
            apply(resetChannel(live(), channel));
            commit("reset channel");
          },
        },
        "Reset Channel",
      ),
    ),
    h(
      Row,
      { gap: 6 },
      h(
        "div",
        { style: { flex: "1 1 auto" } },
        h(SegmentedControl, {
          size: "sm",
          value: p.linear ? "linear" : "perceptual",
          options: [
            { value: "perceptual", label: "Perceptual", title: "Work on display-encoded values" },
            { value: "linear", label: "Linear", title: "Work on linear light" },
          ],
          onChange: (v: string) => {
            const linear = v === "linear";
            if (linear === live().linear) return;
            apply({ ...live(), linear });
            commit(linear ? "linear" : "perceptual");
          },
        }),
      ),
      h(SegmentedControl, {
        size: "sm",
        value: scale,
        options: [
          { value: "linear", label: "Lin", title: "Linear histogram" },
          { value: "log", label: "Log", title: "Logarithmic histogram" },
        ],
        onChange: (v: string) => store().getState().setScale(v === "log" ? "log" : "linear"),
      }),
    ),
    h(
      Section,
      { title: "Input Levels" },
      gutter(
        inMask ? null : h(HistogramView, { bins: hist ? hist[channel] : null, scale, channel }),
        h(GradientBar, { background: inputBarGradient(p, channel), label: "Input levels" }),
        h(HandleBar, {
          label: "Input levels handles",
          positions: inputHandlePositions(ch),
          onDrag: (i: number, pos: number) => editChannel((c) => dragInput(c, INPUT_HANDLES[i], pos)),
          onRelease: () => commit("input levels"),
        }),
      ),
      h(
        Row,
        { gap: 4, justify: "space-between" },
        h(
          Row,
          { gap: 2 },
          inMask ? null : pickButton("black", "channel"),
          field("Low input", shown(ch.lowInput), 1, (c, v) => ({ ...c, lowInput: clamp(v / DISPLAY_SCALE, 0, c.highInput) })),
        ),
        field("Gamma", Math.round(ch.gamma * 100) / 100, 0.01, (c, v) => ({ ...c, gamma: clamp(v, GAMMA_MIN, GAMMA_MAX) })),
        h(
          Row,
          { gap: 2 },
          field("High input", shown(ch.highInput), 1, (c, v) => ({ ...c, highInput: clamp(v / DISPLAY_SCALE, c.lowInput, 1) })),
          inMask ? null : pickButton("white", "channel"),
        ),
      ),
      h(Toggle, {
        checked: p.clampInput,
        label: "Clamp input",
        onChange: (checked: boolean) => {
          apply({ ...live(), clampInput: checked });
          commit("clamp input");
        },
      }),
    ),
    h(
      Section,
      { title: "Output Levels" },
      gutter(
        h(GradientBar, { background: outputBarGradient(channel), label: "Output levels" }),
        h(HandleBar, {
          label: "Output levels handles",
          positions: outputHandlePositions(ch),
          onDrag: (i: number, pos: number) => editChannel((c) => dragOutput(c, i === 0 ? "low" : "high", pos)),
          onRelease: () => commit("output levels"),
        }),
      ),
      h(
        Row,
        { gap: 4, justify: "space-between" },
        field("Low output", shown(ch.lowOutput), 1, (c, v) => ({ ...c, lowOutput: clamp(v / DISPLAY_SCALE, 0, 1) })),
        field("High output", shown(ch.highOutput), 1, (c, v) => ({ ...c, highOutput: clamp(v / DISPLAY_SCALE, 0, 1) })),
      ),
      h(Toggle, {
        checked: p.clampOutput,
        label: "Clamp output",
        onChange: (checked: boolean) => {
          apply({ ...live(), clampOutput: checked });
          commit("clamp output");
        },
      }),
    ),
    inMask ? null : h(
      Section,
      { title: "All Channels" },
      h(
        Button,
        { size: "sm", full: true, title: "Adjust levels for all channels automatically", onClick: () => void autoLevels() },
        "Auto Input Levels",
      ),
      h(Row, { gap: 4 }, pickButton("black", "all", POINT_LABEL.black), pickButton("grey", "all", POINT_LABEL.grey), pickButton("white", "all", POINT_LABEL.white)),
    ),
  );
}
