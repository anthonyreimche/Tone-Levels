// The bars' colours as GIMP draws them: the input bar previews map_input (in
// grey for Value, all three channels' maps for a colour channel), the output
// bar runs from black to the channel's colour.

import { describe, expect, it } from "vitest";
import { inputBarGradient, outputBarGradient } from "../src/Bars";
import { DEFAULT_CHANNEL, DEFAULT_PARAMS, withChannel } from "../src/model";

describe("inputBarGradient", () => {
  it("previews map_input in grey for Value", () => {
    expect(inputBarGradient(DEFAULT_PARAMS, "value", 3)).toBe(
      "linear-gradient(to right, rgb(0, 0, 0) 0.00%, rgb(127, 127, 127) 50.00%, rgb(255, 255, 255) 100.00%)",
    );
  });

  it("shows all three channels' input maps for a colour channel", () => {
    const p = withChannel(DEFAULT_PARAMS, "red", { ...DEFAULT_CHANNEL, lowInput: 0.5 });
    expect(inputBarGradient(p, "green", 3)).toBe(
      "linear-gradient(to right, rgb(0, 0, 0) 0.00%, rgb(0, 127, 127) 50.00%, rgb(255, 255, 255) 100.00%)",
    );
  });
});

describe("outputBarGradient", () => {
  it("runs from black to the channel's colour", () => {
    expect(outputBarGradient("value")).toBe("linear-gradient(to right, #000000, #ffffff)");
    expect(outputBarGradient("red")).toBe("linear-gradient(to right, #000000, #ff0000)");
    expect(outputBarGradient("green")).toBe("linear-gradient(to right, #000000, #00ff00)");
  });
});
