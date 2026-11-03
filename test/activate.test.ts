// What activate() registers under the extension id, the dock header's reset,
// and deactivate() tearing it all down.

import { afterEach, describe, expect, it, vi } from "vitest";
import { activate, deactivate } from "../src/index";
import { DEFAULT_PARAMS } from "../src/model";
import { LevelsPanel } from "../src/Panel";
import { STAGE_ID, UNIFORM_KEYS, qualified, readParams } from "../src/params";
import { store } from "../src/store";
import { fakeApi } from "./support/fake-api";

describe("activate", () => {
  afterEach(() => deactivate());

  it("registers the stage and the panel", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.stages.map((s) => s.id)).toEqual([STAGE_ID]);
    expect(rig.panels.length).toBe(1);
    expect(rig.panels[0]).toMatchObject({
      id: "tone-levels.panel",
      title: "Tone Levels",
      defaultDock: { module: "develop", direction: "right" },
    });
  });

  it("hands the canvas the pick-drag tool while a picker is armed", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.held()).toBeNull();
    store().getState().setPicking({ point: "grey", scope: "all" });
    expect(rig.held()).not.toBeNull();
  });

  it("offers the panel in masks, owning every key it writes", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.panels[0].mask?.component).toBe(LevelsPanel);
    expect([...(rig.panels[0].mask?.owns ?? [])].sort()).toEqual(UNIFORM_KEYS.map(qualified).sort());
  });

  it("docks the panel after core Tone Curve (order 6)", () => {
    const rig = fakeApi();
    activate(rig.api);
    expect(rig.panels[0].defaultDock?.order).toBe(6.5);
  });

  it("resets every key from the dock header in one commit", () => {
    const rig = fakeApi({ [qualified("redGamma")]: 2, [qualified("linear")]: 1 });
    activate(rig.api);
    rig.panels[0].onReset?.();
    expect(readParams(rig.develop.getState().paramBag)).toEqual(DEFAULT_PARAMS);
    expect(rig.commits).toEqual(["Tone Levels reset"]);
  });

  it("disarms the picker, lets go of its tool and drops the stage on deactivate", () => {
    const rig = fakeApi();
    activate(rig.api);
    store().getState().setPicking({ point: "black", scope: "all" });
    deactivate();
    expect(store().getState().picking).toBeNull();
    expect(rig.held()).toBeNull();
    expect(rig.unregisteredStages).toEqual([STAGE_ID]);
  });
});

describe("deactivate", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does nothing and throws nothing when activate() never ran", async () => {
    vi.resetModules();
    const fresh = await import("../src/index");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => fresh.deactivate()).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns, rather than throws, when a teardown call fails", () => {
    const rig = fakeApi();
    rig.api.unregisterProcessingStage = () => {
      throw new Error("host gone");
    };
    activate(rig.api);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => deactivate()).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("[tone-levels] deactivate failed:", expect.any(Error));
  });
});
