// ============================================================
//  経営ダッシュボード
// ============================================================
import { money, moneyHTML, pct, pctDelta, num, dcls, arrow, stars, moneyUnit } from '../core/format.js';
import { section, kv, mini, chip, bar, spark, empty, openModal, closeModal, toast } from './dom.js';
import { kpis, ttm, unrealizedGain, buildBS, overdraft, debtCapacity, effectiveRate } from '../sim/finance.js';
import { personnelCost, payIndex, projectCapacity } from '../sim/hr.js';
import { ranking } from '../sim/rivals.js';
import { orgPower } from '../sim/hr.js';
import { USES, DISTRICTS } from '../data/city.js';
import { TIERS, UNLOCK_INFO, tierOf, nextTier, unlocked, ttmRevenue } from '../sim/company.js';
import { PLAN_METRICS, PLAN_METRIC_IDS, PLAN_SPANS, valueOf, fmtTarget, progressOf,
  planProgress, weeksLeft, ambitionOf, startPlan, abandonPlan } from '../sim/midplan.js';
import { ceo } from '../sim/officers.js';

export const title = '経営ダッシュボード';

export function render(g) {
  const k = kpis(g);
  const t = ttm(g);
  const h = g.finance.history;
  const rank = ranking(g, 'rev');
  const me = rank.find(x => x.isPlayer);
  const p = orgPower(g);
  const ug = k.unrealized;

  const revSeries = h.slice(-16).map(x => x.pl.revenue);
  const opSeries = h.slice(-16).map(x => x.pl.op);

  // セグメント構成
  const segTotal = Math.max(1, t.revSale + t.revLease + t.revFee);
  const segs = [
    { n: '分譲事業', v: t.revSale, c: '#0f8a55' },
    { n: '賃貸事業', v: t.revLease, c: '#0d7ea8' },
    { n: 'その他・連結', v: t.revFee + (t.revenue - t.revSale - t.revLease - t.revFee), c: '#6b4bc4' },
  ];

  const m = g.market;
  const demRows = Object.entries(m.demand).filter(([u]) => USES[u]).map(([u, v]) => `
    <div class="kv"><span class="k">${USES[u].name}</span>
    <span class="v" style="color:${v > 1.08 ? 'var(--green)' : v < 0.92 ? 'var(--red)' : 'var(--ink)'}">${(v * 100).toFixed(0)}</span></div>`).join('');

  const newsHTML = (g.news || []).slice(-8).reverse().map(n => `
    <div class="newsitem"><span class="ico">${n.icon}</span><span>${n.text}</span></div>`).join('') || empty('まだニュースはない');

  return `
  ${alerts(g, k, t, p)}
  ${section('主要指標', `直近4四半期（${g.year}年 ${g.month}月 第${g.weekOfMonth}週目時点）`, `
    <div class="grid4">
      ${mini('売上高', moneyHTML(t.revenue), '直近4四半期')}
      ${mini('営業利益', moneyHTML(t.op), `利益率 ${pct(k.opMargin)}`, t.op >= 0 ? 'var(--green)' : 'var(--red)')}
      ${mini('当期純利益', moneyHTML(t.net), '', t.net >= 0 ? 'var(--green)' : 'var(--red)')}
      ${mini('ROE', pct(k.roe), `ROA ${pct(k.roa)}`, k.roe >= 0.08 ? 'var(--gold)' : '')}
    </div>
    <div style="margin-top:12px">${spark(revSeries, { color: '#b0781a' })}</div>
    <div class="hint">売上高の推移（直近16四半期）</div>
  `)}

  ${midPlanSection(g)}

  ${growth(g)}

  ${section('財務ポジション', `格付 ${k.rating.id}`, `
    <div class="grid2">
      <div>
        ${kv('現金及び預金', money(g.cash), 'big')}
        ${kv('有利子負債', money(g.debt))}
        ${kv('純資産', money(k.bps * g.company.shares / 1e6))}
        ${kv('自己資本比率', pct(k.equityRatio))}
        ${kv('D/Eレシオ', k.de.toFixed(2) + '倍')}
      </div>
      <div>
        ${kv('借入可能枠', money(k.capacity))}
        ${kv('調達余力', money(k.room))}
        ${kv('適用金利', pct(k.rate, 2))}
        ${kv('保有不動産 含み益', `<span class="${dcls(ug.gain)}">${money(ug.gain, { sign: true })}</span>`)}
        ${kv('企業ブランド', `${stars(g.company.brand)} ${g.company.brand.toFixed(0)}`)}
      </div>
    </div>
    ${g.company.listed ? `<div class="grid3" style="margin-top:10px">
      ${mini('株価', num(k.price) + '円')}
      ${mini('時価総額', money(k.cap, { unit: false }), moneyUnit(k.cap))}
      ${mini('EPS', num(k.eps, 1) + '円', `BPS ${num(k.bps, 0)}円`)}
    </div>` : `<div class="hint" style="margin-top:8px">当社は未上場である。財務パネルから上場の条件を確認できる。</div>`}
  `)}

  ${section('事業ポートフォリオ', '直近4四半期の売上構成', `
    ${segs.map(s => `
      <div class="kv"><span class="k">${s.n}</span><span class="v">${money(s.v)}　<span style="color:var(--ink-mute)">${pct(s.v / segTotal, 0)}</span></span></div>
      <div class="bar"><i style="width:${(s.v / segTotal * 100).toFixed(1)}%;background:${s.c}"></i></div>
    `).join('')}
    <div class="grid4" style="margin-top:12px">
      ${mini('保有賃貸物件', g.assets.length + '件', money(g.assets.reduce((a, x) => a + (x.bookLand + x.bookBuild), 0)))}
      ${mini('分譲在庫', g.inventory.length + '件', money(g.inventory.reduce((a, x) => a + x.cost * (1 - x.soldRatio), 0)))}
      ${mini('開発中', g.projects.length + `/${projectCapacity(g)}件`, '同時進行の上限')}
      ${mini('未着工の用地', g.cells.filter(c => c.owner === 'player' && !c.building && !c.projectId).length + '件', '')}
    </div>
  `)}

  ${section('市況', `${m.phaseName}局面`, `
    <div class="card" style="border-color:rgba(227,181,88,.25)">
      <div class="card-t"><span class="card-n">${m.phaseName}</span>${chip(`センチメント ${(m.sentiment * 100).toFixed(0)}`, m.sentiment > 0.6 ? 'green' : m.sentiment < 0.4 ? 'red' : 'grey')}</div>
      <div class="card-s">${m.phaseDesc || ''}</div>
    </div>
    <div class="grid3">
      ${mini('不動産価格指数', (m.priceIdx * 100).toFixed(0), '100 = 2026年', m.priceIdx > 1.05 ? 'var(--green)' : m.priceIdx < 0.95 ? 'var(--red)' : '')}
      ${mini('建設費指数', (m.costIdx * 100).toFixed(0), '上昇＝原価増', m.costIdx > 1.15 ? 'var(--red)' : '')}
      ${mini('長期金利', pct(m.rate, 2), '調達コストの基準')}
    </div>
    <div style="margin-top:10px"><div class="sec-t" style="border:none;padding:0;margin-bottom:4px"><span>用途別の需要指数</span></div>${demRows}</div>
  `)}

  ${section('業界ポジション', `売上高ランキング ${me ? me.rank : '—'}位 / ${rank.length}社`, `
    <table class="tbl">
      <tr><th>順位</th><th>企業</th><th>売上高</th><th>営業利益</th><th>純利益</th></tr>
      ${rank.slice(0, 5).map(r => row(r)).join('')}
      ${me && me.rank > 5 ? `<tr><td colspan="5" style="text-align:center;color:var(--ink-mute)">…</td></tr>` + row(me) : ''}
    </table>
    <div class="hint">競合タブで各社の詳細な財務と戦略を確認できる。</div>
  `)}

  ${section('最近の出来事', '', newsHTML)}
  `;
}

/** 経営上の注意喚起 */
function alerts(g, k, t, p) {
  const list = [];
  const od = overdraft(g);
  const burn = Math.round(personnelCost(g) * 13 + 200);

  if (od > 0) list.push({ lv: 'red', t: '借入枠を超過している', d: `超過額 ${money(od)}。この状態が4四半期続くと支払不能となる。物件売却・増資・返済で早急に解消すること。` });
  if (g.cash < burn) list.push({ lv: 'red', t: '手元資金が薄い', d: `現預金 ${money(g.cash)} に対し、四半期の固定的支出は約 ${money(burn)}。調達余力は ${money(k.room)}。` });
  if (k.de > 3.2 && od <= 0) list.push({ lv: 'amber', t: `D/Eレシオが ${k.de.toFixed(1)}倍`, d: '負債への依存が高い。金利上昇や市況悪化の影響を受けやすい。保有物件の売却による圧縮を検討すること。' });
  if (k.equityRatio < 0.18) list.push({ lv: 'amber', t: `自己資本比率 ${pct(k.equityRatio, 0)}`, d: `格付は ${k.rating.id}。金利は ${pct(k.rate, 2)} まで上がっている。` });

  const stale = g.inventory.filter(i => i.weeksOnSale >= 104 && i.soldRatio < 0.8);
  if (stale.length) list.push({ lv: 'amber', t: `長期在庫 ${stale.length}件`, d: `${stale.map(i => i.name).join('・')}。値下げしなければ評価損が続く。` });

  const idle = g.cells.filter(c => c.owner === 'player' && !c.isHQ && !c.building && !c.projectId);
  if (idle.length >= 3) list.push({ lv: 'amber', t: `未着工の用地 ${idle.length}件`, d: '保有しているだけで固定資産税と金利がかかる。早期に事業化するか、方針を見直すこと。' });

  if (!g.projects.length && !g.inventory.length && g.week > 26) list.push({ lv: 'amber', t: '開発パイプラインが切れている', d: '進行中の案件も販売中の在庫もない。数年後の売上がゼロになる。用地の仕込みを急ぐこと。' });

  const mor = g.staff.length ? g.staff.reduce((a, s) => a + s.morale, 0) / g.staff.length : 1;
  if (mor < 0.55) list.push({ lv: 'amber', t: '社員の士気が低下している', d: `平均モチベーション ${(mor * 100).toFixed(0)}。給与水準は市場比 ${pct(payIndex(g), 0)}。離職と引き抜きが増える。` });

  if (g.takeoverOffer) list.push({ lv: 'red', t: '買収提案を受けている', d: `${g.takeoverOffer.name}から買収提案が来ている。競合タブで回答すること。` });

  if (g.projects.length >= projectCapacity(g)) list.push({ lv: 'cyan', t: '開発案件が上限に達している', d: `建設管理部と商品企画部を増員すれば、同時に扱える案件が増える（現在 ${projectCapacity(g)}件）。` });

  if (!list.length) return '';
  return section('経営上の注意', `${list.length}件`, list.map(a => `
    <div class="card" style="border-color:${a.lv === 'red' ? 'rgba(255,107,122,.45)' : a.lv === 'amber' ? 'rgba(255,180,84,.35)' : 'rgba(84,214,255,.3)'}">
      <div class="card-t"><span class="card-n" style="color:${a.lv === 'red' ? 'var(--red)' : a.lv === 'amber' ? 'var(--amber)' : 'var(--cyan)'}">${a.lv === 'cyan' ? 'ℹ' : '⚠'} ${a.t}</span></div>
      <div class="card-s">${a.d}</div>
    </div>`).join(''));
}

function row(r) {
  return `<tr class="${r.isPlayer ? 'me' : ''}">
    <td>${r.rank}</td>
    <td><span style="color:${r.color}">■</span> ${r.name}</td>
    <td>${money(r.rev)}</td>
    <td>${money(r.op)}</td>
    <td>${money(r.np)}</td>
  </tr>`;
}

// ------------------------------------------------------------
//  成長段階 — 売上が伸びると何ができるようになるか
// ------------------------------------------------------------
function growth(g) {
  const now = tierOf(g);
  const nx = nextTier(g);
  const rev = ttmRevenue(g);
  const home = DISTRICTS[g.company.home];

  const rows = TIERS.map(t => {
    const done = rev >= t.rev;
    const isNow = t === now;
    const gained = t.unlock.map(k => UNLOCK_INFO[k]).filter(Boolean);
    return `<div class="tierrow ${isNow ? 'now' : done ? 'done' : ''}">
      <span class="tr-m">${isNow ? '▶' : done ? '✓' : '·'}</span>
      <span class="tr-b">
        <span class="tr-n">${t.name}</span>
        <span class="tr-d">売上高 ${t.rev ? Math.round(t.rev / 100).toLocaleString() + '億円〜' : '創業時'}　${
      gained.length ? gained.map(x => `${x.icon} ${x.name}`).join('／') : '用地取得・開発・分譲'}</span>
      </span>
    </div>`;
  }).join('');

  const waiting = [];
  for (const t of TIERS) for (const key of t.unlock) {
    if (unlocked(g, key)) continue;
    const info = UNLOCK_INFO[key];
    if (info) waiting.push({ key, info, need: t.rev });
  }

  return section('成長段階', now.name, `
    <div class="card" style="border-color:rgba(227,181,88,.3);background:var(--gold-soft)">
      <div class="card-t"><span class="card-n">${now.name}</span>${
    chip(`地盤 ${home ? home.short : '—'}`, 'gold')}</div>
      <div class="card-s">${now.desc}${home ? `<br>${home.name}では分譲単価と募集賃料に上乗せがつき、稼働率も入札の評価も有利になる。` : ''}</div>
      ${nx ? `<div class="kv" style="margin-top:8px"><span class="k">次は「${nx.name}」まで</span>
        <span class="v">${money(Math.max(0, nx.rev - rev))} 足りない</span></div>
        ${bar(Math.min(1, nx.rev > 0 ? rev / nx.rev : 1), 'gold')}` : '<div class="hint">最上位の段階に到達している。</div>'}
    </div>
    <div style="margin-top:10px">${rows}</div>
    ${waiting.length ? `<div class="hint">解禁待ち：${waiting.map(w => `${w.info.icon} ${w.info.name}（${Math.round(w.need / 100).toLocaleString()}億円）`).join('、 ')}</div>` : '<div class="hint">すべての機能が解禁されている。</div>'}
  `);
}

// ------------------------------------------------------------
//  中期経営計画
// ------------------------------------------------------------
function midPlanSection(g) {
  const p = g.midPlan;
  const hist = (g.planHistory || []).slice(-3).reverse();
  const histHTML = hist.length ? `<div style="margin-top:10px">
    <div class="sec-t" style="border:none;padding:0;margin-bottom:4px"><span>過去の計画</span></div>
    ${hist.map(h => `<div class="kv">
      <span class="k">${h.name}（${h.startYear}〜${h.endYear}年）</span>
      <span class="v ${h.status === 'achieved' ? 'up' : h.status === 'missed' || h.status === 'abandoned' ? 'down' : ''}">${
    { achieved: '達成', partial: '一部達成', missed: '未達', abandoned: '取り下げ' }[h.status] || '—'}　${(h.score * 100).toFixed(0)}%</span>
    </div>`).join('')}
  </div>` : '';

  if (!p) {
    return section('中期経営計画', '未策定', `
      <div class="card">
        <div class="card-t"><span class="card-n">📋 計画を掲げていない</span></div>
        <div class="card-s">社長として3年または5年の数値目標を決め、社内外に公表できる。
        公表すると社員の目線が揃って士気が上がり、株価にも期待が乗る。
        達成すれば企業ブランドが大きく伸びるが、未達なら経営責任を問われる。</div>
        <div class="btnrow"><button class="btn primary" data-act="plan.new">中期経営計画を策定する</button></div>
      </div>
      ${histHTML}
    `);
  }

  const score = planProgress(g, p);
  const left = weeksLeft(g, p);
  const elapsed = 1 - left / Math.max(1, p.endWeek - p.startWeek);
  const onTrack = score >= elapsed - 0.06;
  const rows = p.targets.map(t => {
    const m = PLAN_METRICS[t.id];
    const pr = progressOf(g, t);
    return `<div class="kv" style="margin-top:7px">
      <span class="k">${m.icon} ${m.name}</span>
      <span class="v">${fmtTarget(t.id, valueOf(g, t.id))} / <b>${fmtTarget(t.id, t.target)}</b>
        <span class="${pr >= 1 ? 'up' : pr >= elapsed - 0.06 ? '' : 'down'}">（${(pr * 100).toFixed(0)}%）</span></span>
    </div>${bar(Math.max(0, Math.min(1, pr)), pr >= 1 ? '' : pr >= elapsed - 0.06 ? 'gold' : 'red')}`;
  }).join('');

  return section('中期経営計画', p.name, `
    <div class="card" style="border-color:${onTrack ? 'rgba(15,138,85,.35)' : 'rgba(255,107,122,.4)'}">
      <div class="card-t"><span class="card-n">📋 ${p.name}</span>${
    chip(onTrack ? '計画どおり' : '遅れている', onTrack ? 'green' : 'red')}</div>
      <div class="card-s">${p.startYear}年に公表した${p.years}か年計画。残り ${Math.ceil(left / 13)} 四半期（${left}週）。</div>
      ${kv('全体の進捗', `<b>${(score * 100).toFixed(0)}%</b>　<span style="color:var(--ink-mute)">経過 ${(elapsed * 100).toFixed(0)}%</span>`, 'big')}
      ${bar(Math.min(1, score), onTrack ? '' : 'red')}
      ${rows}
      <div class="hint">野心度 ${ambitionOf(p).toFixed(2)}。高い目標ほど達成時の見返りは大きいが、未達の傷も深くなる。</div>
      <div class="btnrow"><button class="btn sm danger" data-act="plan.abandon">計画を取り下げる</button></div>
    </div>
    ${histHTML}
  `);
}

// ------------------------------------------------------------
//  計画の策定
// ------------------------------------------------------------
export function openPlan(g, ctx) {
  const me = ceo(g);
  let spanIdx = 0;
  let name = `${g.year}年度 中期経営計画`;
  // 既定の3項目に、現状から2割増しの目標を置く
  const picked = {};
  for (const id of ['revenue', 'op', 'leaseNoi']) {
    const base = valueOf(g, id);
    picked[id] = Math.max(base * 1.6, PLAN_METRICS[id].scale === 100 ? 5000 : base + 1);
  }
  openModal('中期経営計画の策定', build(), []);
  bind();

  function build() {
    const span = PLAN_SPANS[spanIdx];
    const list = Object.keys(picked);
    const preview = list.map(id => {
      const m = PLAN_METRICS[id];
      const base = valueOf(g, id);
      const target = picked[id];
      const st = base > 0 ? target / base : 99;
      return `<div class="kv"><span class="k">${m.icon} ${m.name}</span>
        <span class="v">${fmtTarget(id, base)} → <b>${fmtTarget(id, target)}</b>
        <span style="color:var(--ink-mute)">${base > 0 ? `×${st.toFixed(2)}` : '新規'}</span></span></div>`;
    }).join('');

    return `
    <div class="card" style="background:var(--gold-soft);border-color:rgba(227,181,88,.4)">
      <div class="card-t"><span class="card-n">👑 ${me.name}</span>${chip('代表取締役社長', 'gold')}</div>
      <div class="card-s">掲げた数字は社内にも市場にも残る。
      背伸びした目標ほど達成時の評価は高いが、届かなければブランドも士気も落ちる。</div>
    </div>
    <div class="field" style="margin-top:12px">
      <label>計画の名称</label>
      <input type="text" id="inpPlanName" maxlength="24" value="${name}">
    </div>
    <div class="field" style="margin-top:10px">
      <label>計画期間</label>
      <div class="btnrow">
        ${PLAN_SPANS.map((sp, i) => `<button class="btn sm ${i === spanIdx ? 'primary' : ''}" data-span="${i}">${sp.name}</button>`).join('')}
      </div>
      <div class="hint">${span.years}年後（${g.year + span.years}年）に判定する。長い計画ほど見返りは大きい（×${span.reward.toFixed(2)}）。</div>
    </div>
    <div class="sec">
      <div class="sec-t"><span>掲げる目標</span><span class="note">最大4つ</span></div>
      <div class="selgrid">
        ${PLAN_METRIC_IDS.map(id => {
      const m = PLAN_METRICS[id];
      const on = picked[id] !== undefined;
      return `<button class="selbtn ${on ? 'on' : ''}" data-m="${id}">
          <b>${m.icon} ${m.name}</b><span>いま ${fmtTarget(id, valueOf(g, id))}</span>
        </button>`;
    }).join('')}
      </div>
    </div>
    ${Object.keys(picked).map(id => {
      const m = PLAN_METRICS[id];
      const shown = m.scale === 0.01 ? (picked[id] * 100).toFixed(1)
        : m.scale === 100 ? Math.round(picked[id] / 100) : Math.round(picked[id]);
      return `<div class="field">
        <label>${m.icon} ${m.name}の目標（${m.unit}）　いま ${fmtTarget(id, valueOf(g, id))}</label>
        <input type="number" class="tg" data-m="${id}" value="${shown}" step="${m.scale === 0.01 ? '0.5' : '1'}">
        <div class="hint">${m.desc}</div>
      </div>`;
    }).join('')}
    <div class="card" style="margin-top:10px">
      <div class="card-t"><span class="card-n">計画の骨子</span></div>
      ${preview || '<div class="hint">目標を1つ以上選ぶこと。</div>'}
    </div>
    <div class="btnrow">
      <button class="btn primary wide" data-go="1" ${Object.keys(picked).length ? '' : 'disabled'}>この計画を公表する</button>
    </div>`;
  }

  function refresh() { document.getElementById('modalBody').innerHTML = build(); bind(); }
  function bind() {
    const body = document.getElementById('modalBody');
    body.querySelector('#inpPlanName').oninput = e => { name = e.target.value; };
    body.querySelectorAll('[data-span]').forEach(b => b.onclick = () => { spanIdx = +b.dataset.span; refresh(); });
    body.querySelectorAll('[data-m]').forEach(b => {
      if (b.classList.contains('tg')) {
        b.oninput = e => {
          const m = PLAN_METRICS[b.dataset.m];
          const v = +e.target.value;
          picked[b.dataset.m] = m.scale === 0.01 ? v / 100 : m.scale === 100 ? v * 100 : v;
        };
        return;
      }
      b.onclick = () => {
        const id = b.dataset.m;
        if (picked[id] !== undefined) delete picked[id];
        else if (Object.keys(picked).length >= 4) return toast('目標は4つまでである', 'bad');
        else picked[id] = Math.max(valueOf(g, id) * 1.6, PLAN_METRICS[id].scale === 100 ? 5000 : valueOf(g, id) + 1);
        refresh();
      };
    });
    body.querySelector('[data-go]').onclick = () => {
      const targets = Object.entries(picked).map(([id, target]) => ({ id, target }));
      const err = startPlan(g, { name, spanIdx, targets }, g.news);
      if (err) return toast(err, 'bad');
      toast('中期経営計画を公表した', 'good');
      ctx.refresh(); closeModal();
    };
  }
}
