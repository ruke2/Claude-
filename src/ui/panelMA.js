// ============================================================
//  M&A・子会社パネル
// ============================================================
import { money, num, pct, moneyUnit, moneyHTML } from '../core/format.js';
import { section, kv, mini, chip, bar, empty, openModal, closeModal, toast } from './dom.js';
import { SUB_TYPES } from '../data/companies.js';
import { maDueDiligence, acquire, foundSubsidiary, liquidate, MA_RISKS } from '../sim/ma.js';
import { orgPower } from '../sim/hr.js';
import { debtCapacity } from '../sim/finance.js';
import { RNG } from '../core/rng.js';

export const title = 'M&A・子会社';

export function render(g, ctx) {
  const p = orgPower(g);

  const subs = g.subsidiaries.length ? g.subsidiaries.map(s => {
    const def = SUB_TYPES.find(x => x.id === s.type);
    return `<div class="card">
      <div class="card-t"><span class="card-n">${s.icon} ${s.name}</span>${chip(s.health > 0.8 ? '良好' : s.health > 0.5 ? '要注意' : '不振', s.health > 0.8 ? 'green' : s.health > 0.5 ? 'amber' : 'red')}</div>
      <div class="card-s">${def ? def.desc : ''}</div>
      ${kv('出資額', money(s.bookValue))}
      ${kv('年間の固定費', money(s.upkeep))}
      ${kv('直近の損益', `<span class="${(s.lastPL || 0) >= 0 ? 'up' : 'down'}">${money(s.lastPL || 0, { sign: true })}</span>`)}
      ${kv('出向者', s.staffIds.length + '名')}
      ${kv('健全度', (s.health * 100).toFixed(0))}
      ${bar(s.health, s.health < 0.5 ? 'red' : '')}
      <div class="btnrow"><button class="btn sm danger" data-act="ma.liquidate" data-id="${s.id}">清算する</button></div>
    </div>`;
  }).join('') : empty('子会社はまだない');

  const subMenu = SUB_TYPES.filter(d => !g.subsidiaries.some(s => s.type === d.id)).map(d => `
    <div class="card click" data-act="ma.found" data-id="${d.id}">
      <div class="card-t"><span class="card-n">${d.icon} ${d.name}</span>${chip(money(d.cost), 'gold')}</div>
      <div class="card-s">${d.desc}<br><span style="color:var(--amber)">リスク：${d.risk}</span></div>
      <div class="hint">年間固定費 ${money(d.upkeep)}／必要な出向者 ${d.staffNeed}名</div>
    </div>`).join('') || empty('設立できる子会社はすべて設立済みである');

  const targets = g.maTargets.length ? g.maTargets.map(t => {
    const known = t.risks.filter(r => r.found);
    return `<div class="card click" data-act="ma.target" data-id="${t.id}">
      <div class="card-t"><span class="card-n">${t.icon} ${t.name}</span>${chip(t.label, 'violet')}</div>
      <div class="card-s">${t.note}<br>シナジー：${t.synergy}</div>
      ${kv('売上高 / 営業利益', `${money(t.rev)} / ${money(t.op)}`)}
      ${kv('純資産', money(t.equity))}
      ${kv('提示価格', `<b style="color:var(--gold)">${money(t.askPrice)}</b>`)}
      <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
        ${chip(`従業員 ${num(t.employees)}名`, 'grey')}
        ${t.ddLevel ? chip(`調査済 Lv${t.ddLevel}`, 'cyan') : chip('未調査', 'amber')}
        ${known.length ? chip(`懸念事項 ${known.length}件`, 'red') : ''}
        ${chip(`残り${t.expires - g.week}週`, t.expires - g.week <= 3 ? 'red' : 'grey')}
      </div>
    </div>`;
  }).join('') : empty('現在、売却の打診はない');

  const done = g.acquisitions.length ? g.acquisitions.map(a => {
    const fired = a.risks.filter(r => r.fired);
    return `<div class="card">
      <div class="card-t"><span class="card-n">${a.icon} ${a.name}</span>${chip(a.failed ? '失敗' : a.integration >= 1 ? '統合完了' : 'PMI進行中', a.failed ? 'red' : a.integration >= 1 ? 'green' : 'amber')}</div>
      <div class="card-s">${a.label}／買収額 ${money(a.price)}</div>
      ${kv('統合進捗', pct(a.integration, 0))}
      ${bar(a.integration, a.failed ? 'red' : 'violet')}
      ${kv('連結売上（年）', money(a.rev))}
      ${kv('連結営業利益（年）', money(a.op))}
      ${kv('のれん残高', money(a.goodwill))}
      ${a.impaired ? kv('減損累計', `<span class="down">${money(a.impaired)}</span>`) : ''}
      ${kv('事業の健全度', (a.health * 100).toFixed(0))}
      ${fired.length ? `<div class="hint" style="color:var(--red)">顕在化した問題：${fired.map(r => r.name).join('・')}</div>` : ''}
      ${!a.failed && a.integration < 1 ? `<div class="hint">統合が完了するとシナジーが完全に発現する。経営企画部の能力が統合速度を決める。</div>` : ''}
    </div>`;
  }).join('') : empty('買収した企業はない');

  return `
  ${section('M&A体制', '', `
    <div class="grid3">
      ${mini('経営企画部', p.corp.quality.toFixed(0), `${p.corp.count}名`)}
      ${mini('財務経理部', p.fin.quality.toFixed(0), `${p.fin.count}名`)}
      ${mini('投資余力', money(g.cash + Math.max(0, debtCapacity(g) - g.debt), { unit: false }), moneyUnit(g.cash + Math.max(0, debtCapacity(g) - g.debt)))}
    </div>
    <div class="hint">経営企画部と財務経理部の能力がデューデリジェンスの精度とPMIの成功率を左右する。調査を怠れば簿外債務やキーマン流出で買収は失敗する。</div>
  `)}
  ${section('保有子会社', `${g.subsidiaries.length}社`, subs)}
  ${section('子会社の設立', '', subMenu)}
  ${section('買収候補', `${g.maTargets.length}社`, targets)}
  ${section('買収済み企業', `${g.acquisitions.length}社`, done)}
  `;
}

export function openTarget(g, t, ctx) {
  let price = t.askPrice;
  openModal(`${t.icon} ${t.name}`, build(), [{ label: '閉じる', cls: 'ghost' }]);
  bind();

  function build() {
    const known = t.risks.filter(r => r.found);
    const goodwill = Math.max(0, price - t.equity);
    const multiple = t.op > 0 ? (price / t.op).toFixed(1) : '—';
    const p = orgPower(g);
    return `
    <div class="grid3" style="margin-bottom:12px">
      ${mini('売上高', money(t.rev, { unit: false }), moneyUnit(t.rev))}
      ${mini('営業利益', moneyHTML(t.op), `利益率 ${pct(t.op / t.rev, 1)}`)}
      ${mini('純資産', money(t.equity, { unit: false }), moneyUnit(t.equity))}
    </div>
    <div class="card">
      <div class="card-t"><span class="card-n">${t.label}</span>${chip(`従業員 ${num(t.employees)}名`, 'grey')}</div>
      <div class="card-s">${t.note}<br><b>期待されるシナジー：</b>${t.synergy}</div>
    </div>

    <div class="sec">
      <div class="sec-t"><span>デューデリジェンス</span><span class="note">${t.ddLevel ? `Lv${t.ddLevel} 実施済み（精度 ${pct(t.ddSkill || 0, 0)}）` : '未実施'}</span></div>
      ${known.length ? known.map(r => `
        <div class="card" style="border-color:rgba(255,107,122,.3)">
          <div class="card-t"><span class="card-n">⚠ ${r.name}</span>${chip('要注意', 'red')}</div>
          <div class="card-s">${r.desc}</div>
        </div>`).join('')
        : `<div class="hint">${t.ddLevel ? '調査の範囲では重大な問題は見つからなかった。ただし完全ではない。' : '未調査のまま買収すると、簿外債務やキーマン流出といった問題を丸ごと引き受けることになる。事前に判明していれば被害を半分以下に抑えられる。'}</div>`}
      <div class="btnrow">
        <button class="btn sm" data-dd="1" ${t.ddLevel >= 1 ? 'disabled' : ''}>簡易DD ${money(Math.round(t.askPrice * 0.006))}</button>
        <button class="btn sm" data-dd="2" ${t.ddLevel >= 2 ? 'disabled' : ''}>詳細DD ${money(Math.round(t.askPrice * 0.018))}</button>
      </div>
    </div>

    <div class="sec">
      <div class="sec-t"><span>買収条件</span></div>
      <div class="field">
        <label>買収価格（億円）</label>
        <input type="number" id="inpPrice" value="${Math.round(price / 100)}" step="10">
        <input type="range" id="rngPrice" min="${Math.round(t.equity * 0.7 / 100)}" max="${Math.round(t.askPrice * 1.4 / 100)}" value="${Math.round(price / 100)}" style="width:100%;margin-top:8px;accent-color:var(--gold)">
      </div>
      <div id="mInfo" class="hint"></div>
      <div class="card" style="margin-top:8px">
        ${kv('提示価格', money(t.askPrice))}
        ${kv('のれん計上額', money(goodwill))}
        ${kv('EBITDA倍率（概算）', multiple + '倍')}
        ${kv('のれん償却（年）', money(Math.round(goodwill / 20)))}
        <div class="hint">のれんは20年で均等償却する。買収先の業績が計画を下回れば減損処理となり、特別損失が発生する。</div>
      </div>
      <div class="card">
        ${kv('現預金', money(g.cash))}
        ${kv('借入余力', money(Math.max(0, debtCapacity(g) - g.debt)))}
        ${kv('統合の想定速度', `${(Math.min(0.42, 0.16 + p.corp.quality / 420 + p.hr.quality / 700) * 100).toFixed(0)}% ／四半期`)}
      </div>
      <div class="btnrow"><button class="btn primary wide" data-buy="1">この条件で買収する</button></div>
      <div class="hint">安く買い叩けばのれんは小さくなるが、提示価格を大きく下回ると売主に断られる可能性がある。</div>
    </div>`;
  }

  function refresh() { document.getElementById('modalBody').innerHTML = build(); bind(); }

  function bind() {
    const body = document.getElementById('modalBody');
    body.querySelectorAll('[data-dd]').forEach(b => b.onclick = () => {
      const lv = +b.dataset.dd;
      const cost = Math.round(t.askPrice * (lv === 1 ? 0.006 : 0.018));
      if (g.cash < cost) return toast('資金が不足している', 'bad');
      const rng = new RNG(g.rngState ^ (g.week * 104729) ^ lv);
      const r = maDueDiligence(g, t, lv, rng);
      g.rngState = rng.s;
      toast(r.found ? `調査で${r.found}件の懸念が判明した` : '重大な問題は見つからなかった', r.found ? 'bad' : 'good');
      ctx.refresh(); refresh();
    });
    const inp = body.querySelector('#inpPrice'), rg = body.querySelector('#rngPrice'), info = body.querySelector('#mInfo');
    const sync = v => {
      price = Math.round(v * 100);
      inp.value = v; rg.value = v;
      const ratio = price / t.askPrice;
      info.innerHTML = `提示価格比 <b>${((ratio - 1) * 100).toFixed(0)}%</b>　${ratio < 0.82 ? '<span class="down">売主が難色を示す可能性が高い</span>' : ratio < 0.95 ? '交渉の余地はある' : '成立の可能性は高い'}`;
    };
    inp.oninput = e => sync(+e.target.value);
    rg.oninput = e => sync(+e.target.value);
    sync(+inp.value);
    body.querySelector('[data-buy]').onclick = () => {
      const ratio = price / t.askPrice;
      if (g.cash < price) {
        const room = Math.max(0, debtCapacity(g) - g.debt);
        if (g.cash + room < price) return toast('資金と借入枠が不足している', 'bad');
      }
      const rng = new RNG(g.rngState ^ 2654435761);
      if (ratio < 0.82 && rng.chance(0.75 - ratio * 0.5)) {
        g.rngState = rng.s;
        toast('売主に価格を拒否された', 'bad');
        return;
      }
      if (g.cash < price) { const need = Math.ceil((price - g.cash) / 100) * 100; g.debt += need; g.cash += need; }
      acquire(g, t, price, rng, g.news);
      g.rngState = rng.s;
      toast(`${t.name}の買収が成立した`, 'good');
      ctx.refresh(); closeModal();
    };
  }
}
