import type { KeyPhysicalAttrs } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { ParsedKeymapFile } from "./qmkJson";
import { fromPhysicalKeys, KeyGeom, matchKeys } from "./remap";
import { builtInLayoutForKeyCount, fetchQmkLayout } from "./vial";

const MAX_KEYS_LISTED = 8;
const keys = (n: number) => `${n} key${n === 1 ? "" : "s"}`;

// Where the file's keys sit: stored in the file, looked up from QMK, or guessed from
// the key count
async function sourceKeys(
  file: ParsedKeymapFile,
  keyCount: number
): Promise<{ keys?: KeyGeom[]; note?: string }> {
  if (file.keys?.length === keyCount) return { keys: file.keys };

  if (file.keyboard && file.layout) {
    try {
      const layout = await fetchQmkLayout(file.keyboard, file.layout);
      if (layout.keys?.length === keyCount) return { keys: layout.keys };
    } catch {
      // Fall back to guessing below
    }
  }

  const guess = builtInLayoutForKeyCount(keyCount);
  if (guess?.data.keys) {
    return {
      keys: guess.data.keys,
      note: `Couldn't find out which keyboard the file is from, so it was taken to be a ${guess.keyboard} ${guess.layout} keymap.`,
    };
  }
  return {};
}

// Rearrange a keymap made for a keyboard with a different number of keys so each key
// lands where it sat on the original keyboard. Keys that have no place are dropped,
// and the keyboard's keys with no match are left as they are.
export async function fitKeymapToKeyboard(
  file: ParsedKeymapFile,
  physicalKeys: KeyPhysicalAttrs[]
): Promise<ParsedKeymapFile> {
  const target = physicalKeys.length;
  const fileKeys = Math.max(0, ...file.layers.map((l) => l.length));
  if (!target || !fileKeys || fileKeys === target) return file;

  const { keys: source, note } = await sourceKeys(file, fileKeys);
  // Without positions, applyImport goes by key order and reports the mismatch
  if (!source) return file;

  const match = matchKeys(source, fromPhysicalKeys(physicalKeys));
  const used = new Set(match.filter((m) => m !== undefined));
  const dropped = [...Array(fileKeys).keys()].filter((i) => !used.has(i));
  const unmatched = match.filter((m) => m === undefined).length;

  const base = file.layers[0] ?? [];
  const droppedNames = dropped
    .map((i) => base[i])
    .filter((c): c is string => !!c && c !== "KC_NO" && c !== "KC_TRNS");
  const listed = droppedNames.slice(0, MAX_KEYS_LISTED).join(", ");
  const more = droppedNames.length > MAX_KEYS_LISTED ? ", …" : "";

  const parts = [
    `The file is for a keyboard with ${keys(fileKeys)} and this one has ${target}, so keys were matched by where they sit on each keyboard.`,
  ];
  if (dropped.length) {
    parts.push(
      `${keys(dropped.length)} from the file had no place here and ${dropped.length === 1 ? "was" : "were"} left out` +
        (listed ? ` (on the first layer: ${listed}${more}).` : ".")
    );
  }
  if (unmatched) {
    parts.push(
      `${keys(unmatched)} on this keyboard had no match in the file and ${unmatched === 1 ? "was" : "were"} left as ${unmatched === 1 ? "it was" : "they were"}.`
    );
  }

  return {
    ...file,
    layers: file.layers.map((codes) =>
      match.map((s) => (s === undefined ? null : codes[s] ?? null))
    ),
    keys: undefined,
    warnings: [...(note ? [note] : []), parts.join(" "), ...(file.warnings ?? [])],
  };
}
