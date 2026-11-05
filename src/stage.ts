// The GPU side: one inline stage on the display-encoded colour. `space` names
// the display domain's own encoding, so the core adds no conversion; declaring
// it opts into unclamped values on version 2 photos, which is what gives Clamp
// input and Clamp output their meaning. The block runs only while some key
// differs from its default, so an untouched photo renders bit-exact.

import { KEY_SPECS, STAGE_ID, keyRange } from "./params";
import type { ProcessingStageContribution, UniformDeclaration } from "./safelight";

/** A GLSL float literal at full single precision, always with a decimal
 *  point (GLSL ES never promotes an integer literal to float). */
export function glslLiteral(v: number): string {
  const s = v.toPrecision(10);
  if (!s.includes("e")) return s.includes(".") ? s : `${s}.0`;
  const [mantissa, exponent] = s.split("e");
  return `${mantissa.includes(".") ? mantissa : `${mantissa}.0`}e${exponent}`;
}

// The host rewrites every whole-word match of a uniform key, helpers
// included, so no helper or parameter may share a key's name.
const HELPERS = `
float tlMap(float v, float lo, float hi, float ci, float ig, float olo, float ohi, float co) {
  v = hi != lo ? (v - lo) / (hi - lo) : v - lo;
  if (ci > 0.5) v = clamp(v, 0.0, 1.0);
  if (ig != 1.0 && v > 0.0) v = pow(v, ig);
  v = ohi >= olo ? v * (ohi - olo) + olo : olo - v * (olo - ohi);
  if (co > 0.5) v = clamp(v, 0.0, 1.0);
  return v;
}
vec3 tlDecode(vec3 y) {
  vec3 a = abs(y);
  return sign(y) * mix(a / 12.92, pow((a + 0.055) / 1.055, vec3(2.4)), step(0.04045, a));
}
vec3 tlEncode(vec3 x) {
  vec3 a = abs(x);
  return sign(x) * mix(a * 12.92, 1.055 * pow(a, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, a));
}
`;

/** A key clamped to its range on `version`. The host binds bag values as
 *  stored, with no range check, so the shader clamps them as readParams does
 *  on the CPU. */
const bounded = (key: string, version: number): string => {
  const spec = KEY_SPECS.find((s) => s.key === key);
  if (!spec) throw new Error(`[tone-levels] no spec for ${key}`);
  const { min, max } = keyRange(spec, version);
  return `clamp(${key}, ${glslLiteral(min)}, ${glslLiteral(max)})`;
};

const map = (channel: string, v: string, version: number) => {
  const k = (field: string) => bounded(`${channel}${field}`, version);
  return `tlMap(${v}, ${k("LowInput")}, ${k("HighInput")}, clampInput, 1.0 / ${k("Gamma")}, ${k("LowOutput")}, ${k("HighOutput")}, clampOutput)`;
};

const levels = (version: number) =>
  `    v = vec3(${map("red", "v.r", version)}, ${map("green", "v.g", version)}, ${map("blue", "v.b", version)});
    v = vec3(${map("value", "v.r", version)}, ${map("value", "v.g", version)}, ${map("value", "v.b", version)});`;

const GATE = KEY_SPECS.map((s) => `${s.key} != ${glslLiteral(s.default)}`).join(" || ");

// Version 1 keeps exactly the shader its photos were edited with.
const GLSL = `
{
  if (${GATE}) {
    vec3 v = linear > 0.5 ? tlDecode(c) : c;
#if SL_PROCESS_VERSION >= 2
${levels(2)}
#else
${levels(1)}
#endif
    c = linear > 0.5 ? tlEncode(v) : v;
  }
}
`;

function uniforms(): UniformDeclaration[] {
  return KEY_SPECS.map((s) => ({
    key: s.key,
    glslType: "float",
    default: s.default,
    range: { ...s.full, step: s.step },
    label: s.label,
  }));
}

export function levelsStage(): ProcessingStageContribution {
  return {
    id: STAGE_ID,
    name: "Tone Levels",
    phase: "display-adjust",
    glsl: GLSL,
    helpers: HELPERS,
    uniforms: uniforms(),
    presetScope: "global",
    space: { encoding: "perceptual" },
    // A mask's copy runs at the defaults until its levels move, so the gate
    // keeps an untouched mask bit-exact too.
    mask: { maskable: true },
  };
}
