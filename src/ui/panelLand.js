// ============================================================
//  用地パネル — 売却情報・デューデリジェンス・入札
// ============================================================
import { money, moneyHTML, num, pct, clamp, moneyUnit } from '../core/format.js';
import { section, kv, mini, chip, bar, empty, lockCard, openModal, closeModal, toast } from './dom.js';
import { unlocked, needFor, ttmRevenue, UNLOCK_INFO, isHome } from '../sim/company.js';
import { DISTRICTS, USES, GRADES, TERRAIN, CITIES, cityOf } from '../data/city.js';
import { LISTING_KINDS, ddCost, runDueDiligence, ACQ_FEE, holdingCostQ } from '../sim/land.js';
import { weeksLabel } from '../core/time.js';
import { devPlan, landAppraisal, bestUseFit } from '../sim/valuation.js';
import { orgPower } from '../sim/hr.js';
import { debtCapacity } from '../sim/finance.js';
import { RNG } from '../core/rng.js';
import { standingRows, MAX_BIDS } from '../sim/trading.js';
import { assemblyRows, assemblyBases, neighborsOf, MAX_PARCELS, MAX_ASSEMBLIES } from '../sim/assembly.js';

export const title = '用地取得';

export function render(g, ctx) {
  const p = orgPower(g);
  const owned = g.cells.filter(c => c.owner === 'player' && !c.isHQ && !c.building && !c.projectId);
  const bidding = g.listings.filter(l => l.bid);

  const cards = g.listings.length ? g.listings.map(l => {
    const c = g.cells.find(x => x.id === l.cellId);
    const d = DISTRICTS[c.d];
    const K = LISTING_KINDS[l.kind];
    const known = l.risks.filter(r => r.found);
    return `<div class="card click ${l.kind === 'public' ? 'publiccard' : ''}" data-act="land.detail" data-id="${l.id}">
      <div class="card-t">
        <span class="card-n">${l.program ? l.program.icon + ' ' : ''}${cityOf(c.d) === 'minato' ? '' : CITIES[cityOf(c.d)].short + '・'}${d.name}　${num(c.area)}坪</span>
        ${chip(K.name, l.kind === 'public' ? 'cyan' : l.kind === 'nego' ? 'green' : l.kind === 'proposal' ? 'violet' : 'cyan')}
        ${isHome(g, c.d) ? chip('地盤', 'gold') : ''}
      </div>
      <div class="card-s">
        ${l.program ? `<b>${l.program.name}</b><br>指定用途 ${USES[l.program.use].name}　／　` : `容積率 ${c.far}% ／ 最有効利用 ${USES[l.bestUse].name} ／ `}容積率 ${c.far}% ／ 駅力 ${(c.station * 100).toFixed(0)}
        <br>売主：${l.seller}
      </div>
      <div class="kv"><span class="k">売出価格</span><span class="v">${money(l.askPrice)}</span></div>
      <div class="kv"><span class="k">当社査定</span><span class="v">${money(l.appraisal)}</span></div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap">
        ${chip(`締切まで ${l.deadline}週`, l.deadline <= 2 ? 'red' : 'grey')}
        ${l.ddLevel ? chip(`調査済 Lv${l.ddLevel}`, 'cyan') : chip('未調査', 'amber')}
        ${known.length ? chip(`判明した事項 ${known.length}件`, known.some(r => r.bad) ? 'red' : 'green') : ''}
        ${l.bid ? chip(`入札済 ${money(l.bid.amount)}`, 'gold') : ''}
      </div>
    </div>`;
  }).join('') : empty('現在、売りに出ている用地はない。<br>用地開発部の陣容を厚くすると情報が集まりやすくなる。');

  const ownedCards = owned.length ? owned.map(c => {
    const d = DISTRICTS[c.d];
    const app = landAppraisal(g, c);
    const book = c.bookValue ?? c.lastPaid ?? 0;
    const gain = app - book;
    return `<div class="card click" data-act="dev.plan" data-id="${c.id}">
      <div class="card-t"><span class="card-n">${c.program ? c.program.icon + ' ' : ''}${cityOf(c.d) === 'minato' ? '' : CITIES[cityOf(c.d)].short + '・'}${d.name}　${num(c.area)}坪</span>${
      c.program ? chip('公募条件あり', 'cyan') : chip('未着工', 'amber')}</div>
      <div class="card-s">${c.program ? `<b>${c.program.name}</b>（${USES[c.program.use].name}として整備する義務がある）<br>` : ''}容積率 ${c.far}%／取得 ${money(book)}／時価 ${money(app)}
        <span class="${gain >= 0 ? 'up' : 'down'}">（${money(gain, { sign: true })}）</span><br>
        保有コスト ${money(holdingCostQ(g, c))}／四半期
        ${(c.risks || []).filter(r => r.bad).length ? `<br><span style="color:var(--red)">未解消の課題：${(c.risks || []).filter(r => r.bad).map(r => r.name).join('・')}</span>` : ''}
      </div>
      <div class="btnrow"><button class="btn sm primary" data-act="dev.plan" data-id="${c.id}">事業化を検討する</button><button class="btn sm" data-act="focus" data-id="${c.id}">📍 地図で見る</button></div>
    </div>`;
  }).join('') : empty('未着工の保有地はない');

  return `
  ${section('用地情報の入手力', '', `
    <div class="grid3">
      ${mini('用地開発部', p.land.quality.toFixed(0), `${p.land.count}名`)}
      ${mini('今期の案件数', g.listings.length + '件', '市況とチーム力で変動')}
      ${mini('入札中', bidding.length + '件', '締切で自動的に開札')}
    </div>
    <div class="hint">用地開発部の人員と能力が高いほど、多くの売却情報が持ち込まれる。仲介子会社の買収も情報量を押し上げる。</div>
  `)}
  ${section('売却情報', `${g.listings.length}件`, cards)}
  ${section('収益物件（一棟）', `${(g.standing || []).length}件`, standingCards(g))}
  ${unlocked(g, 'public') ? '' : section('公共案件', '未解禁',
    lockCard(UNLOCK_INFO.public, needFor(g, 'public'), ttmRevenue(g)))}
  ${section('保有中の未着工用地', `${owned.length}件`, ownedCards)}
  ${assemblySection(g)}
  `;
}

/**
 * 用地の集約（種地の取得）。
 * 大きな敷地は「探すもの」ではなく「作るもの」である、という節。
 */
function assemblySection(g) {
  const rows = assemblyRows(g);
  const bases = assemblyBases(g);
  const body = `
    <div class="hint" style="margin-bottom:10px">
      隣り合う区画を買い足して、1つの大きな敷地にする。
      種地は相場では買えず、地権者によっては折り合わない。
      <b>1人でも折れないと敷地はつながらない。</b>
      途中でやめても、買った土地は飛び地として手元に残る。
    </div>
    ${rows.map(r => {
    const a = r.assembly;
    return `<div class="card click ${r.holdouts ? 'warn' : ''}" data-act="asm.open" data-id="${a.id}">
        <div class="card-t">
          <span class="card-n">${r.district.name}　集約交渉</span>
          ${chip(`${r.done}/${r.total}区画`, r.done === r.total ? 'green' : 'amber')}
          ${r.holdouts ? chip(`ごねている ${r.holdouts}件`, 'red') : ''}
        </div>
        <div class="card-s">いまの敷地 ${num(r.baseArea)}坪　→　まとまれば <b>${num(r.futureArea)}坪</b></div>
        <div class="kv"><span class="k">ここまでの支出</span><span class="v">${money(r.spent)}</span></div>
        <div class="btnrow"><button class="btn sm primary" data-act="asm.open" data-id="${a.id}">交渉の状況を見る</button></div>
      </div>`;
  }).join('')}
    ${rows.length >= MAX_ASSEMBLIES ? '' : bases.slice(0, 5).map(c => {
    const nb = neighborsOf(g, c);
    return `<div class="card click" data-act="asm.start" data-id="${c.id}">
        <div class="card-t"><span class="card-n">${cityOf(c.d) === 'minato' ? '' : CITIES[cityOf(c.d)].short + '・'}${DISTRICTS[c.d].name}　${num(c.area)}坪</span>${chip('集約できる', 'cyan')}</div>
        <div class="card-s">隣に買える区画が ${nb.length} つある（最大${MAX_PARCELS}区画まで交渉できる）<br>
          まとまれば ${num(c.area + nb.slice(0, MAX_PARCELS).reduce((s, x) => s + x.area, 0))}坪 の敷地になる</div>
        <div class="btnrow"><button class="btn sm" data-act="asm.start" data-id="${c.id}">集約を検討する</button></div>
      </div>`;
  }).join('')}
    ${!rows.length && !bases.length ? empty('集約できる自社の更地がない。<br>隣に他社や個人の区画が残っている更地を持っていることが条件である。') : ''}`;
  return section('用地の集約（種地の取得）', rows.length ? `${rows.length}件 交渉中` : '', body);
}

/**
 * 稼働中のビルの売り物件。
 * 更地の売却情報と見分けがつくように、見せる数字を変える。
 * 土地は坪単価、ビルは**利回り**で判断するものである。
 */
function standingCards(g) {
  const rows = standingRows(g);
  if (!rows.length) {
    return empty('いま売りに出ている一棟物件はない。<br>用地開発部の情報力が高いほど、この手の話は早く回ってくる。');
  }
  return rows.map(r => {
    const o = r.offer, s = o.spec, c = r.cell;
    if (!c) return '';
    return `<div class="card click" data-act="std.detail" data-id="${o.id}">
      <div class="card-t">
        <span class="card-n">${cityOf(c.d) === 'minato' ? '' : CITIES[cityOf(c.d)].short + '・'}${(c.building && c.building.name) || r.district.name}</span>
        ${chip(USES[s.use].name, 'cyan')}
        ${s.value >= 20000 ? chip('大型', 'gold') : ''}
        ${isHome(g, c.d) ? chip('地盤', 'gold') : ''}
      </div>
      <div class="card-s">
        ${r.district.name}　${GRADES[s.grade].name}／地上${s.floors}階／貸室 ${num(s.nra)}坪／築${s.age}年<br>
        売主：${o.seller}
      </div>
      <div class="kv"><span class="k">売出価格</span><span class="v">${money(o.ask)}</span></div>
      <div class="kv"><span class="k">当社査定</span><span class="v">${money(s.value)}</span></div>
      <div class="kv"><span class="k">NOI利回り（売出価格に対して）</span><span class="v">${(r.yieldOnAsk * 100).toFixed(2)}%</span></div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap">
        ${chip(`締切まで ${r.weeksLeft}週`, r.weeksLeft <= 2 ? 'red' : 'grey')}
        ${chip(`稼働 ${Math.round(s.occupancy * 100)}%`, s.occupancy >= 0.9 ? 'green' : 'amber')}
        ${o.bids ? chip(`交渉 ${o.bids}/${MAX_BIDS}回`, o.bids >= MAX_BIDS ? 'red' : 'amber') : ''}
      </div>
    </div>`;
  }).join('');
}

// ------------------------------------------------------------
//  案件詳細
// ------------------------------------------------------------
export function openDetail(g, listing, ctx) {
  const c = g.cells.find(x => x.id === listing.cellId);
  if (!c) return;
  const d = DISTRICTS[c.d];
  const K = LISTING_KINDS[listing.kind];
  let use = listing.bestUse, grade = 'standard', planLevel = 1;

  const body = openModal(`${d.name}　${num(c.area)}坪`, buildHTML(), [
    { label: '閉じる', cls: 'ghost' },
  ]);
  bind();

  function buildHTML() {
    const plan = devPlan(g, c, use, grade, { landCost: listing.appraisal });
    const known = listing.risks.filter(r => r.found);
    const room = Math.max(0, debtCapacity(g) - g.debt);
    const power = g.cash + room;
    const p = orgPower(g);
    // 他社の入札レンジ予測（用地部の情報力で精度が上がる）
    const acc = Math.min(0.92, 0.35 + p.land.quality / 220);
    const est = Math.round(plan.residualLand * 0.86);
    const spread = Math.round(est * (0.42 - acc * 0.30));
    // 残余法がマイナスになる（この用途では事業が成り立たない）場合、
    // 入札欄の初期値やスライダーの上限が負の数になってしまうので下限を設ける
    const bidBase = Math.max(0, Math.min(plan.residualLand * 0.82, listing.askPrice));
    const bidMax = Math.max(listing.askPrice, Math.max(0, plan.residualLand));

    return `
    <div class="grid3" style="margin-bottom:14px">
      ${mini('売出価格', money(listing.askPrice, { unit: false }), moneyUnit(listing.askPrice))}
      ${mini('当社査定', money(listing.appraisal, { unit: false }), moneyUnit(listing.appraisal))}
      ${mini('取得諸費用', moneyHTML(Math.round(listing.askPrice * ACQ_FEE)), `売買価格の${(ACQ_FEE * 100).toFixed(1)}%`)}
    </div>

    <div class="card">
      <div class="card-t"><span class="card-n">${K.icon} ${K.name}</span>${chip(`締切まで ${listing.deadline}週`, listing.deadline <= 2 ? 'red' : 'grey')}</div>
      <div class="card-s">${K.desc}<br>売主：${listing.seller}<br>${listing.note}</div>
    </div>
    ${listing.program ? `<div class="card" style="border-color:rgba(13,126,168,.4)">
      <div class="card-t"><span class="card-n">${listing.program.icon} ${listing.program.name}</span>${chip('公募条件', 'cyan')}</div>
      <div class="card-s">${listing.program.desc}</div>
      ${kv('指定用途', USES[listing.program.use].name)}
      ${kv('仕様の下限', GRADES[listing.program.minGrade] ? GRADES[listing.program.minGrade].name : '—')}
      ${kv('公共貢献施設の負担', '建設費の約' + (listing.program.benefit * 100).toFixed(1) + '%')}
      ${kv('審査', '提案内容 7割・価格 3割')}
      <div class="hint">公募価格を下回る提示はできない。選定されると企業ブランドが上がるが、指定された用途でしか着工できない。</div>
    </div>` : ''}

    <div class="sec">
      <div class="sec-t"><span>区画の概要</span></div>
      <div class="grid2">
        <div>
          ${kv('所在', `${CITIES[cityOf(c.d)].name}　${d.name}`)}
          ${kv('敷地面積', num(c.area) + '坪')}
          ${kv('容積率', c.far + '%')}
        </div>
        <div>
          ${kv('駅力', (c.station * 100).toFixed(0) + ' / 100')}
          ${kv('最有効利用', USES[listing.bestUse].name)}
          ${kv('用途適合', (d.fit[use] ?? 0.3).toFixed(2))}
        </div>
      </div>
    </div>

    <div class="sec">
      <div class="sec-t"><span>デューデリジェンス</span><span class="note">${listing.ddLevel ? `実施済み（Lv${listing.ddLevel}）` : '未実施'}</span></div>
      ${known.length ? known.map(r => `
        <div class="card" style="border-color:${r.bad ? 'rgba(255,107,122,.3)' : 'rgba(74,222,155,.3)'}">
          <div class="card-t"><span class="card-n">${r.bad ? '⚠' : '✨'} ${r.name}</span>${chip(r.bad ? 'リスク' : '好材料', r.bad ? 'red' : 'green')}</div>
          <div class="card-s">${r.desc}</div>
        </div>`).join('')
        : `<div class="hint">${listing.ddLevel ? '調査の範囲では特段の問題は見つからなかった。ただし見落としの可能性は残る。' : '調査を行わないまま取得すると、土壌汚染や地中障害物といった瑕疵を引き受けることになる。'}</div>`}
      <div class="btnrow">
        <button class="btn sm" data-dd="1" ${listing.ddLevel >= 1 ? 'disabled' : ''}>簡易調査 ${money(ddCost(listing, 1))}</button>
        <button class="btn sm" data-dd="2" ${listing.ddLevel >= 2 ? 'disabled' : ''}>詳細調査 ${money(ddCost(listing, 2))}</button>
      </div>
    </div>

    <div class="sec">
      <div class="sec-t"><span>事業収支シミュレーション</span></div>
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
        <select id="selUse" class="selin" style="min-width:140px">
          ${Object.values(USES).map(u => `<option value="${u.id}" ${u.id === use ? 'selected' : ''}>${u.name}（適合 ${(d.fit[u.id] ?? 0.3).toFixed(2)}）</option>`).join('')}
        </select>
        <select id="selGrade" class="selin" style="min-width:120px">
          ${Object.values(GRADES).map(x => `<option value="${x.id}" ${x.id === grade ? 'selected' : ''}>${x.name}</option>`).join('')}
        </select>
      </div>
      <div class="grid2">
        <div>
          ${kv('延床面積', num(plan.gfa) + '坪')}
          ${kv('想定階数', '地上' + plan.floors + '階')}
          ${kv('建設費', money(plan.buildCost))}
          ${kv('工期', weeksLabel(plan.weeks) + `（${plan.weeks}週）`)}
        </div>
        <div>
          ${plan.saleRevenue ? kv('分譲売上', money(plan.saleRevenue)) : ''}
          ${plan.units ? kv('計画戸数', num(plan.units) + '戸') : ''}
          ${plan.assetValue ? kv('完成時資産価値', money(plan.assetValue)) : ''}
          ${plan.noi ? kv('年間NOI', money(plan.noi)) : ''}
          ${plan.yieldOnCost ? kv('開発利回り', pct(plan.yieldOnCost)) : ''}
        </div>
      </div>
      <div class="card" style="margin-top:10px;border-color:rgba(227,181,88,.3)">
        ${kv('土地に払える上限（残余法）', `<b style="color:var(--gold)">${money(plan.residualLand)}</b>`, 'big')}
        ${kv('想定事業利益', `<span class="${plan.profit >= 0 ? 'up' : 'down'}">${money(plan.profit, { sign: true })}（${pct(plan.margin)}）</span>`)}
        <div class="hint">目標利益率15%を確保した場合に土地へ支払える金額。これを超えて入札すると高値掴みになる。</div>
        ${plan.residualLand <= 0 ? `<div class="hint" style="color:var(--red)">この用途では、土地が無償でも採算に乗らない。用途適合${(d.fit[use] ?? 0.3).toFixed(2)}のこの土地に${USES[use].name}は合っていない${g.market.costIdx > 1.25 ? `うえ、建設費指数が${(g.market.costIdx * 100).toFixed(0)}と高止まりしている` : ''}。用途を変えるか、市況の落ち着きを待つこと。</div>` : ''}
      </div>
      <div class="card" style="margin-top:8px">
        ${kv('他社の想定入札レンジ', `${money(Math.max(0, est - spread))} 〜 ${money(est + spread)}`)}
        <div class="hint">用地開発部の情報力：${(acc * 100).toFixed(0)}%（高いほど予測が絞り込まれる）</div>
      </div>
    </div>

    ${listing.kind === 'proposal' ? `
    <div class="sec">
      <div class="sec-t"><span>提案の作り込み</span></div>
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        ${[[1, '標準提案', 0], [2, '重点提案', Math.round(listing.askPrice * 0.004)], [3, '全社総力', Math.round(listing.askPrice * 0.012)]].map(([lv, nm, cost]) => `
          <button class="btn sm ${planLevel === lv ? 'primary' : ''}" data-plan="${lv}">${nm}${cost ? `（${money(cost)}）` : ''}</button>`).join('')}
      </div>
      <div class="hint">提案コンペでは価格だけでなく企画内容が評価される。商品企画部の能力と提案への投資が勝敗を分ける。</div>
    </div>` : ''}

    <div class="sec">
      <div class="sec-t"><span>入札</span><span class="note">投資余力 ${money(power)}</span></div>
      <div class="field">
        <label>入札金額（億円）</label>
        <input type="number" id="inpBid" value="${Math.round((listing.bid ? listing.bid.amount : bidBase) / 100)}" step="1" min="0">
      </div>
      <input type="range" id="rngBid" min="${Math.round(listing.appraisal * 0.4 / 100)}" max="${Math.round(bidMax * 1.35 / 100)}" value="${Math.round((listing.bid ? listing.bid.amount : bidBase) / 100)}" style="width:100%;accent-color:var(--gold)">
      <div id="bidInfo" class="hint"></div>
      <div class="btnrow">
        ${listing.kind === 'nego'
        ? `<button class="btn primary" data-buy="1">${money(listing.askPrice)}で即時取得する</button>`
        : `<button class="btn primary" data-bid="1">この金額で入札する</button>`}
        ${listing.bid ? `<button class="btn danger" data-cancel="1">入札を取り下げる</button>` : ''}
      </div>
    </div>`;
  }

  function refresh() {
    const el = document.getElementById('modalBody');
    el.innerHTML = buildHTML();
    bind();
  }

  function bind() {
    const body = document.getElementById('modalBody');
    const su = body.querySelector('#selUse'), sg = body.querySelector('#selGrade');
    if (su) su.onchange = e => { use = e.target.value; refresh(); };
    if (sg) sg.onchange = e => { grade = e.target.value; refresh(); };
    body.querySelectorAll('[data-dd]').forEach(b => b.onclick = () => {
      const lv = +b.dataset.dd;
      const cost = ddCost(listing, lv);
      if (g.cash < cost) return toast('資金が不足している', 'bad');
      g.cash -= cost;
      g.finance.quarterAcc.cogsOther += cost;
      const rng = new RNG(g.rngState ^ (listing.id.length * 7919) ^ g.week);
      const found = runDueDiligence(g, listing, lv, rng);
      g.rngState = rng.s;
      toast(found ? `調査により${found}件の事実が判明した` : '特段の問題は発見されなかった', found ? 'bad' : 'good');
      ctx.refresh(); refresh();
    });
    body.querySelectorAll('[data-plan]').forEach(b => b.onclick = () => {
      const lv = +b.dataset.plan;
      const cost = [0, 0, Math.round(listing.askPrice * 0.004), Math.round(listing.askPrice * 0.012)][lv];
      if (cost && g.cash < cost) return toast('資金が不足している', 'bad');
      if (cost) { g.cash -= cost; g.finance.quarterAcc.sga += cost; }
      planLevel = lv; refresh(); ctx.refresh();
    });
    const inp = body.querySelector('#inpBid'), rng2 = body.querySelector('#rngBid'), info = body.querySelector('#bidInfo');
    const sync = (v) => {
      if (inp) inp.value = v; if (rng2) rng2.value = v;
      const amt = v * 100;
      const plan = devPlan(g, c, use, grade, { landCost: amt });
      const fee = Math.round(amt * ACQ_FEE);
      if (info) info.innerHTML = `取得総額 ${money(amt + fee)}（諸費用込み）／この価格での想定利益率 <b class="${plan.margin >= 0.12 ? 'up' : plan.margin >= 0 ? '' : 'down'}">${pct(plan.margin)}</b>`;
    };
    if (inp) inp.oninput = e => sync(+e.target.value);
    if (rng2) rng2.oninput = e => sync(+e.target.value);
    sync(+(inp ? inp.value : 0));
    const bid = body.querySelector('[data-bid]');
    if (bid) bid.onclick = () => {
      const amt = Math.round((+inp.value) * 100);
      const fee = Math.round(amt * ACQ_FEE);
      if (amt <= 0) return toast('金額を入力すること', 'bad');
      if (amt + fee > g.cash + Math.max(0, debtCapacity(g) - g.debt)) return toast('投資余力を超えている', 'bad');
      listing.bid = { amount: amt, planQuality: [0, 40, 62, 84][planLevel], use, grade };
      toast(`${money(amt)}で入札した。開札は${listing.deadline}週後である`, 'good');
      ctx.refresh(); closeModal();
    };
    const buy = body.querySelector('[data-buy]');
    if (buy) buy.onclick = () => {
      const amt = listing.askPrice, fee = Math.round(amt * ACQ_FEE);
      if (g.cash < amt + fee) {
        const room = Math.max(0, debtCapacity(g) - g.debt);
        if (g.cash + room < amt + fee) return toast('資金と借入枠が不足している', 'bad');
        const need = Math.ceil((amt + fee - g.cash) / 100) * 100;
        g.debt += need; g.cash += need;
        toast(`不足分 ${money(need)} を借り入れた`);
      }
      ctx.acquireNow(listing, c, amt);
      closeModal();
    };
    const cancel = body.querySelector('[data-cancel]');
    if (cancel) cancel.onclick = () => { listing.bid = null; toast('入札を取り下げた'); ctx.refresh(); closeModal(); };
  }
}

// ------------------------------------------------------------
//  収益物件（一棟）の詳細と価格交渉
//
//  用地の入札とは手触りを変えてある。
//  こちらは**相対取引**で、提示したその場で返事が来る。
//  同じ「入札して締切を待つ」にすると、二つある意味が無い。
// ------------------------------------------------------------
export function openStandingDetail(g, offer, ctx, after) {
  const c = g.cells.find(x => x.id === offer.cellId);
  if (!c) return;
  const d = DISTRICTS[c.d];
  const s = offer.spec;
  let last = null;

  openModal(`${(c.building && c.building.name) || d.name}　${num(s.nra)}坪`, buildHTML(), [
    { label: '見送る', cls: 'ghost', onClick: () => { Pass(); } },
    { label: '閉じる', cls: 'ghost' },
  ]);
  bind();

  function Pass() {
    const { passStanding } = ctx.trading;
    passStanding(g, offer, ctx.news || null);
    ctx.refresh && ctx.refresh();
  }

  function buildHTML() {
    const room = Math.max(0, debtCapacity(g) - g.debt);
    const power = g.cash + room;
    const base = Math.min(offer.ask, Math.round(s.value * 1.02));
    // 同じ金を開発に回した場合との比較。**これを出さないと判断できない。**
    // 一棟買いは「安く買える」のではなく「時間を買う」ものである
    const devYoc = 0.062;
    return `
    <div class="grid2">
      ${mini('NOI（年額）', money(s.noi), `稼働 ${Math.round(s.occupancy * 100)}%`)}
      ${mini('キャップレート', (s.cap * 100).toFixed(2) + '%', '当社の査定利回り')}
      ${mini('当社査定', money(s.value), 'NOI ÷ キャップレート')}
      ${mini('売出価格', money(offer.ask), `査定比 ${((offer.ask / Math.max(1, s.value) - 1) * 100).toFixed(1)}%`)}
    </div>

    <div class="sec">
      <div class="sec-t"><span>物件の概要</span></div>
      ${kv('所在', `${CITIES[cityOf(c.d)].name}　${d.name}`)}
      ${kv('用途', USES[s.use].name)}
      ${kv('グレード', GRADES[s.grade].name)}
      ${kv('規模', `地上${s.floors}階／延床 ${num(s.gfa)}坪／貸室 ${num(s.nra)}坪`)}
      ${kv('築年数', `${s.age}年`)}
      ${kv('現行賃料', `月坪 ${num(s.rent)}円`)}
      ${kv('地区の相場', `月坪 ${num(s.marketRent)}円`)}
      ${kv('稼働率', `${Math.round(s.occupancy * 100)}%`)}
      <div class="hint">売主：${offer.seller}<br>${offer.note}</div>
    </div>

    <div class="sec">
      <div class="sec-t"><span>買うか、建てるか</span></div>
      <div class="hint">
        この物件を売出価格で買うと利回りは <b>${(s.noi / Math.max(1, offer.ask) * 100).toFixed(2)}%</b>。
        同じ金額を開発に回した場合の開発利回りはおおむね ${(devYoc * 100).toFixed(1)}% である。<br>
        一棟買いが有利なのは利回りではなく、<b>工期3〜4年ぶんの時間を買えること</b>と、
        <b>一度に規模を増やせること</b>である。竣工リスクも、売れ残りのリスクも無い。
      </div>
    </div>

    <div class="sec">
      <div class="sec-t"><span>価格の提示</span><span class="note">投資余力 ${money(power)}</span></div>
      ${offer.bids >= MAX_BIDS
        ? '<div class="hint" style="color:var(--red)">これ以上の交渉には応じてもらえない。</div>'
        : `<div class="field">
        <label>提示額（億円）　残り ${MAX_BIDS - offer.bids} 回</label>
        <input type="number" id="inpStd" value="${Math.round(base / 100)}" step="1" min="0">
      </div>
      <input type="range" id="rngStd" min="${Math.round(s.value * 0.6 / 100)}" max="${Math.round(offer.ask * 1.1 / 100)}" value="${Math.round(base / 100)}" style="width:100%;accent-color:var(--gold)">
      <div id="stdInfo" class="hint"></div>
      <div class="btnrow">
        <button class="btn primary" data-std="1">この金額で買い付けを入れる</button>
      </div>`}
      ${last ? `<div class="card ${last.ok ? 'sel' : 'warn'}" style="margin-top:8px"><div class="card-s">${last.message || ''}</div></div>` : ''}
      <div class="hint">売主には手放してよい下限がある。安く入れすぎると席を立たれる。
        交渉は${MAX_BIDS}回まで。取得時には仲介手数料と税で価格の5%がかかる。</div>
    </div>`;
  }

  function refresh() {
    const el = document.getElementById('modalBody');
    if (!el) return;
    el.innerHTML = buildHTML();
    bind();
  }

  function bind() {
    const inp = document.getElementById('inpStd');
    const rng = document.getElementById('rngStd');
    const info = document.getElementById('stdInfo');
    const sync = v => {
      if (inp) inp.value = v;
      if (rng) rng.value = v;
      if (!info) return;
      const price = v * 100;
      const fee = Math.round(price * 0.05);
      info.innerHTML = `取得原価 ${money(price + fee)}（うち手数料・税 ${money(fee)}）`
        + `／この価格での利回り <b>${(s.noi / Math.max(1, price) * 100).toFixed(2)}%</b>`
        + `／査定比 ${((price / Math.max(1, s.value) - 1) * 100).toFixed(1)}%`
        + (price + fee > g.cash ? '<br><span style="color:var(--red)">手元資金が足りない。先に借入を起こすこと。</span>' : '');
    };
    if (inp) inp.oninput = () => sync(+inp.value || 0);
    if (rng) rng.oninput = () => sync(+rng.value || 0);
    sync(inp ? (+inp.value || 0) : 0);

    const go = document.querySelector('[data-std]');
    if (go) go.onclick = () => {
      const price = Math.round((+inp.value || 0) * 100);
      if (price <= 0) return toast('金額を入れること', 'bad');
      const r = ctx.trading.bidStanding(g, offer, price, ctx.rng, ctx.news || null);
      last = r;
      if (r.ok) {
        closeModal();
        toast(`${(c.building && c.building.name) || d.name}を取得した`, 'good');
        ctx.refresh && ctx.refresh();
        after && after(r);
        return;
      }
      if (r.close || offer.bids >= MAX_BIDS) {
        // 交渉が終わったら、カードからも消す
        toast(r.message, 'bad');
        ctx.trading.passStanding(g, offer, null);
        closeModal();
        ctx.refresh && ctx.refresh();
        return;
      }
      refresh();
    };
  }
}

// ------------------------------------------------------------
//  用地の集約（種地の取得）
// ------------------------------------------------------------
export function openAssemblyStart(g, cell, ctx) {
  const nb = neighborsOf(g, cell).slice(0, MAX_PARCELS);
  if (!nb.length) { toast('隣に買える区画がない', 'bad'); return; }
  const picked = new Set(nb.map(c => c.id));

  openModal(`${DISTRICTS[cell.d].name}　用地の集約`, buildHTML(), [
    { label: 'やめる', cls: 'ghost' },
  ]);
  bind();

  function buildHTML() {
    const chosen = nb.filter(c => picked.has(c.id));
    const area = cell.area + chosen.reduce((s, c) => s + c.area, 0);
    const app = chosen.reduce((s, c) => s + landAppraisal(g, c), 0);
    return `
    <div class="grid3">
      ${mini('いまの敷地', `${num(cell.area)}坪`, DISTRICTS[cell.d].name)}
      ${mini('まとまれば', `${num(area)}坪`, `${(area / Math.max(1, cell.area)).toFixed(2)}倍`)}
      ${mini('種地の相場', money(app), '実際はこれより高く付く')}
    </div>
    <div class="sec">
      <div class="sec-t"><span>交渉する区画</span><span class="note">最大${MAX_PARCELS}区画</span></div>
      ${nb.map(c => `<div class="card ${picked.has(c.id) ? 'sel' : ''} click" data-pick="${c.id}">
        <div class="card-t"><span class="card-n">${num(c.area)}坪</span>${picked.has(c.id) ? chip('交渉する', 'cyan') : chip('外す', 'grey')}</div>
        <div class="card-s">容積率 ${c.far}%／相場 ${money(landAppraisal(g, c))}
          ${c.building ? `<br>いま建っているもの：${USES[c.building.use].name}（築${Math.max(0, g.year - c.building.year)}年）` : '<br>更地'}</div>
      </div>`).join('')}
    </div>
    <div class="hint">
      交渉を始めると、地権者ごとに希望価格が出る。<b>相場では買えない。</b>
      足元を見られ、相場の1.2〜1.9倍を求められることが多い。<br>
      提示額を出して待つと、週ごとに折れるかどうかが決まる。
      粘りすぎると態度を硬化させ、希望価格が跳ね上がる。<br>
      <b>交渉中は母屋の区画も着工できない。</b>打ち切れば着工できるが、
      すでに買った種地は飛び地として残る。
    </div>
    <div class="btnrow">
      <button class="btn primary" data-go="1" ${picked.size ? '' : 'disabled'}>この区画で交渉に入る</button>
    </div>`;
  }

  function refresh() {
    const el = document.getElementById('modalBody');
    if (!el) return;
    el.innerHTML = buildHTML();
    bind();
  }

  function bind() {
    document.querySelectorAll('[data-pick]').forEach(b => {
      b.onclick = () => {
        const id = b.dataset.pick;
        if (picked.has(id)) picked.delete(id); else if (picked.size < MAX_PARCELS) picked.add(id);
        refresh();
      };
    });
    const go = document.querySelector('[data-go]');
    if (go) go.onclick = () => {
      const r = ctx.assembly.startAssembly(g, cell, nb.filter(c => picked.has(c.id)), ctx.rng, null);
      if (!r.ok) return toast(r.message, 'bad');
      closeModal();
      toast('用地の集約に着手した。各区画に提示額を出すこと', 'good');
      ctx.refresh && ctx.refresh();
    };
  }
}

/** 交渉の状況と、提示額の変更 */
export function openAssembly(g, a, ctx) {
  openModal(`${DISTRICTS[a.district].name}　集約の交渉`, buildHTML(), [
    { label: '閉じる', cls: 'ghost' },
  ]);
  bind();

  function buildHTML() {
    const base = g.cells.find(c => c.id === a.baseId);
    const done = a.parcels.filter(p => p.status === 'deal');
    const future = (base ? base.area : 0) + a.parcels.reduce((s, p) => s + p.area, 0);
    return `
    <div class="grid3">
      ${mini('まとまった区画', `${done.length}/${a.parcels.length}`, '全部そろって初めて合筆される')}
      ${mini('いまの敷地', `${num(base ? base.area : 0)}坪`, `まとまれば ${num(future)}坪`)}
      ${mini('ここまでの支出', money(a.spent), '打ち切っても戻らない')}
    </div>

    ${a.parcels.map((pc, i) => {
      const st = pc.status === 'deal' ? chip('取得済', 'green')
        : pc.status === 'holdout' ? chip('ごねている', 'red') : chip('交渉中', 'amber');
      return `<div class="card ${pc.status === 'holdout' ? 'warn' : ''}">
        <div class="card-t"><span class="card-n">${num(pc.area)}坪　${pc.owner}</span>${st}</div>
        <div class="card-s">${pc.note}</div>
        <div class="kv"><span class="k">相場</span><span class="v">${money(pc.appraisal)}</span></div>
        <div class="kv"><span class="k">先方の希望</span><span class="v">${money(pc.ask)}<span style="color:var(--ink-mute)">（相場の${(pc.ask / Math.max(1, pc.appraisal)).toFixed(2)}倍）</span></span></div>
        ${pc.status === 'deal'
          ? `<div class="kv"><span class="k">取得額</span><span class="v up">${money(pc.paid || pc.offer)}</span></div>`
          : `<div class="kv"><span class="k">いまの提示</span><span class="v">${pc.offer ? money(pc.offer) : '—'}</span></div>
             <div class="kv"><span class="k">交渉の週数</span><span class="v">${pc.weeks}週</span></div>`}
        ${pc.status === 'open' ? `
        <div class="field" style="margin-top:8px">
          <label>提示額（億円）</label>
          <input type="number" id="ofs${i}" value="${Math.round((pc.offer || pc.ask * 0.92) / 100)}" step="1" min="0">
        </div>
        <div class="btnrow"><button class="btn sm primary" data-offer="${i}">この額で提示する</button></div>` : ''}
        ${pc.status === 'holdout' ? `
        <div class="hint">仲介やコンサルを入れて、もう一度話を持ちかけることはできる（費用 ${money(Math.round(pc.ask * 0.012))}）。
          成否は用地開発部と経営企画部の力しだいである。</div>
        <div class="btnrow"><button class="btn sm" data-reopen="${i}">話を持ちかける</button></div>` : ''}
      </div>`;
    }).join('')}

    <div class="hint">提示額は何度でも変えられる。高く出すほど早くまとまるが、そのぶん土地の原価が上がる。
      毎週、折れるかどうかが判定される。</div>
    <div class="btnrow">
      <button class="btn danger" data-abandon="1">交渉を打ち切る</button>
    </div>`;
  }

  function refresh() {
    const el = document.getElementById('modalBody');
    if (!el) return;
    el.innerHTML = buildHTML();
    bind();
  }

  function bind() {
    document.querySelectorAll('[data-offer]').forEach(b => {
      b.onclick = () => {
        const i = +b.dataset.offer;
        const inp = document.getElementById('ofs' + i);
        const amount = Math.round((+inp.value || 0) * 100);
        if (amount <= 0) return toast('金額を入れること', 'bad');
        const r = ctx.assembly.offerParcel(g, a, a.parcels[i], amount, null);
        if (!r.ok) return toast(r.message, 'bad');
        toast('提示した。返事は週を進めると来る');
        refresh();
        ctx.refresh && ctx.refresh();
      };
    });
    document.querySelectorAll('[data-reopen]').forEach(b => {
      b.onclick = () => {
        const i = +b.dataset.reopen;
        const r = ctx.assembly.reopenParcel(g, a, a.parcels[i], ctx.rng, null);
        toast(r.ok ? '再び交渉のテーブルに着いた' : r.message, r.ok ? 'good' : 'bad');
        refresh();
        ctx.refresh && ctx.refresh();
      };
    });
    const ab = document.querySelector('[data-abandon]');
    if (ab) ab.onclick = () => {
      ctx.assembly.abandonAssembly(g, a, null);
      closeModal();
      toast('交渉を打ち切った', 'warn');
      ctx.refresh && ctx.refresh();
    };
  }
}
