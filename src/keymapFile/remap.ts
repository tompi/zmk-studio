// Best-effort import of a keymap made for a different keyboard: keys are matched by
// where they sit, not by their order. Each half of a split keyboard is lined up on
// its inner columns and its bottom (thumb) row, so e.g. a 6-column Corne keymap on a
// 5-column Corne keeps everything but the outer columns, and a keymap with a number
// row loses that row on a keyboard without one.

import type { KeyPhysicalAttrs } from "@zmkfirmware/zmk-studio-ts-client/keymap";

// A key's position in key units, as in QMK's info.json. Rotation is in degrees
// around (rx, ry).
export interface KeyGeom {
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
  rx?: number;
  ry?: number;
}

// ZMK reports positions in hundredths of a key and degree
export function fromPhysicalKeys(keys: KeyPhysicalAttrs[]): KeyGeom[] {
  return keys.map((k) => ({
    x: k.x / 100,
    y: k.y / 100,
    w: k.width / 100,
    h: k.height / 100,
    r: (k.r || 0) / 100,
    rx: (k.rx || 0) / 100,
    ry: (k.ry || 0) / 100,
  }));
}

const round = (n: number) => Math.round(n * 100) / 100;

// Compact form stored in ZMK Studio's exports: [x, y, w, h, r, rx, ry]
export const packKeys = (keys: KeyGeom[]) =>
  keys.map((k) =>
    [k.x, k.y, k.w ?? 1, k.h ?? 1, k.r ?? 0, k.rx ?? 0, k.ry ?? 0].map(round)
  );

export function unpackKeys(packed: unknown): KeyGeom[] | undefined {
  if (
    !Array.isArray(packed) ||
    !packed.length ||
    !packed.every(
      (k) =>
        Array.isArray(k) &&
        k.length >= 2 &&
        k.every((n) => typeof n === "number" && Number.isFinite(n))
    )
  ) {
    return undefined;
  }
  return (packed as number[][]).map(([x, y, w, h, r, rx, ry]) => ({
    x,
    y,
    w,
    h,
    r,
    rx,
    ry,
  }));
}

interface Point {
  i: number;
  x: number;
  y: number;
}

function center(k: KeyGeom, i: number): Point {
  const cx = k.x + (k.w ?? 1) / 2;
  const cy = k.y + (k.h ?? 1) / 2;
  if (!k.r) return { i, x: cx, y: cy };
  const a = (k.r * Math.PI) / 180;
  const ox = k.rx ?? 0;
  const oy = k.ry ?? 0;
  const dx = cx - ox;
  const dy = cy - oy;
  return {
    i,
    x: ox + dx * Math.cos(a) - dy * Math.sin(a),
    y: oy + dx * Math.sin(a) + dy * Math.cos(a),
  };
}

// A gap this wide between key centers means a split keyboard
const SPLIT_GAP = 1.5;
// Keys this close (in key units, after lining up) are a good match. Pairs up to the
// looser distance are allowed too, e.g. thumb keys that are angled differently.
const MAX_DISTANCE = 0.75;
const LOOSE_DISTANCE = 1.5;

// The x where the keyboard splits into halves, if it does
function splitAt(points: Point[]): number | undefined {
  const xs = points.map((p) => p.x).sort((a, b) => a - b);
  let best = 0;
  let at: number | undefined;
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1];
    if (gap > best) {
      best = gap;
      at = (xs[i] + xs[i - 1]) / 2;
    }
  }
  return best >= SPLIT_GAP ? at : undefined;
}

type Side = "left" | "right" | "whole";

// Positions relative to each half's inner top-row key (x grows away from it)
function normalize(keys: KeyGeom[], split: boolean) {
  const points = keys.map(center);
  const at = split ? splitAt(points) : undefined;
  const halves: [Side, Point[]][] =
    at === undefined
      ? [["whole", points]]
      : [
          ["left", points.filter((p) => p.x < at)],
          ["right", points.filter((p) => p.x >= at)],
        ];

  return halves.map(([side, half]) => {
    const top = Math.min(...half.map((p) => p.y));
    const topRow = half.filter((p) => p.y - top < 0.5);
    const anchorX =
      side === "left"
        ? Math.max(...topRow.map((p) => p.x))
        : Math.min(...topRow.map((p) => p.x));
    return half.map((p) => ({
      i: p.i,
      x: side === "left" ? anchorX - p.x : p.x - anchorX,
      y: p.y - top,
    }));
  });
}

export const isSplit = (keys: KeyGeom[]) => splitAt(keys.map(center)) !== undefined;

// Cheapest assignment of rows to columns (Hungarian algorithm); cost has at least as
// many columns as rows. Returns the column for each row.
function assign(cost: number[][]): number[] {
  const n = cost.length;
  const m = cost[0]?.length ?? 0;
  const u = Array(n + 1).fill(0);
  const v = Array(m + 1).fill(0);
  const p = Array(m + 1).fill(0);
  const way = Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = Array(m + 1).fill(Infinity);
    const used = Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const out = Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) out[p[j] - 1] = j - 1;
  return out;
}

// Pair up keys so the total distance is smallest. A key left unpaired costs as much
// as the loosest allowed pair.
function pairUp(src: Point[], dst: Point[], dx: number, dy: number) {
  const dist = (s: Point, d: Point) => Math.hypot(s.x + dx - d.x, s.y + dy - d.y);
  const cost = dst.map((d) => [
    ...src.map((s) => {
      const dd = dist(s, d);
      return dd <= LOOSE_DISTANCE ? dd : 1e6;
    }),
    ...dst.map(() => LOOSE_DISTANCE),
  ]);

  const result = new Map<number, number>();
  let close = 0;
  assign(cost).forEach((j, di) => {
    if (j < 0 || j >= src.length || cost[di][j] > LOOSE_DISTANCE) return;
    result.set(dst[di].i, src[j].i);
    if (cost[di][j] <= MAX_DISTANCE) close++;
  });
  return { result, close };
}

// Whole rows or columns a half may be shifted by to line up better, e.g. when one
// keyboard has a number row and the other doesn't
const SHIFTS = [0, -1, 1, -2, 2];

// For each target key, the index of the source key at the same place, if any
export function matchKeys(source: KeyGeom[], target: KeyGeom[]): (number | undefined)[] {
  const split = isSplit(source) && isSplit(target);
  const srcHalves = normalize(source, split);
  const dstHalves = normalize(target, split);

  const out: (number | undefined)[] = Array(target.length).fill(undefined);
  srcHalves.forEach((src, h) => {
    const dst = dstHalves[h];
    const bottom = (ps: Point[]) => Math.max(...ps.map((p) => p.y));
    const tries = SHIFTS.flatMap((dy) =>
      SHIFTS.map((dx) => ({
        ...pairUp(src, dst, dx, dy),
        gap: Math.abs(bottom(src) + dy - bottom(dst)),
      }))
    );
    // Of the shifts with (nearly) the most close matches, take the one that lines
    // up the bottom (thumb) rows best, since those matter more than e.g. a number
    // row. Ties go to the smaller shift, which comes first.
    const most = Math.max(...tries.map((t) => t.close));
    const slack = Math.max(1, Math.round(dst.length * 0.05));
    const best = tries
      .filter((t) => t.close >= most - slack)
      .reduce((a, b) => (b.gap < a.gap - 0.05 ? b : a));
    best.result.forEach((s, d) => (out[d] = s));
  });
  return out;
}
