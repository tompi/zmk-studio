// HID usages for the key palette and for assigning keys by typing them.

import type { GetBehaviorDetailsResponse } from "@zmkfirmware/zmk-studio-ts-client/behaviors";

export const findKeyPress = (
  behaviors: Record<number, GetBehaviorDetailsResponse>
) => Object.values(behaviors).find((b) => b.displayName === "Key Press");

export const KEYBOARD_PAGE = 7;
export const CONSUMER_PAGE = 12;

// Full HID usage (page in the upper 16 bits) for a keyboard or consumer key
export const kb = (id: number) => (KEYBOARD_PAGE << 16) | id;
export const cc = (id: number) => (CONSUMER_PAGE << 16) | id;

// Implicit modifiers are stored in the top byte of a usage, e.g. LS(N1) for "!"
export const LEFT_SHIFT_FLAG = 0x02;
export const RIGHT_SHIFT_FLAG = 0x20;
export const withMods = (usage: number, flags: number) =>
  (usage | (flags << 24)) >>> 0;

// What a key types with Shift held, on a US layout
export const SHIFTED_LABELS: Record<number, string> = {
  0x1e: "!",
  0x1f: "@",
  0x20: "#",
  0x21: "$",
  0x22: "%",
  0x23: "^",
  0x24: "&",
  0x25: "*",
  0x26: "(",
  0x27: ")",
  0x2d: "_",
  0x2e: "+",
  0x2f: "{",
  0x30: "}",
  0x31: "|",
  0x33: ":",
  0x34: '"',
  0x35: "~",
  0x36: "<",
  0x37: ">",
  0x38: "?",
};

// KeyboardEvent.code -> HID usage. `code` is the physical key, which is also what
// the keyboard sends, so this doesn't depend on the OS keyboard layout.
const CODES: Record<string, number> = {
  Enter: kb(0x28),
  Escape: kb(0x29),
  Backspace: kb(0x2a),
  Tab: kb(0x2b),
  Space: kb(0x2c),
  Minus: kb(0x2d),
  Equal: kb(0x2e),
  BracketLeft: kb(0x2f),
  BracketRight: kb(0x30),
  Backslash: kb(0x31),
  Semicolon: kb(0x33),
  Quote: kb(0x34),
  Backquote: kb(0x35),
  Comma: kb(0x36),
  Period: kb(0x37),
  Slash: kb(0x38),
  CapsLock: kb(0x39),
  PrintScreen: kb(0x46),
  ScrollLock: kb(0x47),
  Pause: kb(0x48),
  Insert: kb(0x49),
  Home: kb(0x4a),
  PageUp: kb(0x4b),
  Delete: kb(0x4c),
  End: kb(0x4d),
  PageDown: kb(0x4e),
  ArrowRight: kb(0x4f),
  ArrowLeft: kb(0x50),
  ArrowDown: kb(0x51),
  ArrowUp: kb(0x52),
  NumLock: kb(0x53),
  NumpadDivide: kb(0x54),
  NumpadMultiply: kb(0x55),
  NumpadSubtract: kb(0x56),
  NumpadAdd: kb(0x57),
  NumpadEnter: kb(0x58),
  Numpad0: kb(0x62),
  NumpadDecimal: kb(0x63),
  IntlBackslash: kb(0x64),
  ContextMenu: kb(0x65),
  Power: kb(0x66),
  NumpadEqual: kb(0x67),
  NumpadComma: kb(0x85),
  IntlRo: kb(0x87),
  KanaMode: kb(0x88),
  IntlYen: kb(0x89),
  Convert: kb(0x8a),
  NonConvert: kb(0x8b),
  Lang1: kb(0x90),
  Lang2: kb(0x91),
  ControlLeft: kb(0xe0),
  ShiftLeft: kb(0xe1),
  AltLeft: kb(0xe2),
  MetaLeft: kb(0xe3),
  ControlRight: kb(0xe4),
  ShiftRight: kb(0xe5),
  AltRight: kb(0xe6),
  MetaRight: kb(0xe7),
  AudioVolumeMute: cc(0xe2),
  AudioVolumeUp: cc(0xe9),
  AudioVolumeDown: cc(0xea),
  MediaPlayPause: cc(0xcd),
  MediaTrackNext: cc(0xb5),
  MediaTrackPrevious: cc(0xb6),
  MediaStop: cc(0xb7),
};
for (let i = 0; i < 26; i++) {
  CODES[`Key${String.fromCharCode(65 + i)}`] = kb(0x04 + i);
}
for (let i = 1; i <= 9; i++) {
  CODES[`Digit${i}`] = kb(0x1d + i);
  CODES[`Numpad${i}`] = kb(0x58 + i);
}
CODES.Digit0 = kb(0x27);
for (let i = 1; i <= 12; i++) CODES[`F${i}`] = kb(0x39 + i);
for (let i = 13; i <= 24; i++) CODES[`F${i}`] = kb(0x68 + i - 13);

export const usageForEventCode = (code: string): number | undefined =>
  CODES[code];

export const isModifierCode = (code: string) =>
  /^(Control|Shift|Alt|Meta)(Left|Right)$/.test(code);
