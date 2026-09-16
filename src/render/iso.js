// ============================================================
//  アイソメトリック座標変換
// ============================================================
import { MAP_W, MAP_H } from '../data/city.js';

export const TILE_W = 74;     // タイル幅(基準)
export const TILE_H = 37;     // タイル高(基準)
export const Z_UNIT = 4.1;    // 建物1mあたりの画面高さ(基準)

/** 回転を適用したグリッド座標 */
export function rotate(gx, gy, rot) {
  switch (rot & 3) {
    case 1: return [gy, MAP_W - 1 - gx];
    case 2: return [MAP_W - 1 - gx, MAP_H - 1 - gy];
    case 3: return [MAP_H - 1 - gy, gx];
    default: return [gx, gy];
  }
}

/** グリッド→画面座標（カメラ適用前のワールド座標） */
export function toScreen(gx, gy, z, rot, zoom) {
  const [x, y] = rotate(gx, gy, rot);
  return {
    x: (x - y) * (TILE_W / 2) * zoom,
    y: (x + y) * (TILE_H / 2) * zoom - z * Z_UNIT * zoom,
  };
}

/** 描画順のキー（奥→手前） */
export function depthKey(gx, gy, rot) {
  const [x, y] = rotate(gx, gy, rot);
  return x + y;
}

/** 画面座標→グリッド（高さ0平面） */
export function fromScreen(sx, sy, rot, zoom) {
  const hw = (TILE_W / 2) * zoom, hh = (TILE_H / 2) * zoom;
  const fx = (sx / hw + sy / hh) / 2;
  const fy = (sy / hh - sx / hw) / 2;
  const rx = Math.round(fx), ry = Math.round(fy);
  // 逆回転
  switch (rot & 3) {
    case 1: return [MAP_W - 1 - ry, rx];
    case 2: return [MAP_W - 1 - rx, MAP_H - 1 - ry];
    case 3: return [ry, MAP_H - 1 - rx];
    default: return [rx, ry];
  }
}

/** タイル菱形のパスを引く */
export function diamond(ctx, cx, cy, w, h) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy);
  ctx.lineTo(cx, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy);
  ctx.closePath();
}
