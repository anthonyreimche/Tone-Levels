// The GPU stage as a contract: one inline display-adjust stage on the
// perceptual encoding, its uniforms exactly the bag keys with GIMP's defaults,
// the default gate, each channel then Value, GLSL literals with decimal
// points, no texture fetches, and helper names clear of the keys the host
// rewrites.

import { describe, expect, it } from "vitest";
import { KEY_SPECS, STAGE_ID, SWITCHES, UNIFORM_KEYS } from "../src/params";
import { glslLiteral, levelsStage } from "../src/stage";

const specOf = (key: string) => {
  const spec = KEY_SPECS.find((s) => s.key === key);
  if (!spec) throw new Error(`no spec for ${key}`);
  return spec;
};

/** The shader's clamp of one key to its spec range, as the stage writes it. */
const bounded = (key: string): string => {
  const spec = specOf(key);
  return `clamp(${key}, ${glslLiteral(spec.min)}, ${glslLiteral(spec.max)})`;
};

describe("glslLiteral", () => {
  it("always carries a decimal point", () => {
    expect(glslLiteral(0)).toBe("0.000000000");
    expect(glslLiteral(1)).toBe("1.000000000");
    expect(glslLiteral(0.5)).toBe("0.5000000000");
    expect(glslLiteral(1.17549435e-38)).toMatch(/^1\.17549435\d*e-38$/);
  });
});

describe("levels stage", () => {
  const stage = levelsStage();
  const source = `${stage.glsl}\n${stage.helpers ?? ""}`;

  it("is one inline display-adjust stage on the perceptual encoding", () => {
    expect(stage.id).toBe(STAGE_ID);
    expect(stage.name).toBe("Tone Levels");
    expect(stage.phase).toBe("display-adjust");
    expect(stage.space).toEqual({ encoding: "perceptual" });
    expect(stage.presetScope).toBe("global");
    expect(Object.keys(stage).sort()).toEqual(["glsl", "helpers", "id", "name", "phase", "presetScope", "space", "uniforms"]);
    expect(source).not.toMatch(/\btexture\s*\(|\breadPrev\b|\bstageResult\b/);
  });

  it("declares exactly the bag keys as float uniforms with GIMP's defaults and ranges", () => {
    expect(stage.uniforms.map((u) => u.key)).toEqual([...UNIFORM_KEYS]);
    for (const u of stage.uniforms) expect(u.glslType).toBe("float");
    const byKey = Object.fromEntries(stage.uniforms.map((u) => [u.key, u]));
    expect(byKey.valueGamma).toMatchObject({ default: 1, range: { min: 0.1, max: 10, step: 0.01 }, label: "Value gamma" });
    expect(byKey.redHighInput).toMatchObject({ default: 1, range: { min: 0, max: 1 }, label: "Red high input" });
    expect(byKey.blueLowOutput).toMatchObject({ default: 0, range: { min: 0, max: 1 } });
    expect(byKey.linear).toMatchObject({ default: 0, range: { min: 0, max: 1, step: 1 }, label: "Linear" });
  });

  it("enters its block only when some key leaves its default", () => {
    for (const u of stage.uniforms) expect(stage.glsl).toContain(`${u.key} != ${glslLiteral(Number(u.default))}`);
    expect(stage.glsl).toMatch(/if \(valueLowInput != /);
  });

  it("runs each channel's levels, then Value's, and decodes for Linear", () => {
    const own = stage.glsl.indexOf(`v = vec3(tlMap(v.r, ${bounded("redLowInput")}`);
    const value = stage.glsl.indexOf(`v = vec3(tlMap(v.r, ${bounded("valueLowInput")}`);
    expect(own).toBeGreaterThan(0);
    expect(value).toBeGreaterThan(own);
    expect(stage.glsl).toContain("vec3 v = linear > 0.5 ? tlDecode(c) : c;");
    expect(stage.glsl).toContain("c = linear > 0.5 ? tlEncode(v) : v;");
    expect(stage.glsl).toContain(`1.0 / ${bounded("greenGamma")}`);
  });

  it("clamps every channel key to its readParams range in the shader, literals from KEY_SPECS", () => {
    const channelSpecs = KEY_SPECS.filter((s) => !SWITCHES.some((w) => w === s.key));
    expect(channelSpecs.length).toBe(20);
    for (const s of channelSpecs) {
      expect(stage.glsl).toContain(`clamp(${s.key}, ${glslLiteral(s.min)}, ${glslLiteral(s.max)})`);
    }
  });

  it("writes every number with a decimal point", () => {
    expect(source.match(/(?<![\w.])\d+(?![\w.])/g) ?? []).toEqual([]);
  });

  it("keeps helper names and parameters clear of the uniform keys", () => {
    const helpers = stage.helpers ?? "";
    for (const key of UNIFORM_KEYS) expect(helpers).not.toMatch(new RegExp(`\\b${key}\\b`));
  });
});
