// ============================================================
//  建物描画 — アイソメ立体・ファサード・屋上・工事現場
//  すべてオフスクリーンcanvasにキャッシュして都市描画に貼る
// ============================================================
import { hash2 } from '../core/rng.js';
import { shade, hsl, USE_HSL } from './palette.js';
import { TILE_W, TILE_H, Z_UNIT } from './iso.js';

/** 用途ごとの敷地占有率 */
const FOOT = { office: .84, resi: .80, rental: .80, retail: .90, hotel: .80, logi: .95, house: .60, mixed: .88 };
/** ベイ（窓の横方向分割数） */
const BAYS = { office: 7, resi: 6, rental: 6, retail: 5, hotel: 6, logi: 4, house: 3, mixed: 7 };

/** 平行四辺形パス：左面(u:W→S)／右面(u:S→E) */
function facePath(ctx, o, side, u0, u1, v0, v1, H) {
  const { cx, cy, w, h } = o;
  const p = (u, v) => side === 'L'
    ? [cx - w / 2 + u * w / 2, cy + u * h / 2 - v * H]
    : [cx + u * w / 2, cy + h / 2 - u * h / 2 - v * H];
  const a = p(u0, v0), b = p(u1, v0), c = p(u1, v1), d = p(u0, v1);
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
  ctx.closePath();
}

function topDiamond(ctx, o, H, inset = 0) {
  const { cx, cy, w, h } = o;
  const ww = w * (1 - inset), hh = h * (1 - inset);
  ctx.beginPath();
  ctx.moveTo(cx, cy - hh / 2 - H);
  ctx.lineTo(cx + ww / 2, cy - H);
  ctx.lineTo(cx, cy + hh / 2 - H);
  ctx.lineTo(cx - ww / 2, cy - H);
  ctx.closePath();
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
  g.addColorStop(0.82, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(6,10,18,${0.30 + (1 - T.faceTop) * 0.2})`);
  ctx.fillStyle = g;
  ctx.fill();
}

/** 1セグメント分のファサード。vA〜vB が担当する高さ範囲 */
function drawSeg(ctx, o, side, H, b, T, zoom, vA, vB, use, floors, segIndex) {
  const facade = facadeOf(use, b.stack ? 'auto' : b.facade);
  const seed = b.seed + segIndex * 977;
  const [hu, sa, li] = USE_HSL[use] || USE_HSL.office;
  const mul = side === 'L' ? T.faceL : T.faceR;
  const bays = Math.max(2, Math.round((BAYS[use] || 6) * (o.w / (TILE_W * zoom))));
  const span = Math.max(0.001, vB - vA);
  const fh = span / Math.max(1, floors);
  const winLit = T.windowLit * (b.lit ?? 0.6);
  const darkWin = shade(hu, sa + 10, li, mul * 0.40);

  // --- 壁 ---
  facePath(ctx, o, side, 0, 1, vA, vB, H);
  const wallTop = o.cy + o.h / 2 - H * vB, wallBot = o.cy + o.h / 2 - H * vA;
  const wg = ctx.createLinearGradient(0, wallTop, 0, wallBot);
  wg.addColorStop(0, shade(hu, sa, li, mul * 1.08));
  wg.addColorStop(1, shade(hu, sa, li, mul * 0.88));
  ctx.fillStyle = wg;
  ctx.fill();

  if (H * span < 4 || o.w < 12) return;
  const maxDraw = Math.min(floors, 64);
  const step = Math.max(1, Math.ceil(floors / maxDraw));

  if (facade === 'curtain') {
    // ガラスのカーテンウォール。空を映し込む
    const glassBase = shade(202, 22, 44, mul * 1.05);
    facePath(ctx, o, side, 0.03, 0.97, vA + fh * 0.1, vB - fh * 0.1, H);
    const sg = ctx.createLinearGradient(0, wallTop, 0, wallBot);
    sg.addColorStop(0, shade(T.key === 'night' ? 220 : 205, 30, T.key === 'night' ? 22 : 62, mul * 1.15));
    sg.addColorStop(0.55, glassBase);
    sg.addColorStop(1, shade(210, 18, 30, mul));
    ctx.fillStyle = sg; ctx.fill();
    // 横連窓の目地
    ctx.strokeStyle = shade(hu, sa, li, mul * 1.26, 0.7);
    ctx.lineWidth = Math.max(0.4, zoom * 0.55);
    for (let i = 0; i < floors; i += step) {
      const v = vA + (i + 1) * fh;
      facePath(ctx, o, side, 0.03, 0.97, v, v, H); ctx.stroke();
    }
    // 縦マリオン
    for (let bx = 1; bx < bays; bx++) {
      const u = bx / bays;
      facePath(ctx, o, side, u, u, vA, vB, H); ctx.stroke();
    }
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
      ctx.fillStyle = winLit > 0.25 ? 'rgba(255,226,172,0.80)' : shade(200, 20, 52, mul * 1.06);
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
    // 住宅：バルコニーと手すり
    for (let i = 0; i < floors; i += step) {
      const base = vA + i * fh;
      for (let bx = 0; bx < bays; bx++) {
        const u0 = 0.06 + bx / bays * 0.88, u1 = 0.06 + (bx + 0.8) / bays * 0.88;
        const r = hash2(seed + i * 17, bx * 13, side === 'L' ? 1 : 5);
        facePath(ctx, o, side, u0, u1, base + fh * 0.2, base + fh * 0.72, H);
        ctx.fillStyle = r < winLit ? LIT_COLORS[Math.floor(r * 887) % 6] : darkWin;
        ctx.fill();
      }
      // スラブと手すり
      facePath(ctx, o, side, -0.01, 1.01, base + fh * 0.02, base + fh * 0.13, H);
      ctx.fillStyle = shade(hu, sa - 4, li, mul * 1.20); ctx.fill();
      facePath(ctx, o, side, 0.02, 0.98, base + fh * 0.13, base + fh * 0.30, H);
      ctx.fillStyle = shade(200, 10, 58, mul * 0.9, 0.45); ctx.fill();
    }

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
      ctx.fillStyle = winLit > 0.35 ? 'rgba(255,238,196,0.7)' : shade(200, 14, 44, mul);
      ctx.fill();
    }
    // 搬入口
    facePath(ctx, o, side, 0.12, 0.42, vA + fh * 0.05, vA + fh * 0.5, H);
    ctx.fillStyle = shade(hu, sa, li * 0.6, mul); ctx.fill();

  } else if (facade === 'brick' || facade === 'stone') {
    const wide = facade === 'stone' ? 0.6 : 0.48;
    for (let i = 0; i < floors; i += step) {
      const v0 = vA + i * fh + fh * 0.24, v1 = vA + i * fh + fh * 0.76;
      for (let bx = 0; bx < bays; bx++) {
        const u0 = 0.08 + bx / bays * 0.84, u1 = 0.08 + (bx + wide) / bays * 0.84;
        const r = hash2(seed + i * 23, bx * 11, side === 'L' ? 2 : 6);
        facePath(ctx, o, side, u0, u1, v0, v1, H);
        ctx.fillStyle = r < winLit ? LIT_COLORS[Math.floor(r * 577) % 6] : darkWin;
        ctx.fill();
      }
      facePath(ctx, o, side, -0.01, 1.01, vA + i * fh + fh * 0.86, vA + i * fh + fh * 0.96, H);
      ctx.fillStyle = shade(hu, sa - 6, li, mul * 1.14); ctx.fill();
    }

  } else {
    // grid（標準の格子窓）
    for (let i = 0; i < floors; i += step) {
      const v0 = vA + i * fh + fh * 0.22, v1 = vA + i * fh + fh * 0.78;
      for (let bx = 0; bx < bays; bx++) {
        const u0 = 0.06 + bx / bays * 0.88, u1 = 0.06 + (bx + 0.74) / bays * 0.88;
        const r = hash2(seed + i * 29, bx * 19, side === 'L' ? 4 : 8);
        facePath(ctx, o, side, u0, u1, v0, v1, H);
        ctx.fillStyle = r < winLit ? LIT_COLORS[Math.floor(r * 733) % 6] : darkWin;
        ctx.fill();
      }
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
function drawRoof(ctx, o, H, b, T, zoom) {
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

  // 屋上スラブ
  topDiamond(ctx, o, H);
  ctx.fillStyle = shade(hu, sa - 6, li, T.faceTop * 0.86); ctx.fill();
  ctx.strokeStyle = shade(hu, sa, li, T.faceTop * 1.2, 0.6); ctx.lineWidth = Math.max(0.5, zoom * 0.7); ctx.stroke();
  // パラペット
  topDiamond(ctx, o, H + 2.2 * zoom);
  ctx.fillStyle = shade(hu, sa, li, T.faceTop * 1.06); ctx.fill();

  if (w < 16) return;
  const hi = floors > 26;

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
  if (hi && hash2(seed, 71) > 0.55) {
    ctx.save();
    ctx.translate(cx, cy - H - 2.2 * zoom); ctx.scale(1, TILE_H / TILE_W);
    ctx.beginPath(); ctx.arc(0, 0, w * 0.19, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(210,215,225,0.30)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(0.8, zoom * 1.1); ctx.stroke();
    ctx.font = `${Math.max(5, w * 0.16)}px Oswald, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('H', 0, 0);
    ctx.restore();
  }

  // アンテナ／航空障害灯
  if (b.antenna) {
    const ah = (10 + hash2(seed, 91) * 22) * zoom;
    ctx.strokeStyle = shade(hu, 4, 62, T.faceTop); ctx.lineWidth = Math.max(0.8, zoom * 1.1);
    ctx.beginPath(); ctx.moveTo(cx, cy - H - 2 * zoom); ctx.lineTo(cx, cy - H - 2 * zoom - ah); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy - H - 2 * zoom - ah, Math.max(1.2, zoom * 1.6), 0, Math.PI * 2);
    ctx.fillStyle = '#ff4d5e'; ctx.shadowColor = '#ff2d3e'; ctx.shadowBlur = 9 * zoom; ctx.fill(); ctx.shadowBlur = 0;
  }
  // クラウン（上部の段差）
  if (hi && b.crown > 1) {
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
  if (T.glow > 0.4 && (use === 'retail' || use === 'hotel' || use === 'office') && hash2(seed, 55) > 0.45) {
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
  const foot = (FOOT[b.use] || 0.82) * (opt.footMul || 1);
  const bw = w * foot, bh = h * foot;
  const H = Math.max(2, b.height * Z_UNIT * zoom * (opt.heightMul ?? 1));
  const pad = Math.max(30, 44 * zoom);
  const cw = Math.ceil(w + pad * 2), ch = Math.ceil(H + h + pad * 2);

  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d');
  // タイル中心のローカル座標
  const cx = cw / 2, cy = ch - pad - h / 2;
  const o = { cx, cy, w: bw, h: bh };

  if (opt.construction !== undefined) {
    drawConstruction(ctx, o, H, opt.construction, b.seed, T, zoom);
  } else {
    drawFacade(ctx, o, 'L', H, b, T, zoom);
    drawFacade(ctx, o, 'R', H, b, T, zoom);
    drawRoof(ctx, o, H, b, T, zoom);
  }
  return { canvas: cv, ax: cx, ay: cy };   // ax,ay = タイル中心の位置
}
