// Behavior settings (tapping term etc.) in keymap files.
//
// Both QMK Configurator and Vial exports store them under zmk_studio.behavior_settings,
// by behavior and setting name (local IDs differ between keyboards):
//   { "Mod-Tap": { "Tapping term": 200, "Flavor": "Tap-preferred", "Retro tap": false } }
// Vial exports also fill in Vial's own QMK settings where QMK has an equivalent, and
// Vial files without ZMK Studio's data are read from those.

import type { BehaviorSetting } from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorWithSettings } from "../behaviors/useBehaviorSettings";

export type SettingFileValue = number | boolean | string;
export type BehaviorSettingsFile = Record<string, Record<string, SettingFileValue>>;

// Names the firmware's hold-tap uses (behavior_hold_tap.c)
const MOD_TAP = "Mod-Tap";
const LAYER_TAP = "Layer-Tap";
const TAPPING_TERM = "Tapping term";
const FLAVOR = "Flavor";
const RETRO_TAP = "Retro tap";
const HOLD_PREFERRED = "Hold-preferred";
const BALANCED = "Balanced";
const TAP_PREFERRED = "Tap-preferred";

// Vial's QMK settings (vial-qmk quantum/qmk_settings.c)
const QSID_TAPPING_TERM = "7";
const QSID_TAPPING = "8";
const TAPPING_PERMISSIVE_HOLD = 1;
// Set means hold-on-other-key-press is off
const TAPPING_NO_HOLD_ON_OTHER_KEY = 2;
const TAPPING_RETRO = 8;

function toFileValue(s: BehaviorSetting): SettingFileValue {
  if (s.options) return s.options.options[s.value] ?? s.value;
  if (s.toggle) return s.value !== 0;
  return s.value;
}

// The setting's device value for a file value, or an explanation of why it doesn't fit
function fromFileValue(s: BehaviorSetting, v: SettingFileValue): number | string {
  if (s.options) {
    const i =
      typeof v === "string"
        ? s.options.options.findIndex((o) => o.toLowerCase() === v.toLowerCase())
        : -1;
    return i >= 0 ? i : `"${v}" isn't one of ${s.options.options.join(", ")}`;
  }
  if (s.toggle) {
    return typeof v === "boolean" ? Number(v) : `${v} isn't on or off`;
  }
  if (s.range) {
    if (typeof v !== "number" || !Number.isInteger(v)) return `${v} isn't a whole number`;
    const { min, max } = s.range;
    return v >= min && v <= max ? v : `${v} is outside ${min}–${max}`;
  }
  return "the keyboard doesn't say what values it takes";
}

export function settingsToFile(list: BehaviorWithSettings[]): BehaviorSettingsFile | undefined {
  if (!list.length) return undefined;
  return Object.fromEntries(
    list.map((b) => [
      b.displayName,
      Object.fromEntries(b.settings.map((s) => [s.name, toFileValue(s)])),
    ])
  );
}

const isFileValue = (v: unknown): v is SettingFileValue =>
  typeof v === "number" || typeof v === "boolean" || typeof v === "string";

export function readSettingsFile(json: unknown): BehaviorSettingsFile | undefined {
  if (!json || typeof json !== "object" || Array.isArray(json)) return undefined;

  const result: BehaviorSettingsFile = {};
  for (const [behavior, settings] of Object.entries(json)) {
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) continue;
    const values = Object.entries(settings).filter(
      (e): e is [string, SettingFileValue] => isFileValue(e[1])
    );
    if (values.length) result[behavior] = Object.fromEntries(values);
  }
  return Object.keys(result).length ? result : undefined;
}

// ---------- Vial ----------

// QMK has one tapping term and set of tap-hold options for every key, so take them
// from mod-tap (or layer-tap if there's no mod-tap)
export function settingsToVial(list: BehaviorWithSettings[]): Record<string, number> | undefined {
  const holdTap =
    list.find((b) => b.displayName === MOD_TAP) ??
    list.find((b) => b.displayName === LAYER_TAP);
  if (!holdTap) return undefined;

  const get = (name: string) => holdTap.settings.find((s) => s.name === name);
  const term = get(TAPPING_TERM);
  const flavor = get(FLAVOR);
  const retro = get(RETRO_TAP);

  const result: Record<string, number> = {};
  if (term) result[QSID_TAPPING_TERM] = term.value;

  if (flavor?.options || retro) {
    const flavorName = flavor?.options?.options[flavor.value];
    let tapping = 0;
    // Hold-preferred (and tap-unless-interrupted) is QMK's hold-on-other-key-press;
    // balanced is permissive hold; tap-preferred is QMK's default without either
    if (flavorName === BALANCED) {
      tapping |= TAPPING_NO_HOLD_ON_OTHER_KEY | TAPPING_PERMISSIVE_HOLD;
    } else if (flavorName === TAP_PREFERRED) {
      tapping |= TAPPING_NO_HOLD_ON_OTHER_KEY;
    }
    if (retro?.value) tapping |= TAPPING_RETRO;
    result[QSID_TAPPING] = tapping;
  }

  return Object.keys(result).length ? result : undefined;
}

// Vial's settings as ZMK settings, applied to both mod-tap and layer-tap
export function vialToSettings(json: unknown): BehaviorSettingsFile | undefined {
  if (!json || typeof json !== "object") return undefined;
  const s = json as Record<string, unknown>;

  const holdTap: Record<string, SettingFileValue> = {};
  const term = s[QSID_TAPPING_TERM];
  if (typeof term === "number" && Number.isInteger(term)) {
    holdTap[TAPPING_TERM] = term;
  }

  const tapping = s[QSID_TAPPING];
  if (typeof tapping === "number" && Number.isInteger(tapping)) {
    holdTap[FLAVOR] = !(tapping & TAPPING_NO_HOLD_ON_OTHER_KEY)
      ? HOLD_PREFERRED
      : tapping & TAPPING_PERMISSIVE_HOLD
        ? BALANCED
        : TAP_PREFERRED;
    holdTap[RETRO_TAP] = (tapping & TAPPING_RETRO) !== 0;
  }

  return Object.keys(holdTap).length
    ? { [MOD_TAP]: holdTap, [LAYER_TAP]: { ...holdTap } }
    : undefined;
}

// ---------- Import ----------

export interface SettingChange {
  behaviorId: number;
  settingId: number;
  value: number;
  oldValue: number;
}

// What importing the file's settings would change on the keyboard
export function planSettingsChanges(
  file: BehaviorSettingsFile,
  list: BehaviorWithSettings[]
): { changes: SettingChange[]; warnings: string[] } {
  const changes: SettingChange[] = [];
  const warnings: string[] = [];

  for (const [behaviorName, values] of Object.entries(file)) {
    const behavior = list.find((b) => b.displayName === behaviorName);
    if (!behavior) {
      warnings.push(
        `The file has settings for ${behaviorName}, which this keyboard doesn't offer settings for. They were skipped.`
      );
      continue;
    }

    for (const [settingName, fileValue] of Object.entries(values)) {
      const setting = behavior.settings.find((s) => s.name === settingName);
      if (!setting) {
        warnings.push(`${behaviorName} has no setting "${settingName}" on this keyboard. It was skipped.`);
        continue;
      }

      const value = fromFileValue(setting, fileValue);
      if (typeof value === "string") {
        warnings.push(`${behaviorName} ${settingName.toLowerCase()} was skipped: ${value}.`);
        continue;
      }
      if (value !== setting.value) {
        changes.push({
          behaviorId: behavior.id,
          settingId: setting.id,
          value,
          oldValue: setting.value,
        });
      }
    }
  }

  return { changes, warnings };
}
