// ============================================================
//  テナントとエリアマネジメント
//
//    上半分が大口テナントのリーシング（引き合い・契約）、
//    下半分が街区の共同運営である。
//
//    数字はすべて `sim/tenants.js` と `sim/area.js` から引いてくる。
//    **このパネルの中で計算しないこと。** 画面と本体で値が食い違う。
// ============================================================
import { money, num, pct } from '../core/format.js';
import { section, kv, mini, chip, empty, openModal, closeModal, toast } from './dom.js';
import { DISTRICTS, USES, GRADES } from '../data/city.js';
import { orgPower } from '../sim/hr.js';
import {
  ANCHOR_USES, ANCHOR_CAP, FREE_MAX, MAX_LEADS, acceptChance, respondLead, declineLead,
  tenantSummary, roomOf, qualityOf,
} from '../sim/tenants.js';
import {
  AREA_PROGRAMS, AREA_MIN_ASSETS, MATURE_YEARS, areaCandidates, areaOf, canFound, found,
  dissolve, toggleProgram, areaCost, totalAreaCost, maturityOf, areaShare, areaLift, programById,
} from '../sim/area.js';

export const title = 'テナントとエリア';

/** 契約の残り期間（年） */
const remainOf = (g, t) => Math.max(0, (t.endWeek - g.week) / 52);

export function render(g, ctx) {
  const p = orgPower(g);
  const s = tenantSummary(g);
  const leads = g.leads || [];

  // ---- 引き合い ----
  const leadCards = leads.length ? leads.map(l => {
    const a = g.assets.find(x => x.id === l.assetId);
    if (!a) return '';
    const waiting = !!l.offer;
    return `<div class="card ${waiting ? '' : 'click'}" ${waiting ? '' : `data-act="lead.open" data-id="${l.id}"`}>
      <div class="card-t"><span class="card-n">${l.icon} ${l.name}</span>
        ${l.renewOf ? chip('更新', 'amber') : chip('新規', 'cyan')}
        ${waiting ? chip(`回答待ち あと${Math.max(0, l.answerAt - g.week)}週`, 'grey') : chip(`期限 ${l.deadline}週`, l.deadline <= 2 ? 'red' : 'grey')}</div>
      <div class="card-s">${a.name}（${DISTRICTS[l.district].name}）／${l.catName}</div>
      ${kv('希望する面積', `${num(l.area)}坪（貸室の${Math.round(l.area / Math.max(1, a.nra) * 100)}%）`)}
      ${kv('先方の賃料水準', `月坪 ${num(l.want)}円`)}
      ${kv('契約期間', `${l.term}年`)}
      ${waiting
    ? `<div class="hint">月坪 ${num(l.offer.rent)}円・フリーレント${l.offer.free}ヶ月で提示済み。社内稟議の回答を待っている。</div>`
    : '<div class="hint">押して条件を提示する。</div>'}
    </div>`;
  }).join('') : empty('いま来ている引き合いは無い');

  // ---- 契約一覧 ----
  const ts = (g.tenancies || []).slice().sort((x, y) => y.area * y.rent - x.area * x.rent);
  const rows = ts.length ? ts.map(t => {
    const a = g.assets.find(x => x.id === t.assetId);
    const free = g.week < (t.freeUntil || 0);
    const rem = remainOf(g, t);
    const gap = a && a.marketRent > 0 ? t.rent / a.marketRent - 1 : 0;
    return `<tr>
      <td>${t.icon} ${t.name}</td>
      <td>${a ? a.name : '—'}</td>
      <td style="text-align:right">${num(t.area)}坪</td>
      <td style="text-align:right">${num(t.rent)}円${free ? '<br><span class="chip amber">FR中</span>' : ''}</td>
      <td style="text-align:right;color:${Math.abs(gap) < 0.05 ? 'var(--ink-mute)' : gap > 0 ? 'var(--green)' : 'var(--amber)'}">${(gap * 100).toFixed(0)}%</td>
      <td style="text-align:right;${rem < 1 ? 'color:var(--red)' : ''}">${rem.toFixed(1)}年</td>
    </tr>`;
  }).join('') : '';

  // ---- 物件ごとの埋まり具合 ----
  const targets = g.assets.filter(a => ANCHOR_USES.includes(a.use));
  const assetRows = targets.length ? targets.map(a => {
    const room = roomOf(g, a);
    const anchor = a.anchorShare || 0;
    return `<tr>
      <td>${a.name}</td>
      <td>${USES[a.use].name}</td>
      <td style="text-align:right">${num(a.nra)}坪</td>
      <td style="text-align:right">${pct(anchor, 0)}</td>
      <td style="text-align:right">${pct(a.occupancy, 0)}</td>
      <td style="text-align:right">${num(Math.round(room))}坪</td>
      <td style="text-align:right">${(qualityOf(g, a) * 100).toFixed(0)}</td>
    </tr>`;
  }).join('') : '';

  // ---- エリアマネジメント ----
  const cands = areaCandidates(g);
  const areaCards = cands.length ? cands.map(c => {
    const ar = c.area;
    if (ar) {
      const m = maturityOf(g, ar);
      const progs = ar.programs.map(id => { const x = programById(id); return x ? `${x.icon} ${x.name}` : ''; }).filter(Boolean);
      return `<div class="card click" data-act="area.open" data-id="${c.d}">
        <div class="card-t"><span class="card-n">🏙 ${ar.name}</span>${chip(`成熟 ${pct(m, 0)}`, m > 0.7 ? 'green' : 'amber')}</div>
        <div class="card-s">${c.name}／自社 ${c.assets}棟／延床シェア ${pct(c.share, 0)}</div>
        ${kv('地価への効き目', `×${areaLift(g, c.d).toFixed(3)}`)}
        ${kv('年間の運営費', money(areaCost(g, c.d)))}
        <div class="hint">${progs.length ? progs.join('　') : '施策をまだ入れていない。押して選ぶ。'}</div>
      </div>`;
    }
    const err = canFound(g, c.d);
    return `<div class="card ${err ? '' : 'click'}" ${err ? '' : `data-act="area.open" data-id="${c.d}"`}>
      <div class="card-t"><span class="card-n">${c.name}</span>${chip(`${c.assets}棟`, c.assets >= AREA_MIN_ASSETS ? 'green' : 'grey')}</div>
      <div class="card-s">延床シェア ${pct(c.share, 0)}</div>
      <div class="hint">${err || '押して協議会を設立する。'}</div>
    </div>`;
  }).join('') : empty('保有物件のある地区がまだ無い');

  return `
  ${section('テナントからの引き合い', `${leads.length} / ${MAX_LEADS}`, `
    <div class="hint" style="margin-bottom:10px">
      空室のある自社ビルには、名前のある会社から引き合いが来る。
      オフィスのテナントは<b>就職先ランキングに載っている会社</b>そのものである。
      条件を提示すると、先方の社内稟議を経て1〜3週で返事が来る。
    </div>
    ${leadCards}
  `)}

  ${section('大口テナントの状況', `${s.count}件`, `
    <div class="grid4">
      ${mini('契約件数', String(s.count), s.free > 0 ? `うちフリーレント中 ${s.free}件` : '')}
      ${mini('契約面積', num(s.area) + '坪', `大口比率 ${pct(s.share, 0)}`)}
      ${mini('年間の契約賃料', money(s.rentAnnual), 'フリーレント中を除く')}
      ${mini('リーシング力', p.lease.quality.toFixed(0), 'ビル事業部の能力')}
    </div>
    ${rows ? `<table class="tbl" style="margin-top:12px">
      <tr><th>テナント</th><th>物件</th><th style="text-align:right">面積</th><th style="text-align:right">月坪賃料</th><th style="text-align:right">相場比</th><th style="text-align:right">残存</th></tr>
      ${rows}
    </table>` : empty('大口テナントとの契約はまだ無い')}
    <div class="hint">契約期間中の賃料は動かせない。相場が上がっても据え置きになるかわり、
      その床は空かない。<b>安定を買って上振れを手放す</b>のが大口テナントである。</div>
  `)}

  ${assetRows ? section('物件ごとの埋まり具合', `${targets.length}件`, `
    <table class="tbl">
      <tr><th>物件</th><th>用途</th><th style="text-align:right">貸室</th><th style="text-align:right">大口</th><th style="text-align:right">稼働</th><th style="text-align:right">大口の余地</th><th style="text-align:right">格</th></tr>
      ${assetRows}
    </table>
    <div class="hint">1棟のうち大口に出せるのは貸室の${pct(ANCHOR_CAP, 0)}までである。
      「格」はグレード・築年・駅力から決まる建物の評価で、これが低いと一流企業は見向きもしない。</div>
  `) : ''}

  ${section('エリアマネジメント', (g.areas || []).length ? `年間 ${money(totalAreaCost(g))}` : '', `
    <div class="hint" style="margin-bottom:10px">
      同じ地区に${AREA_MIN_ASSETS}棟以上を持つと、街区の共同運営を始められる。
      緑化・にぎわい・防災・モビリティを自前で回すと、<b>その地区そのものの価値</b>が上がる。
      効き目は設立から${MATURE_YEARS}年かけて満額になり、自社の延床シェアが大きいほど強い。<br>
      <b>効果は地区全体に及ぶ。</b>他社の土地も一緒に値上がりするので、
      買い集めてから始めるのが筋である。
    </div>
    ${areaCards}
  `)}
  `;
}

// ------------------------------------------------------------
//  引き合いへの回答
// ------------------------------------------------------------
export function openLead(g, lead, ctx) {
  const a = g.assets.find(x => x.id === lead.assetId);
  if (!a) return;
  let rent = Math.round(lead.want * 0.98);
  let free = 3;

  openModal(`${lead.icon} ${lead.name}`, build(), [
    { label: '断る', cls: 'ghost', onClick: () => { declineLead(g, lead); ctx.refresh(); } },
    { label: '閉じる', cls: 'ghost' },
  ]);
  bind();

  function build() {
    const months = lead.term * 12;
    const maxFree = Math.min(FREE_MAX, Math.floor(months * 0.25));
    return `
    <div class="grid2">
      ${mini('希望する面積', num(lead.area) + '坪', `貸室の ${Math.round(lead.area / Math.max(1, a.nra) * 100)}%`)}
      ${mini('先方の賃料水準', num(lead.want) + '円', '月坪')}
      ${mini('契約期間', lead.term + '年', lead.renewOf ? '更新' : '新規')}
      ${mini('信用力', (lead.credit * 100).toFixed(0), lead.credit > 0.75 ? '中途解約は起きにくい' : '撤退の risk がある')}
    </div>

    <div class="sec">
      <div class="sec-t"><span>物件と相手</span></div>
      ${kv('物件', `${a.name}（${DISTRICTS[a.district].name}）`)}
      ${kv('用途・グレード', `${USES[a.use].name}／${GRADES[a.grade].name}`)}
      ${kv('建物の格', `${(qualityOf(g, a) * 100).toFixed(0)}　（先方が求める水準 ${(lead.grade * 100).toFixed(0)}）`)}
      ${kv('いまの募集賃料', `月坪 ${num(a.rent)}円`)}
      ${kv('地区の相場', `月坪 ${num(a.marketRent || 0)}円`)}
      ${kv('いまの稼働率', pct(a.occupancy, 0))}
    </div>

    <div class="sec">
      <div class="sec-t"><span>条件の提示</span></div>
      <div class="field">
        <label>賃料（月坪・円）</label>
        <input type="number" id="inpRent" value="${rent}" step="100" min="1">
      </div>
      <input type="range" id="rngRent" min="${Math.round(lead.want * 0.7)}" max="${Math.round(lead.want * 1.4)}" value="${rent}" style="width:100%;accent-color:var(--gold)">
      <div class="field" style="margin-top:10px">
        <label>フリーレント（ヶ月／上限 ${maxFree}）</label>
        <input type="number" id="inpFree" value="${free}" step="1" min="0" max="${maxFree}">
      </div>
      <input type="range" id="rngFree" min="0" max="${maxFree}" value="${free}" style="width:100%;accent-color:var(--gold)">
      <div id="leadInfo" class="hint"></div>
      <div class="btnrow">
        <button class="btn primary" data-lead="1">この条件で提示する</button>
      </div>
      <div class="hint">フリーレントの間は賃料が入らない。そのぶん相手は決めやすくなる。
        返事は社内稟議を経て1〜3週で来る。<b>提示は1回きり</b>で、断られればこの話は流れる。</div>
    </div>`;
  }

  function bind() {
    const ir = document.getElementById('inpRent'), rr = document.getElementById('rngRent');
    const iff = document.getElementById('inpFree'), rf = document.getElementById('rngFree');
    const info = document.getElementById('leadInfo');
    const sync = () => {
      if (ir) ir.value = rent; if (rr) rr.value = rent;
      if (iff) iff.value = free; if (rf) rf.value = free;
      if (!info) return;
      const ch = acceptChance(g, lead, { rent, free });
      const annual = lead.area * rent * 12 / 1e6;
      const lost = annual * free / 12;
      info.innerHTML = `年間の契約賃料 <b>${money(Math.round(annual))}</b>`
        + `／フリーレントで手放す額 ${money(Math.round(lost))}`
        + `／先方の水準比 ${((rent / Math.max(1, lead.want) - 1) * 100).toFixed(0)}%`
        + `<br>まとまる見込み <b style="color:${ch > 0.66 ? 'var(--green)' : ch > 0.33 ? 'var(--amber)' : 'var(--red)'}">${Math.round(ch * 100)}%</b>`;
    };
    const setR = v => { rent = Math.max(1, Math.round(v)); sync(); };
    const setF = v => { free = Math.max(0, Math.round(v)); sync(); };
    if (ir) ir.oninput = () => setR(+ir.value || 0);
    if (rr) rr.oninput = () => setR(+rr.value || 0);
    if (iff) iff.oninput = () => setF(+iff.value || 0);
    if (rf) rf.oninput = () => setF(+rf.value || 0);
    sync();

    const go = document.querySelector('[data-lead]');
    if (go) go.onclick = () => {
      const r = respondLead(g, lead, { rent, free }, ctx.rng);
      if (!r.ok) return toast(r.message, 'bad');
      closeModal();
      toast(`${lead.name}に条件を提示した。回答を待つ。`, 'good');
      ctx.refresh();
    };
  }
}

// ------------------------------------------------------------
//  エリアマネジメント
// ------------------------------------------------------------
export function openArea(g, d, ctx) {
  const dist = DISTRICTS[d];
  if (!dist) return;

  draw();

  function draw() {
    const ar = areaOf(g, d);
    const err = canFound(g, d);
    openModal(`${dist.name}　エリアマネジメント`, build(ar, err), buttons(ar, err));
    bind();
  }

  function buttons(ar) {
    const out = [];
    if (!ar) {
      out.push({
        label: '協議会を設立する', cls: 'primary', close: false,
        disabled: !!canFound(g, d),
        onClick: () => { const r = found(g, d, null); if (!r.ok) return toast(r.message, 'bad'); toast(`${dist.name}で協議会を設立した`, 'good'); ctx.refresh(); draw(); },
      });
    } else {
      out.push({
        label: '解散する', cls: 'danger', close: false,
        onClick: () => { dissolve(g, d, null); toast(`${dist.name}の協議会を解散した`, 'bad'); ctx.refresh(); draw(); },
      });
    }
    out.push({ label: '閉じる', cls: 'ghost' });
    return out;
  }

  function build(ar, err) {
    const share = areaShare(g, d);
    const n = (g.assets || []).filter(a => a.district === d).length;
    const m = ar ? maturityOf(g, ar) : 0;
    const progs = AREA_PROGRAMS.map(p => {
      const on = ar && ar.programs.includes(p.id);
      return `<div class="card ${on ? 'sel' : ''} ${ar ? 'click' : ''}" ${ar ? `data-prog="${p.id}"` : ''}>
        <div class="card-t"><span class="card-n">${p.icon} ${p.name}</span>
          ${on ? chip('実施中', 'green') : chip(money(Math.round(p.cost)) + ' /万坪·年', 'grey')}</div>
        <div class="card-s">${p.desc}</div>
        <div class="hint">効き先：${p.reads}</div>
      </div>`;
    }).join('');

    return `
    <div class="grid2">
      ${mini('自社の保有物件', `${n}棟`, `設立には${AREA_MIN_ASSETS}棟必要`)}
      ${mini('延床シェア', pct(share, 0), '地区の建物全体に対して')}
      ${mini('成熟度', pct(m, 0), ar ? `${MATURE_YEARS}年で満額` : '未設立')}
      ${mini('地価への効き目', ar ? `×${areaLift(g, d).toFixed(3)}` : '—', '地区全体に掛かる')}
    </div>
    ${err && !ar ? `<div class="card warn" style="margin-top:10px"><div class="card-s">${err}</div></div>` : ''}
    <div class="sec">
      <div class="sec-t"><span>施策</span><span class="note">${ar ? `年間 ${money(areaCost(g, d))}` : '設立後に選べる'}</span></div>
      ${progs}
    </div>
    <div class="hint">
      運営費は<b>自社の延床</b>に比例する。持っているほど効き目も費用も大きい。<br>
      効果は地区全体に及ぶので、他社の土地も一緒に値上がりする。
      <b>先に買い集めてから始めること。</b>
    </div>`;
  }

  function bind() {
    for (const el of Array.from(document.querySelectorAll('[data-prog]'))) {
      el.onclick = () => { toggleProgram(g, d, el.dataset.prog); ctx.refresh(); draw(); };
    }
  }
}
