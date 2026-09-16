// ============================================================
//  摩天楼の設計図 — エントリポイント
// ============================================================
import { createGame, cellById } from './core/state.js';
import { money, num, pct, dcls, arrow } from './core/format.js';
import { dateLabel, weeksLabel, WEEKS_PER_QUARTER, syncCalendar } from './core/time.js';
import { CityRenderer, ZOOM_STEPS } from './render/city.js';
import { toScreen } from './render/iso.js';
import { WEATHERS, timeOfMonth, seasonOfMonth } from './render/palette.js';
import { hash2 } from './core/rng.js';
import { DISTRICTS, USES, TERRAIN, GRADES } from './data/city.js';
import { RNG } from './core/rng.js';

import { nextWeek } from './sim/week.js';
import { kpis, ttm, buildBS, sharePrice, marketCap, ipoStatus } from './sim/finance.js';
import { startProject as simStart, canStart } from './sim/project.js';
import { acquireForPlayer, holdingCost, generateListings as genListings } from './sim/land.js';
import { landAppraisal, assetValue, currentNOI } from './sim/valuation.js';
import { sellAsset } from './sim/sales.js';
import { foundSubsidiary, liquidate, generateTargets as genTargets } from './sim/ma.js';
import { orgPower } from './sim/hr.js';
import { ranking } from './sim/rivals.js';
import { SUB_TYPES } from './data/companies.js';
import { HR_PROGRAMS, DEPTS, RANKS } from './data/hrdata.js';

import { $, openModal, closeModal, toast, section, kv, mini, chip, bar, empty } from './ui/dom.js';
import * as Dash from './ui/panelDash.js';
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

const PANELS = { dash: Dash, land: Land, dev: Dev, sales: Sales, asset: Asset, fin: Fin, hr: HR, brand: Brand, ma: MA, rival: Rival };
const SAVE_KEY = 'skyline-dev-v2';

let G = null, R = null;
let currentPanel = null;
let lastT = 0;
const ctx = {
  refresh, rivalKey: 'rev', hrSort: 'ability',
  startProject, acquireNow, focusCell,
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

// ------------------------------------------------------------
//  ゲーム開始
// ------------------------------------------------------------
function startGame(saved) {
  if (saved) {
    G = saved;
  } else {
    const name = ($('#inpCompany').value || '常盤地所').slice(0, 12);
    const diff = $('#inpDiff').value;
    G = createGame({ companyName: name, difficulty: diff, seed: Date.now() & 0x7fffffff });
    G.news = [{ icon: '🏢', type: 'market', text: `${name}が創業した。湊都市での事業を開始する。` }];
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
  R.center();
  window.R = R;

  $('#titleScreen').classList.add('out');
  setTimeout(() => $('#titleScreen').remove(), 800);
  bindInput();
  updateHeader();
  updateTicker();
  refresh();
  requestAnimationFrame(loop);
  if (!saved) setTimeout(showIntro, 900);
}

function loop(ts) {
  const dt = Math.min(0.05, (ts - lastT) / 1000 || 0.016);
  lastT = ts;
  R.draw(dt);
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------
//  入力
// ------------------------------------------------------------
function bindInput() {
  const cv = $('#city');
  let drag = null;

  cv.addEventListener('pointerdown', e => {
    drag = { x: e.clientX, y: e.clientY, cx: R.cam.x, cy: R.cam.y, moved: 0 };
    cv.setPointerCapture(e.pointerId);
    cv.classList.add('dragging');
  });
  cv.addEventListener('pointermove', e => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      R.cam.x = drag.cx + dx; R.cam.y = drag.cy + dy;
    } else {
      const c = R.pick(e.clientX, e.clientY);
      R.hover = c;
      updateHover(c);
    }
  });
  cv.addEventListener('pointerup', e => {
    const wasDrag = drag && drag.moved > 6;
    cv.classList.remove('dragging');
    drag = null;
    if (!wasDrag) {
      const c = R.pick(e.clientX, e.clientY);
      R.selected = c;
      if (c) onCellClick(c);
    }
  });
  cv.addEventListener('pointerleave', () => { drag = null; cv.classList.remove('dragging'); });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    R.zoomBy(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
  }, { passive: false });

  window.addEventListener('resize', () => R.resize());

  document.querySelectorAll('.vbtn').forEach(b => b.onclick = () => {
    const v = b.dataset.view;
    if (v === 'zoomin') R.zoomBy(1);
    if (v === 'zoomout') R.zoomBy(-1);
    if (v === 'rotate') R.rotateBy(1);
    if (v === 'reset') { R.cam.zoomIdx = 1; R.cam.rot = 0; R.invalidate(); R.center(); }
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
  $('#btnQuarter').onclick = () => advance(WEEKS_PER_QUARTER - G.weekOfQuarter);
  $('#feedToggle').onclick = () => {
    const f = $('#feed');
    f.classList.toggle('collapsed');
    $('#feedToggle').textContent = f.classList.contains('collapsed') ? '▸' : '▾';
  };
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
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.panel === key));
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
    case 'hr.newgrad': HR.openNewGrad(G, ctx); break;
    case 'hr.list': ctx.hrSort = id; refresh(); break;
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
      const t = G.maTargets.find(x => x.id === id);
      if (t) MA.openTarget(G, t, ctx);
      break;
    }
    case 'brand.new': Brand.openNew(G, ctx); break;
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
    $('#reportTitle').textContent = `${G.year}年 Q${G.quarter}　決算報告`;
    $('#reportBody').innerHTML = buildReport(G, last, reports);
    $('#reportWrap').classList.remove('hidden');
    return;
  }
  if (bids.length) { showBidResult(bids); return; }
  refresh();
  const majors = reports.flatMap(r => r.majorNews || []);
  if (majors.length) toast(`${majors[0].icon} ${majors[0].text.slice(0, 40)}${majors[0].text.length > 40 ? '…' : ''}`, majors[0].type === 'fin' ? 'bad' : '');
  if (G.gameOver) showGameOver();
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
  openModal('入札の開札', html, [{ label: '閉じる', cls: 'ghost' }]);
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
    blocks.push(`<div class="feed-week">${G.year}年 ${monthOfWeek(r.week)}</div>`
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
function monthOfWeek(week) {
  const MS = [0, 5, 9, 13, 18, 22, 26, 31, 35, 39, 44, 48];
  const woy = week % 52;
  let m = 0;
  for (let i = 0; i < 12; i++) if (woy >= MS[i]) m = i;
  return `${m + 1}月 第${woy - MS[m] + 1}週`;
}

function afterReport() {
  refresh();
  if (G.gameOver) showGameOver();
}

function showGameOver() {
  const k = kpis(G);
  const rank = ranking(G, 'rev').find(x => x.isPlayer);
  openModal(G.gameOver.title, `
    <div class="hint" style="font-size:13px;line-height:2">${G.gameOver.text}</div>
    <div class="grid3" style="margin:16px 0">
      ${mini('経営年数', (G.year - G.company.founded) + '年', `${G.week}週`)}
      ${mini('最終売上高', money(ttm(G).revenue, { unit: false }), '億円')}
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
  `, [{ label: '最初からやり直す', cls: 'primary', onClick: () => { localStorage.removeItem(SAVE_KEY); location.reload(); } }]);
}

function showIntro() {
  openModal('社長就任にあたって', `
    <div class="hint" style="font-size:13px;line-height:2">
      湊都（みなと）市。四井不動産、三陵地所といった巨人が支配するこの街で、当社は最も小さなデベロッパーである。<br><br>
      <b>勝ち筋はただひとつ、彼らが相手にしない小さな土地から始めることだ。</b>大手は自社の売上規模に見合わない案件には入札してこない。北野ニュータウンの戸建用地、城東の物流適地——そこから利益を積み上げ、いつか常盤ビジネス地区の一等地に自社の看板を掲げる。
    </div>
    <div class="sec">
      <div class="sec-t"><span>まず何をするか</span></div>
      ${kv('①', '左の「用地」タブで売却情報を確認する')}
      ${kv('②', '事業収支を見て、利益の出る土地に入札する')}
      ${kv('③', '取得したら「開発」タブで用途とグレードを決めて着工する')}
      ${kv('④', '竣工したら分譲は売り、賃貸は運用する')}
      ${kv('⑤', '「次の四半期」で時間を進める（スペースキー）')}
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
  $('#hdrSeason').textContent = `${seasonOfMonth(G.month)}・${timeOfMonth(G.month).label}　Q${G.quarter} 第${G.weekOfQuarter + 1}週`;
  const items = [
    { k: '現預金', v: money(G.cash, { unit: false }), u: '億円', d: null },
    { k: '有利子負債', v: money(G.debt, { unit: false }), u: '億円' },
    { k: '売上高(TTM)', v: money(t.revenue, { unit: false }), u: '億円' },
    { k: '営業利益', v: money(t.op, { unit: false }), u: '億円', c: t.op >= 0 ? 'up' : 'down' },
    { k: '純資産', v: money(k.bps * G.company.shares / 1e6, { unit: false }), u: '億円' },
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
//  セーブ
// ------------------------------------------------------------
function save() {
  if (!G || G.gameOver) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) { /* 容量超過などは無視 */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const g = JSON.parse(raw);
    return (g && g.cells && g.cells.length) ? g : null;
  } catch (e) { return null; }
}

// ------------------------------------------------------------
//  起動
// ------------------------------------------------------------
titleAnim();
const saved = loadSave();
if (saved) {
  const form = document.querySelector('.title-form');
  const btn = document.createElement('button');
  btn.className = 'btn wide';
  btn.style.marginTop = '10px';
  btn.textContent = `前回の続きから（${saved.company.name}／${saved.year}年Q${saved.quarter}）`;
  btn.onclick = () => startGame(saved);
  form.parentElement.insertBefore(btn, document.querySelector('.title-credit'));
}
$('#btnStart').onclick = () => { localStorage.removeItem(SAVE_KEY); startGame(null); };
