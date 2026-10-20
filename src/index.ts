// Tone Levels, a Safelight extension (GPL-3.0-or-later).
//
// A port of GIMP's Levels tool: per-channel input and output levels over the
// image's histogram, Auto Input Levels and the black, grey and white
// eyedroppers. Registers the display-adjust stage (stage.ts), the Develop
// panel (Panel.ts) and the eyedropper overlay (picker.ts).

import { LevelsPanel } from "./Panel";
import { EXT_ID, STAGE_ID, resetPatch } from "./params";
import { PickerOverlay } from "./picker";
import { api, initRuntime } from "./runtime";
import type { SafelightAPI } from "./safelight";
import { levelsStage } from "./stage";
import { initStore, store } from "./store";

const PANEL_ID = `${EXT_ID}.panel`;
const PICKER_ID = `${EXT_ID}.picker`;

// Named apart from activate()'s `host` parameter; null until activate() runs.
let activeHost: SafelightAPI | null = null;

function reset(): void {
  const dev = api().stores.useDevelopStore.getState();
  dev.setDynParams(resetPatch());
  void dev.commitEdit("Tone Levels reset");
}

export function activate(host: SafelightAPI): void {
  initRuntime(host);
  initStore();
  activeHost = host;
  host.registerProcessingStage(levelsStage());
  host.registerPanel({
    id: PANEL_ID,
    title: "Tone Levels",
    component: LevelsPanel,
    // After core Tone Curve (order 6) by design, not by a registration-order tie.
    defaultDock: { module: "develop", direction: "right", order: 6.5, width: 268 },
    onReset: reset,
  });
  host.registerSlot({ id: PICKER_ID, slot: "develop-canvas-overlay", component: PickerOverlay, order: 60 });
}

export function deactivate(): void {
  // activate() never ran, or deactivate() already ran: nothing to tear down.
  const host = activeHost;
  if (!host) return;
  activeHost = null;
  // The explicit unregisters run before the host sweeps this extension's
  // registrations on disable or uninstall, which keeps a re-enable clean. A
  // throw here would skip that sweep, so a failure is logged instead.
  try {
    store().getState().setPicking(null);
    host.unregisterProcessingStage(STAGE_ID);
    host.unregisterSlot(PICKER_ID);
  } catch (err) {
    console.warn("[tone-levels] deactivate failed:", err);
  }
}
