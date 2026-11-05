// Read and write keymaps in Vial's saved layout format (.vil files).
//
// Vial stores keys by switch matrix position (layer -> row -> column, -1 where there
// is no switch), not in layout order. To turn that into ZMK's key order we need the
// keyboard's matrix map, which comes from QMK's keyboard API or a definition file.

import type { KeyPhysicalAttrs } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { ParsedKeymapFile } from "./qmkJson";
import { KeyGeom, packKeys, unpackKeys } from "./remap";

const isZmkOnlyKey = (code: string) => code.startsWith("ZMK(");

export type MatrixPos = [number, number];

export interface VialFile {
  layout: (string | number)[][][];
  encoderLayout?: (string | number)[][][];
  // Key order -> matrix position, stored by ZMK Studio's export so it can import
  // the file again without looking up the keyboard. Vial ignores it.
  matrix?: MatrixPos[];
  // Where each key sits, also stored by ZMK Studio's export
  keys?: KeyGeom[];
}

export function isVialFile(json: unknown): boolean {
  const layout = (json as { layout?: unknown })?.layout;
  return (
    Array.isArray(layout) &&
    layout.every((l) => Array.isArray(l) && l.every((r) => Array.isArray(r)))
  );
}

const isMatrix = (m: unknown): m is MatrixPos[] =>
  Array.isArray(m) &&
  m.length > 0 &&
  m.every(
    (p) =>
      Array.isArray(p) &&
      p.length === 2 &&
      p.every((n) => Number.isInteger(n) && n >= 0)
  );

export function readVialFile(json: unknown): VialFile {
  const j = json as {
    layout: VialFile["layout"];
    encoder_layout?: unknown;
    zmk_studio?: { matrix?: unknown; keys?: unknown };
  };
  const matrix = j.zmk_studio?.matrix;
  return {
    layout: j.layout,
    encoderLayout: Array.isArray(j.encoder_layout)
      ? (j.encoder_layout as VialFile["encoderLayout"])
      : undefined,
    matrix: isMatrix(matrix) ? matrix : undefined,
    keys: unpackKeys(j.zmk_studio?.keys),
  };
}

// A made-up matrix from where keys sit on screen: keys whose centers are within half
// a key height of a row's top key form a row, numbered left to right. Used when the
// real wiring isn't known.
export function matrixFromPositions(keys: KeyPhysicalAttrs[]): MatrixPos[] {
  const centers = keys.map((k, i) => ({
    i,
    x: k.x + k.width / 2,
    y: k.y + k.height / 2,
  }));
  const heights = keys.map((k) => k.height).sort((a, b) => a - b);
  const rowGap = (heights[Math.floor(heights.length / 2)] || 100) / 2;

  const rows: (typeof centers)[] = [];
  for (const c of [...centers].sort((a, b) => a.y - b.y)) {
    const row = rows[rows.length - 1];
    if (row && c.y - row[0].y <= rowGap) row.push(c);
    else rows.push([c]);
  }

  const matrix: MatrixPos[] = Array(keys.length);
  rows.forEach((row, r) =>
    row
      .sort((a, b) => a.x - b.x)
      .forEach((c, col) => (matrix[c.i] = [r, col]))
  );
  return matrix;
}

// Built in so Corne works offline. Same data as QMK's crkbd/rev1 info.json:
// [row, col, x, y] per key, in layout order.
const corne = (cols: number, keys: number[][]): QmkLayout => ({
  matrix: keys.map(([r, c]) => [r, c]),
  keys: keys.map(([, , x, y]) => ({ x: x - (6 - cols), y })),
});
const corneHalves = (from: number) => {
  const ys = [0.3, 0.3, 0.1, 0, 0.1, 0.2];
  const keys: number[][] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = from; c < 6; c++) keys.push([r, c, c, r + ys[c]]);
    for (let c = 5; c >= from; c--) keys.push([r + 4, c, 14 - c, r + ys[c]]);
  }
  keys.push(
    [3, 3, 4, 3.7], [3, 4, 5, 3.7], [3, 5, 6, 3.2],
    [7, 5, 8, 3.2], [7, 4, 9, 3.7], [7, 3, 10, 3.7]
  );
  return corne(6 - from, keys);
};
// Cheapino (Vial only, not in QMK's API), and the Expensivo, its ZMK cousin with the
// same keys. Matrix and positions as in its keyboard.json, but in ZMK's key order:
// rows left to right, then the thumb keys, then the encoder push. QMK puts the
// encoder push between the halves of the top row instead.
const cheapino = (): QmkLayout => {
  const ys = [0.25, 0.125, 0, 0.125, 0.25];
  const keys: number[][] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) keys.push([r + 4, 10 - c, c, r + ys[c]]);
    for (let c = 0; c < 5; c++) keys.push([r, c, c + 7, r + ys[4 - c]]);
  }
  keys.push(
    [6, 11, 2.5, 3.25], [5, 11, 3.5, 3.5], [4, 11, 4.5, 3.75],
    [0, 5, 6.5, 3.75], [1, 5, 7.5, 3.5], [2, 5, 8.5, 3.25],
    [3, 0, 6, 0.25]
  );
  return { matrix: keys.map(([r, c]) => [r, c]), keys: keys.map(([, , x, y]) => ({ x, y })) };
};
const BUILT_IN: Record<string, Record<string, QmkLayout>> = {
  "crkbd/rev1": {
    LAYOUT_split_3x6_3: corneHalves(0),
    LAYOUT_split_3x5_3: corneHalves(1),
    LAYOUT: corneHalves(0),
  },
  cheapino: {
    LAYOUT_split_3x5_3: cheapino(),
    LAYOUT: cheapino(),
  },
};

// The built-in layout whose switches are exactly the matrix positions a Vial file
// uses, so files from those keyboards import without asking which keyboard they're for
export function builtInLayoutForVialFile(
  vial: VialFile
): { keyboard: string; layout: string; data: QmkLayout } | undefined {
  const used = new Set<string>();
  vial.layout[0]?.forEach((row, r) =>
    row.forEach((code, c) => typeof code === "string" && used.add(`${r},${c}`))
  );
  if (!used.size) return undefined;
  for (const [keyboard, layouts] of Object.entries(BUILT_IN)) {
    for (const [layout, data] of Object.entries(layouts)) {
      if (
        layout !== "LAYOUT" &&
        data.matrix.length === used.size &&
        data.matrix.every(([r, c]) => used.has(`${r},${c}`))
      ) {
        return { keyboard, layout, data };
      }
    }
  }
  return undefined;
}

// A built-in layout with this many keys, to guess what an unnamed file is for
export function builtInLayoutForKeyCount(
  keyCount: number
): { keyboard: string; layout: string; data: QmkLayout } | undefined {
  for (const [keyboard, layouts] of Object.entries(BUILT_IN)) {
    for (const [layout, data] of Object.entries(layouts)) {
      if (layout !== "LAYOUT" && data.matrix.length === keyCount) {
        return { keyboard, layout, data };
      }
    }
  }
  return undefined;
}

// A keyboard layout's keys in layout order: switch matrix position, and where the
// key sits if known
export interface QmkLayout {
  matrix: MatrixPos[];
  keys?: KeyGeom[];
}

interface QmkInfo {
  layouts?: Record<string, { layout: ({ matrix: MatrixPos } & KeyGeom)[] }>;
  layout_aliases?: Record<string, string>;
}

function layoutFromQmkInfo(info: QmkInfo, layoutName: string): QmkLayout {
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
  const keys = layout.layout;
  return {
    matrix: keys.map((k) => k.matrix),
    keys: keys.every((k) => typeof k.x === "number" && typeof k.y === "number")
      ? keys.map(({ x, y, w, h, r, rx, ry }) => ({ x, y, w, h, r, rx, ry }))
      : undefined,
  };
}

// Matrix map from QMK's keyboard API, e.g. keyboard "crkbd/rev1", layout "LAYOUT_split_3x6_3"
export async function fetchQmkMatrix(keyboard: string, layout: string) {
  return (await fetchQmkLayout(keyboard, layout)).matrix;
}

export async function fetchQmkLayout(
  keyboard: string,
  layout: string
): Promise<QmkLayout> {
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
      // Some keyboards are only in Vial, which has no API
      const builtIn = BUILT_IN[kb]?.[layout];
      if (builtIn) return builtIn;
      throw new Error(`QMK doesn't know a keyboard called "${kb}".`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("QMK doesn't")) throw e;
    // Offline: fall back to the built-in maps below
  }

  if (info) return layoutFromQmkInfo(info, layout);

  const builtIn = BUILT_IN[kb]?.[layout];
  if (builtIn) return builtIn;
  throw new Error(
    "Couldn't reach QMK to look up the keyboard. Check the connection, or choose the keyboard's definition file instead."
  );
}

// KLE-style vial.json: each key's first legend is "row,col". Keys that are a
// non-default choice of a layout option have "option,choice" as legend 8.
// Positions follow KLE's rules: x/y are offsets, r/rx/ry carry over between rows.
function layoutFromVialJson(keymap: unknown[][]): QmkLayout {
  const matrix: MatrixPos[] = [];
  const keys: KeyGeom[] = [];
  let r = 0;
  let rx = 0;
  let ry = 0;
  let y = 0;
  for (const row of keymap) {
    if (!Array.isArray(row)) continue;
    let x = rx;
    let w = 1;
    let h = 1;
    let decal = false;
    for (const item of row) {
      if (typeof item === "object" && item !== null) {
        const p = item as Record<string, unknown>;
        const num = (k: string) => (typeof p[k] === "number" ? (p[k] as number) : undefined);
        if (num("r") !== undefined) r = num("r")!;
        if (num("rx") !== undefined) {
          rx = num("rx")!;
          x = rx;
          y = ry;
        }
        if (num("ry") !== undefined) {
          ry = num("ry")!;
          x = rx;
          y = ry;
        }
        x += num("x") ?? 0;
        y += num("y") ?? 0;
        w = num("w") ?? w;
        h = num("h") ?? h;
        decal = !!p.d;
        continue;
      }
      if (typeof item !== "string") continue;
      const key = { x, y, w, h, r, rx, ry };
      x += w;
      w = 1;
      h = 1;
      const isDecal = decal;
      decal = false;
      if (isDecal) continue;

      const legends = item.split("\n");
      const m = /^(\d+),(\d+)$/.exec(legends[0]?.trim() ?? "");
      if (!m) continue;
      const option = /^\d+,(\d+)$/.exec(legends[8]?.trim() ?? "");
      if (option && option[1] !== "0") continue;
      matrix.push([Number(m[1]), Number(m[2])]);
      keys.push(key);
    }
    y += 1;
  }
  return { matrix, keys };
}

// Matrix map from a QMK info.json / keyboard.json (or the QMK API's wrapped form), or a vial.json
export function matrixFromDefinitionFile(text: string, layoutName: string) {
  return layoutFromDefinitionFile(text, layoutName).matrix;
}

export function layoutFromDefinitionFile(
  text: string,
  layoutName: string
): QmkLayout {
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
    const layout = layoutFromVialJson(vialKeymap);
    if (layout.matrix.length) return layout;
  }

  const info = json.keyboards ? Object.values(json.keyboards)[0] : (json as QmkInfo);
  if (info?.layouts) return layoutFromQmkInfo(info, layoutName);

  throw new Error(
    "The definition file doesn't look like a QMK info.json, keyboard.json or vial.json."
  );
}

const isEmptyKey = (k: string) => k === "KC_TRNS" || k === "KC_NO";

// Turn a Vial keymap into layers in layout order
export function vialToKeymapFile(
  vial: VialFile,
  matrix: MatrixPos[],
  keys?: KeyGeom[]
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

  return {
    layers,
    warnings,
    keys: keys?.length === matrix.length ? keys : undefined,
  };
}

// A .vil file for Vial's "Load saved layout". `layers` are QMK keycodes in key order,
// placed at matrix positions; Vial turns names it doesn't know into KC_NO, so
// ZMK-only keys are written as KC_NO up front and reported.
export function exportVialKeymap(
  layers: string[][],
  matrix: MatrixPos[],
  keys?: KeyGeom[]
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
      zmk_studio: { matrix, keys: keys && packKeys(keys) },
    },
    warnings,
  };
}
