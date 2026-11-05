// The GPU stage as a contract: one inline display-adjust stage on the
// perceptual encoding, its uniforms exactly the bag keys with GIMP's defaults,
// the default gate, each channel then Value, GLSL literals with decimal
// points, no texture fetches, and helper names clear of the keys the host
// rewrites. Version 1 photos compile exactly the shader they were edited
// with; version 2 lets the input points leave 0..1.

import { describe, expect, it } from "vitest";
import v1Shader from "./fixtures/levels-v1.json";
import { FULL_INPUT_RANGE, KEY_SPECS, STAGE_ID, SWITCHES, UNIFORM_KEYS } from "../src/params";
import { glslLiteral, levelsStage } from "../src/stage";

const specOf = (key: string) => {
  const spec = KEY_SPECS.find((s) => s.key === key);
  if (!spec) throw new Error(`no spec for ${key}`);
  return spec;
};

/** The shader's clamp of one key to its range on `version`, as the stage writes it. */
const bounded = (key: string, version = 1): string => {
  const spec = specOf(key);
  const { min, max } = version >= 2 ? spec.full : spec;
  return `clamp(${key}, ${glslLiteral(min)}, ${glslLiteral(max)})`;
};

/** The source as the GLSL preprocessor leaves it for one process version:
 *  only `#if SL_PROCESS_VERSION >= n`, `#else` and `#endif`, unnested. */
function forVersion(source: string, version: number): string {
  const out: string[] = [];
  let keep = true;
  for (const line of source.split("\n")) {
    const test = /^\s*#if SL_PROCESS_VERSION >= (\d+)\s*$/.exec(line);
    if (test) keep = version >= Number(test[1]);
    else if (/^\s*#else\s*$/.test(line)) keep = !keep;
    else if (/^\s*#endif\s*$/.test(line)) keep = true;
    else if (keep) out.push(line);
  }
  return out.join("\n");
}

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
  const source = `${stage.glsl}\n// helpers\n${stage.helpers ?? ""}`;
  const v1 = forVersion(stage.glsl, 1);
  const v2 = forVersion(stage.glsl, 2);

  it("compiles the unchanged shader for version 1 photos", () => {
    // levels-v1.json holds the stage's glsl and helpers as 1.1.1 shipped them.
    expect(forVersion(source, 1)).toBe(v1Shader.source);
  });

  it("puts each directive on a line of its own and compares with >=", () => {
    const directives = source.split("\n").filter((l) => l.includes("#"));
    expect(directives.map((l) => l.trim())).toEqual(["#if SL_PROCESS_VERSION >= 2", "#else", "#endif"]);
  });

  it("runs again inside masks", () => {
    expect(stage.mask).toEqual({ maskable: true });
  });

  it("is one inline display-adjust stage on the perceptual encoding", () => {
    expect(stage.id).toBe(STAGE_ID);
    expect(stage.name).toBe("Tone Levels");
    expect(stage.phase).toBe("display-adjust");
    expect(stage.space).toEqual({ encoding: "perceptual" });
    expect(stage.presetScope).toBe("global");
    expect(Object.keys(stage).sort()).toEqual(["glsl", "helpers", "id", "mask", "name", "phase", "presetScope", "space", "uniforms"]);
    expect(source).not.toMatch(/\btexture\s*\(|\breadPrev\b|\bstageResult\b/);
  });

  it("declares exactly the bag keys as float uniforms with GIMP's defaults and ranges", () => {
    expect(stage.uniforms.map((u) => u.key)).toEqual([...UNIFORM_KEYS]);
    for (const u of stage.uniforms) expect(u.glslType).toBe("float");
    const byKey = Object.fromEntries(stage.uniforms.map((u) => [u.key, u]));
    expect(byKey.valueGamma).toMatchObject({ default: 1, range: { min: 0.1, max: 10, step: 0.01 }, label: "Value gamma" });
    expect(byKey.redHighInput).toMatchObject({ default: 1, range: FULL_INPUT_RANGE, label: "Red high input" });
    expect(byKey.greenLowInput).toMatchObject({ default: 0, range: FULL_INPUT_RANGE });
    expect(byKey.blueLowOutput).toMatchObject({ default: 0, range: { min: 0, max: 1 } });
    expect(byKey.linear).toMatchObject({ default: 0, range: { min: 0, max: 1, step: 1 }, label: "Linear" });
  });

  it("enters its block only when some key leaves its default", () => {
    for (const u of stage.uniforms) expect(stage.glsl).toContain(`${u.key} != ${glslLiteral(Number(u.default))}`);
    expect(stage.glsl).toMatch(/if \(valueLowInput != /);
  });

  it("runs each channel's levels, then Value's, and decodes for Linear", () => {
    for (const [version, glsl] of [[1, v1], [2, v2]] as const) {
      const own = glsl.indexOf(`v = vec3(tlMap(v.r, ${bounded("redLowInput", version)}`);
      const value = glsl.indexOf(`v = vec3(tlMap(v.r, ${bounded("valueLowInput", version)}`);
      expect(own).toBeGreaterThan(0);
      expect(value).toBeGreaterThan(own);
      expect(glsl).toContain("vec3 v = linear > 0.5 ? tlDecode(c) : c;");
      expect(glsl).toContain("c = linear > 0.5 ? tlEncode(v) : v;");
      expect(glsl).toContain(`1.0 / ${bounded("greenGamma", version)}`);
    }
  });

  it("clamps every channel key to its readParams range for each version, literals from KEY_SPECS", () => {
    const channelSpecs = KEY_SPECS.filter((s) => !SWITCHES.some((w) => w === s.key));
    expect(channelSpecs.length).toBe(20);
    for (const s of channelSpecs) {
      expect(v1).toContain(`clamp(${s.key}, ${glslLiteral(s.min)}, ${glslLiteral(s.max)})`);
      expect(v2).toContain(`clamp(${s.key}, ${glslLiteral(s.full.min)}, ${glslLiteral(s.full.max)})`);
    }
    expect(v2).toContain(`clamp(redHighInput, ${glslLiteral(FULL_INPUT_RANGE.min)}, ${glslLiteral(FULL_INPUT_RANGE.max)})`);
    expect(v2).toContain("clamp(redHighOutput, 0.000000000, 1.000000000)");
  });

  it("writes every number with a decimal point", () => {
    const code = source.split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n");
    expect(code.match(/(?<![\w.])\d+(?![\w.])/g) ?? []).toEqual([]);
  });

  it("keeps helper names and parameters clear of the uniform keys", () => {
    const helpers = stage.helpers ?? "";
    for (const key of UNIFORM_KEYS) expect(helpers).not.toMatch(new RegExp(`\\b${key}\\b`));
  });
});
