// ============================================================
//  摩天楼の設計図 — エントリポイント
// ============================================================
import { createGame, cellById } from './core/state.js';
import { money, moneyUnit, num, pct, dcls, arrow } from './core/format.js';
import { dateLabel, dateLabelOf, weeksLabel, WEEKS_PER_QUARTER, syncCalendar } from './core/time.js';
import { SLOTS, SLOT_LABEL, BACKUP, listSaves, backupSave, saveTo, loadFrom, deleteSlot, latestSave,
  exportText, exportName, importText, totalSize, storageAvailable, requestPersistence,
  compactStorage } from './core/save.js';
import { CityRenderer, ZOOM_STEPS } from './render/city.js';
import { toScreen } from './render/iso.js';
import { WEATHERS, timeOfMonth, seasonOfMonth } from './render/palette.js';
import { hash2 } from './core/rng.js';
import { DISTRICTS, USES, TERRAIN, GRADES, CITIES } from './data/city.js';
import { RNG } from './core/rng.js';
import * as Trading from './sim/trading.js';
import * as Assembly from './sim/assembly.js';

import { nextWeek } from './sim/week.js';
import { kpis, ttm, buildBS, sharePrice, marketCap, ipoStatus } from './sim/finance.js';
import { startProject as simStart, canStart, feasibility } from './sim/project.js';
import { acquireForPlayer, holdingCost, generateListings as genListings, citiesOpen } from './sim/land.js';
import { landAppraisal, assetValue, currentNOI } from './sim/valuation.js';
import { sellAsset } from './sim/sales.js';
import { foundSubsidiary, liquidate, generateTargets as genTargets } from './sim/ma.js';
import { orgPower } from './sim/hr.js';
import { workload } from './sim/workload.js';
import { dismiss as dismissOfficer } from './sim/officers.js';
import { abandonPlan } from './sim/midplan.js';
import { WORK_PROGRAMS } from './sim/workload.js';
import { seismicOf, retrofitCost, retrofit } from './sim/cityevents.js';
import { acceptPosting, fastTrack, fastTrackOdds } from './sim/talent.js';
import { answerQuestion, closeBriefing } from './sim/ir.js';
import { agendaOf, holdMeeting, supportFor, holdersOf } from './sim/meeting.js';
import { answerRound, acceptanceOf } from './sim/union.js';
import { settle, eventOf, pending as pendingAgenda } from './sim/agenda.js';
import { offerFor, acceptJV, declineJV, jvEffect, relationOf, SHARE_MIN, SHARE_MAX } from './sim/jv.js';
import { SEASONS, suggestedMonths, marketMonths, bonusCost, lastYearMonths, payBonus,
  monthlyPayroll, MONTHS_MAX } from './sim/bonus.js';
import { rankName as rankNameOf, TOP_STAFF_RANK, OFFICER_RANKS } from './data/hrdata.js';
import { avgAbility } from './core/state.js';
import { ranking } from './sim/rivals.js';
import { unlocked } from './sim/company.js';
import { SUB_TYPES, RIVAL_DEFS } from './data/companies.js';
import { HR_PROGRAMS, DEPTS, RANKS } from './data/hrdata.js';

import { $, openModal, closeModal, toast, section, kv, mini, chip, bar, empty } from './ui/dom.js';
import * as Dash from './ui/panelDash.js';
import * as Disc from './ui/panelDisclosure.js';
import * as Land from './ui/panelLand.js';
import * as Dev from './ui/panelDev.js';
import * as Sales from './ui/panelSales.js';
import * as Asset from './ui/panelAsset.js';
import * as Fin from './ui/panelFin.js';
import * as HR from './ui/panelHR.js';
import * as MA from './ui/panelMA.js';
import * as Rival from './ui/panelRival.js';
import * as Brand from './ui/panelBrand.js';
import { buildReport } from './ui/report.js';

const PANELS = { dash: Dash, land: Land, dev: Dev, sales: Sales, asset: Asset, fin: Fin, hr: HR, brand: Brand, ma: MA, rival: Rival, disc: Disc };


let G = null, R = null;
let currentPanel = null;
let lastT = 0;
const ctx = {
  refresh, rivalKey: 'rev', hrSort: 'ability', jobRankMode: 'pop', discTab: 'people',
  startProject, acquireNow, focusCell,
  // 一棟買いの交渉はダイアログの中で完結するので、必要な口をここから渡す
  trading: Trading,
  assembly: Assembly,
  get rng() { return new RNG((G ? G.rngState : 1) ^ 0x5eed17); },
};

/** 指定した区画を画面中央に寄せる */
function focusCell(c) {
  if (!c || !R) return;
  const p = toScreen(c.gx, c.gy, (c.elev || 0) * 6, R.cam.rot, R.zoom);
  R.cam.x = -p.x;
  R.cam.y = -p.y + R.h * 0.16;
  R.selected = c;
  R.hover = c;
  updateHover(c);
}

// ------------------------------------------------------------
//  タイトル画面
// ------------------------------------------------------------
function titleAnim() {
  const cv = $('#titleCanvas');
  if (!cv) return;
  const c = cv.getContext('2d');
  let t = 0, raf;
  const draw = () => {
    const w = cv.width = cv.clientWidth, h = cv.height = cv.clientHeight;
    t += 0.006;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#04060d'); g.addColorStop(0.45, '#0a1426');
    g.addColorStop(0.75, '#152a44'); g.addColorStop(1, '#2b4260');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // 星
    for (let i = 0; i < 90; i++) {
      c.globalAlpha = 0.2 + 0.8 * Math.abs(Math.sin(t * 3 + i));
      c.fillStyle = '#dce8ff';
      c.fillRect(hash2(i, 1) * w, hash2(i, 2) * h * 0.5, 1.4, 1.4);
    }
    c.globalAlpha = 1;
    // 月
    c.beginPath(); c.arc(w * 0.78, h * 0.18, 42, 0, Math.PI * 2);
    const mg = c.createRadialGradient(w * 0.78, h * 0.18, 0, w * 0.78, h * 0.18, 130);
    mg.addColorStop(0, 'rgba(240,246,255,.9)'); mg.addColorStop(0.25, 'rgba(200,220,255,.18)'); mg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = mg; c.fillRect(0, 0, w, h);
    // スカイライン3層
    for (let layer = 2; layer >= 0; layer--) {
      const base = h * (0.72 + layer * 0.07);
      const scale = 1 - layer * 0.22;
      let x = -40 + Math.sin(t * (0.3 + layer * 0.2)) * (12 - layer * 4);
      c.fillStyle = ['rgba(6,10,20,.98)', 'rgba(12,22,40,.9)', 'rgba(22,38,62,.72)'][layer];
      while (x < w + 40) {
        const r1 = hash2(Math.floor(x / 7), layer * 11 + 3);
        const bw = (22 + r1 * 58) * scale, bh = (50 + hash2(Math.floor(x / 7), layer * 11 + 4) * 260) * scale;
        c.fillRect(x, base - bh, bw, bh + h);
        if (layer < 2) {
          c.fillStyle = `rgba(255,225,165,${0.5 - layer * 0.15})`;
          for (let yy = base - bh + 8; yy < base - 6; yy += 9 * scale) {
            for (let xx = x + 4; xx < x + bw - 4; xx += 7 * scale) {
              if (hash2(Math.floor(xx), Math.floor(yy)) > 0.52 + Math.sin(t + xx) * 0.06) c.fillRect(xx, yy, 2.4 * scale, 3.4 * scale);
            }
          }
          c.fillStyle = ['rgba(6,10,20,.98)', 'rgba(12,22,40,.9)'][layer];
        }
        x += bw + 3 + r1 * 10;
      }
    }
    // 手前のもや
    const fg = c.createLinearGradient(0, h * 0.55, 0, h);
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, 'rgba(10,18,32,.9)');
    c.fillStyle = fg; c.fillRect(0, 0, w, h);
    raf = requestAnimationFrame(draw);
  };
  draw();
  return () => cancelAnimationFrame(raf);
}

// 画面が狭い端末（スマートフォン）かどうか。CSS の 820px と合わせている
const IS_SMALL = typeof matchMedia === 'function'
  && (matchMedia('(max-width:820px)').matches || matchMedia('(pointer:coarse)').matches);

// ------------------------------------------------------------
//  ゲーム開始
// ------------------------------------------------------------
function startGame(saved) {
  if (saved) {
    G = saved;
  } else {
    const name = ($('#inpCompany').value || '常盤地所').slice(0, 12);
    const diff = $('#inpDiff').value;
    const home = ($('#inpHome') && $('#inpHome').value) || 'W';
    const ceoName = (($('#inpCeo') && $('#inpCeo').value) || '常盤 宗一郎').slice(0, 12);
    G = createGame({ companyName: name, difficulty: diff, home, ceoName, seed: Date.now() & 0x7fffffff });
    G.news = [{
      icon: '🏢', type: 'market',
      text: `${name}が創業した。${DISTRICTS[G.company.home].name}を地盤に、${ceoName}が代表取締役社長として事業を開始する。`,
    }];
    // 初期の売却情報と買収候補を用意する
    const rng0 = new RNG(G.rngState ^ 12345);
    genListings(G, rng0, G.news);
    genListings(G, rng0, G.news);
    G.maTargets = genTargets(G, rng0, 3);
    G.rngState = rng0.s;
  }
  window.G = G;   // デバッグ用
  const cv = $('#city');
  R = new CityRenderer(cv, G);
  R.setMonth(G.month);
  R.setWeather(G.weather || 'clear');
  if (IS_SMALL) R.fit('minato'); else { R.cam.zoomIdx = 1; R.focusCity('minato', 1); }
  window.R = R;
  window.__wl = () => workload(G, orgPower(G));   // 計測用

  // 画面が狭いときは週次フィードを畳んでおく（見出しをタップで開く）
  if (IS_SMALL) {
    $('#feed').classList.add('collapsed');
    $('#feedToggle').textContent = '▸';
  }

  $('#titleScreen').classList.add('out');
  setTimeout(() => $('#titleScreen').remove(), 800);
  bindInput();
  updateHeader();
  updateTicker();
  refresh();
  requestAnimationFrame(loop);
  if (!saved) setTimeout(showIntro, 900);
}

// ------------------------------------------------------------
//  描画ループ
//    端末を温めないために、必要なときだけ・必要な回数だけ描く。
//    ・画面が隠れている（別のタブ、ホーム画面に戻した）→ 描かない
//    ・都市が完全に覆われている → 描かない。
//      キャンバスが動き続けるかぎり、その上に重なっている
//      backdrop-filter（すりガラス）が毎フレーム焼き直しになる。
//      スマートフォンで熱くなる原因はほぼこれである
//    ・指や視点を動かしていない間はコマ数を落とす。
//      雲の流れも夜景の瞬きも、この速さで見た目は変わらない
// ------------------------------------------------------------
const FPS_IDLE = IS_SMALL ? 24 : 30;
const FPS_ACTIVE = 60;
let activeUntil = 0;       // 操作した直後だけなめらかに描く
let lastDraw = 0;

/** 操作があったことを描画ループに伝える */
function wake(ms = 800) { activeUntil = performance.now() + ms; }

/** 都市が完全に隠れているか（隠れているなら描く意味がない） */
function cityHidden() {
  if (document.hidden) return true;
  const open = el => el && !el.classList.contains('hidden');
  // ダイアログと決算画面は、どの画面幅でも都市の前に暗幕が掛かる
  if (open($('#modalWrap')) || open($('#reportWrap'))) return true;
  // 狭い画面では、パネルが全画面のシートになって都市を覆い隠す
  if (IS_SMALL && open($('#panel'))) return true;
  return false;
}

function loop(ts) {
  requestAnimationFrame(loop);
  if (cityHidden()) { lastT = ts; return; }
  const fps = ts < activeUntil ? FPS_ACTIVE : FPS_IDLE;
  if (ts - lastDraw < 1000 / fps - 1.5) return;
  const dt = Math.min(0.05, (ts - lastT) / 1000 || 0.016);
  lastT = ts; lastDraw = ts;
  R.draw(dt);
}

// ------------------------------------------------------------
//  入力
// ------------------------------------------------------------
function bindInput() {
  const cv = $('#city');
  // 操作している間だけコマ数を上げる。個々のハンドラに手を入れず、
  // 画面全体で入力を拾って描画ループに知らせる
  for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'click']) {
    window.addEventListener(ev, () => wake(), { passive: true, capture: true });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  const pts = new Map();     // 画面に触れている指（マウスなら1つ）
  let drag = null;           // 1本指のドラッグ＝カメラ移動
  let pinch = null;          // 2本指のピンチ＝拡大縮小

  const pos = e => ({ x: e.clientX, y: e.clientY });
  const slop = e => (e.pointerType === 'touch' ? 14 : 6);   // タップとみなす許容移動量
  const two = () => { const v = [...pts.values()]; return [v[0], v[1]]; };

  const startDragFrom = (id, p) => {
    drag = { id, x: p.x, y: p.y, cx: R.cam.x, cy: R.cam.y, moved: 0 };
  };

  cv.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, pos(e));
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    if (pts.size >= 2) {
      const [a, b] = two();
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      drag = null;
      cv.classList.remove('dragging');
    } else {
      startDragFrom(e.pointerId, pos(e));
      cv.classList.add('dragging');
    }
  });

  cv.addEventListener('pointermove', e => {
    if (pts.has(e.pointerId)) pts.set(e.pointerId, pos(e));

    if (pinch && pts.size >= 2) {
      const [a, b] = two();
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      // ズームは段階式なので、一定の比率を超えたら1段動かして基準を取り直す
      if (d > pinch.d * 1.28) { R.zoomBy(1, mx, my); pinch.d = d; }
      else if (d < pinch.d * 0.78) { R.zoomBy(-1, mx, my); pinch.d = d; }
      return;
    }

    if (drag && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      R.cam.x = drag.cx + dx; R.cam.y = drag.cy + dy;
    } else if (!drag && !pinch && e.pointerType !== 'touch') {
      const c = R.pick(e.clientX, e.clientY);
      R.hover = c;
      updateHover(c);
    }
  });

  const endPointer = (e, tap) => {
    const d = drag;
    const wasPinch = !!pinch;
    pts.delete(e.pointerId);
    try { cv.releasePointerCapture(e.pointerId); } catch (_) {}
    if (pts.size < 2) pinch = null;

    if (d && d.id === e.pointerId) {
      drag = null;
      cv.classList.remove('dragging');
      // ピンチのあと1本だけ残ったら、その指でカメラ移動を続ける
      if (pts.size === 1) {
        const id = [...pts.keys()][0];
        startDragFrom(id, pts.get(id));
        drag.moved = 999;                    // 続きなのでタップ扱いにはしない
        cv.classList.add('dragging');
      }
    } else if (pts.size === 1 && !drag) {
      const id = [...pts.keys()][0];
      startDragFrom(id, pts.get(id));
      drag.moved = 999;
      cv.classList.add('dragging');
    }

    if (!tap || wasPinch || pts.size > 0) return;
    if (d && d.moved > slop(e)) return;
    const c = R.pick(e.clientX, e.clientY);
    R.selected = c;
    if (e.pointerType === 'touch') { R.hover = c; updateHover(c); }
    if (c) onCellClick(c);
  };

  cv.addEventListener('pointerup', e => endPointer(e, true));
  cv.addEventListener('pointercancel', e => endPointer(e, false));
  cv.addEventListener('pointerleave', e => {
    if (e.pointerType === 'touch') return;      // 指はキャプチャ中なので無視
    pts.delete(e.pointerId);
    drag = null; pinch = null;
    cv.classList.remove('dragging');
  });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    R.zoomBy(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
  }, { passive: false });
  // iOS Safari のダブルタップ拡大とピンチ拡大を止める
  cv.addEventListener('gesturestart', e => e.preventDefault());
  cv.addEventListener('dblclick', e => e.preventDefault());

  // スマホはアドレスバーの出入りで resize が連発するのでまとめて処理する
  let rzT = 0;
  const onResize = () => { clearTimeout(rzT); rzT = setTimeout(() => R.resize(), 120); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  document.querySelectorAll('.vbtn').forEach(b => b.onclick = () => {
    const v = b.dataset.view;
    if (v === 'zoomin') R.zoomBy(1);
    if (v === 'zoomout') R.zoomBy(-1);
    if (v === 'rotate') R.rotateBy(1);
    if (v === 'reset') { R.cam.rot = 0; if (IS_SMALL) R.fit(R.city); else { R.cam.zoomIdx = 1; R.invalidate(); R.focusCity(R.city, 1); } }
    if (v === 'city') {
      // 進出していない都市には飛べない。
      // **`unlocked(G,'city2')` で一括判定しないこと。**
      // 鶴見野を解禁しただけで、まだ出ていない街にも飛べてしまう
      const open = citiesOpen(G);
      const ids = Object.keys(CITIES).filter(id => open.has(id));
      if (ids.length < 2) return toast('まだ湊都市の外には出ていない', 'bad');
      const next = ids[(ids.indexOf(R.city) + 1) % ids.length];
      R.city = next;
      R.fit(next);                       // その街がちょうど収まる倍率に合わせる
      toast(`${CITIES[next].name}を表示している`);
    }
    if (v === 'layer') {
      R.layer = R.layer === 'normal' ? 'owner' : R.layer === 'owner' ? 'value' : 'normal';
      toast({ normal: '通常表示', owner: '所有者の色分け表示', value: '地価ヒートマップ表示' }[R.layer]);
    }
  });

  document.querySelectorAll('.tab').forEach(b => b.onclick = () => openPanel(b.dataset.panel));
  $('#panelClose').onclick = closePanel;
  $('#modalClose').onclick = closeModal;
  $('#modalWrap').onclick = e => { if (e.target.id === 'modalWrap') closeModal(); };
  $('#btnWeek').onclick = () => advance(1);
  $('#btnMonth').onclick = () => advance(4);
  $('#btnQuarter').onclick = () => {
    // 次の決算週（weekOfQuarter = 12）までの週数。
    // ちょうど決算週にいるときは、1週ではなく次の決算まで進める
    const end = WEEKS_PER_QUARTER - 1;
    const n = (end - G.weekOfQuarter + WEEKS_PER_QUARTER) % WEEKS_PER_QUARTER;
    advance(n || WEEKS_PER_QUARTER);
  };
  $('#btnMenu').onclick = openSaveMenu;
  const toggleFeed = () => {
    const f = $('#feed');
    f.classList.toggle('collapsed');
    $('#feedToggle').textContent = f.classList.contains('collapsed') ? '▸' : '▾';
  };
  // 指で押しやすいよう、見出しのどこを押しても開閉する
  document.querySelector('.feed-head').onclick = toggleFeed;
  $('#reportOk').onclick = () => { $('#reportWrap').classList.add('hidden'); afterReport(); };

  $('#panelBody').addEventListener('click', onPanelClick);

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'Escape') { closeModal(); closePanel(); }
    if (e.key === ' ') { e.preventDefault(); advance(1); }
    if (e.key === 'Enter') { e.preventDefault(); advance(4); }
    if (e.key === 'q' || e.key === 'Q') advance(WEEKS_PER_QUARTER - G.weekOfQuarter);
    if (e.key === 'r' || e.key === 'R') R.rotateBy(1);
    if (e.key === '+' || e.key === '=') R.zoomBy(1);
    if (e.key === '-') R.zoomBy(-1);
    const map = { 1: 'dash', 2: 'land', 3: 'dev', 4: 'sales', 5: 'asset', 6: 'fin', 7: 'hr', 8: 'brand', 9: 'ma', 0: 'rival' };
    if (map[e.key]) openPanel(map[e.key]);
    if (e.key === 's' || e.key === 'S') openSaveMenu();
  });

  window.addEventListener('beforeunload', save);
  setInterval(save, 30000);
}

function updateHover(c) {
  const el = $('#hudHover');
  if (!c) { el.textContent = '区画にカーソルを合わせる'; return; }
  if (c.terrain === TERRAIN.WATER) { el.textContent = '湊湾'; return; }
  if (c.terrain === TERRAIN.ROAD || c.terrain === TERRAIN.AVENUE) { el.textContent = '道路'; return; }
  if (c.terrain === TERRAIN.PARK || c.terrain === TERRAIN.GREEN) { el.textContent = '公園・緑地'; return; }
  const d = DISTRICTS[c.d];
  const owner = c.owner === 'player' ? G.company.name
    : c.owner && c.owner !== 'other' ? (G.rivals.find(r => r.id === c.owner) || {}).name
      : '一般事業者';
  const b = c.building;
  el.innerHTML = `${d.name}／${num(c.area)}坪・容積${c.far}%　所有：${owner}`
    + (b ? `　建物：${b.name}（${USES[b.use].name}・地上${b.floors}階）` : c.onSale ? '　<span style="color:#54d6ff">売却情報あり</span>' : '　更地');
}

function onCellClick(c) {
  if (c.onSale) { Land.openDetail(G, c.onSale, ctx); return; }
  if (c.owner === 'player' && !c.building && !c.projectId) { Dev.openPlan(G, c, ctx); return; }
  if (c.projectId) { openPanel('dev'); return; }
  if (c.invId) { openPanel('sales'); return; }
  if (c.assetId) { openPanel('asset'); return; }
  if (c.building) showBuildingInfo(c);
}

function showBuildingInfo(c) {
  const b = c.building, d = DISTRICTS[c.d];
  const owner = c.owner === 'player' ? G.company.name
    : c.owner && c.owner !== 'other' ? (G.rivals.find(r => r.id === c.owner) || {}).name : '一般事業者';
  openModal(b.name, `
    <div class="grid3" style="margin-bottom:12px">
      ${mini('用途', USES[b.use].name, GRADES[b.grade] ? GRADES[b.grade].name : '')}
      ${mini('階数', '地上' + b.floors + '階', b.height.toFixed(0) + 'm')}
      ${mini('竣工', b.year + '年', `築${Math.max(0, G.year - b.year)}年`)}
    </div>
    <div class="card">
      ${kv('所在', d.name)}
      ${kv('敷地面積', num(c.area) + '坪')}
      ${kv('容積率', c.far + '%')}
      ${kv('所有者', owner)}
      ${kv('土地の想定価格', money(landAppraisal(G, c)))}
    </div>
    <div class="hint">${d.desc}</div>
  `, [{ label: '閉じる', cls: 'ghost' }]);
}

// ------------------------------------------------------------
//  パネル
// ------------------------------------------------------------
function openPanel(key) {
  const mod = PANELS[key];
  if (!mod) return;
  if (currentPanel === key) return closePanel();
  currentPanel = key;
  document.querySelectorAll('.tab').forEach(b => {
    const on = b.dataset.panel === key;
    b.classList.toggle('on', on);
    // 狭い画面ではタブバーが横スクロールする。
    // 選んだタブが画面の外にいることがあるので、寄せてやる
    if (on && IS_SMALL) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  });
  $('#panel').classList.remove('hidden');
  $('#panelTitle').textContent = mod.title;
  refresh();
}
function closePanel() {
  currentPanel = null;
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('on'));
  $('#panel').classList.add('hidden');
}
function refresh() {
  updateHeader();
  updateBadges();
  if (!currentPanel) return;
  const mod = PANELS[currentPanel];
  const sc = $('#panelBody').scrollTop;
  $('#panelBody').innerHTML = mod.render(G, ctx);
  $('#panelBody').scrollTop = sc;
}

function onPanelClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act, id = el.dataset.id;
  handleAction(act, id);
}

function handleAction(act, id) {
  switch (act) {
    case 'land.detail': {
      const l = G.listings.find(x => x.id === id);
      if (l) { focusCell(cellById(G, l.cellId)); Land.openDetail(G, l, ctx); }
      break;
    }
    case 'std.detail': {
      const o = (G.standing || []).find(x => x.id === id);
      if (o) { focusCell(cellById(G, o.cellId)); Land.openStandingDetail(G, o, ctx); }
      break;
    }
    case 'asm.start': {
      const c = cellById(G, id);
      if (c) { focusCell(c); Land.openAssemblyStart(G, c, ctx); }
      break;
    }
    case 'asm.open': {
      const a = (G.assemblies || []).find(x => x.id === id);
      if (a) { focusCell(cellById(G, a.baseId)); Land.openAssembly(G, a, ctx); }
      break;
    }
    case 'agenda.open': openAgendaItem(id); break;
    case 'jv.open': {
      const c = cellById(G, id);
      if (c) openJV(c);
      break;
    }
    case 'focus': {
      const c = cellById(G, id);
      if (c) { focusCell(c); closePanel(); toast('地図の中央に移動した'); }
      break;
    }
    case 'dev.plan': {
      const c = cellById(G, id);
      if (c) { focusCell(c); Dev.openPlan(G, c, ctx); }
      break;
    }
    case 'dev.price': {
      const pj = G.projects.find(x => x.id === id);
      if (pj) Dev.openPricing(G, pj, ctx);
      break;
    }
    case 'sales.price': {
      const inv = G.inventory.find(x => x.id === id);
      if (inv) Sales.openReprice(G, inv, ctx);
      break;
    }
    case 'asset.rent': {
      const a = G.assets.find(x => x.id === id);
      if (a) Asset.openRent(G, a, ctx);
      break;
    }
    case 'asset.rebuild': {
      const a = G.assets.find(x => x.id === id);
      if (a) { focusCell(cellById(G, a.cellId)); Asset.openRebuild(G, a, ctx); }
      break;
    }
    case 'asset.sell': {
      const a = G.assets.find(x => x.id === id);
      if (!a) break;
      const v = assetValue(G, a), book = a.bookLand + a.bookBuild;
      openModal(`物件売却 — ${a.name}`, `
        <div class="card">
          ${kv('想定売却価格', money(v))}
          ${kv('簿価', money(book))}
          ${kv('売却損益', `<span class="${dcls(v - book)}">${money(v - book, { sign: true })}</span>`)}
          ${kv('仲介手数料等', money(Math.round(v * 0.025)))}
          ${kv('年間NOI', money(currentNOI(G, a)))}
        </div>
        <div class="hint">売却すれば現金が一気に入り、借入を圧縮できる。一方で毎年のNOIと将来の値上がり益を失う。</div>
      `, [
        { label: 'やめる', cls: 'ghost' },
        {
          label: '売却する', cls: 'primary', onClick: () => {
            sellAsset(G, a, G.news); toast('物件を売却した', 'good'); R.invalidate(); refresh();
          }
        },
      ]);
      break;
    }
    case 'fin.borrow': Fin.openBorrow(G, ctx, 'borrow'); break;
    case 'fin.repay': Fin.openBorrow(G, ctx, 'repay'); break;
    case 'fin.ipo': Fin.openIPO(G, ctx); break;
    case 'fin.issue': Fin.openIssue(G, ctx); break;
    case 'hr.staff': {
      const s = G.staff.find(x => x.id === id);
      if (s) HR.openStaff(G, s, ctx);
      break;
    }
    case 'hr.mid': HR.openMid(G, id, ctx); break;
    case 'hr.salary': HR.openSalaryPolicy(G, ctx); break;
    case 'hr.ranknames': HR.openRankNames(G, ctx); break;
    case 'hr.appoint': HR.openAppoint(G, ctx); break;
    case 'hr.oversee': {
      const s = G.staff.find(x => x.id === id);
      if (s) HR.openOversee(G, s, ctx);
      break;
    }
    case 'hr.dismiss': {
      const s = G.staff.find(x => x.id === id);
      if (!s) break;
      openModal('役員の解任', `
        <div class="card" style="border-color:rgba(255,107,122,.4)">
          <div class="card-t"><span class="card-n">${s.name}</span></div>
          <div class="card-s">${s.name}を役職から外し、ひとつ下の等級に戻す。
          本人の士気と定着度は大きく落ち、退職につながることもある。</div>
        </div>`, [
        { label: 'やめる', cls: 'ghost' },
        {
          label: '解任する', cls: 'danger', onClick: () => {
            const err = dismissOfficer(G, s, G.news);
            if (err) return toast(err, 'bad');
            toast(`${s.name}を解任した`, 'bad'); refresh();
          }
        },
      ]);
      break;
    }
    case 'hr.ceo': HR.openCeo(G, ctx); break;
    case 'hr.posting': HR.openPostingModal(G, ctx); break;
    case 'hr.accept': {
      const [pid, sid] = String(id).split('|');
      const post = (G.postings || []).find(x => x.id === pid);
      if (!post) break;
      const err = acceptPosting(G, post, sid, G.news);
      if (err) return toast(err, 'bad');
      toast('社内公募による異動を決めた', 'good'); refresh();
      break;
    }
    case 'hr.fast': {
      const s = G.staff.find(x => x.id === id);
      if (!s) break;
      const odds = fastTrackOdds(G, s);
      openModal('抜擢人事', `
        <div class="card" style="border-color:rgba(227,181,88,.4)">
          <div class="card-t"><span class="card-n">${s.name}（${s.age}歳・${rankNameOf(G, s.rank)}）</span></div>
          <div class="card-s">${rankNameOf(G, s.rank)}から${rankNameOf(G, s.rank + 2)}へ、等級を2つ飛ばして引き上げる。</div>
          ${kv('総合能力', avgAbility(s).toFixed(0))}
          ${kv('潜在能力', s.potential)}
          ${kv('統率', s.abil.lead.toFixed(0))}
          ${kv('成功率', `<b class="${odds >= 0.6 ? 'up' : odds < 0.4 ? 'down' : ''}">${(odds * 100).toFixed(0)}%</b>`)}
        </div>
        <div class="hint">成功すれば一気に力を伸ばし、若手の士気も上がる。
        失敗すると本人の士気が大きく落ち、飛び越された社員の士気も下がる。</div>`, [
        { label: 'やめる', cls: 'ghost' },
        {
          label: '抜擢する', cls: 'primary', onClick: () => {
            const rng = new RNG(G.rngState ^ 5150501);
            const r = fastTrack(G, s, rng, G.news);
            G.rngState = rng.s;
            if (r.err) return toast(r.err, 'bad');
            toast(r.ok ? `${s.name}の抜擢は成功した` : `${s.name}には荷が勝ちすぎた`, r.ok ? 'good' : 'bad');
            refresh();
          }
        },
      ]);
      break;
    }
    case 'disc.tab': ctx.discTab = id; refresh(); break;
    case 'disc.work': {
      const w = WORK_PROGRAMS.find(x => x.id === id);
      if (!w) break;
      G.hrPolicy.work = G.hrPolicy.work || {};
      const on = !G.hrPolicy.work[w.id];
      G.hrPolicy.work[w.id] = on;
      toast(`${w.name}を${on ? '導入した' : '取りやめた'}`, on ? 'good' : '');
      refresh();
      break;
    }
    case 'disc.retrofit': {
      const a = G.assets.find(x => x.id === id);
      if (!a) break;
      openModal('耐震改修', `
        <div class="card">
          <div class="card-t"><span class="card-n">${a.name}</span></div>
          <div class="card-s">いまの耐震性能は ${(seismicOf(a) * 100).toFixed(0)}。
          改修すると ${(Math.min(115, seismicOf(a) * 100 + 45)).toFixed(0)} まで上がり、
          地震のときの損害が大きく減る。</div>
          ${kv('工事費', money(retrofitCost(a)))}
          ${kv('現預金', money(G.cash))}
        </div>
        <div class="hint">工事費の65%は資本的支出として簿価に乗り、残りは費用として計上される。</div>`, [
        { label: 'やめる', cls: 'ghost' },
        {
          label: '発注する', cls: 'primary', disabled: G.cash < retrofitCost(a),
          onClick: () => {
            const err = retrofit(G, a, G.news);
            if (err) return toast(err, 'bad');
            toast('耐震改修を発注した', 'good'); refresh();
          }
        },
      ]);
      break;
    }
    case 'plan.new': Dash.openPlan(G, ctx); break;
    case 'plan.abandon': {
      openModal('中期経営計画の取り下げ', `
        <div class="card" style="border-color:rgba(255,107,122,.4)">
          <div class="card-s">掲げた計画を自ら下ろすことになる。
          企業ブランドが下がり、社員の士気も落ちる。</div>
        </div>`, [
        { label: 'やめる', cls: 'ghost' },
        {
          label: '取り下げる', cls: 'danger', onClick: () => {
            const err = abandonPlan(G, G.news);
            if (err) return toast(err, 'bad');
            toast('中期経営計画を取り下げた', 'bad'); refresh();
          }
        },
      ]);
      break;
    }
    case 'hr.culture': HR.openCulture(G, ctx); break;
    case 'hr.newgrad': HR.openNewGrad(G, ctx); break;
    case 'hr.list': ctx.hrSort = id; refresh(); break;
    case 'hr.jobrank': ctx.jobRankMode = id; refresh(); break;
    case 'hr.dept': {
      const list = G.staff.filter(s => s.dept === id && !s.subsidiary);
      const p = orgPower(G)[id];
      openModal(DEPTS[id].name, `
        <div class="grid3" style="margin-bottom:12px">
          ${mini('人数', list.length + '名')}
          ${mini('質', p.quality.toFixed(0))}
          ${mini('量', p.capacity.toFixed(1))}
        </div>
        <div class="hint">${DEPTS[id].desc}</div>
        ${HR.listTable(G, list, 'ability')}
      `, [{ label: '閉じる', cls: 'ghost' }]);
      break;
    }
    case 'hr.prog': {
      const pr = HR_PROGRAMS.find(x => x.field === id);
      const on = G.hrPolicy.programs[id];
      G.hrPolicy.programs[id] = !on;
      toast(`${pr.name}を${!on ? '導入した' : '廃止した'}`);
      refresh();
      break;
    }
    case 'ma.found': {
      if (!unlocked(G, 'sub')) return toast('まだ子会社を設立できる規模ではない', 'bad');
      const def = SUB_TYPES.find(x => x.id === id);
      openModal(`${def.icon} ${def.name}の設立`, `
        <div class="card">
          <div class="card-s">${def.desc}<br><br><span style="color:var(--amber)">リスク：${def.risk}</span></div>
        </div>
        <div class="card">
          ${kv('設立出資額', money(def.cost))}
          ${kv('年間固定費', money(def.upkeep))}
          ${kv('必要な出向者', def.staffNeed + '名')}
          ${kv('現預金', money(G.cash))}
        </div>
        <div class="hint">出向者は本体の部署戦力から抜ける。人員が不足した状態で設立すると、本業の実行力が落ちる。</div>
      `, [
        { label: 'やめる', cls: 'ghost' },
        {
          label: '設立する', cls: 'primary', disabled: G.cash < def.cost,
          onClick: () => {
            const rng = new RNG(G.rngState ^ 99991);
            foundSubsidiary(G, id, rng, G.news);
            G.rngState = rng.s;
            toast(`${def.name}を設立した`, 'good'); refresh();
          }
        },
      ]);
      break;
    }
    case 'ma.liquidate': {
      const s = G.subsidiaries.find(x => x.id === id);
      if (!s) break;
      openModal('子会社の清算', `<div class="hint">${s.name}を清算する。出資額の45%×健全度のみが回収され、残りは特別損失となる。</div>
        <div class="card">${kv('出資額', money(s.bookValue))}${kv('回収見込み', money(Math.round(s.bookValue * 0.45 * s.health)))}</div>`, [
        { label: 'やめる', cls: 'ghost' },
        { label: '清算する', cls: 'danger', onClick: () => { liquidate(G, s, G.news); toast('子会社を清算した'); refresh(); } },
      ]);
      break;
    }
    case 'ma.target': {
      if (!unlocked(G, 'ma')) return toast('まだ他社を買収できる規模ではない', 'bad');
      const t = G.maTargets.find(x => x.id === id);
      if (t) MA.openTarget(G, t, ctx);
      break;
    }
    case 'brand.new':
      if (!unlocked(G, 'brand')) return toast('まだ自社ブランドを立ち上げられる規模ではない', 'bad');
      Brand.openNew(G, ctx); break;
    case 'brand.ad': { const b = G.brands.find(x => x.id === id); if (b) Brand.openAd(G, b, ctx); break; }
    case 'brand.rename': { const b = G.brands.find(x => x.id === id); if (b) Brand.openRename(G, b, ctx); break; }
    case 'rival.sort': ctx.rivalKey = id; refresh(); break;
    case 'rival.detail': Rival.openDetail(G, id, ctx); break;
    case 'rival.reject': {
      G.takeoverOffer = null;
      G.company.brand = Math.max(0, G.company.brand - 1);
      toast('買収提案を拒否した');
      refresh();
      break;
    }
    case 'rival.accept': {
      const o = G.takeoverOffer;
      G.gameOver = { type: 'acquired', title: '買収の受諾', text: `${o.name}による買収提案を受け入れた。${money(o.price)}での売却である。創業から${G.year - G.company.founded}年、当社はその歴史に幕を下ろした。` };
      showGameOver();
      break;
    }
  }
}

// ------------------------------------------------------------
//  アクション
// ------------------------------------------------------------
function startProject(cell, use, grade, brandId, stack) {
  const err = canStart(G, cell);
  if (err) return toast(err, 'bad');
  const rng = new RNG(G.rngState ^ (G.week * 31337));
  const pj = simStart(G, cell, use, grade, rng, G.news, brandId, stack);
  if (!pj) return toast('この構成では計画を作れない', 'bad');
  G.rngState = rng.s;
  R.invalidate();
  toast(`「${pj.name}」に着工した`, 'good');
  refresh();
}

function acquireNow(listing, cell, amount) {
  acquireForPlayer(G, listing, cell, amount, G.news);
  cell.bookValue = amount + Math.round(amount * 0.052);
  R.invalidate();
  toast('用地を取得した', 'good');
  refresh();
}

// ------------------------------------------------------------
//  ターン進行
// ------------------------------------------------------------
let busy = false;
function setBusy(v) {
  busy = v;
  for (const id of ['#btnWeek', '#btnMonth', '#btnQuarter']) $(id).disabled = v;
}

/** 指定した週数だけ進める。重要な出来事があればそこで止まる */
function advance(weeks) {
  if (busy || G.gameOver) return;
  if (weeks <= 0) weeks = 1;
  setBusy(true);
  closeModal();
  setTimeout(() => {
    const reports = [];
    for (let i = 0; i < weeks; i++) {
      const r = nextWeek(G);
      reports.push(r);
      G.news = (G.news || []).concat(r.news).slice(-240);
      if (r.interrupt) break;
    }
    R.setMonth(G.month);
    R.setWeather(G.weather);
    R.invalidate();
    updateHeader();
    updateTicker();
    pushFeed(reports);
    setBusy(false);
    presentResults(reports);
    save();
  }, 20);
}

/** 進行結果の提示 */
function presentResults(reports) {
  const last = reports[reports.length - 1];
  const bids = reports.flatMap(r => r.bids.filter(b => b.listing.bid));
  if (last.quarterEnd) {
    $('#reportTitle').textContent = `${G.year}年 第${G.quarter}四半期　決算報告`;
    $('#reportBody').innerHTML = buildReport(G, last, reports);
    $('#reportWrap').classList.remove('hidden');
    return;
  }
  if (bids.length) { showBidResult(bids); return; }
  refresh();
  const majors = reports.flatMap(r => r.majorNews || []);
  if (majors.length) toast(`${majors[0].icon} ${majors[0].text.slice(0, 40)}${majors[0].text.length > 40 ? '…' : ''}`, majors[0].type === 'fin' ? 'bad' : '');
  // **決算週以外でも afterReport を通すこと。**
  // 以前は決算報告を閉じたときにしか呼ばれておらず、
  // 決算週に当たらない株主総会（6月）と春季交渉（2月）が一度も開かれなかった
  afterReport();
}

/** 入札の開札結果 */
function showBidResult(bids) {
  const html = bids.map(b => {
    const c = b.cell, win = b.result === 'win';
    const sorted = (b.bids || []).slice(0, 7);
    return `<div class="card" style="border-color:${win ? 'rgba(74,222,155,.45)' : 'rgba(255,107,122,.3)'}">
      <div class="card-t">
        <span class="card-n">${DISTRICTS[c.d].name}　${num(c.area)}坪</span>
        ${chip(win ? '落札' : b.result === 'fail' ? '不調' : '失注', win ? 'green' : 'red')}
      </div>
      <table class="tbl" style="margin-top:6px">
        <tr><th>入札者</th><th>金額</th>${b.listing.kind === 'proposal' ? '<th>企画評価</th>' : ''}</tr>
        ${sorted.map((x, i) => `<tr class="${x.isPlayer ? 'me' : ''}">
          <td>${i === 0 && b.result !== 'fail' ? '👑 ' : ''}${x.name}</td>
          <td>${money(x.amount)}</td>
          ${b.listing.kind === 'proposal' ? `<td>${x.quality.toFixed(0)}</td>` : ''}
        </tr>`).join('')}
      </table>
      ${win && b.second ? `<div class="hint">2位との差 ${money(b.winner.amount - b.second.amount)}（${pct((b.winner.amount - b.second.amount) / b.winner.amount, 1)}）</div>` : ''}
      ${win ? `<div class="btnrow"><button class="btn sm primary" data-plancell="${c.id}">この土地の事業計画を作る</button></div>` : ''}
    </div>`;
  }).join('');
  openModal('入札の開札', html, [{ label: '閉じる', cls: 'ghost', act: () => { closeModal(); afterReport(); } }]);
  document.querySelectorAll('[data-plancell]').forEach(b => b.onclick = () => {
    const c = cellById(G, b.dataset.plancell);
    closeModal();
    if (c) { focusCell(c); Dev.openPlan(G, c, ctx); }
  });
  refresh();
}

/** 週次フィード */
function pushFeed(reports) {
  const body = $('#feedBody');
  const blocks = [];
  for (const r of reports) {
    if (!r.news.length) continue;
    const cal = `${r.week % 52 === 0 ? '' : ''}`;
    blocks.push(`<div class="feed-week">${monthOfWeek(r.week)}</div>`
      + r.news.map(n => `<div class="feed-item ${n.major ? 'major' : ''}">
          <span class="fi">${n.icon}</span><span class="ft">${n.text}</span></div>`).join(''));
  }
  if (!blocks.length) {
    blocks.push(`<div class="feed-week">${dateLabel(G)}</div><div class="feed-empty">特筆すべき動きはなかった</div>`);
  }
  body.innerHTML = blocks.reverse().join('');
  body.scrollTop = 0;
  $('#feedTitle').textContent = reports.length > 1 ? `直近${reports.length}週の動き` : '今週の動き';
}
function monthOfWeek(week) { return dateLabelOf(week); }

function afterReport() {
  refresh();
  if (G.gameOver) return showGameOver();
  const rep = G.pendingReport;
  // 順に1つずつ出す。同じ週に総会と春闘が重なると片方が消えてしまう。
  // 閉じても決裁事項として残るので、経営ダッシュボードからいつでも開き直せる
  if (rep && rep.agenda && rep.agenda.raised && rep.agenda.raised.length) {
    const id = rep.agenda.raised.shift();
    return openAgendaItem(id);
  }
  if (rep && rep.unionRound) { rep.unionRound = null; return openShunto(); }
  // 上場していれば、決算のあとに説明会が開かれる
  if (rep && rep.briefing && rep.briefing.length) { const q = rep.briefing; rep.briefing = null; return openBriefing(q); }
}

// ------------------------------------------------------------
//  定時株主総会
//    議案をどう組むかはこちらが決める。賛成率は経営の成績で決まる。
// ------------------------------------------------------------
function openMeeting() {
  const ag = agendaOf(G);
  const sc = ag.score;
  const picked = new Set();
  draw();

  function draw() {
    const tone = sc.total > 0.15 ? 'good' : sc.total < -0.15 ? 'bad' : 'grey';
    openModal(`第${G.year - G.company.founded + 1}期 定時株主総会`, `
      <div class="card">
        <div class="card-t"><span class="card-n">経営に対する評価</span>
          ${chip(sc.total > 0.15 ? '良好' : sc.total < -0.15 ? '厳しい' : '中立', tone)}</div>
        <div class="card-s">
          ${kv('ROE（年換算）', (sc.roe * 100).toFixed(1) + '%')}
          ${kv('株価（直近1年）', (sc.priceUp >= 0 ? '+' : '') + (sc.priceUp * 100).toFixed(1) + '%')}
          ${kv('配当性向', (sc.div * 100).toFixed(0) + '%')}
          ${kv('物言う株主の持株比率', ((G.company.activistShare || 0.06) * 100).toFixed(1) + '%')}
        </div>
      </div>
      <div class="sec">
        <div class="sec-t"><span>株主構成</span></div>
        <div class="card"><div class="card-s">
          ${holdersOf(G).map(h => kv(h.name, (h.share * 100).toFixed(1) + '%')).join('')}
        </div></div>
      </div>
      <div class="sec">
        <div class="sec-t"><span>会社提案（かける議案を選ぶ）</span></div>
        ${ag.company.map(it => {
          const yes = supportFor(G, it, false);
          const on = picked.has(it.id);
          return `<div class="card click ${on ? 'sel' : ''}" data-item="${it.id}">
            <div class="card-t"><span class="card-n">${on ? '☑' : '☐'} ${it.name}</span>
              ${chip(`想定賛成率 ${(yes * 100).toFixed(0)}%`, yes >= it.need ? 'good' : 'bad')}</div>
            <div class="card-s">${it.desc}<br><span class="dim">可決には ${(it.need * 100).toFixed(0)}% が要る</span></div>
          </div>`;
        }).join('')}
      </div>
      ${ag.heat > 0.28 ? `<div class="warnrow">株主提案が出される気配がある（緊張度 ${(ag.heat * 100).toFixed(0)}%）。
        ${ag.proposals.map(p => p.name).join('／')}</div>` : ''}`,
      [{ label: '総会を開く', cls: 'primary', onClick: run, close: false }]);
    const body = document.getElementById('modalBody');
    body.querySelectorAll('[data-item]').forEach(el => el.onclick = () => {
      const id = el.dataset.item;
      if (picked.has(id)) picked.delete(id); else picked.add(id);
      draw();
    });
  }

  function run() {
    const rng = new RNG((G.rngState ^ 0x5bf03635) >>> 0);
    const res = holdMeeting(G, [...picked], rng, G.news);
    G.rngState = rng.s;
    refresh();
    const ng = res.results.filter(r => (r.kind === 'company' && !r.pass) || (r.kind === 'proposal' && r.pass));
    openModal('株主総会の結果', `
      ${res.results.length ? res.results.map(r => `<div class="card">
        <div class="card-t"><span class="card-n">${r.name}</span>
          ${chip(r.pass ? '可決' : '否決', (r.kind === 'proposal') === r.pass ? 'bad' : 'good')}</div>
        <div class="card-s">賛成 ${(r.yes * 100).toFixed(1)}%（必要 ${(r.need * 100).toFixed(0)}%）</div>
      </div>`).join('') : '<div class="hint">付議された議案はなかった。</div>'}
      ${ng.length ? '<div class="warnrow">経営の説明責任が問われている。来期の成績次第では、より強い提案が出る。</div>' : ''}`,
      [{ label: '閉じる', cls: 'primary', onClick: () => { refresh(); if (G.gameOver) showGameOver(); } }]);
  }
}

// ------------------------------------------------------------
//  春季交渉（春闘）
//    要求に対していくらで回答するかを決める。差が大きいと決裂する。
// ------------------------------------------------------------
function openShunto() {
  const r = G.union && G.union.round;
  if (!r || r.result) return;
  const d = r.demand;
  let raise = Math.round(d.base * 0.6 * 10) / 10;
  let hours = false, bonus = false;
  draw();

  function draw() {
    const acc = acceptanceOf(d, { raise, hours, bonus });
    const kind = acc >= 0.62 ? ['妥結', 'good'] : acc >= 0.34 ? ['不満を残して決着', 'amber'] : ['決裂', 'bad'];
    const cost = (raise / 100) * personnelYear();
    openModal(`${G.year}年 春季労使交渉`, `
      <div class="card">
        <div class="card-t"><span class="card-n">組合の要求</span>
          ${chip(`ベア ${d.base.toFixed(1)}%`, 'amber')}</div>
        <div class="card-s">
          ${d.reasons.length ? `<ul style="margin:0 0 8px 1.1em;padding:0;line-height:1.9">
              ${d.reasons.map(x => `<li>${x.text}</li>`).join('')}</ul>`
            : '<div class="dim" style="margin-bottom:8px">とくに強い理由は挙げられていない。</div>'}
          ${kv('組織率', (d.density * 100).toFixed(0) + '%')}
          ${kv('自社の平均年収', d.mine.toFixed(1) + '百万円')}
          ${kv('同業他社の中央値', d.mkt.toFixed(1) + '百万円')}
          ${kv('全社平均の残業', d.ot.toFixed(0) + '時間/月')}
        </div>
      </div>
      <div class="sec">
        <div class="sec-t"><span>会社回答</span>${chip(kind[0], kind[1])}</div>
        <div class="card"><div class="card-s">
          <label class="lbl">ベースアップ <b style="color:var(--gold)">${raise.toFixed(1)}%</b></label>
          <input type="range" id="shRaise" min="0" max="${Math.max(1, Math.ceil(d.base * 1.2 * 10))}" step="1" value="${Math.round(raise * 10)}" style="width:100%">
          ${kv('人件費の増加（年間）', money(cost))}
          <div class="card click ${hours ? 'sel' : ''}" data-opt="hours" style="margin-top:8px">
            <div class="card-t"><span class="card-n">${hours ? '☑' : '☐'} 時間外労働の削減に踏み込む</div>
            <div class="card-s">フレックスと外部委託を導入する。四半期ごとの固定費が増える。
              ${d.wantHours ? '<b style="color:var(--gold)">組合はここを強く求めている。</b>' : ''}</div>
          </div>
          <div class="card click ${bonus ? 'sel' : ''}" data-opt="bonus">
            <div class="card-t"><span class="card-n">${bonus ? '☑' : '☐'} 一時金を上積みする</div>
            <div class="card-s">年収1ヶ月ぶんを一度だけ支給する。</div>
          </div>
        </div></div>
      </div>
      <div class="hint">回答しないまま3月半ばを過ぎると、ゼロ回答として扱われる。</div>`,
      [{ label: 'この内容で回答する', cls: 'primary', onClick: submit, close: false }]);
    const body = document.getElementById('modalBody');
    const sl = body.querySelector('#shRaise');
    if (sl) sl.oninput = () => { raise = (+sl.value) / 10; draw(); };
    body.querySelectorAll('[data-opt]').forEach(el => el.onclick = () => {
      if (el.dataset.opt === 'hours') hours = !hours; else bonus = !bonus;
      draw();
    });
  }

  function personnelYear() {
    const st = (G.staff || []).filter(x => !x.subsidiary);
    const rp = G.hrPolicy.rankPay || [];
    return st.reduce((a, x) => a + (rp[x.rank] || 0), 0);
  }

  function submit() {
    if (bonus) G.cash -= Math.round(personnelYear() / 12);
    const res = answerRound(G, { raise, hours, bonus }, G.news);
    closeModal();
    refresh();
    toast(res.kind === 'break' ? '春季交渉は決裂した'
      : res.kind === 'grudging' ? '不満を残したまま決着した' : '春季交渉が妥結した',
      res.kind === 'break' ? 'bad' : res.kind === 'grudging' ? 'warn' : 'good');
  }
}

// ------------------------------------------------------------
//  決算説明会
//    同じ数字でも、どう説明するかで市場の受け取りは変わる。
// ------------------------------------------------------------
function openBriefing(questions) {
  let i = 0;
  const log = [];
  step();

  function step() {
    if (i >= questions.length) return finish();
    const q = questions[i];
    openModal(`決算説明会　${G.year}年 第${G.quarter}四半期`, `
      <div class="card" style="border-color:rgba(13,126,168,.35)">
        <div class="card-t"><span class="card-n">🎙 ${q.who}からの質問</span>
          ${chip(`${i + 1} / ${questions.length}`, 'grey')}</div>
        <div class="card-s" style="font-size:12.5px;line-height:1.9">${q.q}</div>
      </div>
      ${log.length ? `<div style="margin-top:10px">${log.map(x => `<div class="kv"><span class="k">${x.q}</span><span class="v">${x.a}</span></div>`).join('')}</div>` : ''}
      <div class="sec">
        <div class="sec-t"><span>社長としてどう答えるか</span></div>
        ${q.answers.map((a, k) => `<div class="card click" data-ans="${k}">
          <div class="card-t"><span class="card-n">${a.label}</span></div>
          <div class="card-s">「${a.say}」</div>
        </div>`).join('')}
      </div>`, []);
    const body = document.getElementById('modalBody');
    body.querySelectorAll('[data-ans]').forEach(el => el.onclick = () => {
      const a = q.answers[+el.dataset.ans];
      const after = answerQuestion(G, q, a, G.news);
      log.push({ q: q.who, a: a.label });
      toast(after, a.trust >= 0 ? 'good' : 'bad');
      i++; step();
    });
  }

  function finish() {
    closeBriefing(G, G.news);
    closeModal();
    refresh();
    const t = G.company.irTrust || 0;
    toast(t > 0.3 ? '説明会は好意的に受け止められた'
      : t < -0.25 ? '市場の目は厳しいままである' : '説明会を終えた');
  }
}

function showGameOver() {
  const k = kpis(G);
  const rank = ranking(G, 'rev').find(x => x.isPlayer);
  openModal(G.gameOver.title, `
    <div class="hint" style="font-size:13px;line-height:2">${G.gameOver.text}</div>
    <div class="grid3" style="margin:16px 0">
      ${mini('経営年数', (G.year - G.company.founded) + '年', `${G.week}週`)}
      ${mini('最終売上高', money(ttm(G).revenue, { unit: false }), moneyUnit(ttm(G).revenue))}
      ${mini('業界順位', rank ? rank.rank + '位' : '—', '')}
    </div>
    <div class="card">
      ${kv('累計売上高', money(G.kpi.cumRevenue))}
      ${kv('累計利益', money(G.kpi.cumProfit))}
      ${kv('竣工させた建物', G.kpi.builtCount + '棟')}
      ${kv('販売した住戸', num(G.kpi.soldUnits) + '戸')}
      ${kv('従業員数', G.staff.length + '名')}
      ${kv('企業ブランド', G.company.brand.toFixed(0))}
    </div>
  `, [{ label: '最初からやり直す', cls: 'primary', onClick: () => location.reload() }]);
}

function showIntro() {
  openModal('社長就任にあたって', `
    <div class="hint" style="font-size:13px;line-height:2">
      湊都（みなと）市。四井不動産、三陵地所といった巨人が支配するこの街で、当社は最も小さなデベロッパーである。<br><br>
      <b>勝ち筋はただひとつ、彼らが相手にしない小さな土地から始めることだ。</b>大手は自社の売上規模に見合わない案件には入札してこない。北野ニュータウンの戸建用地、城東の物流適地——そこから利益を積み上げ、いつか常盤ビジネス地区の一等地に自社の看板を掲げる。
    </div>
    <div class="sec">
      <div class="sec-t"><span>まず何をするか</span></div>
      <ol class="steps">
        <li>${IS_SMALL ? '下の' : '左の'}「用地」タブで売却情報を確認する</li>
        <li>事業収支を見て、利益の出る土地に入札する</li>
        <li>取得したら「開発」タブで用途とグレードを決めて着工する</li>
        <li>竣工したら分譲は売り、賃貸は運用する</li>
        <li>右上の ▶ で時間を進める${IS_SMALL ? '' : '（スペースキー）'}</li>
      </ol>
    </div>
    <div class="hint">地区ごとに適した用途がある。合わない用途で建てると必ず損をする。事業計画の画面で利益率を確認すること。</div>
  `, [{ label: '経営を始める', cls: 'primary' }]);
}

// ------------------------------------------------------------
//  ヘッダー・ティッカー
// ------------------------------------------------------------
function updateHeader() {
  const k = kpis(G);
  const t = ttm(G);
  const h = G.finance.history;
  const prev = h.length >= 2 ? h[h.length - 2] : null;
  $('#hdrCompany').textContent = G.company.name;
  $('#hdrDate').textContent = dateLabel(G);
  $('#hdrSeason').textContent = `${seasonOfMonth(G.month)}・${timeOfMonth(G.month).label}　第${G.quarter}四半期 ${G.weekOfQuarter + 1}/13週`;
  const items = [
    { k: '現預金', v: money(G.cash, { unit: false }), u: moneyUnit(G.cash), d: null },
    { k: '有利子負債', v: money(G.debt, { unit: false }), u: moneyUnit(G.debt) },
    { k: '売上高(TTM)', v: money(t.revenue, { unit: false }), u: moneyUnit(t.revenue) },
    { k: '営業利益', v: money(t.op, { unit: false }), u: moneyUnit(t.op), c: t.op >= 0 ? 'up' : 'down' },
    { k: '純資産', v: money(k.bps * G.company.shares / 1e6, { unit: false }), u: moneyUnit(k.bps * G.company.shares / 1e6) },
    { k: '格付', v: k.rating.id, u: '' },
    { k: 'ブランド', v: G.company.brand.toFixed(0), u: '' },
  ];
  if (G.company.listed) items.push({ k: '株価', v: num(k.price), u: '円' });
  $('#statStrip').innerHTML = items.map(i => `
    <div class="stat"><div class="stat-k">${i.k}</div>
    <div class="stat-v ${i.c || ''}">${i.v}${i.u ? `<small>${i.u}</small>` : ''}</div></div>`).join('');

  const w = WEATHERS[G.weather || 'clear'];
  $('#hudWeather').textContent = `${w.icon} ${w.label}　${G.market.phaseName}局面　不動産価格指数 ${(G.market.priceIdx * 100).toFixed(0)}`;
}

function updateBadges() {
  const counts = {
    // 決裁事項（人事・賞与・総会…）。放っておくと期限切れで既定処理になる
    dash: pendingAgenda(G).length,
    land: G.listings.filter(l => !l.bid).length,
    dev: G.cells.filter(c => c.owner === 'player' && !c.isHQ && !c.building && !c.projectId).length,
    ma: G.maTargets.length,
    rival: G.takeoverOffer ? 1 : 0,
  };
  document.querySelectorAll('.tab').forEach(b => {
    const k = b.dataset.panel;
    const old = b.querySelector('.badge');
    if (old) old.remove();
    if (counts[k]) {
      const s = document.createElement('span');
      s.className = 'badge'; s.textContent = counts[k];
      b.appendChild(s);
    }
  });
}

function updateTicker() {
  const rank = ranking(G, 'rev');
  const m = G.market;
  const items = [
    `<span class="tk"><b>湊都市場</b>${m.phaseName}局面</span>`,
    `<span class="tk"><b>不動産価格指数</b>${(m.priceIdx * 100).toFixed(1)}</span>`,
    `<span class="tk"><b>建設費指数</b>${(m.costIdx * 100).toFixed(1)}</span>`,
    `<span class="tk"><b>長期金利</b>${(m.rate * 100).toFixed(2)}%</span>`,
    ...rank.slice(0, 6).map(r => {
      const hist = r.history || [];
      const prev = hist.length >= 2 ? hist[hist.length - 2].rev : r.rev;
      const dl = r.rev - prev;
      return `<span class="tk"><b>${r.short || r.name}</b>${money(r.rev)} <span class="${dl >= 0 ? 'up' : 'down'}">${dl >= 0 ? '▲' : '▼'}</span></span>`;
    }),
    ...(G.news || []).slice(-4).map(n => `<span class="tk">${n.icon} ${n.text.slice(0, 44)}</span>`),
  ];
  $('#tickerTrack').innerHTML = items.join('') + items.join('');
}

// ------------------------------------------------------------
//  セーブ／ロード
// ------------------------------------------------------------
/**
 * オートセーブ。
 * 圧縮に数百ミリ秒かかるので、**画面を描き終えてから**走らせる。
 * 同じフレームで回すと、週を進めた瞬間に固まったように見える。
 */
function save() {
  if (!G || G.gameOver) return;
  const run = () => {
    const r = saveTo('auto', G);
    // 黙って失敗させないこと。気づかないまま何時間も遊ぶことになる
    if (!r.ok) toast(r.message, 'bad');
    else if (r.note) toast(r.note, 'warn');
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1200 });
  else setTimeout(run, 60);
}

function fmtSaveMeta(m) {
  if (!m) return '<span style="color:var(--ink-mute)">空き</span>';
  const d = new Date(m.savedAt);
  const stamp = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `<b>${m.company}</b>　${m.year}年 ${m.month}月 第${m.weekOfMonth}週目<br>
    <span style="color:var(--ink-dim);font-size:11px">純資産 ${money(m.equity)}／物件 ${m.assets}件／社員 ${m.staff}名　保存 ${stamp}</span>`;
}

function openSaveMenu() {
  const canSave = storageAvailable();
  const bak = backupSave();

  const slotCard = (s, recovery) => `
    <div class="card">
      <div class="card-t"><span class="card-n">${s.label}</span>${
        s.id === 'auto' ? chip('自動', 'cyan') : recovery ? chip('復旧用', 'amber') : ''}</div>
      <div class="card-s">${fmtSaveMeta(s.meta)}</div>
      <div class="btnrow">
        ${!recovery && s.id !== 'auto' ? `<button class="btn sm primary" data-sv="${s.id}">ここに保存する</button>` : ''}
        <button class="btn sm" data-ld="${s.id}" ${s.meta ? '' : 'disabled'}>読み込む</button>
        ${!recovery && s.meta && s.id !== 'auto' ? `<button class="btn sm danger" data-dl="${s.id}">削除</button>` : ''}
      </div>
    </div>`;

  const render = () => `
    ${canSave ? '' : `<div class="card" style="border-color:rgba(196,52,74,.35);background:var(--red-soft)">
      <div class="card-t"><span class="card-n">⚠ この画面では保存できない</span></div>
      <div class="card-s">プライベートモードか、ブラウザの設定でデータの保存が止められている。
      普通のタブで開き直すこと。いまの進行はファイルに書き出せば残せる。</div>
    </div>`}
    <div class="hint" style="margin-bottom:10px">進行中のゲームを保存する。オートセーブは週を進めるたびに自動で更新される。
    セーブはこのブラウザの中に残るので、ゲームを更新しても消えない。<br>
    いまの使用量 <b>${totalSize()}KB</b>（ブラウザが使わせてくれるのは 5,000KB 前後）。
    セーブは縮めて置いてあるので、長く遊んでも溢れにくい。</div>
    ${listSaves().map(s => slotCard(s, false)).join('')}
    ${bak ? `<div class="sec" style="margin-top:4px">
      <div class="sec-t"><span>復旧</span></div>
      <div class="hint" style="margin-bottom:8px">オートセーブが上書きされる直前の状態を1つだけ残している。
      うっかり進めすぎたときはここから戻せる。</div>
      ${slotCard(bak, true)}
    </div>` : ''}

    <div class="sec">
      <div class="sec-t"><span>ファイルに残す</span></div>
      <div class="hint">ブラウザのデータを消したり、機種を変えたりすると中のセーブは失われる。
      大事な進行はファイルに書き出しておくこと。</div>
      <div class="btnrow">
        <button class="btn sm primary" data-file-ex="1">ファイルに書き出す</button>
        <button class="btn sm" data-file-im="1">ファイルから読み込む</button>
      </div>
      <input type="file" id="saveFile" accept=".json,application/json" style="display:none">
    </div>

    <div class="sec">
      <div class="sec-t"><span>文字列で持ち出す</span></div>
      <div class="hint">別のブラウザに手で移したいときに使う。</div>
      <div class="btnrow">
        <button class="btn sm" data-ex="1">書き出す</button>
        <button class="btn sm" data-im="1">読み込む</button>
      </div>
      <textarea id="saveText" style="width:100%;height:96px;margin-top:8px;display:none;border-radius:8px;
        background:var(--field-bg);border:1px solid var(--line);color:var(--ink);font-size:11px;padding:8px"></textarea>
    </div>

    <div class="hint" style="margin-top:14px;padding-top:10px;border-top:1px solid var(--line-soft)">
      iPhone の Safari は、7日間そのサイトを開かないでいると保存データを消すことがある。
      ホーム画面に追加して、そこから遊べばこの対象から外れる。
    </div>`;

  openModal('セーブ／ロード', render(), [{ label: '閉じる', cls: 'ghost' }]);

  const bind = () => {
    const body = $('#modalBody');
    const redraw = () => { body.innerHTML = render(); bind(); };

    body.querySelectorAll('[data-sv]').forEach(b => b.onclick = () => {
      const r = saveTo(b.dataset.sv, G);
      toast(r.ok ? `${SLOT_LABEL[b.dataset.sv]}に保存した（${Math.round(r.size / 1024)}KB）` : r.message, r.ok ? 'good' : 'bad');
      redraw();
    });
    body.querySelectorAll('[data-ld]').forEach(b => b.onclick = () => {
      const g = loadFrom(b.dataset.ld);
      if (!g) return toast('このセーブは読み込めなかった', 'bad');
      closeModal();
      applyLoaded(g);
    });
    body.querySelectorAll('[data-dl]').forEach(b => b.onclick = () => {
      deleteSlot(b.dataset.dl);
      toast('削除した');
      redraw();
    });

    // ---- ファイル ----
    const fx = body.querySelector('[data-file-ex]');
    if (fx) fx.onclick = () => {
      try {
        const blob = new Blob([exportText(G)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = exportName(G);
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        toast('セーブデータを書き出した', 'good');
      } catch (e) { toast('書き出せなかった', 'bad'); }
    };
    const fi = body.querySelector('[data-file-im]');
    const fin = body.querySelector('#saveFile');
    if (fi && fin) {
      fi.onclick = () => fin.click();
      fin.onchange = () => {
        const f = fin.files && fin.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          const g = importText(rd.result);
          if (!g) return toast('このファイルは読み取れなかった', 'bad');
          closeModal();
          applyLoaded(g);
        };
        rd.onerror = () => toast('ファイルを開けなかった', 'bad');
        rd.readAsText(f);
      };
    }

    // ---- 文字列 ----
    const ta = body.querySelector('#saveText');
    const ex = body.querySelector('[data-ex]');
    if (ex) ex.onclick = () => {
      ta.style.display = 'block';
      ta.value = exportText(G);
      ta.select();
      toast('この文字列をコピーして保管すること');
    };
    const im = body.querySelector('[data-im]');
    if (im) im.onclick = () => {
      if (ta.style.display === 'none') { ta.style.display = 'block'; ta.value = ''; ta.placeholder = 'ここにセーブデータを貼り付けて、もう一度この操作を行う'; ta.focus(); return; }
      const g = importText(ta.value);
      if (!g) return toast('データを読み取れなかった', 'bad');
      closeModal();
      applyLoaded(g);
    };
  };
  bind();
}

/** 読み込んだ状態を画面に反映する */
function applyLoaded(g) {
  G = g;
  window.G = G;
  syncCalendar(G);
  G.pendingReport = null;
  R.g = G;
  R.invalidate();
  R.setMonth(G.month);
  R.setWeather(G.weather || 'clear');
  if (IS_SMALL) R.fit('minato'); else { R.cam.zoomIdx = 1; R.focusCity('minato', 1); }
  closePanel();
  updateHeader(); updateTicker(); refresh();
  toast(`${G.year}年 ${G.month}月 第${G.weekOfMonth}週目から再開する`, 'good');
}

// ------------------------------------------------------------
//  起動
// ------------------------------------------------------------

// ホーム画面に追加したあともオフラインで遊べるようにする。
// GitHub Pages 以外（file:// や Artifact）では単に何も起きない
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    // ページと同じ場所に置いた sw.js を使う（dist/ にも同じものを配っている）
    navigator.serviceWorker.register(new URL('./sw.js', location.href)).catch(() => {});
  });
}

// ブラウザにデータを消さないよう申請しておく（断られても実害はない）
requestPersistence();

// 前の版で圧縮せずに保存されたものを、縮めて置き直す。
// 古いセーブが1つ残っているだけで空きを食い潰していることがある
compactStorage();

titleAnim();
(function buildTitleSaves() {
  const box = document.getElementById('titleSaves');
  const list = listSaves().filter(s => s.meta);
  if (!list.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="title-saves-t">保存されたゲーム</div>` + list.map(s => `
    <button class="title-save" data-slot="${s.id}">
      <span class="ts-l">${s.label}</span>
      <span class="ts-m"><b>${s.meta.company}</b>　${s.meta.year}年 ${s.meta.month}月 第${s.meta.weekOfMonth}週目</span>
      <span class="ts-r">続きから ▶</span>
    </button>`).join('');
  box.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => {
    const g = loadFrom(b.dataset.slot);
    if (g) startGame(g);
  });
})();
document.getElementById('btnStart').onclick = () => startGame(null);

// ------------------------------------------------------------
//  タイトル画面：地盤の選択
//    どの地区を創業の地にするかで、序盤の戦い方が変わる。
//    大手が地盤にしている街を選べば真正面からぶつかることになる。
// ------------------------------------------------------------
(function initHomeSelect() {
  const sel = document.getElementById('inpHome');
  const note = document.getElementById('homeNote');
  if (!sel) return;
  const owners = {};
  for (const r of RIVAL_DEFS) (owners[r.home] = owners[r.home] || []).push(r);
  // 創業の地は湊都市の中から選ぶ（鶴見野市は進出してから）
  const order = Object.values(DISTRICTS).filter(d => (d.city || 'minato') === 'minato').sort((a, b) =>
    (owners[a.id] ? owners[a.id].length : 0) - (owners[b.id] ? owners[b.id].length : 0) || a.landPrice - b.landPrice);
  sel.innerHTML = order.map(d => {
    const rv = owners[d.id] || [];
    return `<option value="${d.id}"${d.id === 'W' ? ' selected' : ''}>${d.name}${rv.length ? `（${rv.map(r => r.short).join('・')}の地盤）` : '（空白地帯）'}</option>`;
  }).join('');
  const draw = () => {
    const d = DISTRICTS[sel.value];
    const rv = owners[sel.value] || [];
    note.innerHTML = `<b>${d.name}</b>　${d.desc}<br>`
      + (rv.length
        ? `この街は <b>${rv.map(r => r.name).join('・')}</b> の地盤である。真正面からぶつかることになるが、勝てば一気に名が通る。`
        : 'この街を地盤にしている大手はいない。腰を据えて足場を固められる。')
      + '<br>地盤では、分譲単価と募集賃料に約3%の上乗せがつき、稼働率も上がる。'
      + '提案コンペでは地元の実績が評価され、売却情報も入りやすくなる。';
  };
  sel.onchange = draw;
  draw();
})();


// ------------------------------------------------------------
//  決裁事項を開く
//    どれも「決まった時期にしか出てこない」ものなので、
//    閉じたあとでも経営ダッシュボードから開き直せるようにしてある
// ------------------------------------------------------------
function openAgendaItem(id) {
  switch (id) {
    case 'shunto': return openShunto();
    case 'meeting': return openMeeting();
    case 'bonusSummer': return openBonus('summer');
    case 'bonusWinter': return openBonus('winter');
    case 'hrCycle': return openHrCycle();
    case 'recruitPlan': {
      settle(G, 'recruitPlan');
      openPanel('hr');
      toast('人事パネルで翌年度の採用計画を決める');
      return;
    }
    default: return;
  }
}

// ------------------------------------------------------------
//  賞与の決定（夏季・冬季）
// ------------------------------------------------------------
function openBonus(seasonId) {
  const S = SEASONS[seasonId];
  const sug = suggestedMonths(G);
  const mkt = marketMonths(G);
  const last = lastYearMonths(G, seasonId);
  let months = sug;
  draw();

  function draw() {
    const cost = bonusCost(G, months);
    const vs = months - mkt;
    const tone = vs >= 0.3 ? ['世間より厚い', 'good'] : vs <= -0.4 ? ['世間より薄い', 'bad'] : ['世間並み', 'grey'];
    openModal(`${G.year}年 ${S.name}の決定`, `
      <div class="card">
        <div class="card-t"><span class="card-n">目安</span>${chip(`業績どおりなら ${sug.toFixed(1)}ヶ月`, 'grey')}</div>
        <div class="card-s">
          ${kv('世間水準（同業他社から逆算）', mkt.toFixed(1) + 'ヶ月')}
          ${kv('前年の' + S.name, last == null ? '—' : last.toFixed(1) + 'ヶ月')}
          ${kv('社員の月給合計', money(Math.round(monthlyPayroll(G))))}
        </div>
      </div>
      <div class="sec">
        <div class="sec-t"><span>支給月数</span>${chip(tone[0], tone[1])}</div>
        <div class="card"><div class="card-s">
          <label class="lbl">支給月数 <b style="color:var(--gold)">${months.toFixed(1)}ヶ月</b></label>
          <input type="range" id="bnMonths" min="0" max="${Math.round(MONTHS_MAX * 10)}" step="1" value="${Math.round(months * 10)}" style="width:100%">
          ${kv('支給総額', `<b>${money(cost)}</b>`, 'big')}
          ${kv('支給後の現預金', money(G.cash - cost))}
        </div></div>
      </div>
      <div class="hint">${S.label}。世間より厚ければ士気と定着が上がり、薄ければ下がる。
        前年より下げたときの落胆は、上げたときの喜びより大きい。
        決めないまま期限を過ぎると、業績どおりの目安（${sug.toFixed(1)}ヶ月）で支給される。</div>`,
      [{ label: 'この月数で支給する', cls: 'primary', onClick: submit, close: false }]);
    const sl = document.getElementById('bnMonths');
    if (sl) sl.oninput = () => { months = (+sl.value) / 10; draw(); };
  }

  function submit() {
    const r = payBonus(G, seasonId, months, G.news);
    settle(G, seasonId === 'summer' ? 'bonusSummer' : 'bonusWinter');
    closeModal();
    refresh();
    toast(`${S.name}を${r.months.toFixed(1)}ヶ月で支給した（${money(r.cost)}）`,
      r.delta >= 0.03 ? 'good' : r.delta <= -0.04 ? 'bad' : '');
  }
}

// ------------------------------------------------------------
//  定期人事の内示
//    4月の定期人事でどれだけ昇格させるかを決める
// ------------------------------------------------------------
function openHrCycle() {
  const pol = G.hrPolicy;
  let strict = pol.evalStrict ?? 0.5;
  draw();

  function draw() {
    const active = G.staff.filter(s => !s.subsidiary);
    // 等級ごとの「昇格を待っている人数」
    const rows = [];
    for (let r = 1; r <= TOP_STAFF_RANK; r++) {
      if (OFFICER_RANKS.includes(r)) continue;
      const def = RANKS[r];
      const cur = active.filter(s => s.rank === r).length;
      const room = def.slots === Infinity ? Infinity : Math.max(0, def.slots - cur);
      const cands = active.filter(s => s.rank === r - 1 && avgAbility(s) >= def.minAbility && s.tenure >= 2);
      const n = Math.min(room === Infinity ? 99 : room, Math.ceil(cands.length * (0.13 + strict * 0.12)));
      if (cands.length) rows.push({ name: rankNameOf(G, r), cands: cands.length, room, n });
    }
    const total = rows.reduce((a, x) => a + x.n, 0);
    openModal(`${G.year}年 定期人事の内示`, `
      <div class="card">
        <div class="card-t"><span class="card-n">4月の定期人事</span>${chip(`昇格見込み ${total}名`, total ? 'good' : 'grey')}</div>
        <div class="card-s">評価を厳しくすると昇格は絞られ、実力のある社員に枠が回る。
          緩めると多くが上がるが、等級に見合わない社員が増えて組織の質が落ちる。</div>
      </div>
      <div class="sec">
        <div class="sec-t"><span>評価の厳しさ</span>
          ${chip(strict >= 0.7 ? '厳しい' : strict <= 0.3 ? '緩い' : 'ふつう', strict >= 0.7 ? 'amber' : 'grey')}</div>
        <div class="card"><div class="card-s">
          <input type="range" id="hcStrict" min="0" max="100" step="5" value="${Math.round(strict * 100)}" style="width:100%">
          <table class="tbl" style="margin-top:8px">
            <tr><th>昇格先</th><th>有資格者</th><th>空き枠</th><th>昇格見込み</th></tr>
            ${rows.map(x => `<tr><td>${x.name}</td><td>${x.cands}</td>
              <td>${x.room === Infinity ? '—' : x.room}</td><td>${x.n}</td></tr>`).join('')}
          </table>
        </div></div>
      </div>
      <div class="hint">ここで決めた方針は、翌年1月の定期昇格に反映される。
        執行役員から上は自動で上がらないので、人事パネルから任命する。</div>`,
      [{ label: 'この方針で内示する', cls: 'primary', onClick: submit, close: false }]);
    const sl = document.getElementById('hcStrict');
    if (sl) sl.oninput = () => { strict = (+sl.value) / 100; draw(); };
  }

  function submit() {
    G.hrPolicy.evalStrict = strict;
    settle(G, 'hrCycle');
    closeModal();
    refresh();
    toast('定期人事の方針を内示した');
  }
}


// ------------------------------------------------------------
//  共同事業
//    持分を決めて組む。相手の希望から離れすぎるとまとまらない。
// ------------------------------------------------------------
function openJV(cell) {
  const off = offerFor(G, cell.id);
  if (!off) return toast('この用地に共同事業の打診は来ていない');
  const rv = G.rivals.find(r => r.id === off.rivalId);
  if (!rv) return;
  const want = Math.round((1 - off.theirShare) * 100) / 100;     // 先方の希望に沿った自社持分
  let share = want;
  draw();

  function draw() {
    const e = jvEffect(G, rv.id, share, off.use);
    const book = cell.bookValue || landAppraisal(G, cell);
    const paid = Math.round(book * (1 - share));
    const gap = Math.abs(share - want);
    const room = 0.18 + relationOf(G, rv.id) * 0.10;
    const ok = gap <= room;
    const solo = feasibility(G, cell, off.use, 'standard');
    openModal(`共同事業の検討　${DISTRICTS[cell.d].name}`, `
      <div class="card">
        <div class="card-t"><span class="card-n">${rv.name}</span>
          ${chip(`関係 ${(relationOf(G, rv.id) * 100).toFixed(0)}`, 'grey')}</div>
        <div class="card-s">
          ${kv('先方の希望', `先方 ${Math.round(off.theirShare * 100)}%／自社 ${Math.round(want * 100)}%`)}
          ${kv('得意分野', Object.entries(rv.focus).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([u]) => USES[u].name).join('・'))}
          ${kv('従業員数', num(rv.employees) + '名')}
          ${kv('回答期限', `あと${Math.max(0, off.deadline - G.week)}週`)}
        </div>
      </div>
      <div class="sec">
        <div class="sec-t"><span>出資比率</span>${chip(ok ? 'まとまる見込み' : '折り合わない', ok ? 'good' : 'bad')}</div>
        <div class="card"><div class="card-s">
          <label class="lbl">自社の持分 <b style="color:var(--gold)">${Math.round(share * 100)}%</b>
            ／ ${rv.short} ${Math.round((1 - share) * 100)}%</label>
          <input type="range" id="jvShare" min="${Math.round(SHARE_MIN * 100)}" max="${Math.round(SHARE_MAX * 100)}" step="5"
            value="${Math.round(share * 100)}" style="width:100%">
          ${kv('土地持分の譲渡で受け取る額', `<b style="color:var(--green)">${money(paid)}</b>`, 'big')}
          ${kv('建設費の軽減', '−' + (e.costCut * 100).toFixed(1) + '%')}
          ${kv('工期の短縮', '−' + (e.speedUp * 100).toFixed(1) + '%')}
          ${kv('単価への上乗せ', (e.priceUp >= 0 ? '+' : '') + (e.priceUp * 100).toFixed(1) + '%')}
        </div></div>
      </div>
      ${solo ? `<div class="sec">
        <div class="sec-t"><span>単独で建てた場合との比較</span></div>
        <div class="card"><div class="card-s">
          ${kv('単独の事業利益', money(solo.profit, { sign: true }))}
          ${kv('共同の自社取り分（概算）', money(Math.round(solo.profit * share * (1 + e.costCut + e.priceUp)), { sign: true }))}
          ${kv('自社の資金負担', `${money(Math.round(solo.buildCost * share))}（単独なら ${money(solo.buildCost)}）`)}
        </div></div>
      </div>` : ''}
      <div class="hint">持分を下げるほど資金は軽くなり、相手の調達力と施工力が濃く効く。
        そのかわり売上も保有床も持分ぶんに減る。
        先方の希望から離れすぎると話はまとまらない。</div>`,
      [
        { label: '見送る', cls: 'ghost', onClick: () => { declineJV(G, off, G.news); refresh(); } },
        { label: 'この比率で合意する', cls: 'primary', disabled: !ok, onClick: submit, close: false },
      ]);
    const sl = document.getElementById('jvShare');
    if (sl) sl.oninput = () => { share = (+sl.value) / 100; draw(); };
  }

  function submit() {
    const r = acceptJV(G, cell, off, share, G.news);
    closeModal();
    refresh();
    if (r.err) return toast(r.err, 'bad');
    toast(`${rv.short}と共同事業で合意した（自社${Math.round(r.share * 100)}%）`, 'good');
  }
}
