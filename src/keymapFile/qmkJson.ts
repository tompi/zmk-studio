// Convert keymaps to and from QMK Configurator's keymap JSON format.
//
// Keys QMK has an equivalent for are written as QMK keycodes (KC_A, LT(1,KC_SPC),
// LSFT_T(KC_A), ...). ZMK-only behaviors are written as ZMK(<behavior>,<params>),
// which QMK Configurator keeps as a custom "ANY" key and we can read back.

import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type {
  BehaviorBinding,
  Keymap,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { validateValue } from "../behaviors/parameters";
import { isVialFile, readVialFile, VialFile } from "./vial";
import {
  MOD_BITS,
  MOD_NAMES,
  modFunctionBits,
  modifierKeyUsage,
  qmkToUsage,
  usageAsModBits,
  usageToQmk,
} from "./qmkKeycodes";

export type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;

export interface QmkKeymapFile {
  version: number;
  notes: string;
  documentation: string;
  keyboard: string;
  keymap: string;
  layout: string;
  layers: string[][];
  author: string;
  // Extra ZMK Studio data; QMK Configurator ignores it
  zmk_studio?: { layer_names?: string[] };
}

// Behavior display names as ZMK reports them
const KEY_PRESS = "Key Press";
const MOMENTARY_LAYER = "Momentary Layer";
const LAYER_TAP = "Layer-Tap";
const MOD_TAP = "Mod-Tap";
const TOGGLE_LAYER = "Toggle Layer";
const TO_LAYER = "To Layer";
const STICKY_LAYER = "Sticky Layer";
const STICKY_KEY = "Sticky Key";
const TRANSPARENT = "Transparent";
const NONE = "None";

const LAYER_FUNCTIONS: Record<string, string> = {
  MO: MOMENTARY_LAYER,
  TG: TOGGLE_LAYER,
  TO: TO_LAYER,
  OSL: STICKY_LAYER,
};

// Behaviors without parameters that QMK has a keycode for: [behavior, QMK keycode, ...aliases]
const SIMPLE: [string, string, ...string[]][] = [
  [TRANSPARENT, "KC_TRNS", "_______", "KC_TRANSPARENT"],
  [NONE, "KC_NO", "XXXXXXX"],
  ["Bootloader", "QK_BOOT", "QK_BOOTLOADER", "RESET"],
  ["Reset", "QK_RBT", "QK_REBOOT"],
  ["Caps Word", "CW_TOGG", "QK_CAPS_WORD_TOGGLE"],
  ["Key Repeat", "QK_REP", "QK_REPEAT_KEY"],
  ["Grave/Escape", "QK_GESC", "KC_GESC", "GRAVE_ESC"],
];

// Mod-tap names other than the plain modifier names, e.g. SFT_T(KC_A)
const MOD_TAP_ALIASES: Record<string, number> = {
  CTL: MOD_BITS.LCTL,
  SFT: MOD_BITS.LSFT,
  ALT: MOD_BITS.LALT,
  OPT: MOD_BITS.LALT,
  GUI: MOD_BITS.LGUI,
  CMD: MOD_BITS.LGUI,
  WIN: MOD_BITS.LGUI,
  ALL: MOD_BITS.LCTL | MOD_BITS.LSFT | MOD_BITS.LALT | MOD_BITS.LGUI,
};

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// ---------- Export ----------

function modBitsToQmk(bits: number): string {
  return MOD_NAMES.filter((m) => bits & MOD_BITS[m])
    .map((m) => `MOD_${m}`)
    .join("|");
}

function genericBinding(
  binding: BehaviorBinding,
  behavior: GetBehaviorDetailsResponse | undefined,
  layerIds: number[]
): string {
  if (!behavior) {
    return `ZMK(#${binding.behaviorId},${binding.param1},${binding.param2})`;
  }

  const layerIndex = (id: number) => layerIds.indexOf(id);
  const set =
    behavior.metadata.find((s) =>
      validateValue(layerIds, binding.param1, s.param1)
    ) ?? behavior.metadata[0];

  const encode = (value: number, descs: typeof set.param1) => {
    if (descs?.some((d) => d.layerId) && layerIndex(value) >= 0) {
      return `L${layerIndex(value)}`;
    }
    if (descs?.some((d) => d.hidUsage)) {
      return usageToQmk(value) ?? `0x${value.toString(16)}`;
    }
    return value.toString();
  };

  const params: string[] = [];
  const used = (descs?: typeof set.param1) =>
    !!descs?.length && !descs.every((d) => d.nil);
  if (used(set?.param1)) params.push(encode(binding.param1, set.param1));
  if (used(set?.param2)) params.push(encode(binding.param2, set.param2));

  return `ZMK(${[behavior.displayName, ...params].join(",")})`;
}

export function bindingToQmk(
  binding: BehaviorBinding,
  behavior: GetBehaviorDetailsResponse | undefined,
  layerIds: number[]
): string {
  const layerIndex = (id: number) => layerIds.indexOf(id);
  const name = behavior?.displayName ?? "";
  const is = (n: string) => sameName(name, n);
  const { param1, param2 } = binding;

  const simple = SIMPLE.find(([b]) => is(b));
  if (simple) return simple[1];

  if (is(KEY_PRESS)) {
    const kc = usageToQmk(param1);
    if (kc) return kc;
  }

  for (const [fn, behaviorName] of Object.entries(LAYER_FUNCTIONS)) {
    if (is(behaviorName) && layerIndex(param1) >= 0) {
      return `${fn}(${layerIndex(param1)})`;
    }
  }

  if (is(LAYER_TAP) && layerIndex(param1) >= 0) {
    const tap = usageToQmk(param2);
    if (tap) return `LT(${layerIndex(param1)},${tap})`;
  }

  if (is(MOD_TAP)) {
    const hold = usageAsModBits(param1);
    const tap = usageToQmk(param2);
    if (hold !== undefined && tap) {
      const single = MOD_NAMES.find((m) => MOD_BITS[m] === hold);
      return single ? `${single}_T(${tap})` : `MT(${modBitsToQmk(hold)},${tap})`;
    }
  }

  if (is(STICKY_KEY)) {
    const mods = usageAsModBits(param1);
    if (mods !== undefined) return `OSM(${modBitsToQmk(mods)})`;
  }

  return genericBinding(binding, behavior, layerIds);
}

export function exportQmkKeymap(
  keymap: Keymap,
  behaviors: BehaviorMap,
  keyboard: string,
  layout: string
): QmkKeymapFile {
  const layerIds = keymap.layers.map((l) => l.id);

  return {
    version: 1,
    notes: "Exported from ZMK Studio",
    documentation:
      "This file is a QMK Configurator compatible keymap exported from ZMK Studio. ZMK-only keys are written as ZMK(...).",
    keyboard,
    keymap: `${keyboard.replace(/\//g, "_")}_zmk_studio`,
    layout,
    layers: keymap.layers.map((layer) =>
      layer.bindings.map((b) =>
        bindingToQmk(b, behaviors[b.behaviorId], layerIds)
      )
    ),
    author: "",
    zmk_studio: { layer_names: keymap.layers.map((l) => l.name) },
  };
}

// Best guess at the QMK keyboard and layout names, so QMK Configurator can open the file
const KNOWN_KEYBOARDS: [RegExp, number, string, string][] = [
  [/corne|crkbd/i, 42, "crkbd/rev1", "LAYOUT_split_3x6_3"],
  [/corne|crkbd/i, 36, "crkbd/rev1", "LAYOUT_split_3x5_3"],
  [/lily58/i, 58, "lily58/rev1", "LAYOUT"],
  [/sofle/i, 58, "sofle/rev1", "LAYOUT"],
  [/kyria/i, 50, "splitkb/kyria/rev3", "LAYOUT"],
];

export function guessQmkKeyboard(
  deviceName: string,
  keyCount: number
): { keyboard: string; layout: string } {
  const known = KNOWN_KEYBOARDS.find(
    ([re, count]) => re.test(deviceName) && count === keyCount
  );
  if (known) return { keyboard: known[2], layout: known[3] };
  return {
    keyboard: deviceName.toLowerCase().replace(/[^a-z0-9/_]+/g, "_"),
    layout: "LAYOUT",
  };
}

// ---------- Import ----------

export interface ImportContext {
  behaviors: BehaviorMap;
  // Layer id for a layer index, if that layer exists
  layerId: (index: number) => number | undefined;
}

// Split "a,b(c,d),e" into ["a", "b(c,d)", "e"]
function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (s[i] === "," && depth === 0) {
      out.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(s.slice(start).trim());
  return out.filter((a) => a !== "");
}

// A modifier key usage holding all the given mods, e.g. LSFT|LCTL -> LC(LSHIFT)
function modBitsToUsage(bits: number): number {
  const lowest = bits & -bits;
  return modifierKeyUsage(lowest) + (bits & ~lowest) * 0x1000000;
}

function parseModMask(s: string): number | undefined {
  let bits = 0;
  for (const part of s.split("|").map((p) => p.trim())) {
    const b = modFunctionBits(part.replace(/^MOD_/, ""));
    if (b === undefined) return undefined;
    bits |= b;
  }
  return bits || undefined;
}

class ImportError extends Error {}

// Binding for a QMK keycode. Throws ImportError with a reason if it can't be converted.
export function qmkToBinding(
  rawCode: string,
  ctx: ImportContext
): BehaviorBinding {
  let code = rawCode.trim();
  // QMK Configurator wraps custom keycodes in ANY(...)
  const any = /^ANY\((.*)\)$/s.exec(code);
  if (any) code = any[1].trim();

  const behaviorId = (name: string) => {
    const b = Object.values(ctx.behaviors).find((b) =>
      sameName(b.displayName, name)
    );
    if (!b) throw new ImportError(`this keyboard has no "${name}" behavior`);
    return b.id;
  };
  const bind = (name: string, param1 = 0, param2 = 0): BehaviorBinding => ({
    behaviorId: behaviorId(name),
    param1,
    param2,
  });
  const layer = (s: string) => {
    const index = Number(s.replace(/^L/, ""));
    const id = Number.isInteger(index) ? ctx.layerId(index) : undefined;
    if (id === undefined) throw new ImportError(`there is no layer ${s}`);
    return id;
  };
  const key = (s: string) => {
    const u = qmkToUsage(s);
    if (u === undefined) throw new ImportError(`unknown keycode ${s}`);
    return u;
  };

  const simple = SIMPLE.find(([, ...codes]) => codes.includes(code));
  if (simple) return bind(simple[0]);

  if (/^(TD\(\d+\)|M\d+|USER\d+)$/.test(code)) {
    throw new ImportError("tap dances, macros and custom keycodes can't be imported");
  }

  const usage = qmkToUsage(code);
  if (usage !== undefined) return bind(KEY_PRESS, usage);

  const fn = /^(\w+)\((.*)\)$/s.exec(code);
  if (!fn) throw new ImportError(`unknown keycode ${code}`);
  const [, name, argString] = fn;
  const args = splitArgs(argString);

  if (LAYER_FUNCTIONS[name] && args.length === 1) {
    return bind(LAYER_FUNCTIONS[name], layer(args[0]));
  }
  if (name === "LT" && args.length === 2) {
    return bind(LAYER_TAP, layer(args[0]), key(args[1]));
  }
  // Vial writes layer-taps as LT1(KC_A)
  const vialLt = /^LT(\d+)$/.exec(name);
  if (vialLt && args.length === 1) {
    return bind(LAYER_TAP, layer(vialLt[1]), key(args[0]));
  }
  if (name === "MT" && args.length === 2) {
    const bits = parseModMask(args[0]);
    if (bits === undefined) throw new ImportError(`unknown modifiers ${args[0]}`);
    return bind(MOD_TAP, modBitsToUsage(bits), key(args[1]));
  }
  if (name.endsWith("_T") && args.length === 1) {
    const base = name.slice(0, -2);
    const bits = modFunctionBits(base) ?? MOD_TAP_ALIASES[base];
    if (bits !== undefined) {
      return bind(MOD_TAP, modBitsToUsage(bits), key(args[0]));
    }
  }
  if (name === "OSM" && args.length === 1) {
    const bits = parseModMask(args[0]);
    if (bits === undefined) throw new ImportError(`unknown modifiers ${args[0]}`);
    return bind(STICKY_KEY, modBitsToUsage(bits));
  }

  if (name === "ZMK" && args.length >= 1) {
    const [behaviorName, ...params] = args;
    const parseParam = (p: string | undefined) => {
      if (p === undefined) return 0;
      if (/^L\d+$/.test(p)) return layer(p);
      if (/^(0x[0-9a-f]+|\d+)$/i.test(p)) return Number(p);
      return key(p);
    };
    const id = /^#\d+$/.test(behaviorName)
      ? Number(behaviorName.slice(1))
      : behaviorId(behaviorName);
    if (!ctx.behaviors[id]) {
      throw new ImportError(`this keyboard has no behavior ${behaviorName}`);
    }
    return { behaviorId: id, param1: parseParam(params[0]), param2: parseParam(params[1]) };
  }

  throw new ImportError(`unknown keycode ${code}`);
}

export function isImportError(e: unknown): e is Error {
  return e instanceof ImportError;
}

export interface ParsedKeymapFile {
  layers: string[][];
  layerNames?: string[];
  // Problems found while reading the file, shown along with the import result
  warnings?: string[];
}

export type KeymapFileContents =
  | { kind: "layers"; file: ParsedKeymapFile }
  // Vial files need the keyboard's matrix map before they can be imported
  | { kind: "vial"; vial: VialFile };

// Read a QMK Configurator, ZMK Studio or Vial keymap file
export function parseKeymapFile(text: string): KeymapFileContents {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("The file isn't valid JSON.");
  }

  if (isVialFile(json)) {
    return { kind: "vial", vial: readVialFile(json) };
  }

  const file = json as Partial<QmkKeymapFile>;
  if (
    !Array.isArray(file?.layers) ||
    !file.layers.every(
      (l) => Array.isArray(l) && l.every((k) => typeof k === "string")
    )
  ) {
    throw new Error(
      "The file doesn't look like a QMK Configurator or Vial keymap."
    );
  }

  const names = file.zmk_studio?.layer_names;
  return {
    kind: "layers",
    file: {
      layers: file.layers,
      layerNames:
        Array.isArray(names) && names.every((n) => typeof n === "string")
          ? names
          : undefined,
    },
  };
}
