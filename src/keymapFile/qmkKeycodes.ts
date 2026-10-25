// Mapping between ZMK HID usages and QMK keycode names.
//
// A ZMK HID usage packs implicit modifiers, usage page and usage id into one number:
//   bits 24-31: modifiers (see MOD_BITS), bits 16-23: usage page, bits 0-15: usage id

const KEYBOARD_PAGE = 0x07;
const CONSUMER_PAGE = 0x0c;

// [usage id, canonical QMK name (what QMK Configurator exports), ...aliases]
type Entry = [number, string, ...string[]];

const KEYBOARD: Entry[] = [
  [0x28, "KC_ENT", "KC_ENTER"],
  [0x29, "KC_ESC", "KC_ESCAPE"],
  [0x2a, "KC_BSPC", "KC_BACKSPACE", "KC_BSPACE"],
  [0x2b, "KC_TAB"],
  [0x2c, "KC_SPC", "KC_SPACE"],
  [0x2d, "KC_MINS", "KC_MINUS"],
  [0x2e, "KC_EQL", "KC_EQUAL"],
  [0x2f, "KC_LBRC", "KC_LEFT_BRACKET", "KC_LBRACKET"],
  [0x30, "KC_RBRC", "KC_RIGHT_BRACKET", "KC_RBRACKET"],
  [0x31, "KC_BSLS", "KC_BACKSLASH", "KC_BSLASH"],
  [0x32, "KC_NUHS", "KC_NONUS_HASH"],
  [0x33, "KC_SCLN", "KC_SEMICOLON", "KC_SCOLON"],
  [0x34, "KC_QUOT", "KC_QUOTE"],
  [0x35, "KC_GRV", "KC_GRAVE", "KC_ZKHK"],
  [0x36, "KC_COMM", "KC_COMMA"],
  [0x37, "KC_DOT"],
  [0x38, "KC_SLSH", "KC_SLASH"],
  [0x39, "KC_CAPS", "KC_CAPS_LOCK", "KC_CAPSLOCK", "KC_CLCK"],
  [0x46, "KC_PSCR", "KC_PRINT_SCREEN", "KC_PSCREEN"],
  [0x47, "KC_SCRL", "KC_SCROLL_LOCK", "KC_SCROLLLOCK", "KC_SLCK"],
  [0x48, "KC_PAUS", "KC_PAUSE", "KC_BRK"],
  [0x49, "KC_INS", "KC_INSERT"],
  [0x4a, "KC_HOME"],
  [0x4b, "KC_PGUP", "KC_PAGE_UP"],
  [0x4c, "KC_DEL", "KC_DELETE"],
  [0x4d, "KC_END"],
  [0x4e, "KC_PGDN", "KC_PAGE_DOWN", "KC_PGDOWN"],
  [0x4f, "KC_RGHT", "KC_RIGHT"],
  [0x50, "KC_LEFT"],
  [0x51, "KC_DOWN"],
  [0x52, "KC_UP"],
  [0x53, "KC_NUM", "KC_NUM_LOCK", "KC_NUMLOCK", "KC_NLCK"],
  [0x54, "KC_PSLS", "KC_KP_SLASH"],
  [0x55, "KC_PAST", "KC_KP_ASTERISK"],
  [0x56, "KC_PMNS", "KC_KP_MINUS"],
  [0x57, "KC_PPLS", "KC_KP_PLUS"],
  [0x58, "KC_PENT", "KC_KP_ENTER"],
  [0x62, "KC_P0", "KC_KP_0"],
  [0x63, "KC_PDOT", "KC_KP_DOT"],
  [0x64, "KC_NUBS", "KC_NONUS_BACKSLASH", "KC_NONUS_BSLASH"],
  [0x65, "KC_APP", "KC_APPLICATION"],
  [0x66, "KC_KB_POWER"],
  [0x67, "KC_PEQL", "KC_KP_EQUAL"],
  [0x74, "KC_EXEC", "KC_EXECUTE"],
  [0x75, "KC_HELP"],
  [0x76, "KC_MENU"],
  [0x77, "KC_SLCT", "KC_SELECT"],
  [0x78, "KC_STOP"],
  [0x79, "KC_AGIN", "KC_AGAIN"],
  [0x7a, "KC_UNDO"],
  [0x7b, "KC_CUT"],
  [0x7c, "KC_COPY"],
  [0x7d, "KC_PSTE", "KC_PASTE"],
  [0x7e, "KC_FIND"],
  [0x7f, "KC_KB_MUTE", "KC__MUTE"],
  [0x80, "KC_KB_VOLUME_UP", "KC__VOLUP"],
  [0x81, "KC_KB_VOLUME_DOWN", "KC__VOLDOWN"],
  [0x85, "KC_PCMM", "KC_KP_COMMA"],
  [0xe0, "KC_LCTL", "KC_LEFT_CTRL", "KC_LCTRL"],
  [0xe1, "KC_LSFT", "KC_LEFT_SHIFT", "KC_LSHIFT"],
  [0xe2, "KC_LALT", "KC_LEFT_ALT", "KC_LOPT"],
  [0xe3, "KC_LGUI", "KC_LEFT_GUI", "KC_LCMD", "KC_LWIN"],
  [0xe4, "KC_RCTL", "KC_RIGHT_CTRL", "KC_RCTRL"],
  [0xe5, "KC_RSFT", "KC_RIGHT_SHIFT", "KC_RSHIFT"],
  [0xe6, "KC_RALT", "KC_RIGHT_ALT", "KC_ROPT", "KC_ALGR"],
  [0xe7, "KC_RGUI", "KC_RIGHT_GUI", "KC_RCMD", "KC_RWIN"],
];
for (let i = 0; i < 26; i++) {
  KEYBOARD.push([0x04 + i, `KC_${String.fromCharCode(65 + i)}`]);
}
for (let i = 1; i <= 9; i++) {
  KEYBOARD.push([0x1d + i, `KC_${i}`]);
  KEYBOARD.push([0x58 + i, `KC_P${i}`, `KC_KP_${i}`]);
  KEYBOARD.push([0x86 + i, `KC_INT${i}`, `KC_INTERNATIONAL_${i}`]);
  KEYBOARD.push([0x8f + i, `KC_LNG${i}`, `KC_LANGUAGE_${i}`, `KC_LANG${i}`]);
}
// Older QMK names for some international keys (Vial still uses them)
const OLD_INT_NAMES = ["KC_RO", "KC_KANA", "KC_JYEN", "KC_HENK", "KC_MHEN"];
OLD_INT_NAMES.forEach((name, i) =>
  (KEYBOARD.find(([id]) => id === 0x87 + i) as string[]).push(name)
);
KEYBOARD.push([0x27, "KC_0"]);
for (let i = 1; i <= 12; i++) KEYBOARD.push([0x39 + i, `KC_F${i}`]);
for (let i = 13; i <= 24; i++) KEYBOARD.push([0x68 + i - 13, `KC_F${i}`]);

const CONSUMER: Entry[] = [
  [0x6f, "KC_BRIU", "KC_BRIGHTNESS_UP"],
  [0x70, "KC_BRID", "KC_BRIGHTNESS_DOWN"],
  [0xb3, "KC_MFFD", "KC_MEDIA_FAST_FORWARD"],
  [0xb4, "KC_MRWD", "KC_MEDIA_REWIND"],
  [0xb5, "KC_MNXT", "KC_MEDIA_NEXT_TRACK"],
  [0xb6, "KC_MPRV", "KC_MEDIA_PREV_TRACK"],
  [0xb7, "KC_MSTP", "KC_MEDIA_STOP"],
  [0xb8, "KC_EJCT", "KC_MEDIA_EJECT"],
  [0xcd, "KC_MPLY", "KC_MEDIA_PLAY_PAUSE"],
  [0xe2, "KC_MUTE", "KC_AUDIO_MUTE"],
  [0xe9, "KC_VOLU", "KC_AUDIO_VOL_UP"],
  [0xea, "KC_VOLD", "KC_AUDIO_VOL_DOWN"],
  [0x183, "KC_MSEL", "KC_MEDIA_SELECT"],
  [0x18a, "KC_MAIL"],
  [0x192, "KC_CALC", "KC_CALCULATOR"],
  [0x194, "KC_MYCM", "KC_MY_COMPUTER"],
  [0x221, "KC_WSCH", "KC_WWW_SEARCH"],
  [0x223, "KC_WHOM", "KC_WWW_HOME"],
  [0x224, "KC_WBAK", "KC_WWW_BACK"],
  [0x225, "KC_WFWD", "KC_WWW_FORWARD"],
  [0x226, "KC_WSTP", "KC_WWW_STOP"],
  [0x227, "KC_WREF", "KC_WWW_REFRESH"],
  [0x22a, "KC_WFAV", "KC_WWW_FAVORITES"],
  [0x29f, "KC_MCTL", "KC_MISSION_CONTROL"],
  [0x2a0, "KC_LPAD", "KC_LAUNCHPAD"],
];

// QMK's shifted keycodes, e.g. KC_EXLM is Shift+1: [name, unshifted key, ...aliases]
const SHIFTED: [string, string, ...string[]][] = [
  ["KC_TILD", "KC_GRV", "KC_TILDE"],
  ["KC_EXLM", "KC_1", "KC_EXCLAIM"],
  ["KC_AT", "KC_2"],
  ["KC_HASH", "KC_3"],
  ["KC_DLR", "KC_4", "KC_DOLLAR"],
  ["KC_PERC", "KC_5", "KC_PERCENT"],
  ["KC_CIRC", "KC_6", "KC_CIRCUMFLEX"],
  ["KC_AMPR", "KC_7", "KC_AMPERSAND"],
  ["KC_ASTR", "KC_8", "KC_ASTERISK"],
  ["KC_LPRN", "KC_9", "KC_LEFT_PAREN"],
  ["KC_RPRN", "KC_0", "KC_RIGHT_PAREN"],
  ["KC_UNDS", "KC_MINS", "KC_UNDERSCORE"],
  ["KC_PLUS", "KC_EQL"],
  ["KC_LCBR", "KC_LBRC", "KC_LEFT_CURLY_BRACE"],
  ["KC_RCBR", "KC_RBRC", "KC_RIGHT_CURLY_BRACE"],
  ["KC_PIPE", "KC_BSLS"],
  ["KC_COLN", "KC_SCLN", "KC_COLON"],
  ["KC_DQUO", "KC_QUOT", "KC_DQT", "KC_DOUBLE_QUOTE"],
  ["KC_LABK", "KC_COMM", "KC_LT", "KC_LEFT_ANGLE_BRACKET"],
  ["KC_RABK", "KC_DOT", "KC_GT", "KC_RIGHT_ANGLE_BRACKET"],
  ["KC_QUES", "KC_SLSH", "KC_QUESTION"],
];

// ZMK implicit modifier bits, and the QMK names for them
export const MOD_BITS = {
  LCTL: 0x01,
  LSFT: 0x02,
  LALT: 0x04,
  LGUI: 0x08,
  RCTL: 0x10,
  RSFT: 0x20,
  RALT: 0x40,
  RGUI: 0x80,
} as const;
export type ModName = keyof typeof MOD_BITS;
export const MOD_NAMES = Object.keys(MOD_BITS) as ModName[];

// Other spellings QMK accepts for the modifier functions, e.g. S(KC_1)
const MOD_ALIASES: Record<string, number> = {
  C: MOD_BITS.LCTL,
  S: MOD_BITS.LSFT,
  A: MOD_BITS.LALT,
  LOPT: MOD_BITS.LALT,
  G: MOD_BITS.LGUI,
  LCMD: MOD_BITS.LGUI,
  LWIN: MOD_BITS.LGUI,
  ROPT: MOD_BITS.RALT,
  ALGR: MOD_BITS.RALT,
  RCMD: MOD_BITS.RGUI,
  RWIN: MOD_BITS.RGUI,
  LCS: MOD_BITS.LCTL | MOD_BITS.LSFT,
  C_S: MOD_BITS.LCTL | MOD_BITS.LSFT,
  LCA: MOD_BITS.LCTL | MOD_BITS.LALT,
  LSA: MOD_BITS.LSFT | MOD_BITS.LALT,
  LCG: MOD_BITS.LCTL | MOD_BITS.LGUI,
  LAG: MOD_BITS.LALT | MOD_BITS.LGUI,
  SGUI: MOD_BITS.LSFT | MOD_BITS.LGUI,
  LSG: MOD_BITS.LSFT | MOD_BITS.LGUI,
  LCAG: MOD_BITS.LCTL | MOD_BITS.LALT | MOD_BITS.LGUI,
  RCG: MOD_BITS.RCTL | MOD_BITS.RGUI,
  RCAG: MOD_BITS.RCTL | MOD_BITS.RALT | MOD_BITS.RGUI,
  MEH: MOD_BITS.LCTL | MOD_BITS.LSFT | MOD_BITS.LALT,
  HYPR: MOD_BITS.LCTL | MOD_BITS.LSFT | MOD_BITS.LALT | MOD_BITS.LGUI,
};

export function modFunctionBits(name: string): number | undefined {
  return (MOD_BITS as Record<string, number>)[name] ?? MOD_ALIASES[name];
}

const usage = (mods: number, page: number, id: number) =>
  mods * 0x1000000 + page * 0x10000 + id;

export function splitUsage(u: number) {
  return {
    mods: Math.floor(u / 0x1000000) & 0xff,
    page: Math.floor(u / 0x10000) & 0xff,
    id: u & 0xffff,
  };
}

const nameToUsage = new Map<string, number>();
const usageToName = new Map<number, string>();

for (const [page, entries] of [
  [KEYBOARD_PAGE, KEYBOARD],
  [CONSUMER_PAGE, CONSUMER],
] as const) {
  for (const [id, canonical, ...aliases] of entries) {
    const u = usage(0, page, id);
    usageToName.set(u, canonical);
    for (const n of [canonical, ...aliases]) nameToUsage.set(n, u);
  }
}
for (const [name, base, ...aliases] of SHIFTED) {
  const u = nameToUsage.get(base)! + MOD_BITS.LSFT * 0x1000000;
  usageToName.set(u, name);
  for (const n of [name, ...aliases]) nameToUsage.set(n, u);
}

// The single modifier key for a set of mod bits, e.g. LSFT -> KC_LSFT
export function modifierKeyUsage(bit: number): number {
  return usage(0, KEYBOARD_PAGE, 0xe0 + Math.log2(bit));
}

// If the usage is a plain modifier key (with any implicit mods), its mod bits
export function usageAsModBits(u: number): number | undefined {
  const { mods, page, id } = splitUsage(u);
  if (page !== KEYBOARD_PAGE || id < 0xe0 || id > 0xe7) return undefined;
  return mods | (1 << (id - 0xe0));
}

// QMK keycode for a HID usage, e.g. KC_A, KC_EXLM or LCTL(LSFT(KC_A))
export function usageToQmk(u: number): string | undefined {
  const exact = usageToName.get(u);
  if (exact) return exact;

  const { mods, page, id } = splitUsage(u);
  // Prefer QMK's shifted names, e.g. LCTL(KC_EXLM) over LCTL(LSFT(KC_1))
  const shifted =
    mods & MOD_BITS.LSFT ? usageToName.get(usage(MOD_BITS.LSFT, page, id)) : undefined;
  let name = shifted ?? usageToName.get(usage(0, page, id));
  if (!name) return undefined;

  const rest = shifted ? mods & ~MOD_BITS.LSFT : mods;
  for (const mod of [...MOD_NAMES].reverse()) {
    if (rest & MOD_BITS[mod]) name = `${mod}(${name})`;
  }
  return name;
}

// HID usage for a QMK keycode, or undefined if there is no plain key for it
export function qmkToUsage(code: string): number | undefined {
  const plain = nameToUsage.get(code);
  if (plain !== undefined) return plain;

  const m = /^(\w+)\((.*)\)$/.exec(code);
  if (!m) return undefined;
  const bits = modFunctionBits(m[1]);
  const inner = qmkToUsage(m[2].trim());
  if (bits === undefined || inner === undefined) return undefined;

  const { mods, page, id } = splitUsage(inner);
  return usage(mods | bits, page, id);
}
