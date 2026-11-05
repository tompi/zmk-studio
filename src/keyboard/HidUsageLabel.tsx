import {
  hid_usage_get_labels,
  hid_usage_page_and_id_from_usage,
} from "../hid-usages";
import { KEYBOARD_PAGE, SHIFTED_LABELS } from "./keyCodes";

export interface HidUsageLabelProps {
  hid_usage: number;
}

function remove_prefix(s?: string) {
  return s?.replace(/^Keyboard /, "");
}

// Implicit modifier flags (top byte of the usage) as symbols, in Ctrl/Alt/Shift/GUI order
const MOD_SYMBOLS: [number, string][] = [
  [0x11, "⌃"],
  [0x44, "⌥"],
  [0x22, "⇧"],
  [0x88, "◆"],
];

export const HidUsageLabel = ({ hid_usage }: HidUsageLabelProps) => {
  let [page, id] = hid_usage_page_and_id_from_usage(hid_usage);
  const mods = (hid_usage >>> 24) & 0xff;
  page &= 0xff;

  let labels = hid_usage_get_labels(page, id);

  // Shift plus a symbol key is shown as the shifted symbol, e.g. "!" for LS(N1);
  // other modifiers are shown in front of the key
  const shiftedLabel =
    page === KEYBOARD_PAGE && (mods & ~0x22) === 0 && mods
      ? SHIFTED_LABELS[id]
      : undefined;
  if (shiftedLabel) {
    labels = { short: shiftedLabel };
  } else if (mods) {
    const prefix = MOD_SYMBOLS.filter(([bits]) => mods & bits)
      .map(([, s]) => s)
      .join("");
    const add = (s?: string) => s && prefix + remove_prefix(s);
    labels = {
      short: add(labels.short),
      med: add(labels.med),
      long: add(labels.long),
    };
  }

  return (
    <span
      className="@[10em]:before:content-[attr(data-long-content)] @[6em]:before:content-[attr(data-med-content)] before:content-[attr(aria-label)]"
      aria-label={remove_prefix(labels.short)}
      data-med-content={remove_prefix(labels.med || labels.short)}
      data-long-content={remove_prefix(
        labels.long || labels.med || labels.short
      )}
    />
  );
};
