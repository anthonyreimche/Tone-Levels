// @vitest-environment jsdom
// The eyedropper overlay's render gate: armed and not cropping it covers the
// canvas; while the Crop tool is open it draws nothing (the view then shows a
// widened crop the pre-Levels sample does not match), and while a core tool
// (Mask, Heal) or a core picker (white balance, HSL) is active it draws
// nothing so their clicks reach the canvas. It stays armed throughout, so the
// overlay returns when the other tool closes.

import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PickerOverlay } from "../src/picker";
import { initRuntime } from "../src/runtime";
import { initStore, store } from "../src/store";
import { fakeApi, type Rig } from "./support/fake-api";

describe("PickerOverlay", () => {
  let rig: Rig;
  beforeEach(() => {
    rig = fakeApi();
    initRuntime(rig.api);
    initStore();
    store().getState().setPicking({ point: "black", scope: "channel" });
  });
  afterEach(() => cleanup());

  it("covers the canvas while armed", () => {
    const { container } = render(React.createElement(PickerOverlay));
    expect(container.firstChild).not.toBeNull();
  });

  it("draws nothing while the Crop tool is open and stays armed", () => {
    const { container } = render(React.createElement(PickerOverlay));
    act(() => rig.develop.setState({ cropping: true }));
    expect(container.innerHTML).toBe("");
    expect(store().getState().picking).not.toBeNull();
    act(() => rig.develop.setState({ cropping: false }));
    expect(container.firstChild).not.toBeNull();
  });

  it.each([
    ["the Mask tool", { activeTool: "mask" }, { activeTool: "none" }],
    ["the Retouch tool", { activeTool: "retouch" }, { activeTool: "none" }],
    ["the HSL picker tool", { activeTool: "hsl-picker" }, { activeTool: "none" }],
    ["the white balance picker", { wbPicking: true }, { wbPicking: false }],
    ["the HSL picker", { hslPicking: true }, { hslPicking: false }],
  ] as const)("draws nothing while %s is active and stays armed", (_name, active, cleared) => {
    const { container } = render(React.createElement(PickerOverlay));
    expect(container.firstChild).not.toBeNull();
    act(() => rig.develop.setState(active));
    expect(container.innerHTML).toBe("");
    expect(store().getState().picking).not.toBeNull();
    act(() => rig.develop.setState(cleared));
    expect(container.firstChild).not.toBeNull();
  });
});
