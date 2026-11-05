// Tabs of keys to pick from below the keymap, like QMK Configurator's keycode
// keyboards. Clicking one sets the selected key in the keymap to it.

import { ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Tab, TabList, TabPanel, Tabs } from "react-aria-components";
import type {
  BehaviorParameterValueDescription,
  GetBehaviorDetailsResponse,
} from "@zmkfirmware/zmk-studio-ts-client/behaviors";
import type { BehaviorBinding } from "@zmkfirmware/zmk-studio-ts-client/keymap";

import { Key } from "./Key";
import { FitText } from "./FitText";
import {
  cc,
  CONSUMER_PAGE,
  findKeyPress,
  kb,
  KEYBOARD_PAGE,
  LEFT_SHIFT_FLAG,
  SHIFTED_LABELS,
  withMods,
} from "./keyCodes";
import {
  hid_usage_page_and_id_from_usage,
  hid_usage_page_get_ids,
} from "../hid-usages";
import { useLocalStorageState } from "../misc/useLocalStorageState";

type BehaviorMap = Record<number, GetBehaviorDetailsResponse>;
type Layer = { id: number; name: string };

// ---------- Key layouts ----------

// [label, usage, width, height]; a number on its own is a gap of that many keys.
// "\n" in a label puts the parts on separate lines (shifted symbol on top).
type Spec = [string, number, number?, number?] | number;

interface GridKey {
  label: string;
  usage: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

function grid(rows: [number, Spec[]][]): GridKey[] {
  const keys: GridKey[] = [];
  for (const [y, specs] of rows) {
    let x = 0;
    for (const s of specs) {
      if (typeof s === "number") {
        x += s;
        continue;
      }
      const [label, usage, w = 1, h = 1] = s;
      keys.push({ label, usage, x, y, w, h });
      x += w;
    }
  }
  return keys;
}

const k = (label: string, id: number, w?: number, h?: number): Spec => [
  label,
  kb(id),
  w,
  h,
];
const shifted = (id: number): Spec => [
  SHIFTED_LABELS[id],
  withMods(kb(id), LEFT_SHIFT_FLAG),
];
const media = (label: string, id: number): Spec => [label, cc(id)];
const range = (labels: string[], firstId: number) =>
  labels.map((l, i) => k(l, firstId + i));

const LETTERS = (s: string) =>
  [...s].map((c) => k(c, 0x04 + c.charCodeAt(0) - 65));

const BASIC = grid([
  [
    0,
    [
      k("Esc", 0x29),
      1,
      ...range(["F1", "F2", "F3", "F4"], 0x3a),
      0.5,
      ...range(["F5", "F6", "F7", "F8"], 0x3e),
      0.5,
      ...range(["F9", "F10", "F11", "F12"], 0x42),
      0.25,
      k("PrScr", 0x46),
      k("ScrLk", 0x47),
      k("Pause", 0x48),
    ],
  ],
  [
    1.25,
    [
      k("~\n`", 0x35),
      ...range(
        ["!\n1", "@\n2", "#\n3", "$\n4", "%\n5", "^\n6", "&\n7", "*\n8", "(\n9", ")\n0"],
        0x1e
      ),
      k("_\n-", 0x2d),
      k("+\n=", 0x2e),
      k("Bksp", 0x2a, 2),
      0.25,
      k("Ins", 0x49),
      k("Home", 0x4a),
      k("PgUp", 0x4b),
      0.25,
      k("Num", 0x53),
      k("/", 0x54),
      k("*", 0x55),
      k("-", 0x56),
    ],
  ],
  [
    2.25,
    [
      k("Tab", 0x2b, 1.5),
      k("Q", 0x14),
      k("W", 0x1a),
      k("E", 0x08),
      k("R", 0x15),
      k("T", 0x17),
      k("Y", 0x1c),
      k("U", 0x18),
      k("I", 0x0c),
      k("O", 0x12),
      k("P", 0x13),
      k("{\n[", 0x2f),
      k("}\n]", 0x30),
      k("|\n\\", 0x31, 1.5),
      0.25,
      k("Del", 0x4c),
      k("End", 0x4d),
      k("PgDn", 0x4e),
      0.25,
      k("7", 0x5f),
      k("8", 0x60),
      k("9", 0x61),
      k("+", 0x57, 1, 2),
    ],
  ],
  [
    3.25,
    [
      k("Caps", 0x39, 1.75),
      ...LETTERS("ASDFGHJKL"),
      k(":\n;", 0x33),
      k("\"\n'", 0x34),
      k("Enter", 0x28, 2.25),
      3.5,
      k("4", 0x5c),
      k("5", 0x5d),
      k("6", 0x5e),
    ],
  ],
  [
    4.25,
    [
      k("Shift", 0xe1, 2.25),
      ...LETTERS("ZXCVBNM"),
      k("<\n,", 0x36),
      k(">\n.", 0x37),
      k("?\n/", 0x38),
      k("Shift", 0xe5, 2.75),
      1.25,
      k("↑", 0x52),
      1.25,
      k("1", 0x59),
      k("2", 0x5a),
      k("3", 0x5b),
      k("Enter", 0x58, 1, 2),
    ],
  ],
  [
    5.25,
    [
      k("Ctrl", 0xe0, 1.25),
      k("GUI", 0xe3, 1.25),
      k("Alt", 0xe2, 1.25),
      k("Space", 0x2c, 6.25),
      k("AltGr", 0xe6, 1.25),
      k("GUI", 0xe7, 1.25),
      k("Menu", 0x65, 1.25),
      k("Ctrl", 0xe4, 1.25),
      0.25,
      k("←", 0x50),
      k("↓", 0x51),
      k("→", 0x4f),
      0.25,
      k("0", 0x62, 2),
      k(".", 0x63),
    ],
  ],
]);

const EXTRA = grid([
  [
    0,
    range(
      ["F13", "F14", "F15", "F16", "F17", "F18", "F19", "F20", "F21", "F22", "F23", "F24"],
      0x68
    ),
  ],
  [
    1.25,
    [0x35, 0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x2d, 0x2e].map(
      shifted
    ),
  ],
  [2.25, [0x2f, 0x30, 0x31, 0x33, 0x34, 0x36, 0x37, 0x38].map(shifted)],
  [
    3.5,
    [
      k("ISO \\", 0x64),
      k("ISO #", 0x32),
      0.5,
      k("ろ", 0x87),
      k("かな", 0x88),
      k("¥", 0x89),
      k("変換", 0x8a),
      k("無変換", 0x8b),
      k("한/英 かな", 0x90, 1.5),
      k("漢字 英数", 0x91, 1.5),
    ],
  ],
  [
    4.75,
    [
      k("Undo", 0x7a),
      k("Cut", 0x7b),
      k("Copy", 0x7c),
      k("Paste", 0x7d),
      k("Find", 0x7e),
      k("Again", 0x79),
      0.5,
      k("Help", 0x75),
      k("Menu", 0x76),
      k("Select", 0x77),
      k("Stop", 0x78),
      k("Exec", 0x74),
      0.5,
      k("Power", 0x66),
      k("KP =", 0x67),
      k("KP ,", 0x85),
    ],
  ],
]);

const MEDIA = grid([
  [
    0,
    [
      media("🔇", 0xe2),
      media("🔉", 0xea),
      media("🔊", 0xe9),
      0.5,
      media("⏮", 0xb6),
      media("⏯", 0xcd),
      media("⏭", 0xb5),
      media("⏹", 0xb7),
      0.5,
      media("⏪", 0xb4),
      media("⏩", 0xb3),
      media("⏏", 0xb8),
      0.5,
      media("🔅", 0x70),
      media("🔆", 0x6f),
    ],
  ],
  [
    1.25,
    [
      media("Home", 0x223),
      media("Back", 0x224),
      media("Fwd", 0x225),
      media("Reload", 0x227),
      media("Search", 0x221),
      0.5,
      media("Calc", 0x192),
      media("Mail", 0x18a),
      media("Files", 0x194),
      media("Lock", 0x19e),
    ],
  ],
]);

// ---------- Behaviors ----------

interface Choice {
  value: number;
  label: string;
}

// Every value a parameter can take, or undefined if it can't be listed (e.g. a key)
function paramChoices(
  descs: BehaviorParameterValueDescription[] | undefined,
  layers: Layer[]
): Choice[] | undefined {
  if (!descs || descs.length === 0) return [{ value: 0, label: "" }];
  const out: Choice[] = [];
  for (const d of descs) {
    if (d.nil) {
      out.push({ value: 0, label: "" });
    } else if (d.constant !== undefined) {
      out.push({ value: d.constant, label: d.name });
    } else if (d.layerId) {
      layers.forEach((l, i) =>
        out.push({ value: l.id, label: l.name || i.toString() })
      );
    } else if (d.range) {
      if (d.range.max - d.range.min > 15) return undefined;
      for (let v = d.range.min; v <= d.range.max; v++) {
        out.push({ value: v, label: v.toString() });
      }
    } else {
      return undefined;
    }
  }
  return out;
}

interface BehaviorKey {
  label: string;
  binding: BehaviorBinding;
}

function behaviorKeys(
  behavior: GetBehaviorDetailsResponse,
  layers: Layer[]
): BehaviorKey[] {
  const bind = (param1 = 0, param2 = 0) => ({
    behaviorId: behavior.id,
    param1,
    param2,
  });
  if (behavior.metadata.length === 0) {
    return [{ label: "", binding: bind() }];
  }

  const keys: BehaviorKey[] = [];
  const seen = new Set<string>();
  for (const set of behavior.metadata) {
    const first = paramChoices(set.param1, layers);
    const second = paramChoices(set.param2, layers);
    if (!first || !second) continue;
    for (const a of first) {
      for (const b of second) {
        const id = `${a.value},${b.value}`;
        if (seen.has(id)) continue;
        seen.add(id);
        keys.push({
          label: [a.label, b.label].filter(Boolean).join(" "),
          binding: bind(a.value, b.value),
        });
      }
    }
  }
  return keys.slice(0, 40);
}

// Most used first, then by name
const BEHAVIOR_ORDER = [
  "Transparent",
  "None",
  "Momentary Layer",
  "Toggle Layer",
  "To Layer",
  "Sticky Layer",
];
const behaviorRank = (b: GetBehaviorDetailsResponse) => {
  const i = BEHAVIOR_ORDER.indexOf(b.displayName);
  return i < 0 ? BEHAVIOR_ORDER.length : i;
};

// ---------- Helpers ----------

// Whether the keyboard's Key Press behavior accepts this usage
function usageAllowed(keyPress: GetBehaviorDetailsResponse, usage: number) {
  const hid = keyPress.metadata
    .flatMap((s) => s.param1)
    .find((d) => d.hidUsage)?.hidUsage;
  if (!hid) return false;
  const [page, id] = hid_usage_page_and_id_from_usage(usage);
  const max =
    (page & 0xff) === KEYBOARD_PAGE
      ? hid.keyboardMax
      : page === CONSUMER_PAGE
      ? hid.consumerMax
      : 0;
  // Modifiers sit above most keyboards' max, but are always allowed
  const isModifier = (page & 0xff) === KEYBOARD_PAGE && id >= 0xe0 && id <= 0xe7;
  return isModifier || !max || id <= max;
}

function usageName(usage: number) {
  const [page, id] = hid_usage_page_and_id_from_usage(usage);
  return hid_usage_page_get_ids(page & 0xff)?.UsageIds.find((u) => u.Id === id)
    ?.Name;
}

const sameBinding = (a: BehaviorBinding | null, b: BehaviorBinding) =>
  !!a &&
  a.behaviorId === b.behaviorId &&
  (a.param1 >>> 0) === (b.param1 >>> 0) &&
  (a.param2 >>> 0) === (b.param2 >>> 0);

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const Label = ({ text }: { text: string }) => (
  <div className="flex flex-col items-center leading-tight max-w-full px-[2px]">
    {text.split("\n").map((line, i) => (
      <FitText key={i} className="max-w-full">
        {line}
      </FitText>
    ))}
  </div>
);

interface PaletteKeyProps {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  oneU: number;
  title?: string;
  header?: string;
  disabled?: boolean;
  selected?: boolean;
  onClick: () => void;
  children: ReactNode;
}

const PaletteKey = ({
  x,
  y,
  w = 1,
  h = 1,
  oneU,
  title,
  header,
  disabled,
  selected,
  onClick,
  children,
}: PaletteKeyProps) => (
  <div
    title={title}
    className={`${x !== undefined ? "absolute" : ""} hover:z-10 ${
      disabled ? "opacity-40 pointer-events-none" : ""
    }`}
    style={
      x !== undefined ? { left: x * oneU, top: (y ?? 0) * oneU } : undefined
    }
  >
    <Key
      width={w}
      height={h}
      oneU={oneU}
      header={header}
      selected={selected}
      onClick={onClick}
    >
      {children}
    </Key>
  </div>
);

// ---------- Component ----------

export interface KeyPaletteProps {
  behaviors: BehaviorMap;
  layers: Layer[];
  // Binding of the selected key; null when no key is selected
  selectedBinding: BehaviorBinding | null;
  onPick: (binding: BehaviorBinding) => void;
}

const GridPanel = ({
  keys,
  keyPress,
  selectedBinding,
  onPick,
}: {
  keys: GridKey[];
  keyPress?: GetBehaviorDetailsResponse;
  selectedBinding: BehaviorBinding | null;
  onPick: (binding: BehaviorBinding) => void;
}) => {
  const [ref, width] = useWidth();
  const units = Math.max(...keys.map((k) => k.x + k.w));
  const rows = Math.max(...keys.map((k) => k.y + k.h));
  const oneU = Math.max(26, Math.min(44, Math.floor(width / units)));

  return (
    <div ref={ref} className="w-full">
      <div
        className="relative mx-auto"
        style={{ width: units * oneU, height: rows * oneU }}
      >
        {keys.map((key, i) => {
          const binding = keyPress && {
            behaviorId: keyPress.id,
            param1: key.usage,
            param2: 0,
          };
          const enabled =
            !!binding && !!selectedBinding && usageAllowed(keyPress, key.usage);
          return (
            <PaletteKey
              key={i}
              x={key.x}
              y={key.y}
              w={key.w}
              h={key.h}
              oneU={oneU}
              title={usageName(key.usage)}
              disabled={!enabled}
              selected={!!binding && sameBinding(selectedBinding, binding)}
              onClick={() => binding && onPick(binding)}
            >
              <Label text={key.label} />
            </PaletteKey>
          );
        })}
      </div>
    </div>
  );
};

const BehaviorsPanel = ({
  behaviors,
  layers,
  selectedBinding,
  onPick,
}: Omit<KeyPaletteProps, "behaviors"> & { behaviors: BehaviorMap }) => {
  const groups = useMemo(
    () =>
      Object.values(behaviors)
        .map((b) => ({ behavior: b, keys: behaviorKeys(b, layers) }))
        .filter((g) => g.keys.length > 0)
        .sort(
          (a, b) =>
            behaviorRank(a.behavior) - behaviorRank(b.behavior) ||
            a.behavior.displayName.localeCompare(b.behavior.displayName)
        ),
    [behaviors, layers]
  );

  if (groups.length === 0) {
    return <p className="text-base-content/60 p-2">No behaviors to show.</p>;
  }

  return (
    <div className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 items-center">
      {groups.map(({ behavior, keys }) => (
        <div key={behavior.id} className="contents">
          <div className="text-sm text-base-content/70">
            {behavior.displayName}
          </div>
          <div className="flex flex-wrap">
            {keys.map(({ label, binding }, i) => (
              <PaletteKey
                key={i}
                w={label.length > 10 ? 2 : label ? 1.25 : 1.5}
                oneU={40}
                header={label ? behavior.displayName : undefined}
                title={[behavior.displayName, label].filter(Boolean).join(": ")}
                disabled={!selectedBinding}
                selected={sameBinding(selectedBinding, binding)}
                onClick={() => onPick(binding)}
              >
                <Label text={label || behavior.displayName} />
              </PaletteKey>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const TABS = [
  { id: "basic", label: "Basic" },
  { id: "extra", label: "Symbols & International" },
  { id: "media", label: "Media & Apps" },
  { id: "behaviors", label: "Layers & Behaviors" },
];

export const KeyPalette = ({
  behaviors,
  layers,
  selectedBinding,
  onPick,
}: KeyPaletteProps) => {
  const [tab, setTab] = useLocalStorageState<string>("keyPaletteTab", "basic");
  const keyPress = useMemo(() => findKeyPress(behaviors), [behaviors]);

  const grids: Record<string, GridKey[]> = {
    basic: BASIC,
    extra: EXTRA,
    media: MEDIA,
  };

  return (
    <Tabs
      selectedKey={TABS.some((t) => t.id === tab) ? tab : "basic"}
      onSelectionChange={(k) => setTab(String(k))}
      className="flex flex-col gap-2"
    >
      <div className="flex items-center gap-4 flex-wrap">
        <TabList aria-label="Key groups" className="flex gap-1">
          {TABS.map((t) => (
            <Tab
              key={t.id}
              id={t.id}
              className="px-3 py-1 rounded cursor-pointer outline-none text-sm rac-hover:bg-base-300 rac-selected:bg-primary rac-selected:text-primary-content rac-focus-visible:ring-2"
            >
              {t.label}
            </Tab>
          ))}
        </TabList>
        <span className="text-sm text-base-content/60">
          {selectedBinding
            ? "Click a key below, or press a key on your keyboard, to set the selected key"
            : "Select a key above to change it"}
        </span>
      </div>
      {TABS.map((t) => (
        <TabPanel key={t.id} id={t.id} className="outline-none">
          {t.id === "behaviors" ? (
            <BehaviorsPanel
              behaviors={behaviors}
              layers={layers}
              selectedBinding={selectedBinding}
              onPick={onPick}
            />
          ) : (
            <GridPanel
              keys={grids[t.id]}
              keyPress={keyPress}
              selectedBinding={selectedBinding}
              onPick={onPick}
            />
          )}
        </TabPanel>
      ))}
    </Tabs>
  );
};
