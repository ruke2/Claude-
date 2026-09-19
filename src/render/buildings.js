// ============================================================
//  建物描画 — アイソメ立体・ファサード・屋上・工事現場
//  すべてオフスクリーンcanvasにキャッシュして都市描画に貼る
// ============================================================
import { hash2 } from '../core/rng.js';
import { shade, hsl, USE_HSL, WALL_TONES } from './palette.js';
import { TILE_W, TILE_H, Z_UNIT } from './iso.js';

/**
 * 用途ごとの敷地占有率。
 * **massingOf() が棟ごとに空き（セットバック）を持っているので、
 * ここで重ねて絞らないこと。** 二重に効かせると建物が敷地の真ん中で縮んで、
 * 広い空き地に小さな箱が置いてあるだけの絵になる。
 */
const FOOT = { office: .96, resi: .94, rental: .94, retail: .99, hotel: .94, logi: .99, house: .97, mixed: .97 };
/** ベイ（窓の横方向分割数） */
const BAYS = { office: 7, resi: 6, rental: 6, retail: 5, hotel: 6, logi: 4, house: 3, mixed: 7 };

/**
 * 平行四辺形パス：左面(u:W→S)／右面(u:S→E)
 *
 * o = { cx, cy, w, h, sk }。cx,cy は footprint の中心、w,h は菱形の幅と高さ。
 * sk は「細長さ」で、グリッドの x方向の奥行 du と y方向の奥行 dv から
 *   sk = (dv - du) / (dv + du)
 * で決まる。正方形の敷地なら sk = 0 で、以前の式とそのまま一致する。
 * **sk を無視すると、細長い建物の壁と屋根がずれる。**
 */
function facePath(ctx, o, side, u0, u1, v0, v1, H, append) {
  const { cx, cy, w, h } = o;
  const sk = o.sk || 0;
  const p = (u, v) => side === 'L'
    ? [cx - w / 2 + u * (w / 2) * (1 - sk), cy + (h / 2) * sk + u * (h / 2) * (1 - sk) - v * H]
    : [cx - (w / 2) * sk + u * (w / 2) * (1 + sk), cy + h / 2 - u * (h / 2) * (1 + sk) - v * H];
  const a = p(u0, v0), b = p(u1, v0), c = p(u1, v1), d = p(u0, v1);
  // append のときは beginPath を呼ばない。
  // 同じ色の窓を1本のパスにまとめて1回で塗るため
  if (!append) ctx.beginPath();
  ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
  ctx.closePath();
}

function topDiamond(ctx, o, H, inset = 0) {
  const { cx, cy, w, h } = o;
  const sk = o.sk || 0;
  const ww = w * (1 - inset), hh = h * (1 - inset);
  ctx.beginPath();
  ctx.moveTo(cx + (ww / 2) * sk, cy - hh / 2 - H);
  ctx.lineTo(cx + ww / 2, cy - (hh / 2) * sk - H);
  ctx.lineTo(cx - (ww / 2) * sk, cy + hh / 2 - H);
  ctx.lineTo(cx - ww / 2, cy + (hh / 2) * sk - H);
  ctx.closePath();
}


// ------------------------------------------------------------
//  マッシング（敷地の使われ方）
//    1区画に1つの箱を置くと、街が盤面の駒にしか見えない。
//    実際の街は、戸建が数棟並び、低層は雑居ビルが軒を接し、
//    高層は低層部の上にタワーが載っている。
//    ここでは区画をどう使っているかを volumes として返す。
//
//  u,v は区画内の位置（0..1）。u はグリッドの +x、v は +y。
//  du = u1-u0、dv = v1-v0 が敷地の奥行で、
//  du ≠ dv の細長い棟は facePath の sk が受け持つ。
// ------------------------------------------------------------

/** 区画内の矩形 → 描画用の箱 */
function volBox(cx, cy, w, h, u0, u1, v0, v1) {
  const du = u1 - u0, dv = v1 - v0;
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  return {
    cx: cx + (cu - cv) * w / 2,
    cy: cy + (cu + cv - 1) * h / 2,
    w: (du + dv) * w / 2,
    h: (du + dv) * h / 2,
    sk: (dv - du) / (dv + du),
    depth: cu + cv,
  };
}

/** 低層の雑居ビルが何棟並ぶか */
function stripCount(r) { return r < 0.30 ? 2 : r < 0.72 ? 3 : 4; }

/**
 * 建物の立体構成を返す。
 * 返すのは { u0,u1,v0,v1, floors, use, role, seedAdd } の配列で、
 * 奥（depth が小さい）から手前の順に並んでいる。
 */
export function massingOf(b) {
  const use = b.use, fl = Math.max(1, b.floors);
  const S = b.seed;
  const R = (k) => hash2(S, k, 3);
  const out = [];
  const push = (u0, u1, v0, v1, floors, u2, role, add) =>
    out.push({ u0, u1, v0, v1, floors: Math.max(1, Math.round(floors)), use: u2 || use, role, seedAdd: add || 0 });

  if (use === 'house') {
    // 戸建分譲：小さな家が2〜4棟、前面に寄せて並ぶ
    const n = R(1) < 0.28 ? 2 : R(1) < 0.78 ? 3 : 4;
    const cols = n <= 2 ? 1 : 2, rows = Math.ceil(n / cols);
    const m = 0.10;                      // 敷地の外周に残す空き
    const cw = (1 - m * 2) / cols, ch = (1 - m * 2) / rows;
    let k = 0;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (k >= n) break;
      const jx = hash2(S, k * 13 + 5, 7), jy = hash2(S, k * 13 + 9, 7);
      const gw = cw * (0.62 + jx * 0.16), gh = ch * (0.62 + jy * 0.16);
      const ox = m + i * cw + (cw - gw) * (0.2 + jx * 0.6);
      const oy = m + j * ch + (ch - gh) * (0.2 + jy * 0.6);
      push(ox, ox + gw, oy, oy + gh, 1 + Math.round(jx * 1.4), 'house', 'house', k * 101);
      k++;
    }
    return out;
  }

  if (use === 'logi') {
    // 物流：大きな箱ひとつ。手前の角に小さな事務所棟が付く
    push(0.03, 0.97, 0.03, 0.88, fl, 'logi', 'main', 0);
    if (R(2) > 0.35) push(0.10, 0.40, 0.88, 0.99, 1, 'office', 'annex', 311);
    return out;
  }

  // ---- 低層（5階まで）：雑居ビルが軒を接して並ぶ ----
  if (fl <= 5) {
    const n = stripCount(R(3));
    const along = R(4) > 0.5;             // どちらの通りに向くか
    const m = 0.04;
    const span = 1 - m * 2;
    // 間口を不揃いにする（同じ幅で割ると団地に見える）
    const ws = [];
    let tot = 0;
    for (let i = 0; i < n; i++) { const t = 0.72 + hash2(S, i * 17 + 3, 11) * 0.66; ws.push(t); tot += t; }
    let acc = m;
    for (let i = 0; i < n; i++) {
      const wgt = ws[i] / tot * span;
      const depth = 0.68 + hash2(S, i * 23, 13) * 0.28;     // 奥行はまちまち
      const f = Math.max(1, Math.round(fl * (0.55 + hash2(S, i * 29, 17) * 0.85)));
      const back = m + (span * 0 + 0);
      if (along) push(acc, acc + wgt - 0.004, back, back + depth, f, use, 'strip', i * 211);
      else push(back, back + depth, acc, acc + wgt - 0.004, f, use, 'strip', i * 211);
      acc += wgt;
    }
    return out;
  }

  // ---- 中層（6〜14階）：主棟＋低層の付属棟 ----
  if (fl <= 14) {
    const m = 0.06 + R(5) * 0.05;
    const skew = (R(6) - 0.5) * 0.12;
    const u0 = m + Math.max(0, skew), u1 = 1 - m + Math.min(0, skew);
    const v0 = m - Math.min(0, skew), v1 = 1 - m - Math.max(0, skew);
    if (R(7) > 0.55) {
      // 主棟を奥に寄せ、手前に2〜3階の低層部を置く
      const cut = v0 + (v1 - v0) * (0.62 + R(8) * 0.14);
      push(u0, u1, v0, cut, fl, use, 'main', 0);
      push(u0 + 0.02, u1 - 0.02, cut, v1, Math.max(1, Math.round(fl * 0.2)), use === 'office' ? 'retail' : use, 'podium', 407);
    } else {
      push(u0, u1, v0, v1, fl, use, 'main', 0);
    }
    return out;
  }

  // ---- 高層（15階以上）：低層部の上にタワーが載る ----
  const pm = 0.03 + R(9) * 0.03;
  const pf = Math.max(2, Math.min(6, Math.round(fl * 0.09)));
  push(pm, 1 - pm, pm, 1 - pm, pf, use === 'logi' ? use : 'retail', 'podium', 0);
  // タワーは敷地の一方に寄せる（真ん中に立てると全部同じ絵になる）。
  // **細くしすぎないこと。** 0.5 を切ると40階建てが電柱にしか見えない
  const tw = 0.64 + R(10) * 0.20, th = 0.64 + R(11) * 0.20;
  const ou = (1 - tw) * (0.15 + R(12) * 0.70), ov = (1 - th) * (0.15 + R(13) * 0.70);
  push(ou, ou + tw, ov, ov + th, fl, use, 'tower', 0);
  // 超高層はさらに上でひと絞りする
  if (fl >= 34 && R(14) > 0.42) {
    const ins = 0.09 + R(15) * 0.07;
    push(ou + tw * ins, ou + tw * (1 - ins), ov + th * ins, ov + th * (1 - ins),
      fl + Math.round(fl * (0.10 + R(16) * 0.08)), use, 'crown', 613);
  }
  return out;
}

// ------------------------------------------------------------
//  ファサード
// ------------------------------------------------------------
/** 用途からファサードの型を決める */
function facadeOf(use, given) {
  if (given && given !== 'auto') return given;
  return { office: 'curtain', resi: 'terrace', rental: 'terrace', retail: 'glassbox', hotel: 'grid', logi: 'panel', house: 'brick', mixed: 'curtain' }[use] || 'grid';
}

const LIT_COLORS = ['#ffe6b0', '#ffd98e', '#fff2d0', '#cfe2ff', '#ffdd9a', '#ffeccb'];

/** 建物全体のファサード（スタックがあれば階層ごとに描き分ける） */
function drawFacade(ctx, o, side, H, b, T, zoom) {
  const stack = (b.stack && b.stack.length > 1) ? b.stack : null;
  if (!stack) {
    drawSeg(ctx, o, side, H, b, T, zoom, 0, 1, b.use, b.floors, 0);
    drawGrime(ctx, o, side, H, T, zoom);
    return;
  }
  const total = stack.reduce((a, x) => a + x.floors, 0) || 1;
  let acc = 0, i = 0;
  for (const seg of stack) {
    const vA = acc / total, vB = (acc + seg.floors) / total;
    drawSeg(ctx, o, side, H, b, T, zoom, vA, vB, seg.use, seg.floors, i);
    // セグメントの境界に庇（セットバックの帯）を入れる
    if (acc > 0) {
      facePath(ctx, o, side, -0.015, 1.015, vA - 0.004, vA + 0.006, H);
      ctx.fillStyle = shade(210, 5, 34, side === 'L' ? T.faceL : T.faceR);
      ctx.fill();
    }
    acc += seg.floors; i++;
  }
  drawGrime(ctx, o, side, H, T, zoom);
}

/** 経年の汚れと足元の陰り（アンビエントオクルージョン風） */
function drawGrime(ctx, o, side, H, T, zoom) {
  facePath(ctx, o, side, 0, 1, 0, 1, H);
  const { cx, cy, w, h } = o;
  const g = ctx.createLinearGradient(0, cy + h / 2 - H, 0, cy + h / 2);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.86, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(8,12,20,${0.16 + (1 - T.faceTop) * 0.14})`);
  ctx.fillStyle = g;
  ctx.fill();
}

/** 1セグメント分のファサード。vA〜vB が担当する高さ範囲 */
function drawSeg(ctx, o, side, H, b, T, zoom, vA, vB, use, floors, segIndex) {
  const facade = facadeOf(use, b.stack ? 'auto' : b.facade);
  const seed = b.seed + segIndex * 977;
  const base = USE_HSL[use] || USE_HSL.office;
  // 建物ごとに外装を1種類選ぶ。白い吹付け・生成りのタイル・灰のPC板…と
  // 実際の街並みと同じだけ色を散らさないと、同じ建物が並んでいるように見える
  const tone = WALL_TONES[Math.floor(hash2(b.seed, segIndex, 5) * WALL_TONES.length) % WALL_TONES.length];
  const jitter = hash2(b.seed, segIndex, 9);
  const hu = base[0] + tone.h + (jitter - 0.5) * 10;
  const sa = Math.max(1.5, base[1] * tone.s * (0.85 + jitter * 0.3));
  const li = Math.min(94, base[2] * tone.l * (0.97 + jitter * 0.06));
  const mul = side === 'L' ? T.faceL : T.faceR;
  const bays = Math.max(2, Math.round((BAYS[use] || 6) * (o.w / (TILE_W * zoom))));
  const span = Math.max(0.001, vB - vA);
  const fh = span / Math.max(1, floors);
  const winLit = T.windowLit * (b.lit ?? 0.6);
  const G0 = T.glass || [206, 20, 55];
  // ガラスの濃さも棟ごとに変える。全部同じだと、どのビルも同じ水色になる
  const G = [G0[0] + tone.h * 0.4, G0[1] * (0.85 + jitter * 0.4), G0[2] * tone.g];
  const darkWin = shade(G[0], G[1], G[2], mul * 1.0);

  // --- 壁 ---
  facePath(ctx, o, side, 0, 1, vA, vB, H);
  const wallTop = o.cy + o.h / 2 - H * vB, wallBot = o.cy + o.h / 2 - H * vA;
  const wg = ctx.createLinearGradient(0, wallTop, 0, wallBot);
  wg.addColorStop(0, shade(hu, sa, li, mul * 1.14));
  wg.addColorStop(1, shade(hu, sa, li, mul * 0.94));
  ctx.fillStyle = wg;
  ctx.fill();

  if (H * span < 4 || o.w < 12) return;

  // 引きの絵では窓を1枚ずつ描かず、階層のラインと点灯だけで表現する
  if (zoom < 0.52) {
    ctx.strokeStyle = shade(hu, sa, li, mul * 0.74, 0.55);
    ctx.lineWidth = Math.max(0.35, zoom * 0.6);
    const every = Math.max(1, Math.round(2 / Math.max(0.2, zoom)));
    for (let i = 0; i < floors; i += every) {
      const v = vA + (i + 0.5) * fh;
      facePath(ctx, o, side, 0.06, 0.94, v, v, H); ctx.stroke();
    }
    if (winLit > 0.12) {
      for (let i = 0; i < floors; i += every) {
        const r = hash2(seed + i * 37, side === 'L' ? 11 : 23);
        if (r >= winLit * 1.6) continue;
        const v = vA + i * fh;
        facePath(ctx, o, side, 0.1 + r * 0.5, 0.2 + r * 0.6, v + fh * 0.2, v + fh * 0.8, H);
        ctx.fillStyle = LIT_COLORS[Math.floor(r * 313) % 6];
        ctx.globalAlpha = 0.7; ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    ctx.strokeStyle = shade(hu, sa, li, mul * 1.3, 0.4);
    ctx.lineWidth = Math.max(0.4, zoom * 0.7);
    facePath(ctx, o, side, 0, 1, vA, vB, H); ctx.stroke();
    return;
  }

  const maxDraw = Math.min(floors, 64);
  const step = Math.max(1, Math.ceil(floors / maxDraw));

  if (facade === 'curtain') {
    // ガラスのカーテンウォール。空を映し込む
    const glassBase = shade(G[0], G[1], G[2] * 1.04, mul * 1.05);
    facePath(ctx, o, side, 0.03, 0.97, vA + fh * 0.1, vB - fh * 0.1, H);
    const sg = ctx.createLinearGradient(0, wallTop, 0, wallBot);
    sg.addColorStop(0, shade(G[0], G[1] + 6, G[2] * 1.22, mul * 1.12));
    sg.addColorStop(0.55, glassBase);
    sg.addColorStop(1, shade(G[0], G[1], G[2] * 0.90, mul));
    ctx.fillStyle = sg; ctx.fill();
    // 横連窓の目地と縦マリオン（1本のパスにまとめて1回で引く）
    ctx.strokeStyle = shade(hu, sa, li, mul * 1.26, 0.7);
    ctx.lineWidth = Math.max(0.4, zoom * 0.55);
    ctx.beginPath();
    for (let i = 0; i < floors; i += step) {
      const v = vA + (i + 1) * fh;
      facePath(ctx, o, side, 0.03, 0.97, v, v, H, true);
    }
    for (let bx = 1; bx < bays; bx++) {
      const u = bx / bays;
      facePath(ctx, o, side, u, u, vA, vB, H, true);
    }
    ctx.stroke();
    // 点灯
    for (let i = 0; i < floors; i += step) {
      for (let bx = 0; bx < bays; bx++) {
        const r = hash2(seed + i * 31, bx * 7, side === 'L' ? 3 : 9);
        if (r >= winLit) continue;
        const v0 = vA + i * fh + fh * 0.22, v1 = vA + i * fh + fh * 0.84;
        facePath(ctx, o, side, 0.04 + bx / bays * 0.92, 0.04 + (bx + 0.9) / bays * 0.92, v0, v1, H);
        ctx.fillStyle = LIT_COLORS[Math.floor(r * 997) % 6];
        ctx.globalAlpha = 0.55 + r * 0.45; ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    // 反射のハイライト
    facePath(ctx, o, side, side === 'L' ? 0.02 : 0.64, side === 'L' ? 0.3 : 0.98, vA, vB, H);
    const gr = ctx.createLinearGradient(o.cx - o.w / 2, wallTop, o.cx + o.w / 2, wallBot);
    gr.addColorStop(0, `rgba(255,255,255,${T.key === 'night' ? 0.03 : 0.11})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gr; ctx.fill();

  } else if (facade === 'glassbox') {
    // 商業施設：大開口のガラスと庇
    for (let i = 0; i < floors; i += step) {
      const v0 = vA + i * fh + fh * 0.12, v1 = vA + i * fh + fh * 0.82;
      facePath(ctx, o, side, 0.05, 0.95, v0, v1, H);
      ctx.fillStyle = winLit > 0.25 ? 'rgba(255,226,172,0.80)' : shade(G[0], G[1], G[2] * 1.06, mul * 1.06);
      ctx.fill();
      // 庇
      facePath(ctx, o, side, -0.01, 1.01, vA + i * fh + fh * 0.86, vA + i * fh + fh * 0.98, H);
      ctx.fillStyle = shade(hu, sa - 6, li, mul * 1.18); ctx.fill();
    }
    // 看板
    if (o.w > 20) {
      facePath(ctx, o, side, 0.12, 0.52, vB - fh * 0.55, vB - fh * 0.15, H);
      ctx.fillStyle = T.glow > 0.4 ? '#ff7aa8' : shade(hu, sa + 20, li * 0.8, mul);
      if (T.glow > 0.4) { ctx.shadowColor = '#ff5f95'; ctx.shadowBlur = 10 * zoom; }
      ctx.fill(); ctx.shadowBlur = 0;
    }

  } else if (facade === 'terrace') {
    // 住宅：バルコニーと手すり。
    // 窓は同じ色なので1本のパスにまとめる（1枚ずつ塗ると高層で数百回になる）
    ctx.beginPath();
    const lits = [];
    for (let i = 0; i < floors; i += step) {
      const base = vA + i * fh;
      for (let bx = 0; bx < bays; bx++) {
        const u0 = 0.06 + bx / bays * 0.88, u1 = 0.06 + (bx + 0.8) / bays * 0.88;
        const r = hash2(seed + i * 17, bx * 13, side === 'L' ? 1 : 5);
        if (r < winLit) { lits.push([u0, u1, base + fh * 0.2, base + fh * 0.72, r]); continue; }
        facePath(ctx, o, side, u0, u1, base + fh * 0.2, base + fh * 0.72, H, true);
      }
    }
    ctx.fillStyle = darkWin; ctx.fill();
    for (const [u0, u1, v0, v1, r] of lits) {
      facePath(ctx, o, side, u0, u1, v0, v1, H);
      ctx.fillStyle = LIT_COLORS[Math.floor(r * 887) % 6]; ctx.fill();
    }
    // スラブ
    ctx.beginPath();
    for (let i = 0; i < floors; i += step) {
      const base = vA + i * fh;
      facePath(ctx, o, side, -0.01, 1.01, base + fh * 0.02, base + fh * 0.13, H, true);
    }
    ctx.fillStyle = shade(hu, sa - 4, li, mul * 1.20); ctx.fill();
    // 手すり
    ctx.beginPath();
    for (let i = 0; i < floors; i += step) {
      const base = vA + i * fh;
      facePath(ctx, o, side, 0.02, 0.98, base + fh * 0.13, base + fh * 0.30, H, true);
    }
    ctx.fillStyle = shade(200, 10, 58, mul * 0.9, 0.45); ctx.fill();

  } else if (facade === 'panel') {
    // 倉庫・パネル外壁
    ctx.strokeStyle = shade(hu, sa, li, mul * 0.86);
    ctx.lineWidth = Math.max(0.4, zoom * 0.5);
    for (let bx = 1; bx < bays * 2; bx++) {
      const u = bx / (bays * 2);
      facePath(ctx, o, side, u, u, vA, vB, H); ctx.stroke();
    }
    for (let i = 0; i < floors; i += step) {
      const v0 = vA + i * fh + fh * 0.32, v1 = vA + i * fh + fh * 0.5;
      facePath(ctx, o, side, 0.08, 0.92, v0, v1, H);
      ctx.fillStyle = winLit > 0.35 ? 'rgba(255,238,196,0.7)' : shade(G[0], G[1] - 4, G[2] * 0.9, mul);
      ctx.fill();
    }
    // 搬入口
    facePath(ctx, o, side, 0.12, 0.42, vA + fh * 0.05, vA + fh * 0.5, H);
    ctx.fillStyle = shade(hu, sa, li * 0.6, mul); ctx.fill();

  } else if (facade === 'brick' || facade === 'stone') {
    const wide = facade === 'stone' ? 0.6 : 0.48;
    ctx.beginPath();
    const lits = [];
    for (let i = 0; i < floors; i += step) {
      const v0 = vA + i * fh + fh * 0.24, v1 = vA + i * fh + fh * 0.76;
      for (let bx = 0; bx < bays; bx++) {
        const u0 = 0.08 + bx / bays * 0.84, u1 = 0.08 + (bx + wide) / bays * 0.84;
        const r = hash2(seed + i * 23, bx * 11, side === 'L' ? 2 : 6);
        if (r < winLit) { lits.push([u0, u1, v0, v1, r]); continue; }
        facePath(ctx, o, side, u0, u1, v0, v1, H, true);
      }
    }
    ctx.fillStyle = darkWin; ctx.fill();
    for (const [u0, u1, v0, v1, r] of lits) {
      facePath(ctx, o, side, u0, u1, v0, v1, H);
      ctx.fillStyle = LIT_COLORS[Math.floor(r * 577) % 6]; ctx.fill();
    }
    ctx.beginPath();
    for (let i = 0; i < floors; i += step) {
      facePath(ctx, o, side, -0.01, 1.01, vA + i * fh + fh * 0.86, vA + i * fh + fh * 0.96, H, true);
    }
    ctx.fillStyle = shade(hu, sa - 6, li, mul * 1.14); ctx.fill();

  } else {
    // grid（標準の格子窓）
    ctx.beginPath();
    const lits = [];
    for (let i = 0; i < floors; i += step) {
      const v0 = vA + i * fh + fh * 0.22, v1 = vA + i * fh + fh * 0.78;
      for (let bx = 0; bx < bays; bx++) {
        const u0 = 0.06 + bx / bays * 0.88, u1 = 0.06 + (bx + 0.74) / bays * 0.88;
        const r = hash2(seed + i * 29, bx * 19, side === 'L' ? 4 : 8);
        if (r < winLit) { lits.push([u0, u1, v0, v1, r]); continue; }
        facePath(ctx, o, side, u0, u1, v0, v1, H, true);
      }
    }
    ctx.fillStyle = darkWin; ctx.fill();
    for (const [u0, u1, v0, v1, r] of lits) {
      facePath(ctx, o, side, u0, u1, v0, v1, H);
      ctx.fillStyle = LIT_COLORS[Math.floor(r * 733) % 6]; ctx.fill();
    }
    ctx.strokeStyle = shade(hu, sa, li, mul * 1.18, 0.5);
    ctx.lineWidth = Math.max(0.35, zoom * 0.45);
    for (let i = 0; i < floors; i += step * 2) {
      const v = vA + i * fh;
      facePath(ctx, o, side, 0, 1, v, v, H); ctx.stroke();
    }
  }

  // --- 最下部（エントランス・店舗） ---
  if (vA < 0.02 && H > 12) {
    const v1 = Math.min(0.9, fh * (use === 'retail' ? 2.2 : 1.05));
    facePath(ctx, o, side, 0, 1, 0, v1, H);
    ctx.fillStyle = T.windowLit > 0.3 ? `rgba(255,216,156,${0.26 + T.glow * 0.22})` : 'rgba(18,24,36,0.34)';
    ctx.fill();
    // キャノピー
    facePath(ctx, o, side, -0.02, 1.02, v1, v1 + Math.min(0.03, fh * 0.2), H);
    ctx.fillStyle = shade(hu, sa - 8, li, mul * 1.22); ctx.fill();
  }

  // --- 角のエッジ ---
  ctx.strokeStyle = shade(hu, sa, li, mul * 1.34, 0.45);
  ctx.lineWidth = Math.max(0.4, zoom * 0.7);
  facePath(ctx, o, side, 0, 1, vA, vB, H); ctx.stroke();
}

// ------------------------------------------------------------
//  屋上まわり
// ------------------------------------------------------------
function drawRoof(ctx, o, H, b, T, zoom, top = true) {
  const { use, floors, seed } = b;
  const [hu, sa, li] = USE_HSL[use] || USE_HSL.office;
  const { cx, cy, w, h } = o;

  if (use === 'house') {   // 切妻屋根
    const rh = h * 0.7;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy - H); ctx.lineTo(cx, cy + h / 2 - H);
    ctx.lineTo(cx, cy + h / 2 - H - rh); ctx.lineTo(cx - w / 2, cy - H - rh * 0.5);
    ctx.closePath();
    ctx.fillStyle = shade(12, 34, 38, T.faceL); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + w / 2, cy - H); ctx.lineTo(cx, cy + h / 2 - H);
    ctx.lineTo(cx, cy + h / 2 - H - rh); ctx.lineTo(cx + w / 2, cy - H - rh * 0.5);
    ctx.closePath();
    ctx.fillStyle = shade(12, 34, 38, T.faceR * 0.9); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, cy - H - rh * 0.5); ctx.lineTo(cx, cy + h / 2 - H - rh);
    ctx.lineTo(cx + w / 2, cy - H - rh * 0.5); ctx.lineTo(cx, cy - h / 2 - H - rh * 0.1);
    ctx.closePath();
    ctx.fillStyle = shade(12, 30, 44, T.faceTop); ctx.fill();
    return;
  }

  // 屋上スラブ。
  // **外壁の色をそのまま持ってこないこと。** 明るい外壁だと真っ白な皿になって、
  // 上から見た街が銀色の板を並べたように見える。実際の屋上は灰色の防水層である
  topDiamond(ctx, o, H);
  ctx.fillStyle = shade(212, 4, 54, T.faceTop); ctx.fill();
  // 防水層の継ぎ目
  if (w > 22) {
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = Math.max(0.4, zoom * 0.5);
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      ctx.beginPath();
      ctx.moveTo(cx - w / 2 + w * t / 2, cy - H + h * t / 2 - h / 2 + h / 2);
      ctx.lineTo(cx + w * t / 2, cy - H + h / 2 - h * t / 2);
      ctx.stroke();
    }
  }
  // パラペット（立ち上がり）
  topDiamond(ctx, o, H + 2.2 * zoom);
  ctx.fillStyle = shade(hu, sa, li, T.faceTop * 0.94); ctx.fill();
  ctx.strokeStyle = shade(hu, sa, li, T.faceTop * 1.12, 0.5); ctx.lineWidth = Math.max(0.4, zoom * 0.6); ctx.stroke();

  if (w < 16) return;
  const hi = top && floors > 26;

  // 屋上設備
  const nEq = 1 + Math.floor(hash2(seed, 5) * 3);
  for (let i = 0; i < nEq; i++) {
    const r1 = hash2(seed + i * 41, 13), r2 = hash2(seed + i * 41, 27), r3 = hash2(seed + i * 41, 31);
    const bw = w * (0.12 + r3 * 0.16), bh = h * (0.12 + r3 * 0.16);
    const bz = (2.4 + r3 * 4.2) * zoom;
    const ox = (r1 - 0.5) * w * 0.34, oy = (r2 - 0.5) * h * 0.34;
    const sub = { cx: cx + ox, cy: cy + oy, w: bw, h: bh };
    facePath(ctx, sub, 'L', 0, 1, 0, 1, bz); ctx.fillStyle = shade(hu, 6, 48, T.faceL); ctx.fill();
    facePath(ctx, sub, 'R', 0, 1, 0, 1, bz); ctx.fillStyle = shade(hu, 6, 48, T.faceR); ctx.fill();
    topDiamond(ctx, sub, bz); ctx.fillStyle = shade(hu, 6, 56, T.faceTop); ctx.fill();
  }

  // ヘリポート
  if (top && hi && hash2(seed, 71) > 0.55) {
    ctx.save();
    ctx.translate(cx, cy - H - 2.2 * zoom); ctx.scale(1, TILE_H / TILE_W);
    ctx.beginPath(); ctx.arc(0, 0, w * 0.19, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(210,215,225,0.30)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(0.8, zoom * 1.1); ctx.stroke();
    ctx.font = `${Math.max(5, w * 0.16)}px Oswald, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', 0, 0);
    ctx.restore();
  }

  // アンテナ／航空障害灯。
  // **低い建物に付けないこと。** 2階建ての家の屋根で赤ランプが光る
  if (top && b.antenna && floors >= 14) {
    const ah = (10 + hash2(seed, 91) * 22) * zoom;
    ctx.strokeStyle = shade(hu, 4, 62, T.faceTop); ctx.lineWidth = Math.max(0.8, zoom * 1.1);
    ctx.beginPath(); ctx.moveTo(cx, cy - H - 2 * zoom); ctx.lineTo(cx, cy - H - 2 * zoom - ah); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy - H - 2 * zoom - ah, Math.max(1.2, zoom * 1.6), 0, Math.PI * 2);
    ctx.fillStyle = '#ff4d5e'; ctx.shadowColor = '#ff2d3e'; ctx.shadowBlur = 9 * zoom; ctx.fill(); ctx.shadowBlur = 0;
  }
  // クラウン（上部の段差）
  if (top && hi && b.crown > 1) {
    let cz = H;
    for (let i = 0; i < b.crown - 1; i++) {
      const ins = 0.24 + i * 0.18;
      const sub = { cx, cy, w: w * (1 - ins), h: h * (1 - ins) };
      const sz = (3.2 + hash2(seed, 100 + i) * 5) * zoom;
      facePath(ctx, sub, 'L', 0, 1, 0, 1, sz - (cz - H)); ctx.fillStyle = shade(hu, sa, li, T.faceL * 0.95); ctx.fill();
      facePath(ctx, sub, 'R', 0, 1, 0, 1, sz - (cz - H)); ctx.fillStyle = shade(hu, sa, li, T.faceR * 0.95); ctx.fill();
      // ※上に積む
      ctx.save(); ctx.translate(0, -(cz - H)); topDiamond(ctx, sub, H + sz - (cz - H));
      ctx.fillStyle = shade(hu, sa, li + 4, T.faceTop); ctx.fill(); ctx.restore();
      cz += sz;
    }
  }
  // 夜のネオン看板
  if (top && T.glow > 0.4 && (use === 'retail' || use === 'hotel' || use === 'office') && hash2(seed, 55) > 0.45) {
    const nc = ['#ff6aa0', '#5fe0ff', '#ffd45f', '#8affa0'][Math.floor(hash2(seed, 57) * 4)];
    ctx.save(); ctx.globalAlpha = 0.6 + T.glow * 0.4;
    ctx.fillStyle = nc; ctx.shadowColor = nc; ctx.shadowBlur = 14 * zoom;
    const sub = { cx, cy, w: w * 0.5, h: h * 0.5 };
    facePath(ctx, sub, 'R', 0.15, 0.85, 0.02, 0.1, H - 3 * zoom);
    ctx.fill(); ctx.restore();
  }
}

// ------------------------------------------------------------
//  工事現場
// ------------------------------------------------------------
function drawConstruction(ctx, o, fullH, prog, seed, T, zoom) {
  const { cx, cy, w, h } = o;
  const H = fullH * Math.max(0.05, prog);
  // 基礎の土
  topDiamond(ctx, o, 0);
  ctx.fillStyle = '#4a3f33'; ctx.fill();

  // 躯体
  if (H > 2) {
    facePath(ctx, o, 'L', 0, 1, 0, 1, H); ctx.fillStyle = shade(30, 6, 44, T.faceL); ctx.fill();
    facePath(ctx, o, 'R', 0, 1, 0, 1, H); ctx.fillStyle = shade(30, 6, 44, T.faceR); ctx.fill();
    topDiamond(ctx, o, H); ctx.fillStyle = shade(30, 6, 52, T.faceTop); ctx.fill();

    // 床スラブのライン
    const fl = Math.max(1, Math.round(H / (3.3 * Z_UNIT * zoom)));
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = Math.max(0.4, zoom * 0.6);
    for (let i = 1; i < fl; i++) {
      const v = i / fl;
      facePath(ctx, o, 'L', 0, 1, v, v, H); ctx.stroke();
      facePath(ctx, o, 'R', 0, 1, v, v, H); ctx.stroke();
    }
    // 防音シート（上部）
    const sv = Math.max(0, 1 - 0.34);
    facePath(ctx, o, 'L', 0, 1, sv, 1, H); ctx.fillStyle = 'rgba(190,205,220,0.60)'; ctx.fill();
    facePath(ctx, o, 'R', 0, 1, sv, 1, H); ctx.fillStyle = 'rgba(165,182,200,0.60)'; ctx.fill();
    // 足場
    ctx.strokeStyle = 'rgba(255,190,90,0.55)'; ctx.lineWidth = Math.max(0.4, zoom * 0.5);
    for (let i = 0; i <= 5; i++) {
      const u = i / 5;
      facePath(ctx, o, 'L', u, u, 0, 1, H); ctx.stroke();
      facePath(ctx, o, 'R', u, u, 0, 1, H); ctx.stroke();
    }
  }

  // タワークレーン
  const craneH = fullH * Math.min(1, prog + 0.22) + 14 * zoom;
  const bx = cx + w * 0.30, by = cy + h * 0.14;
  ctx.strokeStyle = '#f0c040'; ctx.lineWidth = Math.max(1, zoom * 1.4);
  ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx, by - craneH); ctx.stroke();
  ctx.lineWidth = Math.max(0.5, zoom * 0.7);
  for (let i = 0; i < 9; i++) {
    const y0 = by - craneH * (i / 9), y1 = by - craneH * ((i + 1) / 9);
    ctx.beginPath(); ctx.moveTo(bx - 2.2 * zoom, y0); ctx.lineTo(bx + 2.2 * zoom, y1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx + 2.2 * zoom, y0); ctx.lineTo(bx - 2.2 * zoom, y1); ctx.stroke();
  }
  const dir = hash2(seed, 3) > 0.5 ? 1 : -1;
  const jib = w * 0.72 * dir, cw = -w * 0.26 * dir;
  ctx.lineWidth = Math.max(1, zoom * 1.3);
  ctx.beginPath(); ctx.moveTo(bx + cw, by - craneH - 1.5 * zoom); ctx.lineTo(bx + jib, by - craneH - 4 * zoom); ctx.stroke();
  ctx.lineWidth = Math.max(0.6, zoom * 0.8);
  ctx.beginPath(); ctx.moveTo(bx + jib * 0.62, by - craneH - 3 * zoom); ctx.lineTo(bx + jib * 0.62, by - craneH + 9 * zoom); ctx.stroke();
  ctx.fillStyle = '#f0c040';
  ctx.fillRect(bx + cw - 2 * zoom, by - craneH - 4 * zoom, 4 * zoom, 4 * zoom);
  ctx.beginPath(); ctx.arc(bx + jib * 0.62, by - craneH + 10 * zoom, 1.6 * zoom, 0, Math.PI * 2); ctx.fill();
  if (T.glow > 0.4) {
    ctx.beginPath(); ctx.arc(bx, by - craneH - 2 * zoom, 1.4 * zoom, 0, Math.PI * 2);
    ctx.fillStyle = '#ff4d5e'; ctx.shadowColor = '#ff2d3e'; ctx.shadowBlur = 8 * zoom; ctx.fill(); ctx.shadowBlur = 0;
  }
  // 仮囲い
  facePath(ctx, o, 'L', 0, 1, 0, 0.06, Math.max(H, 6 * zoom)); ctx.fillStyle = 'rgba(210,225,240,0.5)'; ctx.fill();
  facePath(ctx, o, 'R', 0, 1, 0, 0.06, Math.max(H, 6 * zoom)); ctx.fillStyle = 'rgba(190,206,222,0.5)'; ctx.fill();
}

// ------------------------------------------------------------
//  公開API：建物1棟をオフスクリーンに描いて返す
// ------------------------------------------------------------
export function renderBuilding(b, T, zoom, opt = {}) {
  const w = TILE_W * zoom, h = TILE_H * zoom;
  const footMul = opt.footMul || 1;
  const fhM = b.height / Math.max(1, b.floors);          // 1階あたりの高さ(m)
  const topH = Math.max(2, b.height * Z_UNIT * zoom * (opt.heightMul ?? 1));
  const pad = Math.max(30, 44 * zoom);
  const cw = Math.ceil(w + pad * 2), ch = Math.ceil(topH + h + pad * 2);

  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d');
  const cx = cw / 2, cy = ch - pad - h / 2;              // タイル中心のローカル座標

  if (opt.construction !== undefined) {
    const foot = (FOOT[b.use] || 0.82) * footMul;
    drawConstruction(ctx, { cx, cy, w: w * foot, h: h * foot }, topH, opt.construction, b.seed, T, zoom);
    return { canvas: cv, ax: cx, ay: cy };
  }

  // 敷地の使われ方に沿って棟を並べる
  const vols = massingOf(b);
  const shrink = (FOOT[b.use] || 0.86) * footMul;        // 用途ごとの空き地のとり方
  const boxes = vols.map(v => {
    // 区画の中心に向かって少しだけ縮める（道路に接しすぎると軒がはみ出て見える）
    const k = (t) => 0.5 + (t - 0.5) * shrink;
    const o = volBox(cx, cy, w, h, k(v.u0), k(v.u1), k(v.v0), k(v.v1));
    return { v, o, H: Math.max(1.6, v.floors * fhM * Z_UNIT * zoom * (opt.heightMul ?? 1)) };
  }).sort((a, x) => a.o.depth - x.o.depth || a.H - x.H);

  let maxH = 0;
  for (const bx of boxes) maxH = Math.max(maxH, bx.H);

  for (const { v, o, H } of boxes) {
    // 棟ごとの見た目。用途・階数・種が変わるので、色も表情も1棟ずつ違う
    const vb = {
      use: v.use, floors: v.floors, grade: b.grade,
      facade: v.role === 'podium' ? 'glassbox' : b.facade,
      seed: (b.seed + v.seedAdd) | 0,
      lit: b.lit, antenna: b.antenna, crown: b.crown, height: v.floors * fhM,
      stack: v.role === 'main' && v.floors === b.floors ? b.stack : null,
    };
    // 足元の影（棟と棟のあいだに落ちる。これが無いと箱が浮いて見える）。
    // **`ctx.filter` のぼかしを使わないこと。** 1棟につき合成のやり直しが入り、
    // 倍率を変えた直後の1フレームが跳ね上がる。薄い菱形を2枚重ねれば足りる
    if (H > 3) {
      const a = 0.10 + (1 - T.faceTop) * 0.10;
      topDiamond(ctx, o, 0, -0.20);
      ctx.fillStyle = `rgba(12,18,30,${a * 0.6})`; ctx.fill();
      topDiamond(ctx, o, 0, -0.07);
      ctx.fillStyle = `rgba(12,18,30,${a})`; ctx.fill();
    }
    drawFacade(ctx, o, 'L', H, vb, T, zoom);
    drawFacade(ctx, o, 'R', H, vb, T, zoom);
    drawRoof(ctx, o, H, vb, T, zoom, H >= maxH - 0.5);
  }
  return { canvas: cv, ax: cx, ay: cy };   // ax,ay = タイル中心の位置
}
