// ============================================================
//  都市レンダラ — 空・地面・建物・エフェクト
// ============================================================
import { hash2 } from '../core/rng.js';
import { MAP_W, MAP_H, DISTRICTS, TERRAIN, USES, CITIES } from '../data/city.js';
import { TIMES, WEATHERS, timeOfMonth, hsl, shade } from './palette.js';
import { TILE_W, TILE_H, Z_UNIT, toScreen, fromScreen, depthKey, diamond, rotate } from './iso.js';
import { renderBuilding } from './buildings.js';

export const ZOOM_STEPS = [0.30, 0.40, 0.52, 0.66, 0.84, 1.06, 1.34];

// スマートフォンは描画性能が低いので、1フレームで作り直す建物数を減らす
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer:coarse)').matches;
const SPRITE_BUDGET = COARSE ? 8 : 18;

export class CityRenderer {
  constructor(canvas, game) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.g = game;
    this.cam = { x: 0, y: 0, zoomIdx: 1, rot: 0 };
    this.time = timeOfMonth(game.month || 1);
    this.weather = WEATHERS.clear;
    this.layer = 'normal';        // normal | owner | value
    this.hover = null;
    this.selected = null;
    this.cache = new Map();
    this.last = new Map();      // 直前の時間帯のスプライト（再生成中のつなぎ）
    this.budget = 999;
    this.t = 0;
    this.stars = null;
    this.skyline = null;
    this.pulse = 0;
    this.city = 'minato';      // いま見ている都市
    this.resize();
  }

  get zoom() { return ZOOM_STEPS[this.cam.zoomIdx]; }

  resize() {
    this.w = this.cv.clientWidth; this.h = this.cv.clientHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    // 端末によっては dpr が3以上ある。描画するピクセル数に上限を設ける
    const MAX_PIX = 2.6e6;
    const area = Math.max(1, this.w * this.h);
    if (area * dpr * dpr > MAX_PIX) dpr = Math.max(1, Math.sqrt(MAX_PIX / area));
    this.cv.width = Math.floor(this.w * dpr);
    this.cv.height = Math.floor(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.dpr = dpr;
    this.skyline = null;
    this._ground = null;
    this._groundOff = false;
    this._skySig = null; this._sunSig = null;
  }

  invalidate() {
    // 一度に全棟を描き直すと重いので、フレームごとに少しずつ作り替える
    this.cache.clear();
    this._ground = null;
    this._groundOff = false;
    this._order = null;      // セーブを読み込むと区画そのものが入れ替わる
  }

  setMonth(m) {
    const t = timeOfMonth(m);
    if (t !== this.time) { this.time = t; this.invalidate(); this.skyline = null; }
  }
  setWeather(key) { this.weather = WEATHERS[key] || WEATHERS.clear; }

  center() {
    this.centerOn(MAP_W / 2, MAP_H / 2);
  }

  /** 指定した位置が画面中央に来るようカメラを置く。建物が上に伸びる分だけ下げる */
  centerOn(gx, gy) {
    const p = toScreen(gx, gy, 0, this.cam.rot, this.zoom);
    this.cam.x = -p.x;
    this.cam.y = -p.y + this.h * 0.14;
  }

  /**
   * ある都市の区画が占める範囲。
   * 地図が広がっても、いま見たい街だけを画面に収められるようにする。
   */
  cityBounds(cityId) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
    for (const c of this.g.cells) {
      if (!c.d || c.terrain !== TERRAIN.LOT) continue;
      if (cityId && (DISTRICTS[c.d].city || 'minato') !== cityId) continue;
      n++;
      if (c.gx < x0) x0 = c.gx; if (c.gx > x1) x1 = c.gx;
      if (c.gy < y0) y0 = c.gy; if (c.gy > y1) y1 = c.gy;
    }
    if (!n) return { x0: 0, y0: 0, x1: MAP_W - 1, y1: MAP_H - 1, cx: MAP_W / 2, cy: MAP_H / 2, w: MAP_W, h: MAP_H };
    return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0 + 3, h: y1 - y0 + 3 };
  }

  // 画面にその都市がだいたい収まる倍率に合わせる（小さい画面向け）
  fit(cityId = this.city) {
    const b = this.cityBounds(cityId);
    const wSpan = (b.w + b.h) * (TILE_W / 2);
    const hSpan = (b.w + b.h) * (TILE_H / 2);
    let idx = 0;
    for (let i = 0; i < ZOOM_STEPS.length; i++) {
      const z = ZOOM_STEPS[i];
      if (wSpan * z <= this.w * 1.06 && hSpan * z <= this.h * 0.78) idx = i;
    }
    this.cam.zoomIdx = idx;
    this.invalidate();
    this.centerOn(b.cx, b.cy);
  }

  /** 見る都市を切り替える */
  focusCity(cityId, zoomIdx) {
    this.city = cityId;
    const b = this.cityBounds(cityId);
    if (typeof zoomIdx === 'number') { this.cam.zoomIdx = zoomIdx; this.invalidate(); }
    this.centerOn(b.cx, b.cy);
    return CITIES[cityId] ? CITIES[cityId].name : '';
  }

  zoomBy(d, ax, ay) {
    const ni = Math.max(0, Math.min(ZOOM_STEPS.length - 1, this.cam.zoomIdx + d));
    if (ni === this.cam.zoomIdx) return;
    const old = this.zoom;
    this.cam.zoomIdx = ni;
    const k = this.zoom / old;
    // カーソル位置を基準に拡大
    const cx = (ax ?? this.w / 2) - this.w / 2, cy = (ay ?? this.h / 2) - this.h / 2;
    this.cam.x = (this.cam.x - cx) * k + cx;
    this.cam.y = (this.cam.y - cy) * k + cy;
    this.invalidate();
  }
  rotateBy(d) { this.cam.rot = (this.cam.rot + d + 4) & 3; this.invalidate(); }

  /** 画面座標 → セル */
  pick(mx, my) {
    const sx = mx - this.w / 2 - this.cam.x;
    const sy = my - this.h / 2 - this.cam.y;
    // 建物の高さを考慮し、上から手前のセルを優先して当てる
    const cands = [];
    for (let dz = 0; dz < 60; dz += 1.5) {
      const [gx, gy] = fromScreen(sx, sy + dz * Z_UNIT * this.zoom, this.cam.rot, this.zoom);
      if (gx < 0 || gy < 0 || gx >= MAP_W || gy >= MAP_H) continue;
      const c = this.g.cells[gy * MAP_W + gx];
      if (!c) continue;
      const bh = this.heightOf(c);
      if (dz <= bh + 0.6) cands.push({ c, d: depthKey(gx, gy, this.cam.rot), dz });
    }
    if (!cands.length) {
      const [gx, gy] = fromScreen(sx, sy, this.cam.rot, this.zoom);
      if (gx < 0 || gy < 0 || gx >= MAP_W || gy >= MAP_H) return null;
      return this.g.cells[gy * MAP_W + gx];
    }
    cands.sort((a, b) => b.d - a.d || b.dz - a.dz);
    return cands[0].c;
  }

  heightOf(c) {
    if (c.building) return c.building.height;
    if (c.projectId) {
      const pj = this.g.projects.find(p => p.id === c.projectId);
      if (pj) return pj.heightM * Math.max(0.08, pj.progress);
    }
    return 0;
  }

  // --------------------------------------------------------
  //  空
  // --------------------------------------------------------
  drawSky() {
    const { ctx, w, h } = this;
    const T = this.time, W = this.weather;
    const hz0 = this.horizonY();
    // 空のグラデーションは時間帯と画面サイズでしか変わらない。
    // 毎フレーム作り直さずに使い回す
    const skySig = `${T.key}|${hz0.toFixed(0)}|${w}x${h}`;
    if (this._skySig !== skySig) {
      const g0 = ctx.createLinearGradient(0, Math.min(0, hz0 - h * 1.35), 0, hz0);
      T.sky.forEach((c, i) => g0.addColorStop(i / (T.sky.length - 1), c));
      this._skyGrad = g0; this._skySig = skySig;
    }
    ctx.fillStyle = this._skyGrad; ctx.fillRect(0, 0, w, Math.max(1, hz0));

    // 星
    if (T.key === 'night') {
      if (!this.stars) {
        this.stars = [];
        for (let i = 0; i < 160; i++) this.stars.push({ x: hash2(i, 1) * w, y: hash2(i, 2) * h * 0.55, r: hash2(i, 3) * 1.3 + 0.2, p: hash2(i, 4) });
      }
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, Math.max(1, hz0)); ctx.clip();
      ctx.save();
      for (const s of this.stars) {
        ctx.globalAlpha = (0.3 + 0.7 * Math.abs(Math.sin(this.t * 0.7 + s.p * 9))) * (1 - W.cloud * 0.8);
        ctx.fillStyle = '#e8f0ff';
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
      ctx.restore();
      ctx.restore();
    }

    // 太陽／月
    const sx = T.sun.x * w, sy = hz0 - T.sun.alt * Math.max(180, hz0);
    // 太陽・月のにじみも動かないので使い回す
    if (this._sunSig !== skySig) {
      const s0 = ctx.createRadialGradient(sx, sy, 0, sx, sy, T.sun.r * 5);
      s0.addColorStop(0, T.sun.color);
      s0.addColorStop(0.18, T.sun.color.replace(/[\d.]+\)$/, '0.30)'));
      s0.addColorStop(1, 'rgba(0,0,0,0)');
      this._sunGrad = s0; this._sunSig = skySig;
    }
    const sg = this._sunGrad;
    ctx.save(); ctx.globalAlpha = 1 - W.cloud * 0.65;
    ctx.beginPath(); ctx.rect(0, 0, w, Math.max(1, hz0)); ctx.clip();
    ctx.fillStyle = sg; ctx.fillRect(0, 0, w, h);
    ctx.beginPath(); ctx.arc(sx, sy, T.sun.r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = T.key === 'night' ? 'rgba(232,240,255,0.92)' : T.sun.color; ctx.fill();
    ctx.restore();

    // 雲
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, Math.max(1, hz0)); ctx.clip();
    const cn = Math.round(6 + W.cloud * 14);
    for (let i = 0; i < cn; i++) {
      const sp = 6 + hash2(i, 11) * 14;
      const cx = ((hash2(i, 12) * w * 1.6 + this.t * sp) % (w * 1.6)) - w * 0.3;
      const cy = hash2(i, 13) * Math.max(60, hz0 * 0.72);
      const cw = 60 + hash2(i, 14) * 180, chh = 14 + hash2(i, 15) * 26;
      const a = (0.06 + W.cloud * 0.30) * (0.5 + hash2(i, 16) * 0.5);
      ctx.globalAlpha = a;
      const cg = ctx.createLinearGradient(0, cy - chh, 0, cy + chh);
      cg.addColorStop(0, T.key === 'evening' ? '#ffcba0' : T.key === 'night' ? '#2a3a55' : '#ffffff');
      cg.addColorStop(1, T.key === 'night' ? '#18243a' : '#c8d6e8');
      ctx.fillStyle = cg;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const bx = cx + (k / 4 - 0.5) * cw, br = chh * (0.6 + hash2(i, 20 + k) * 0.8);
        ctx.moveTo(bx + br, cy); ctx.arc(bx, cy, br, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.restore();

    // 遠景スカイライン
    const hz = this.horizonY();
    this.drawSkyline(hz);
    // 海（地平線より下）
    this.drawSea(hz);
    // 地平のもや
    const fg = ctx.createLinearGradient(0, hz - h * 0.16, 0, hz + h * 0.10);
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.55, T.fog); fg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fg; ctx.fillRect(0, Math.max(0, hz - h * 0.16), w, h * 0.26);
  }

  /** 地平線のY座標（カメラに緩やかに追随する） */
  horizonY() {
    return this.h * 0.40 + this.cam.y * 0.22;
  }

  /** 海面 */
  drawSea(hz) {
    const { ctx, w, h } = this;
    const T = this.time, W = this.weather;
    const top = Math.max(-h, hz);
    const g = ctx.createLinearGradient(0, top, 0, h);
    const pal = {
      morning: ['#7d97b8', '#3d5b80', '#1e3550'],
      noon: ['#89b4d8', '#3d76a8', '#1d4a72'],
      evening: ['#c98868', '#6b3f58', '#2c1e36'],
      night: ['#1b3350', '#0d1c30', '#060d18'],
    }[T.key];
    g.addColorStop(0, pal[0]); g.addColorStop(0.18, pal[1]); g.addColorStop(1, pal[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, top, w, h - top);
    // 波
    ctx.save();
    ctx.beginPath(); ctx.rect(0, top, w, h - top); ctx.clip();
    for (let i = 0; i < 70; i++) {
      const r = hash2(i, 31), r2 = hash2(i, 37);
      const depth = r2 * r2;
      const y = top + depth * (h - top) + Math.sin(this.t * 0.9 + r * 20) * 2;
      const len = (8 + r * 90) * (0.3 + depth);
      ctx.globalAlpha = (0.05 + r * 0.14) * (1 - W.cloud * 0.4);
      ctx.fillStyle = T.key === 'evening' ? '#ffcb9a' : T.key === 'night' ? '#6f9ad0' : '#ffffff';
      ctx.fillRect(((r * w * 1.4 + this.t * (6 + depth * 20)) % (w * 1.4)) - w * 0.2, y, len, 1 + depth * 2);
    }
    ctx.restore();
  }

  drawSkyline(hz) {
    const { ctx, w, h } = this;
    const T = this.time;
    if (!this.skyline || this.skyline.w !== w) {
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.floor(w)); cv.height = Math.max(1, Math.floor(h * 0.24));
      const c2 = cv.getContext('2d');
      for (let layer = 0; layer < 2; layer++) {
        let x = -20;
        const base = cv.height;
        while (x < cv.width + 20) {
          const r1 = hash2(Math.floor(x), layer * 7 + 1), r2 = hash2(Math.floor(x), layer * 7 + 2);
          const bw = 14 + r1 * 38, bh = (12 + r2 * 58) * (layer ? 0.66 : 1);
          c2.fillStyle = layer
            ? (T.key === 'night' ? 'rgba(20,32,55,0.85)' : T.key === 'evening' ? 'rgba(76,48,66,0.7)' : 'rgba(150,175,205,0.45)')
            : (T.key === 'night' ? 'rgba(10,18,34,0.95)' : T.key === 'evening' ? 'rgba(48,30,48,0.85)' : 'rgba(112,142,180,0.55)');
          c2.fillRect(x, base - bh, bw, bh);
          if (T.key === 'night' || T.key === 'evening') {
            c2.fillStyle = T.key === 'night' ? 'rgba(255,225,160,0.55)' : 'rgba(255,190,120,0.35)';
            for (let yy = base - bh + 4; yy < base - 4; yy += 6) {
              for (let xx = x + 3; xx < x + bw - 3; xx += 5) {
                if (hash2(Math.floor(xx), Math.floor(yy)) > 0.62) c2.fillRect(xx, yy, 2, 3);
              }
            }
          }
          x += bw + 2 + r1 * 8;
        }
      }
      this.skyline = { cv, w };
    }
    ctx.save();
    ctx.globalAlpha = 0.85 - this.weather.cloud * 0.35;
    ctx.drawImage(this.skyline.cv, 0, (hz ?? h * 0.4) - this.skyline.cv.height);
    ctx.restore();
  }

  // --------------------------------------------------------
  //  地面タイル
  // --------------------------------------------------------
  tileColor(c) {
    const T = this.time;
    if (c.terrain === TERRAIN.WATER) return null;
    if (c.terrain === TERRAIN.ROAD) return shade(220, 4, 38, T.faceTop);
    if (c.terrain === TERRAIN.AVENUE) return shade(220, 3, 42, T.faceTop);
    if (c.terrain === TERRAIN.PARK || c.terrain === TERRAIN.GREEN) return shade(118, 26, 40, T.faceTop);
    const d = DISTRICTS[c.d];
    if (this.layer === 'owner') {
      if (c.owner === 'player') return shade(45, 70, 46, T.faceTop);
      if (c.owner && c.owner !== 'other') {
        const r = this.g.rivals.find(x => x.id === c.owner);
        if (r) { const [h2, s2, l2] = hexToHsl(r.color); return shade(h2, s2, l2 * 0.6, T.faceTop); }
      }
      return shade(0, 0, 26, T.faceTop);
    }
    if (this.layer === 'value' && c.baseValue) {
      const v = Math.min(1, c.baseValue / 42000);
      return shade(240 - v * 240, 62, 20 + v * 26, T.faceTop);
    }
    return shade(d ? d.hue : 210, 6, c.vacant ? 46 : 38, T.faceTop);
  }

  drawTile(c, px, py) {
    const { ctx } = this;
    const z = this.zoom, T = this.time;
    const w = TILE_W * z, h = TILE_H * z;
    const eh = (c.elev || 0) * 6 * Z_UNIT * z;

    if (c.terrain === TERRAIN.WATER) {
      diamond(ctx, px, py, w + 1, h + 1);
      const g = ctx.createLinearGradient(px, py - h / 2, px, py + h / 2);
      g.addColorStop(0, T.key === 'night' ? '#08182e' : T.key === 'evening' ? '#3a2a44' : '#15456e');
      g.addColorStop(1, T.key === 'night' ? '#0b2038' : T.key === 'evening' ? '#5c3348' : '#1d5c8d');
      ctx.fillStyle = g; ctx.fill();
      // きらめき
      ctx.save(); ctx.clip();
      for (let i = 0; i < 5; i++) {
        const r = hash2(c.gx * 13 + i, c.gy * 7);
        const yy = py - h / 2 + r * h;
        const ph = Math.sin(this.t * 1.4 + r * 12) * 0.5 + 0.5;
        ctx.globalAlpha = 0.10 + ph * 0.22;
        ctx.fillStyle = T.key === 'evening' ? '#ffb070' : T.key === 'night' ? '#7fa8d8' : '#ffffff';
        ctx.fillRect(px - w * 0.3 + (r - 0.5) * 8, yy, w * (0.16 + ph * 0.3), Math.max(1, z * 1.1));
      }
      ctx.restore();
      return;
    }

    // 土の側面（起伏）
    if (eh > 0.4) {
      ctx.beginPath();
      ctx.moveTo(px - w / 2, py); ctx.lineTo(px, py + h / 2);
      ctx.lineTo(px, py + h / 2 + eh); ctx.lineTo(px - w / 2, py + eh);
      ctx.closePath(); ctx.fillStyle = shade(28, 18, 20, T.faceL); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(px, py + h / 2); ctx.lineTo(px + w / 2, py);
      ctx.lineTo(px + w / 2, py + eh); ctx.lineTo(px, py + h / 2 + eh);
      ctx.closePath(); ctx.fillStyle = shade(28, 18, 16, T.faceR); ctx.fill();
    }

    diamond(ctx, px, py, w + 0.8, h + 0.8);
    ctx.fillStyle = this.tileColor(c); ctx.fill();

    if (c.terrain === TERRAIN.ROAD || c.terrain === TERRAIN.AVENUE) {
      this.drawRoad(c, px, py, w, h);
    } else if (c.terrain === TERRAIN.PARK || c.terrain === TERRAIN.GREEN) {
      this.drawPark(c, px, py, w, h);
    } else if (this.layer === 'normal') {
      // 歩道（区画の外周）
      ctx.save();
      diamond(ctx, px, py, w + 0.8, h + 0.8); ctx.clip();
      diamond(ctx, px, py, w + 0.8, h + 0.8);
      ctx.fillStyle = shade(212, 4, 58, T.faceTop); ctx.fill();
      diamond(ctx, px, py, w * 0.86, h * 0.86);
      ctx.fillStyle = this.tileColor(c); ctx.fill();
      ctx.restore();
      // 縁石
      ctx.strokeStyle = shade(212, 3, 72, T.faceTop, 0.5); ctx.lineWidth = Math.max(0.4, z * 0.55);
      diamond(ctx, px, py, w * 0.86, h * 0.86); ctx.stroke();
      // 敷地内の舗装と植栽
      if (z > 0.5 && c.building) {
        const r = hash2(c.gx, c.gy, 44);
        if (r > 0.6) {
          ctx.save(); diamond(ctx, px, py, w * 0.84, h * 0.84); ctx.clip();
          ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = Math.max(0.4, z * 0.5);
          for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.moveTo(px - w * 0.3 + i * w * 0.08, py + h * 0.28);
            ctx.lineTo(px - w * 0.06 + i * w * 0.08, py + h * 0.4);
            ctx.stroke();
          }
          ctx.restore();
        }
        if (r < 0.42 && z > 0.6) {
          this.drawTree(px + (r - 0.2) * w * 0.5, py + h * 0.30, z * 0.7, c.gx * 3, c.gy * 5);
        }
      }
      if (c.vacant && !c.projectId) {
        // 更地：砂利と区画ロープ
        ctx.save(); diamond(ctx, px, py, w * 0.9, h * 0.9); ctx.clip();
        ctx.fillStyle = 'rgba(190,175,150,0.13)';
        for (let i = 0; i < 16; i++) {
          const rx = hash2(c.gx * 31 + i, c.gy * 17), ry = hash2(c.gx * 13, c.gy * 29 + i);
          ctx.fillRect(px - w / 2 + rx * w, py - h / 2 + ry * h, z * 1.6, z * 1.1);
        }
        ctx.restore();
      }
    }
    // 時間帯の色被せ
    diamond(ctx, px, py, w + 0.8, h + 0.8);
    ctx.fillStyle = T.groundTint; ctx.fill();
  }

  drawRoad(c, px, py, w, h) {
    const { ctx } = this;
    const z = this.zoom, T = this.time;
    const avenue = c.terrain === TERRAIN.AVENUE;
    const g = this.g;
    const at = (x, y) => (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) ? g.cells[y * MAP_W + x] : null;
    const isRoad = cc => cc && (cc.terrain === TERRAIN.ROAD || cc.terrain === TERRAIN.AVENUE);
    const n = isRoad(at(c.gx, c.gy - 1)), s = isRoad(at(c.gx, c.gy + 1));
    const e = isRoad(at(c.gx + 1, c.gy)), ww = isRoad(at(c.gx - 1, c.gy));

    ctx.save(); diamond(ctx, px, py, w, h); ctx.clip();
    // 舗装の質感
    ctx.fillStyle = 'rgba(0,0,0,.05)';
    for (let i = 0; i < 6; i++) {
      const rx = hash2(c.gx * 7 + i, c.gy * 3), ry = hash2(c.gx, c.gy * 11 + i);
      ctx.fillRect(px - w / 2 + rx * w, py - h / 2 + ry * h, w * 0.1, h * 0.12);
    }
    // 中央線
    ctx.strokeStyle = avenue ? 'rgba(235,200,90,0.55)' : 'rgba(250,252,255,0.42)';
    ctx.lineWidth = Math.max(0.6, z * (avenue ? 1.2 : 0.9));
    ctx.setLineDash(avenue ? [] : [z * 5, z * 5]);
    if (e || ww) { ctx.beginPath(); ctx.moveTo(px - w / 2, py); ctx.lineTo(px + w / 2, py); ctx.stroke(); }
    if (n || s) { ctx.beginPath(); ctx.moveTo(px, py - h / 2); ctx.lineTo(px, py + h / 2); ctx.stroke(); }
    ctx.setLineDash([]);
    // 交差点には横断歩道を引く
    if ((n || s) && (e || ww)) {
      ctx.fillStyle = 'rgba(250,252,255,0.5)';
      for (let i = 0; i < 4; i++) {
        const t0 = 0.18 + i * 0.12;
        // 北東の辺に沿って
        ctx.beginPath();
        ctx.moveTo(px + w * 0.5 * t0, py - h * 0.5 * t0);
        ctx.lineTo(px + w * 0.5 * (t0 + 0.06), py - h * 0.5 * (t0 + 0.06));
        ctx.lineTo(px + w * 0.5 * (t0 + 0.06) + w * 0.1, py - h * 0.5 * (t0 + 0.06) + h * 0.1);
        ctx.lineTo(px + w * 0.5 * t0 + w * 0.1, py - h * 0.5 * t0 + h * 0.1);
        ctx.closePath(); ctx.fill();
      }
    }
    // 街灯と光溜まり
    if (T.street > 0) {
      const lit = `rgba(255,214,150,${0.13 * T.street})`;
      ctx.fillStyle = lit;
      ctx.beginPath(); ctx.ellipse(px - w * 0.26, py + h * 0.1, w * 0.2, h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(px + w * 0.26, py - h * 0.1, w * 0.2, h * 0.4, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // 街路樹（幹線のみ／密度は決定的）
    if (avenue && z > 0.5) {
      for (const sgn of [-1, 1]) {
        if (hash2(c.gx * 7 + sgn, c.gy * 11) > 0.45) {
          this.drawTree(px + sgn * w * 0.3, py + sgn * h * 0.3, z * 0.85, c.gx + sgn, c.gy);
        }
      }
    }
    // 車
    if (z > 0.45 && (avenue || hash2(c.gx, c.gy, 5) > 0.5)) {
      const cars = avenue ? 2 : 1;
      for (let i = 0; i < cars; i++) {
        const sd = hash2(c.gx * 3 + i, c.gy * 5);
        const horiz = (e || ww) && (sd > 0.5 || !(n || s));
        const speed = 0.12 + sd * 0.1;
        let p = ((this.t * speed + sd) % 1);
        const dir = sd > 0.5 ? 1 : -1;
        if (dir < 0) p = 1 - p;
        const off = (i === 0 ? -1 : 1) * (horiz ? h : w) * 0.11;
        const cxp = horiz ? px - w / 2 + p * w : px + off * 0.6;
        const cyp = horiz ? py + off : py - h / 2 + p * h;
        const cl = ['#d8dde6', '#2f3644', '#b03a3a', '#3a6fb0', '#d8b23a'][Math.floor(sd * 5)];
        ctx.fillStyle = cl;
        const cwid = Math.max(2, z * 4.2), chei = Math.max(1.4, z * 2.4);
        ctx.fillRect(cxp - cwid / 2, cyp - chei / 2, cwid, chei);
        if (T.street > 0.3) {
          ctx.fillStyle = `rgba(255,230,170,${0.5 * T.street})`;
          ctx.fillRect(cxp + (horiz ? dir * cwid / 2 : 0) - 1, cyp - 0.8, 2.2, 1.6);
        }
      }
    }
  }

  drawPark(c, px, py, w, h) {
    const { ctx } = this;
    const z = this.zoom, T = this.time;
    ctx.save(); diamond(ctx, px, py, w * 0.98, h * 0.98); ctx.clip();
    // 芝のムラ
    for (let i = 0; i < 10; i++) {
      const rx = hash2(c.gx * 19 + i, c.gy * 23), ry = hash2(c.gx * 29, c.gy * 31 + i);
      ctx.fillStyle = `rgba(${90 + rx * 40},${140 + ry * 50},${70 + rx * 30},0.14)`;
      ctx.beginPath(); ctx.ellipse(px - w / 2 + rx * w, py - h / 2 + ry * h, w * 0.14, h * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    }
    // 園路
    ctx.strokeStyle = 'rgba(210,200,180,0.18)'; ctx.lineWidth = Math.max(1, z * 2.4);
    ctx.beginPath(); ctx.moveTo(px - w / 2, py); ctx.quadraticCurveTo(px, py - h * 0.2, px + w / 2, py); ctx.stroke();
    ctx.restore();
    const n = 4 + Math.floor(hash2(c.gx, c.gy, 3) * 3);
    for (let i = 0; i < n; i++) {
      const rx = hash2(c.gx * 37 + i, c.gy * 41), ry = hash2(c.gx * 43, c.gy * 47 + i);
      const ox = (rx - 0.5) * w * 0.62, oy = (ry - 0.5) * h * 0.62;
      this.drawTree(px + ox, py + oy, z * (0.8 + rx * 0.6), c.gx + i, c.gy);
    }
  }

  drawTree(x, y, z, sx, sy) {
    const { ctx } = this;
    const T = this.time;
    const th = (7 + hash2(sx, sy, 9) * 7) * z;
    const tr = (3.4 + hash2(sx, sy, 10) * 2.6) * z;
    ctx.fillStyle = shade(30, 26, 18, T.faceR);
    ctx.fillRect(x - z * 0.6, y - th * 0.55, Math.max(1, z * 1.2), th * 0.6);
    const g = ctx.createRadialGradient(x - tr * 0.3, y - th - tr * 0.3, tr * 0.2, x, y - th, tr * 1.3);
    const dark = T.key === 'night';
    g.addColorStop(0, dark ? '#1d3a2a' : shade(108, 38, 40, T.faceTop));
    g.addColorStop(1, dark ? '#0e1f18' : shade(120, 32, 22, T.faceR));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y - th, tr, tr * 0.92, 0, 0, Math.PI * 2); ctx.fill();
  }

  // --------------------------------------------------------
  //  建物
  // --------------------------------------------------------
  buildingSprite(c) {
    const key = `${c.id}|${this.cam.zoomIdx}|${this.time.key}`;
    const pj = c.projectId ? this.g.projects.find(p => p.id === c.projectId) : null;
    const fullKey = pj ? `${key}|c${Math.round(pj.progress * 10)}` : key;
    let s = this.cache.get(fullKey);
    if (s) return s;
    if (this.budget <= 0) {
      const old = this.last.get(c.id);
      if (old) return old;
    }
    this.budget--;
    if (pj && pj.status !== 'done') {
      const pseudo = { use: pj.use, floors: pj.floors, grade: pj.grade, facade: 'grid', height: pj.heightM, seed: pj.seed, lit: 0.4, antenna: false, crown: 0 };
      s = renderBuilding(pseudo, this.time, this.zoom, { construction: pj.progress });
    } else if (c.building) {
      s = renderBuilding(c.building, this.time, this.zoom);
    } else return null;
    this.cache.set(fullKey, s);
    this.last.set(c.id, s);
    return s;
  }

  // --------------------------------------------------------
  //  地面のキャッシュ
  // --------------------------------------------------------

  /** 奥から手前へ並べた区画。回転が変わらなければ使い回せる */
  drawOrder() {
    if (this._order && this._orderRot === this.cam.rot) return this._order;
    const g = this.g;
    const arr = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const c = g.cells[y * MAP_W + x];
      if (c) arr.push({ c, k: depthKey(x, y, this.cam.rot) });
    }
    arr.sort((a, b) => a.k - b.k);
    this._order = arr; this._orderRot = this.cam.rot;
    return arr;
  }

  /** 地面の内容が変わったことを知らせる */
  dirtyGround() { this._ground = null; }

  /**
   * 地面の見た目に関わる状態の指紋。
   * 建物の有無・更地・着工中、所有者表示のときは所有者も見る。
   * これが変わらないかぎり焼き直さない。
   */
  groundSig() {
    const owner = this.layer === 'owner';
    let n = 5381;
    for (const c of this.g.cells) {
      let v = (c.building ? 1 : 0) | (c.vacant ? 2 : 0) | (c.projectId ? 4 : 0);
      if (owner && c.owner) v += c.owner.length * 8 + c.owner.charCodeAt(0);
      n = (n * 33 + v) | 0;
    }
    return n;
  }

  /**
   * マップ全体の地面を1枚の画像に焼く。
   * 大きくなりすぎるときは null を返し、呼び出し側は1枚ずつ描く。
   */
  groundLayer(order) {
    const z = this.zoom;
    const key = `${this.cam.zoomIdx}|${this.cam.rot}|${this.time.key}|${this.layer}|${this.groundSig()}`;
    // いま画面に入っているワールド座標の範囲
    const vx0 = -this.w / 2 - this.cam.x, vx1 = this.w / 2 - this.cam.x;
    const vy0 = -this.h / 2 - this.cam.y, vy1 = this.h / 2 - this.cam.y;
    const gd = this._ground;
    // 焼いたときに面倒を見ると決めた範囲（cov）に画面が収まっていれば使い回す。
    // 焼いた画像そのものはマップの外を切り落としてあるので、
    // 画像の大きさで判定すると、端に寄せたときに毎フレーム焼き直しになる
    if (gd && gd.key === key && gd.cov
      && vx0 >= gd.cov.x0 && vy0 >= gd.cov.y0
      && vx1 <= gd.cov.x1 && vy1 <= gd.cov.y1) return gd;

    // マップ四隅（起伏と島の厚みぶんの余白を足す）
    let mx0 = Infinity, my0 = Infinity, mx1 = -Infinity, my1 = -Infinity;
    for (const [gx, gy] of [[-1, -1], [MAP_W, -1], [MAP_W, MAP_H], [-1, MAP_H]]) {
      const p = toScreen(gx, gy, 0, this.cam.rot, z);
      if (p.x < mx0) mx0 = p.x; if (p.x > mx1) mx1 = p.x;
      if (p.y < my0) my0 = p.y; if (p.y > my1) my1 = p.y;
    }
    const pad = TILE_W * z;
    mx0 -= pad; mx1 += pad;
    my0 -= 7 * 6 * Z_UNIT * z + pad;     // 最大標高ぶん上に伸ばす
    my1 += pad;

    // 焼くのは「画面の少し外まで」。マップ全体を焼こうとすると、
    // 拡大したときに上限を超えて毎フレーム1枚ずつ描くことになり、
    // そこがいちばん重くなる。画面まわりだけなら拡大しても焼ける
    const mgx = this.w * 0.3, mgy = this.h * 0.3;
    const cov = { x0: vx0 - mgx, y0: vy0 - mgy, x1: vx1 + mgx, y1: vy1 + mgy };
    let x0 = Math.max(mx0, cov.x0), x1 = Math.min(mx1, cov.x1);
    let y0 = Math.max(my0, cov.y0), y1 = Math.min(my1, cov.y1);
    if (!(x1 > x0 && y1 > y0)) return null;     // 画面がマップの外

    const dpr = this.dpr;   // 本体と同じ解像度で焼くと、貼るときに拡大縮小が入らない
    let cw = Math.ceil(x1 - x0), ch = Math.ceil(y1 - y0);
    // それでも大きすぎるときは、余白を削ってから諦める
    // （上限は端末のメモリを食いつぶさないための歯止め。6e6px ≒ 24MB）
    const LIMIT = 6e6;
    if (cw * ch * dpr * dpr > LIMIT) {
      cov.x0 = vx0; cov.x1 = vx1; cov.y0 = vy0; cov.y1 = vy1;
      x0 = Math.max(mx0, vx0); x1 = Math.min(mx1, vx1);
      y0 = Math.max(my0, vy0); y1 = Math.min(my1, vy1);
      cw = Math.ceil(x1 - x0); ch = Math.ceil(y1 - y0);
      if (cw * ch * dpr * dpr > LIMIT) { this._groundOff = true; return null; }
    }
    this._groundOff = false;

    const cv = (gd && gd.canvas) || document.createElement('canvas');
    const pw = Math.max(1, Math.round(cw * dpr)), phh = Math.max(1, Math.round(ch * dpr));
    if (cv.width !== pw || cv.height !== phh) { cv.width = pw; cv.height = phh; }
    const c2 = cv.getContext('2d');
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    c2.clearRect(0, 0, cw, ch);
    c2.translate(-x0, -y0);

    // drawTile は this.ctx を見るので、一時的に差し替える
    const prev = this.ctx;
    const margin = 260 * z + 400;
    this.ctx = c2;
    try {
      for (const { c } of order) {
        const p = toScreen(c.gx, c.gy, (c.elev || 0) * 6, this.cam.rot, z);
        // 焼く範囲の外は描かない
        if (p.x < x0 - margin || p.x > x1 + margin || p.y < y0 - margin || p.y > y1 + margin) continue;
        this.drawTile(c, p.x, p.y);
      }
    } finally {
      this.ctx = prev;
    }
    this._ground = { key, canvas: cv, x: x0, y: y0, w: cw, h: ch, cov };
    return this._ground;
  }

  // --------------------------------------------------------
  //  メイン描画
  // --------------------------------------------------------
  draw(dt) {
    const __t0 = performance.now();
    this.t += dt;
    this.budget = SPRITE_BUDGET;   // 1フレームで作り直す建物数の上限
    this.pulse = (Math.sin(this.t * 3) + 1) / 2;
    const { ctx, w, h } = this;
    const g = this.g, z = this.zoom, T = this.time, W = this.weather;
    ctx.save();
    this.drawSky();

    ctx.translate(w / 2 + this.cam.x, h / 2 + this.cam.y);
    this.drawIslandBase();

    const order = this.drawOrder();
    const margin = 260 * z + 400;

    // 地面（道路・公園・水面・区画の下地）
    // 全景では1000枚以上のタイルを毎フレーム描くことになるので、
    // 一度オフスクリーンに焼いて貼り付ける
    const ground = this.groundLayer(order);
    if (ground) {
      ctx.drawImage(ground.canvas, ground.x, ground.y, ground.w, ground.h);
    } else {
      for (const { c } of order) {
        const p = toScreen(c.gx, c.gy, (c.elev || 0) * 6, this.cam.rot, z);
        const px = p.x, py = p.y;
        const scX = px + w / 2 + this.cam.x, scY = py + h / 2 + this.cam.y;
        if (scX < -margin || scX > w + margin || scY < -margin || scY > h + margin * 1.6) continue;
        this.drawTile(c, px, py);
      }
    }

    // 建物が地面に落とす影（建物本体より先にまとめて描く）
    // 引きの画では点ほどの大きさにしかならないので省く
    if (T.shadow > 0.05 && z >= 0.40) {
      ctx.save();
      ctx.globalAlpha = T.shadow * (1 - W.cloud * 0.55);
      ctx.fillStyle = '#05080f';
      for (const { c } of order) {
        const hh = this.heightOf(c);
        if (hh < 1) continue;
        const p = toScreen(c.gx, c.gy, (c.elev || 0) * 6, this.cam.rot, z);
        const scX = p.x + w / 2 + this.cam.x, scY = p.y + h / 2 + this.cam.y;
        if (scX < -margin || scX > w + margin || scY < -margin || scY > h + margin * 1.6) continue;
        this.drawShadow(p.x, p.y, hh, c);
      }
      ctx.restore();
    }

    // 建物・ハイライト
    for (const { c } of order) {
      const p = toScreen(c.gx, c.gy, (c.elev || 0) * 6, this.cam.rot, z);
      const px = p.x, py = p.y;
      const scX = px + w / 2 + this.cam.x, scY = py + h / 2 + this.cam.y;
      if (scX < -margin || scX > w + margin || scY < -margin * 2 || scY > h + margin * 1.6) continue;
      this.drawOverlay(c, px, py);
      const sp = this.buildingSprite(c);
      if (sp) ctx.drawImage(sp.canvas, px - sp.ax, py - sp.ay);
      this.drawMarker(c, px, py);
    }

    ctx.restore();

    // 天候エフェクト
    this.drawWeather();
    // ビネット（画面サイズが変わらないかぎり作り直さない）
    if (!this._vignette || this._vigW !== w || this._vigH !== h) {
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34, w / 2, h / 2, Math.max(w, h) * 0.78);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)');
      this._vignette = vg; this._vigW = w; this._vigH = h;
    }
    ctx.fillStyle = this._vignette; ctx.fillRect(0, 0, w, h);
    // 夜のグロー
    if (T.glow > 0.6) {
      ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#2a4a80'; ctx.fillRect(0, 0, w, h); ctx.restore();
    }
    const ms = performance.now() - __t0;
    this.stat = this.stat || { n: 0, sum: 0, max: 0 };
    this.stat.n++; this.stat.sum += ms; this.stat.max = Math.max(this.stat.max, ms);
  }

  /** 建物が地面に落とす影（底面を太陽の反対方向に引き伸ばす） */
  drawShadow(px, py, heightM, c) {
    const { ctx } = this;
    const z = this.zoom, T = this.time;
    const use = (c.building && c.building.use) || (c.projectId ? 'office' : 'office');
    const foot = { office: .90, resi: .86, rental: .86, retail: .95, hotel: .86, logi: .96, house: .66, mixed: .93 }[use] || 0.88;
    const w = TILE_W * z * foot, h = TILE_H * z * foot;
    const hpx = heightM * Z_UNIT * z;
    const len = Math.min(hpx * 0.5, TILE_W * z * 2.6);
    const ox = T.shadowDir[0] * len * 0.5, oy = T.shadowDir[1] * len * 0.32;
    const base = [[px, py - h / 2], [px + w / 2, py], [px, py + h / 2], [px - w / 2, py]];
    const pts = base.concat(base.map(([x, y]) => [x + ox, y + oy]));
    // 8点の凸包（Andrew's monotone chain）
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
    const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
    ctx.beginPath();
    hull.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.closePath();
    ctx.fill();
  }

  /** 都市が乗る島の土台 */
  drawIslandBase() {
    const { ctx } = this;
    const z = this.zoom, T = this.time;
    const corners = [[-0.5, -0.5], [MAP_W - 0.5, -0.5], [MAP_W - 0.5, MAP_H - 0.5], [-0.5, MAP_H - 0.5]]
      .map(([x, y]) => toScreen(x, y, 0, this.cam.rot, z));
    const D = 34 * z;
    // 上面（海面の縁取り）
    ctx.beginPath();
    corners.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
    ctx.closePath();
    ctx.fillStyle = T.key === 'night' ? '#0a1424' : T.key === 'evening' ? '#3a2434' : '#26384e';
    ctx.fill();
    // 側面（手前2辺）
    const bottom = corners.reduce((a, b) => (b.y > a.y ? b : a));
    const bi = corners.indexOf(bottom);
    for (const k of [-1, 1]) {
      const p1 = corners[bi], p2 = corners[(bi + k + 4) % 4];
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p2.x, p2.y + D); ctx.lineTo(p1.x, p1.y + D);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, p1.y, 0, p1.y + D);
      const base = k < 0 ? T.faceL : T.faceR;
      g.addColorStop(0, shade(30, 12, 20, base));
      g.addColorStop(1, shade(220, 16, 7, base));
      ctx.fillStyle = g; ctx.fill();
    }
    // 波打ち際
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = T.key === 'night' ? 'rgba(120,170,230,.5)' : 'rgba(255,255,255,.55)';
    ctx.lineWidth = Math.max(1, z * 1.6);
    ctx.beginPath();
    corners.forEach((p, i) => i ? ctx.lineTo(p.x, p.y + Math.sin(this.t * 1.5 + i) * 1.5) : ctx.moveTo(p.x, p.y));
    ctx.closePath(); ctx.stroke();
    ctx.restore();
  }

  /** 区画の状態を示す床面オーバーレイ */
  drawOverlay(c, px, py) {
    if (c.terrain !== TERRAIN.LOT) return;
    const { ctx } = this; const z = this.zoom;
    const w = TILE_W * z, h = TILE_H * z;
    const isSel = this.selected === c, isHov = this.hover === c;
    let col = null, lw = 1.2, glow = 0;
    if (c.onSale) { col = `rgba(120,230,255,${0.5 + this.pulse * 0.45})`; lw = 1.8; glow = 8; }
    if (c.owner === 'player') { col = 'rgba(227,181,88,0.85)'; lw = 1.6; glow = 5; }
    if (c.projectId) { col = `rgba(255,170,70,${0.65 + this.pulse * 0.3})`; lw = 1.8; glow = 7; }
    if (isHov) { col = 'rgba(255,255,255,0.9)'; lw = 2; glow = 6; }
    if (isSel) { col = '#ffe9a8'; lw = 2.4; glow = 12; }
    if (!col) return;
    ctx.save();
    ctx.strokeStyle = col; ctx.lineWidth = lw * Math.max(0.8, z);
    if (glow) { ctx.shadowColor = col; ctx.shadowBlur = glow * z; }
    diamond(ctx, px, py, w * 0.95, h * 0.95); ctx.stroke();
    if (isSel || c.onSale) {
      diamond(ctx, px, py, w * 0.95, h * 0.95);
      ctx.fillStyle = isSel ? 'rgba(255,233,168,0.12)' : `rgba(120,230,255,${0.05 + this.pulse * 0.06})`;
      ctx.fill();
    }
    ctx.restore();
  }

  /** 区画の上に浮かぶアイコン */
  drawMarker(c, px, py) {
    if (c.terrain !== TERRAIN.LOT) return;
    const { ctx } = this; const z = this.zoom;
    const top = py - this.heightOf(c) * Z_UNIT * z - 14 * z;
    const bob = Math.sin(this.t * 2 + c.gx) * 2 * z;
    const show = [];
    if (c.onSale) show.push({ t: '売地', c: '#54d6ff' });
    if (c.projectId) {
      const pj = this.g.projects.find(p => p.id === c.projectId);
      if (pj) show.push({ t: `${Math.round(pj.progress * 100)}%`, c: '#ffb454' });
    }
    if (c.invId) {
      const iv = this.g.inventory.find(i => i.id === c.invId);
      if (iv && iv.soldRatio < 1) show.push({ t: `分譲 ${Math.round(iv.soldRatio * 100)}%`, c: '#4ade9b' });
    }
    if (c.isHQ) show.push({ t: '本社', c: '#e3b558' });
    if (!show.length || z < 0.5) return;
    ctx.save();
    let yy = top + bob;
    for (const s of show) {
      ctx.font = `${Math.round(9 * Math.max(1, z))}px "Noto Sans JP", sans-serif`;
      const tw = ctx.measureText(s.t).width + 10 * z;
      ctx.fillStyle = 'rgba(8,12,20,0.82)';
      roundRect(ctx, px - tw / 2, yy - 13 * z, tw, 14 * z, 3 * z); ctx.fill();
      ctx.strokeStyle = s.c; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = s.c; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.t, px, yy - 6 * z);
      yy -= 17 * z;
    }
    ctx.restore();
  }

  drawWeather() {
    const { ctx, w, h } = this;
    const W = this.weather;
    if (W.rain) {
      ctx.save(); ctx.strokeStyle = 'rgba(180,205,235,0.34)'; ctx.lineWidth = 1;
      for (let i = 0; i < 180; i++) {
        const sp = 620 + hash2(i, 3) * 400;
        const x = (hash2(i, 1) * w + this.t * 60) % w;
        const y = (hash2(i, 2) * h + this.t * sp) % h;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 4, y + 15); ctx.stroke();
      }
      ctx.restore();
    }
    if (W.snow) {
      ctx.save(); ctx.fillStyle = 'rgba(255,255,255,0.72)';
      for (let i = 0; i < 140; i++) {
        const sp = 26 + hash2(i, 5) * 40;
        const x = (hash2(i, 6) * w + Math.sin(this.t * 0.8 + i) * 22 + this.t * 12) % w;
        const y = (hash2(i, 7) * h + this.t * sp) % h;
        const r = 1 + hash2(i, 8) * 1.8;
        ctx.globalAlpha = 0.35 + hash2(i, 9) * 0.5;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    if (W.dim) { ctx.fillStyle = `rgba(20,30,45,${W.dim})`; ctx.fillRect(0, 0, w, h); }
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let hh = 0; const l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (mx === r) hh = 60 * (((g - b) / d) % 6);
    else if (mx === g) hh = 60 * ((b - r) / d + 2);
    else hh = 60 * ((r - g) / d + 4);
  }
  return [(hh + 360) % 360, s * 100, l * 100];
}
