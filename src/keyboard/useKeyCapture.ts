// While a key in the keymap is selected, typing a key on the computer's keyboard
// assigns it. Shift+key assigns the shifted key (e.g. Shift+1 gives "!"), and a
// modifier pressed and released on its own assigns that modifier. Shortcuts with
// Ctrl, Alt or GUI are left alone so the browser and app keep working.

import { useEffect, useRef } from "react";
import {
  isModifierCode,
  LEFT_SHIFT_FLAG,
  RIGHT_SHIFT_FLAG,
  usageForEventCode,
  withMods,
} from "./keyCodes";

// Typing into these shouldn't change the keymap
function isEditing(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    !!target.closest(
      "input, textarea, select, [role=combobox], [role=listbox], [role=dialog], dialog"
    )
  );
}

export function useKeyCapture(
  enabled: boolean,
  onUsage: (usage: number) => void
) {
  // Latest callback, so the listeners don't need re-adding on every render
  const callback = useRef(onUsage);
  callback.current = onUsage;

  useEffect(() => {
    if (!enabled) return;

    // Modifier that's down with no other key pressed since
    let lone: string | undefined;
    const shifts = new Set<string>();

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditing(e.target) || document.querySelector("dialog[open]")) return;

      if (isModifierCode(e.code)) {
        if (e.code.startsWith("Shift")) shifts.add(e.code);
        lone = e.repeat ? lone : e.code;
        return;
      }
      lone = undefined;

      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const usage = usageForEventCode(e.code);
      if (usage === undefined) return;

      e.preventDefault();
      if (e.repeat) return;
      const shift = e.shiftKey
        ? shifts.has("ShiftRight") && !shifts.has("ShiftLeft")
          ? RIGHT_SHIFT_FLAG
          : LEFT_SHIFT_FLAG
        : 0;
      callback.current(shift ? withMods(usage, shift) : usage);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      shifts.delete(e.code);
      if (e.code !== lone) return;
      lone = undefined;
      if (isEditing(e.target) || document.querySelector("dialog[open]")) return;
      const usage = usageForEventCode(e.code);
      if (usage !== undefined) callback.current(usage);
    };

    // E.g. Cmd+Tab away: the key-up never arrives
    const onBlur = () => {
      lone = undefined;
      shifts.clear();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [enabled]);
}
