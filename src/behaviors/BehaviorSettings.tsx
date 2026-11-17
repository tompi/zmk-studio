// Runtime settings of behaviors, such as a hold-tap's tapping term. Only firmware
// with the behavior settings RPCs offers them; on other firmware the button is hidden.

import { useEffect, useState } from "react";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import type { BehaviorSetting } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

import { GenericModal } from "../GenericModal";
import { useModalRef } from "../misc/useModalRef";

import {
  BehaviorMap,
  BehaviorWithSettings,
  useBehaviorSettings,
} from "./useBehaviorSettings";

// Help for the settings ZMK's hold-tap offers, keyed by the name the firmware reports
const SETTING_HELP: Record<string, string> = {
  "Tapping term":
    "How long the key must be held before it counts as a hold.",
  "Quick tap":
    "Tapping and then holding the key within this time repeats the tap instead of holding. 0 turns it off.",
  "Require prior idle":
    "If another key was pressed within this time before, the key always taps. Helps against accidental mods while typing fast. 0 turns it off.",
  Flavor:
    "How the key decides between hold and tap when other keys are pressed while it is held.",
  "Hold trigger on release":
    "Decide on the hold when the other key is released, rather than pressed. Makes chording mods across the same hand easier.",
  "Retro tap":
    "If the key is held past the tapping term and released without pressing another key, send the tap anyway.",
};

const inputClass =
  "rounded bg-base-200 border border-base-300 px-2 py-1 text-sm";

function RangeSetting({
  setting,
  onChange,
}: {
  setting: BehaviorSetting;
  onChange: (v: number) => void;
}) {
  const { min, max, unit } = setting.range!;
  // Drafts follow the slider and the number box; the device is only told once
  // the user lets go, so a drag doesn't flood it with requests
  const [draft, setDraft] = useState(String(setting.value));
  useEffect(() => setDraft(String(setting.value)), [setting.value]);

  const commit = (raw: string) => {
    const v = Math.round(Number(raw));
    if (raw.trim() === "" || !Number.isFinite(v)) {
      setDraft(String(setting.value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, v));
    setDraft(String(clamped));
    onChange(clamped);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        className="flex-1 accent-primary"
        min={min}
        max={max}
        step={max - min > 200 ? 5 : 1}
        value={Number(draft) || 0}
        aria-label={setting.name}
        onChange={(e) => setDraft(e.target.value)}
        onPointerUp={(e) => commit(e.currentTarget.value)}
        onKeyUp={(e) => commit(e.currentTarget.value)}
      />
      <input
        type="number"
        className={`${inputClass} w-20 text-right`}
        min={min}
        max={max}
        value={draft}
        aria-label={`${setting.name} value`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget.value);
        }}
      />
      <span className="w-6 text-sm opacity-70">{unit}</span>
    </div>
  );
}

function SettingControl({
  setting,
  onChange,
}: {
  setting: BehaviorSetting;
  onChange: (v: number) => void;
}) {
  if (setting.range) {
    return <RangeSetting setting={setting} onChange={onChange} />;
  }

  if (setting.options) {
    return (
      <select
        className={inputClass}
        value={setting.value}
        aria-label={setting.name}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {setting.options.options.map((o, i) => (
          <option key={i} value={i}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (setting.toggle) {
    return (
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={setting.value !== 0}
        aria-label={setting.name}
        onChange={(e) => onChange(e.target.checked ? 1 : 0)}
      />
    );
  }

  return <span className="text-sm opacity-70">{setting.value}</span>;
}

function describeDefault(setting: BehaviorSetting): string {
  if (setting.options) {
    return setting.options.options[setting.defaultValue] ?? String(setting.defaultValue);
  }
  if (setting.toggle) {
    return setting.defaultValue ? "on" : "off";
  }
  return `${setting.defaultValue}${setting.range?.unit ? " " + setting.range.unit : ""}`;
}

export function BehaviorSettingsPanel({
  behaviors,
  onChange,
}: {
  behaviors: BehaviorWithSettings[];
  onChange: (behaviorId: number, settingId: number, value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {behaviors.map((b) => (
        <section key={b.id} className="flex flex-col gap-2">
          <h3 className="font-semibold">{b.displayName}</h3>
          <div className="grid grid-cols-[13rem_1fr_auto] items-center gap-x-3 gap-y-2">
            {b.settings.map((s) => {
              const isDefault = s.value === s.defaultValue;
              return (
                <div key={s.id} className="contents">
                  <label className="text-sm" title={SETTING_HELP[s.name]}>
                    {s.name}
                    {!isDefault && <span className="text-primary"> •</span>}
                  </label>
                  <SettingControl
                    setting={s}
                    onChange={(v) => onChange(b.id, s.id, v)}
                  />
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-base-300 disabled:opacity-0"
                    disabled={isDefault}
                    title={`Back to the default (${describeDefault(s)})`}
                    aria-label={`Reset ${s.name} to default`}
                    onClick={() => onChange(b.id, s.id, s.defaultValue)}
                  >
                    <RotateCcw className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <p className="text-sm opacity-70">
        Changes take effect right away. Save them to keep them after the keyboard
        restarts; a dot marks values that differ from the keymap's default.
      </p>
    </div>
  );
}

const buttonClass =
  "flex flex-1 items-center justify-center gap-1 px-2 py-1 text-sm rounded hover:bg-base-300 disabled:opacity-50";

export function BehaviorSettingsButton({ behaviors }: { behaviors: BehaviorMap }) {
  const [list, setSetting] = useBehaviorSettings(behaviors);
  const [open, setOpen] = useState(false);
  const ref = useModalRef(open, true);

  if (list.length === 0) return null;

  return (
    <>
      <button
        type="button"
        className={buttonClass}
        onClick={() => setOpen(true)}
        title="Timings and other settings of behaviors such as mod-tap"
      >
        <SlidersHorizontal className="size-4" /> Behavior settings
      </button>
      <GenericModal
        ref={ref}
        className="w-[36rem] max-w-[calc(100vw-2rem)]"
        onClose={() => setOpen(false)}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg">Behavior settings</h2>
          <button
            type="button"
            className="px-2 py-1 rounded hover:bg-base-300"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
        <BehaviorSettingsPanel behaviors={list} onChange={setSetting} />
      </GenericModal>
    </>
  );
}
