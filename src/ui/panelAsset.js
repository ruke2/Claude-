// ============================================================
//  保有物件パネル — 賃貸ポートフォリオ
// ============================================================
import { money, num, pct, moneyUnit, moneyHTML } from '../core/format.js';
import { section, kv, mini, chip, bar, empty, openModal, closeModal, toast } from './dom.js';
import { DISTRICTS, USES, GRADES } from '../data/city.js';
import { assetValue, currentNOI, subEffect } from '../sim/valuation.js';
import { orgPower } from '../sim/hr.js';
import { canRebuild, REBUILD_AGE, rebuildTargets, rebuildQuote, demolish,
  SCHEMES, schemeAvailable } from '../sim/rebuild.js';

export const title = '保有物件';

export function render(g, ctx) {
  const p = orgPower(g);
  let book = 0, mv = 0, noi = 0;
  for (const a of g.assets) { book += a.bookLand + a.bookBuild; mv += assetValue(g, a); noi += currentNOI(g, a); }

  const byUse = {};
  for (const a of g.assets) {
    const k = a.use;
    byUse[k] = byUse[k] || { n: 0, nra: 0, noi: 0, mv: 0 };
    byUse[k].n++; byUse[k].nra += a.nra; byUse[k].noi += currentNOI(g, a); byUse[k].mv += assetValue(g, a);
  }

  const cards = g.assets.length ? g.assets.map(a => {
    const d = DISTRICTS[a.district];
    const v = assetValue(g, a), b = a.bookLand + a.bookBuild;
    const n = currentNOI(g, a);
    const gap = a.rent / Math.max(1, a.marketRent) - 1;
    return `<div class="card">
      <div class="card-t"><span class="card-n">${a.name}</span>${chip(USES[a.use].name, 'cyan')}</div>
      <div class="card-s">${d.name}／貸室${num(a.nra)}坪／築${a.age.toFixed(1)}年／${GRADES[a.grade].name}</div>
      <div class="kv"><span class="k">稼働率</span><span class="v ${a.occupancy < 0.75 ? 'down' : a.occupancy > 0.93 ? 'up' : ''}">${pct(a.occupancy, 0)}</span></div>
      ${bar(a.occupancy, a.occupancy < 0.75 ? 'red' : '')}
      <div class="kv"><span class="k">賃料</span><span class="v">${num(a.rent)}円/坪·月　<span style="color:${Math.abs(gap) < 0.03 ? 'var(--ink-mute)' : gap > 0 ? 'var(--amber)' : 'var(--green)'}">市場比${(gap * 100).toFixed(0)}%</span></span></div>
      <div class="kv"><span class="k">年間NOI</span><span class="v">${money(n)}</span></div>
      <div class="kv"><span class="k">簿価 / 時価</span><span class="v">${money(b)} / ${money(v)}</span></div>
      <div class="kv"><span class="k">含み損益</span><span class="v ${v - b >= 0 ? 'up' : 'down'}">${money(v - b, { sign: true })}</span></div>
      <div class="kv"><span class="k">利回り（NOI÷簿価）</span><span class="v">${pct(n / Math.max(1, b))}</span></div>
      <div class="btnrow">
        <button class="btn sm" data-act="focus" data-id="${a.cellId}">📍</button>
        <button class="btn sm" data-act="asset.rent" data-id="${a.id}">賃料を改定する</button>
        ${canRebuild(g, a) ? '' : `<button class="btn sm tonal" data-act="asset.rebuild" data-id="${a.id}">建て替える</button>`}
        <button class="btn sm danger" data-act="asset.sell" data-id="${a.id}">売却する</button>
      </div>
    </div>`;
  }).join('') : empty('保有している賃貸物件はない');

  const rb = rebuildTargets(g);

  return `
  ${rb.length ? section('建て替えを検討できる物件', `${rb.length}件`, `
    <div class="hint" style="margin-bottom:10px">築${REBUILD_AGE}年を過ぎた自社物件は、解体して建て直せる。
    昔の建物は容積を使い残していることが多く、いまの基準で建て直すだけで床が増える。
    総合設計制度や再開発等促進区を使えば、容積率そのものを割り増せる。</div>
    ${rb.slice(0, 6).map(r => `<div class="card click" data-act="asset.rebuild" data-id="${r.asset.id}">
      <div class="card-t"><span class="card-n">${r.asset.name}</span>${chip(`築${Math.round(r.asset.age)}年`, r.asset.age >= 45 ? 'red' : 'amber')}</div>
      <div class="card-s">${DISTRICTS[r.asset.district].name}／${USES[r.asset.use].name}／延床 ${num(r.asset.gfa || 0)}坪
        <br>いまの建物は容積の <b>${Math.round((1 - r.slack) * 100)}%</b> しか使っていない</div>
      <div class="kv"><span class="k">解体費</span><span class="v">${money(r.quote.demo)}</span></div>
      <div class="kv"><span class="k">建物の除却損</span><span class="v down">${money(r.quote.loss)}</span></div>
      <div class="kv"><span class="k">工事中に失う賃料</span><span class="v down">${money(r.quote.lostRent)}</span></div>
    </div>`).join('')}
  `) : ''}
  ${section('賃貸ポートフォリオ', `${g.assets.length}件`, `
    <div class="grid4">
      ${mini('簿価合計', money(book, { unit: false }), moneyUnit(book))}
      ${mini('時価合計', money(mv, { unit: false }), moneyUnit(mv))}
      ${mini('含み損益', money(mv - book, { unit: false }), moneyUnit(mv - book), mv - book >= 0 ? 'var(--green)' : 'var(--red)')}
      ${mini('年間NOI', moneyHTML(noi), `利回り ${pct(noi / Math.max(1, book))}`)}
    </div>
    ${Object.keys(byUse).length ? `<table class="tbl" style="margin-top:12px">
      <tr><th>用途</th><th>件数</th><th>貸室面積</th><th>年間NOI</th><th>時価</th></tr>
      ${Object.entries(byUse).map(([u, v]) => `<tr><td>${USES[u].name}</td><td>${v.n}</td><td>${num(v.nra)}坪</td><td>${money(v.noi)}</td><td>${money(v.mv)}</td></tr>`).join('')}
    </table>` : ''}
    <div class="hint">ビル事業部の能力（${p.lease.quality.toFixed(0)}）が稼働率と賃料改定の交渉力を左右する。${subEffect(g, 'exitPremium') > 0 ? `REIT運用会社があるため、売却時に${pct(subEffect(g, 'exitPremium'), 0)}のプレミアムが乗る。` : ''}</div>
  `)}
  ${section('物件一覧', '', cards)}
  `;
}

export function openRent(g, a, ctx) {
  openModal(`賃料改定 — ${a.name}`, build(), [{ label: '閉じる', cls: 'ghost' }]);
  bind();
  function build() {
    return `
    <div class="card">
      ${kv('現行賃料', num(a.rent) + '円/坪·月')}
      ${kv('市場賃料', num(a.marketRent) + '円/坪·月')}
      ${kv('稼働率', pct(a.occupancy, 0))}
      ${kv('貸室面積', num(a.nra) + '坪')}
    </div>
    <div class="field" style="margin-top:12px">
      <label>新しい募集賃料（円/坪·月）</label>
      <input type="number" id="inpR" value="${a.rent}" step="500">
      <input type="range" id="rngR" min="${Math.round(Math.min(a.marketRent * 0.6, a.rent * 0.9))}" max="${Math.round(Math.max(a.marketRent * 1.4, a.rent * 1.1))}" value="${a.rent}" step="100" style="width:100%;margin-top:8px;accent-color:var(--gold)">
    </div>
    <div id="rInfo" class="hint"></div>
    <div class="hint">市場賃料を上回る設定は空室を増やす。逆に安すぎると収益を取りこぼす。既存テナントの賃料は段階的にしか動かない。</div>
    <div class="btnrow"><button class="btn primary" data-set="1">改定する</button></div>`;
  }
  function bind() {
    const body = document.getElementById('modalBody');
    const inp = body.querySelector('#inpR'), rg = body.querySelector('#rngR'), info = body.querySelector('#rInfo');
    const sync = v => {
      inp.value = v; rg.value = v;
      const gap = v / Math.max(1, a.marketRent);
      const target = Math.max(0, Math.min(1, (1.34 - gap * 0.36) * 0.95));
      info.innerHTML = `市場比 <b>${((gap - 1) * 100).toFixed(0)}%</b>　想定稼働率 <b>${(target * 100).toFixed(0)}%</b>　満室想定賃料収入 ${money(Math.round(a.nra * v * 12 / 1e6))}／年`;
    };
    inp.oninput = e => sync(+e.target.value);
    rg.oninput = e => sync(+e.target.value);
    sync(+inp.value);
    body.querySelector('[data-set]').onclick = () => {
      a.rent = Math.round(+inp.value); a.lastRentReview = g.week;
      toast('募集賃料を改定した');
      ctx.refresh(); closeModal();
    };
  }
}

// ------------------------------------------------------------
//  建て替え
//
//  **失うものを必ず一緒に出すこと。**
//  解体費だけ見せると、賃料が何年ぶん消えるのかが分からない。
// ------------------------------------------------------------
export function openRebuild(g, a, ctx) {
  const err = canRebuild(g, a);
  if (err) { toast(err, 'bad'); return; }
  const cell = g.cells.find(c => c.id === a.cellId);
  let scheme = 'plain';

  openModal(`${a.name}　建て替えの検討`, buildHTML(), [
    { label: 'やめる', cls: 'ghost' },
  ]);
  bind();

  function buildHTML() {
    const q = rebuildQuote(g, a, scheme);
    const S = SCHEMES[scheme];
    const total = q.demo + q.loss + q.lostRent;
    return `
    <div class="grid3">
      ${mini('いまの建物', `${num(a.gfa || 0)}坪`, `築${Math.round(a.age)}年／地上${a.floors || '—'}階`)}
      ${mini('容積の使い残し', `${Math.max(0, 100 - q.usedFar * 100 / Math.max(1, cell.far)).toFixed(0)}%`, `指定 ${cell.far}%／実績 ${q.usedFar}%`)}
      ${mini('いまの時価', money(q.marketValue), `年間NOI ${money(q.noi)}`)}
    </div>

    <div class="sec">
      <div class="sec-t"><span>進め方</span></div>
      <div class="btnrow" style="margin-top:0">
        ${Object.values(SCHEMES).map(s => {
      const ok = schemeAvailable(g, a, s);
      return `<button class="btn sm ${scheme === s.id ? 'primary' : ''}" data-scheme="${s.id}" ${ok ? '' : 'disabled'}>${s.name}${s.farBonus > 1 ? `（容積 +${Math.round((s.farBonus - 1) * 100)}%）` : ''}</button>`;
    }).join('')}
      </div>
      <div class="hint">${S.desc}${schemeAvailable(g, a, S) ? '' : '<br><span style="color:var(--red)">この敷地では要件を満たさない。</span>'}
        ${S.minArea ? `<br>必要な敷地面積 ${num(S.minArea)}坪以上（この敷地は ${num(cell.area)}坪）` : ''}
        ${S.minValue ? `／必要な規模 ${money(S.minValue)}以上` : ''}</div>
      ${kv('容積率', `${q.farNow}%　→　<b>${q.farAfter}%</b>`)}
      ${kv('工事費の上乗せ', S.costMul > 1 ? `+${Math.round((S.costMul - 1) * 100)}%` : 'なし')}
      ${kv('手続きによる遅れ', S.delay ? `${S.delay}週` : 'なし')}
    </div>

    <div class="sec">
      <div class="sec-t"><span>いま払うもの・失うもの</span><span class="note">合計 ${money(total)}</span></div>
      ${kv('解体費（現金）', money(q.demo))}
      ${kv('建物の除却損（損益に計上）', `<span class="down">${money(q.loss)}</span>`)}
      ${kv('工事中に入らなくなる賃料', `<span class="down">${money(q.lostRent)}（およそ${Math.round(q.weeks / 52 * 10) / 10}年ぶん）</span>`)}
      <div class="hint">解体費は土地の取得原価に含め、次の建物の原価になる。
        建物の残存簿価はその期の損益に落ちる。<br>
        <b>解体したあとは、いつもの「事業化を検討する」から用途とグレードを決めて着工する。</b>
        更地のまま寝かせておくこともできるが、そのあいだ賃料は入らない。</div>
    </div>

    <div class="btnrow">
      <button class="btn danger" data-go="1" ${schemeAvailable(g, a, SCHEMES[scheme]) ? '' : 'disabled'}>解体に着手する</button>
    </div>`;
  }

  function refresh() {
    const el = document.getElementById('modalBody');
    if (!el) return;
    el.innerHTML = buildHTML();
    bind();
  }

  function bind() {
    document.querySelectorAll('[data-scheme]').forEach(b => {
      b.onclick = () => { scheme = b.dataset.scheme; refresh(); };
    });
    const go = document.querySelector('[data-go]');
    if (go) go.onclick = () => {
      const r = demolish(g, a, scheme, null);
      if (!r.ok) return toast(r.message, 'bad');
      closeModal();
      toast(`${a.name}の解体に着手した。用地パネルから事業化を進めること`, 'good');
      ctx.refresh && ctx.refresh();
    };
  }
}
