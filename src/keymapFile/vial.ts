// Read and write keymaps in Vial's saved layout format (.vil files).
//
// Vial stores keys by switch matrix position (layer -> row -> column, -1 where there
// is no switch), not in layout order. To turn that into ZMK's key order we need the
// keyboard's matrix map, which comes from QMK's keyboard API or a definition file.

import type { ParsedKeymapFile } from "./qmkJson";

const isZmkOnlyKey = (code: string) => code.startsWith("ZMK(");

type MatrixPos = [number, number];

export interface VialFile {
  layout: (string | number)[][][];
  encoderLayout?: (string | number)[][][];
}

export function isVialFile(json: unknown): boolean {
  const layout = (json as { layout?: unknown })?.layout;
  return (
    Array.isArray(layout) &&
    layout.every((l) => Array.isArray(l) && l.every((r) => Array.isArray(r)))
  );
}

export function readVialFile(json: unknown): VialFile {
  const j = json as { layout: VialFile["layout"]; encoder_layout?: unknown };
  return {
    layout: j.layout,
    encoderLayout: Array.isArray(j.encoder_layout)
      ? (j.encoder_layout as VialFile["encoderLayout"])
      : undefined,
  };
}

// Built in so Corne works offline. Same data as QMK's crkbd/rev1 info.json.
const CORNE_LEFT = (cols: number[]) => [0, 1, 2].map((r) => cols.map((c) => [r, c]));
const builtIn = (from: number): MatrixPos[] => {
  const left = [...Array(6 - from).keys()].map((i) => i + from);
  const right = [...left].reverse();
  const rows = CORNE_LEFT(left).flatMap((row, r) => [
    ...row,
    ...right.map((c) => [r + 4, c]),
  ]);
  return [
    ...rows,
    [3, 3], [3, 4], [3, 5],
    [7, 5], [7, 4], [7, 3],
  ] as MatrixPos[];
};
const BUILT_IN: Record<string, Record<string, MatrixPos[]>> = {
  "crkbd/rev1": {
    LAYOUT_split_3x6_3: builtIn(0),
    LAYOUT_split_3x5_3: builtIn(1),
    LAYOUT: builtIn(0),
  },
};

interface QmkInfo {
  layouts?: Record<string, { layout: { matrix: MatrixPos }[] }>;
  layout_aliases?: Record<string, string>;
}

function matrixFromQmkInfo(info: QmkInfo, layoutName: string): MatrixPos[] {
  const layouts = info.layouts ?? {};
  const name = layouts[layoutName]
    ? layoutName
    : info.layout_aliases?.[layoutName] ?? Object.keys(layouts)[0];
  const layout = name ? layouts[name] : undefined;
  if (!layout) {
    throw new Error(
      `The keyboard has no layout "${layoutName}". Available: ${Object.keys(layouts).join(", ") || "none"}.`
    );
  }
  return layout.layout.map((k) => k.matrix);
}

// Matrix map from QMK's keyboard API, e.g. keyboard "crkbd/rev1", layout "LAYOUT_split_3x6_3"
export async function fetchQmkMatrix(
  keyboard: string,
  layout: string
): Promise<MatrixPos[]> {
  const kb = keyboard.trim().replace(/^\/+|\/+$/g, "");
  let info: QmkInfo | undefined;
  try {
    const resp = await fetch(
      `https://keyboards.qmk.fm/v1/keyboards/${kb}/info.json`
    );
    if (resp.ok) {
      const json = await resp.json();
      info = json?.keyboards?.[kb] ?? Object.values(json?.keyboards ?? {})[0];
    } else if (resp.status === 404) {
      throw new Error(`QMK doesn't know a keyboard called "${kb}".`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("QMK doesn't")) throw e;
    // Offline: fall back to the built-in maps below
  }

  if (info) return matrixFromQmkInfo(info, layout);

  const builtIn = BUILT_IN[kb]?.[layout];
  if (builtIn) return builtIn;
  throw new Error(
    "Couldn't reach QMK to look up the keyboard. Check the connection, or choose the keyboard's definition file instead."
  );
}

// KLE-style vial.json: each key's first legend is "row,col". Keys that are a
// non-default choice of a layout option have "option,choice" as legend 8.
function matrixFromVialJson(keymap: unknown[][]): MatrixPos[] {
  const out: MatrixPos[] = [];
  let decal = false;
  for (const row of keymap) {
    for (const item of row) {
      if (typeof item === "object" && item !== null) {
        decal = !!(item as { d?: boolean }).d;
        continue;
      }
      if (typeof item !== "string") continue;
      const isDecal = decal;
      decal = false;
      if (isDecal) continue;

      const legends = item.split("\n");
      const m = /^(\d+),(\d+)$/.exec(legends[0]?.trim() ?? "");
      if (!m) continue;
      const option = /^\d+,(\d+)$/.exec(legends[8]?.trim() ?? "");
      if (option && option[1] !== "0") continue;
      out.push([Number(m[1]), Number(m[2])]);
    }
  }
  return out;
}

// Matrix map from a QMK info.json / keyboard.json (or the QMK API's wrapped form), or a vial.json
export function matrixFromDefinitionFile(
  text: string,
  layoutName: string
): MatrixPos[] {
  let json: {
    keyboards?: Record<string, QmkInfo>;
    layouts?: QmkInfo["layouts"] | { keymap?: unknown[][] };
  };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("The definition file isn't valid JSON.");
  }

  const vialKeymap = (json.layouts as { keymap?: unknown[][] } | undefined)?.keymap;
  if (Array.isArray(vialKeymap)) {
    const matrix = matrixFromVialJson(vialKeymap);
    if (matrix.length) return matrix;
  }

  const info = json.keyboards ? Object.values(json.keyboards)[0] : (json as QmkInfo);
  if (info?.layouts) return matrixFromQmkInfo(info, layoutName);

  throw new Error(
    "The definition file doesn't look like a QMK info.json, keyboard.json or vial.json."
  );
}

const isEmptyKey = (k: string) => k === "KC_TRNS" || k === "KC_NO";

// Turn a Vial keymap into layers in layout order
export function vialToKeymapFile(
  vial: VialFile,
  matrix: MatrixPos[]
): ParsedKeymapFile {
  const warnings: string[] = [];
  const isKey = (code: unknown): code is string => typeof code === "string";

  const layers = vial.layout.map((rows) =>
    matrix.map(([r, c]) => {
      const code = rows[r]?.[c];
      return isKey(code) ? code : "KC_NO";
    })
  );
  const missing = matrix.filter(([r, c]) => !isKey(vial.layout[0]?.[r]?.[c])).length;

  if (missing) {
    warnings.push(
      `${missing} key positions of the chosen layout aren't in the Vial file, so they were set to None. Check that the keyboard and layout are right.`
    );
  }

  // Vial keeps spare layers around; don't fill the keyboard with empty ones
  while (layers.length > 1 && layers[layers.length - 1].every(isEmptyKey)) {
    layers.pop();
  }

  const hasEncoders = vial.encoderLayout?.some((l) =>
    l.some((e) => e.some((k) => typeof k === "string" && !isEmptyKey(k)))
  );
  if (hasEncoders) {
    warnings.push("Encoder mappings from Vial aren't imported.");
  }

  return { layers, warnings };
}

// A .vil file for Vial's "Load saved layout". `layers` are QMK keycodes in key order,
// placed at matrix positions; Vial turns names it doesn't know into KC_NO, so
// ZMK-only keys are written as KC_NO up front and reported.
export function exportVialKeymap(
  layers: string[][],
  matrix: MatrixPos[]
): { file: unknown; warnings: string[] } {
  const warnings: string[] = [];
  const rows = Math.max(0, ...matrix.map(([r]) => r + 1));
  const cols = Math.max(0, ...matrix.map(([, c]) => c + 1));

  const keyCount = layers[0]?.length ?? 0;
  if (keyCount !== matrix.length) {
    warnings.push(
      `The keyboard has ${keyCount} keys but the chosen layout has ${matrix.length}, so keys may be in the wrong place. Check that the keyboard and layout are right.`
    );
  }

  let zmkOnly = 0;
  const layout = layers.map((keys) => {
    const grid: (string | number)[][] = Array.from({ length: rows }, () =>
      Array<string | number>(cols).fill(-1)
    );
    matrix.forEach(([r, c], i) => {
      let code = keys[i] ?? "KC_NO";
      if (isZmkOnlyKey(code)) {
        zmkOnly++;
        code = "KC_NO";
      }
      grid[r][c] = code;
    });
    return grid;
  });

  if (zmkOnly) {
    warnings.push(
      `${zmkOnly} key${zmkOnly === 1 ? " uses a ZMK behavior" : "s use ZMK behaviors"} Vial doesn't have, so ${zmkOnly === 1 ? "it was" : "they were"} saved as KC_NO.`
    );
  }

  return {
    file: {
      version: 1,
      layout,
      encoder_layout: [],
      // Default choices, which is what the matrix map above assumes
      layout_options: 0,
    },
    warnings,
  };
}
