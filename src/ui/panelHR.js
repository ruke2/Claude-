// ============================================================
//  人事パネル — 組織図・採用・給与・制度
// ============================================================
import { money, num, pct, man, clamp } from '../core/format.js';
import { section, kv, mini, chip, bar, empty, openModal, closeModal, toast } from './dom.js';
import { DEPTS, DEPT_IDS, RANKS, ABILITIES, ABILITY_IDS, HIRE_CHANNELS, HR_PROGRAMS } from '../data/hrdata.js';
import { orgPower, personnelCost, payIndex, generateCandidates, hireStaff, salaryFairness, projectCapacity } from '../sim/hr.js';
import { avgAbility, baseSalaryFor } from '../core/state.js';
import { RNG } from '../core/rng.js';

export const title = '人事・組織';

export function render(g, ctx) {
  const p = orgPower(g);
  const active = g.staff.filter(s => !s.subsidiary);
  const seconded = g.staff.filter(s => s.subsidiary);
  const avgAge = active.length ? active.reduce((a, s) => a + s.age, 0) / active.length : 0;
  const avgSal = active.length ? active.reduce((a, s) => a + s.salary, 0) / active.length : 0;
  const avgMor = active.length ? active.reduce((a, s) => a + s.morale, 0) / active.length : 0;
  const pi = payIndex(g);

  const deptRows = DEPT_IDS.map(d => {
    const list = active.filter(s => s.dept === d);
    return `<tr class="click" data-act="hr.dept" data-id="${d}">
      <td>${DEPTS[d].icon} ${DEPTS[d].name}</td>
      <td>${list.length}</td>
      <td>${p[d].quality.toFixed(0)}</td>
      <td>${p[d].capacity.toFixed(1)}</td>
      <td>${list.length ? man(list.reduce((a, s) => a + s.salary, 0) / list.length) : '—'}</td>
    </tr>`;
  }).join('');

  // 組織図
  const org = RANKS.slice().reverse().map(r => {
    const members = active.filter(s => s.rank === r.id);
    if (!members.length) return '';
    if (r.id >= 3) {
      return `<div class="org-lv">${members.map(s => nodeHTML(s)).join('')}</div><div class="org-conn"></div>`;
    }
    const byDept = {};
    for (const s of members) byDept[s.dept] = (byDept[s.dept] || 0) + 1;
    return `<div class="org-lv">${Object.entries(byDept).map(([d, n]) => `
      <div class="org-node" data-act="hr.dept" data-id="${d}">
        <div class="on-r">${r.name}</div><div class="on-n">${n}名</div><div class="on-d">${DEPTS[d].short}</div>
      </div>`).join('')}</div><div class="org-conn"></div>`;
  }).join('');

  const progs = HR_PROGRAMS.map(pr => `
    <div class="card click" data-act="hr.prog" data-id="${pr.field}">
      <div class="card-t"><span class="card-n">${pr.icon} ${pr.name}</span>${chip(g.hrPolicy.programs[pr.field] ? '導入中' : '未導入', g.hrPolicy.programs[pr.field] ? 'green' : 'grey')}</div>
      <div class="card-s">${pr.desc}<br>年間コスト ${money(pr.cost)}</div>
    </div>`).join('');

  const subs = seconded.length ? `<div class="hint">子会社への出向者 ${seconded.length}名（本体の部署戦力には算入されない）</div>` : '';

  return `
  ${section('要員サマリ', `${active.length}名（連結 ${g.staff.length}名）`, `
    <div class="grid4">
      ${mini('従業員数', num(active.length) + '名', `平均 ${avgAge.toFixed(1)}歳`)}
      ${mini('平均年収', man(avgSal), `市場比 ${pct(pi, 0)}`, pi < 0.95 ? 'var(--red)' : pi > 1.1 ? 'var(--green)' : '')}
      ${mini('モチベーション', (avgMor * 100).toFixed(0), avgMor < 0.55 ? '低下している' : avgMor > 0.75 ? '高い' : '標準的', avgMor < 0.55 ? 'var(--red)' : avgMor > 0.75 ? 'var(--green)' : '')}
      ${mini('人件費', money(personnelCost(g), { unit: false }), '百万円／四半期')}
    </div>
    ${subs}
    <div class="hint">給与が市場水準を下回ると、モチベーションが落ちて離職と引き抜きが増える。逆に高すぎる給与は利益を圧迫する。</div>
  `)}

  ${section('部署別の陣容', '「質」は加重平均能力、「量」は処理能力', `
    <table class="tbl">
      <tr><th>部署</th><th>人数</th><th>質</th><th>量</th><th>平均年収</th></tr>
      ${deptRows}
    </table>
    <div class="hint">同時に進められる開発案件は ${projectCapacity(g)} 件（建設管理部と商品企画部の陣容で決まる）。</div>
  `)}

  ${section('組織図', '課長以上は個人を表示', `<div class="org">${org}</div>`)}

  ${section('採用', '', `
    <div class="card">
      <div class="card-t"><span class="card-n">🎓 新卒採用計画</span>${chip(`毎年Q1入社`, 'cyan')}</div>
      <div class="kv"><span class="k">採用計画人数</span><span class="v">${g.hrPolicy.newGradPlan}名</span></div>
      <div class="kv"><span class="k">初任給</span><span class="v">${man(g.hrPolicy.newGradSalary)}</span></div>
      <div class="kv"><span class="k">年間人件費の増分（概算）</span><span class="v">${money(Math.round(g.hrPolicy.newGradPlan * g.hrPolicy.newGradSalary * 1.16))}</span></div>
      <div class="btnrow"><button class="btn sm" data-act="hr.newgrad">採用計画を変更する</button></div>
      <div class="hint">初任給と企業ブランドが高いほど計画の充足率と人材の質が上がる。新卒は能力が低いが伸びしろが大きい。</div>
    </div>
    <div class="grid2">
      <div class="card click" data-act="hr.hire" data-id="career">
        <div class="card-t"><span class="card-n">💼 キャリア採用</span></div>
        <div class="card-s">${HIRE_CHANNELS.career.desc}</div>
        <div class="btnrow"><button class="btn sm primary" data-act="hr.hire" data-id="career">候補者を見る</button></div>
      </div>
      <div class="card click" data-act="hr.hire" data-id="headhunt">
        <div class="card-t"><span class="card-n">🎯 ヘッドハンティング</span></div>
        <div class="card-s">${HIRE_CHANNELS.headhunt.desc}</div>
        <div class="btnrow"><button class="btn sm primary" data-act="hr.hire" data-id="headhunt">候補者を見る</button></div>
      </div>
    </div>
  `)}

  ${section('報酬制度', `給与テーブル係数 ${g.hrPolicy.salaryMul.toFixed(2)}`, `
    <div class="card">
      <table class="tbl">
        <tr><th>役職</th><th>人数</th><th>標準年収</th><th>昇格要件</th></tr>
        ${RANKS.map(r => {
    const n = active.filter(s => s.rank === r.id).length;
    return `<tr><td>${r.name}</td><td>${n}${r.slots !== Infinity ? ` / ${r.slots}` : ''}</td>
          <td>${man(r.baseSalary * g.hrPolicy.salaryMul)}</td>
          <td>${r.minAbility ? `能力 ${r.minAbility}以上` : '—'}</td></tr>`;
  }).join('')}
      </table>
      <div class="btnrow"><button class="btn sm" data-act="hr.salary">給与テーブルを改定する</button></div>
    </div>
  `)}

  ${section('人事制度への投資', '', progs)}

  ${section('社員名簿', `${active.length}名`, `
    <div class="btnrow" style="margin-bottom:8px">
      <button class="btn sm" data-act="hr.list" data-id="ability">能力順</button>
      <button class="btn sm" data-act="hr.list" data-id="salary">年収順</button>
      <button class="btn sm" data-act="hr.list" data-id="morale">モチベーション順</button>
      <button class="btn sm" data-act="hr.list" data-id="age">年齢順</button>
    </div>
    ${listTable(g, active, ctx.hrSort || 'ability')}
  `)}
  `;
}

function nodeHTML(s) {
  return `<div class="org-node" data-act="hr.staff" data-id="${s.id}">
    <div class="on-r">${RANKS[s.rank].name}</div>
    <div class="on-n">${s.name}</div>
    <div class="on-d">${DEPTS[s.dept].short}・${s.age}歳</div>
  </div>`;
}

export function listTable(g, list, sort = 'ability') {
  const sorted = list.slice().sort((a, b) => {
    if (sort === 'salary') return b.salary - a.salary;
    if (sort === 'morale') return b.morale - a.morale;
    if (sort === 'age') return b.age - a.age;
    return avgAbility(b) - avgAbility(a);
  }).slice(0, 60);
  return `<table class="tbl">
    <tr><th>氏名</th><th>部署</th><th>役職</th><th>年齢</th><th>能力</th><th>年収</th><th>意欲</th></tr>
    ${sorted.map(s => `<tr class="click" data-act="hr.staff" data-id="${s.id}">
      <td>${s.name}</td><td>${DEPTS[s.dept].short}</td><td>${RANKS[s.rank].short}</td>
      <td>${s.age}</td><td>${avgAbility(s).toFixed(0)}</td><td>${man(s.salary)}</td>
      <td style="color:${s.morale < 0.5 ? 'var(--red)' : s.morale > 0.78 ? 'var(--green)' : 'inherit'}">${(s.morale * 100).toFixed(0)}</td>
    </tr>`).join('')}
  </table>${list.length > 60 ? `<div class="hint">上位60名を表示している</div>` : ''}`;
}

// ------------------------------------------------------------
//  社員詳細
// ------------------------------------------------------------
export function openStaff(g, s, ctx) {
  const fair = salaryFairness(g, s);
  const nextRank = RANKS[s.rank + 1];
  const canPromote = nextRank && avgAbility(s) >= nextRank.minAbility
    && (nextRank.slots === Infinity || g.staff.filter(x => x.rank === s.rank + 1).length < nextRank.slots);

  openModal(`${s.name}（${RANKS[s.rank].name}）`, `
    <div class="grid3" style="margin-bottom:12px">
      ${mini('年齢', s.age + '歳', `勤続 ${s.tenure.toFixed(1)}年`)}
      ${mini('総合能力', avgAbility(s).toFixed(0), `潜在 ${s.potential}`)}
      ${mini('年収', man(s.salary), `市場比 ${pct(fair, 0)}`, fair < 0.95 ? 'var(--red)' : '')}
    </div>
    <div class="sec">
      <div class="sec-t"><span>能力</span></div>
      ${ABILITY_IDS.map(k => `
        <div class="kv"><span class="k">${ABILITIES[k].name}<span style="color:var(--ink-mute);font-size:10px">　${ABILITIES[k].desc}</span></span><span class="v">${s.abil[k].toFixed(0)}</span></div>
        ${bar(s.abil[k] / 100, DEPTS[s.dept].key === k ? 'gold' : '')}`).join('')}
    </div>
    <div class="sec">
      <div class="sec-t"><span>状態</span></div>
      ${kv('所属', DEPTS[s.dept].name + (s.subsidiary ? '（子会社へ出向中）' : ''))}
      ${kv('モチベーション', `${(s.morale * 100).toFixed(0)} / 100`)}
      ${bar(s.morale)}
      ${kv('定着度', `${(s.loyalty * 100).toFixed(0)} / 100`)}
      ${bar(s.loyalty, 'violet')}
      ${kv('入社', s.joined ? `${s.joined.year}年 Q${s.joined.q}（${{ newgrad: '新卒', career: 'キャリア', headhunt: 'ヘッドハント', legacy: '創業期' }[s.channel] || '—'}）` : '—')}
      ${s.note ? kv('備考', s.note) : ''}
    </div>
    <div class="sec">
      <div class="sec-t"><span>人事措置</span></div>
      <div class="field"><label>異動先</label>
        <select id="selDept">${DEPT_IDS.map(d => `<option value="${d}" ${d === s.dept ? 'selected' : ''}>${DEPTS[d].name}</option>`).join('')}</select>
      </div>
      <div class="field"><label>年収（万円）</label>
        <input type="number" id="inpSal" value="${Math.round(s.salary * 100)}" step="10">
      </div>
      <div class="hint">標準年収は ${man(baseSalaryFor(s) * g.hrPolicy.salaryMul)}。これを下回るとモチベーションが下がる。</div>
    </div>
  `, [
    { label: '閉じる', cls: 'ghost' },
    {
      label: '退職勧奨', cls: 'danger', onClick: () => {
        const cost = Math.round(s.salary * 0.8);
        g.cash -= cost; g.finance.quarterAcc.extraordinary -= cost;
        g.staff.splice(g.staff.indexOf(s), 1);
        for (const x of g.staff) if (Math.random() < 0.3) x.morale = Math.max(0, x.morale - 0.04);
        toast(`${s.name}が退職した（割増退職金 ${money(cost)}）`, 'bad');
        ctx.refresh();
      }
    },
    {
      label: canPromote ? `${nextRank.name}に昇格` : '昇格要件を満たさない', cls: 'primary', disabled: !canPromote,
      onClick: () => {
        s.rank++; s.salary = Math.max(s.salary, baseSalaryFor(s) * g.hrPolicy.salaryMul);
        s.morale = Math.min(1, s.morale + 0.16);
        toast(`${s.name}を${RANKS[s.rank].name}に昇格させた`, 'good');
        ctx.refresh();
      }
    },
    {
      label: '変更を適用', cls: '', onClick: () => {
        const d = document.getElementById('selDept').value;
        const sal = (+document.getElementById('inpSal').value) / 100;
        if (d !== s.dept) { s.dept = d; s.morale = Math.max(0, s.morale - 0.03); }
        if (Math.abs(sal - s.salary) > 0.01) {
          s.morale = Math.min(1, s.morale + (sal > s.salary ? 0.08 : -0.12));
          s.salary = Math.round(sal * 10) / 10;
        }
        toast('人事措置を適用した');
        ctx.refresh();
      }
    },
  ]);
}

// ------------------------------------------------------------
//  採用モーダル
// ------------------------------------------------------------
export function openHire(g, channel, ctx) {
  const ch = HIRE_CHANNELS[channel];
  g.candidates = g.candidates || {};
  if (!g.candidates[channel] || g.candidates[channel].turn !== g.turn) {
    const rng = new RNG(g.rngState ^ (g.turn * 7919) ^ channel.length);
    g.candidates[channel] = { turn: g.turn, list: generateCandidates(g, rng, channel, channel === 'headhunt' ? 3 : 5) };
  }
  const list = g.candidates[channel].list;

  openModal(`${ch.icon} ${ch.name}`, build(), [{ label: '閉じる', cls: 'ghost' }]);
  bind();

  function build() {
    return `<div class="hint" style="margin-bottom:12px">${ch.desc}</div>
    ${list.length ? list.map((s, i) => `
      <div class="card">
        <div class="card-t"><span class="card-n">${s.name}（${s.age}歳・${RANKS[s.rank].name}相当）</span>${chip(`能力 ${avgAbility(s).toFixed(0)}`, avgAbility(s) > 72 ? 'gold' : 'grey')}</div>
        <div class="card-s">前職：${s.prevCompany}／希望部署：${DEPTS[s.dept].name}</div>
        <div class="grid3" style="margin:8px 0">
          ${ABILITY_IDS.slice(0, 3).map(k => `<div class="mini"><div class="mini-k">${ABILITIES[k].name}</div><div class="mini-v">${s.abil[k].toFixed(0)}</div></div>`).join('')}
        </div>
        <div class="grid3">
          ${ABILITY_IDS.slice(3).map(k => `<div class="mini"><div class="mini-k">${ABILITIES[k].name}</div><div class="mini-v">${s.abil[k].toFixed(0)}</div></div>`).join('')}
        </div>
        <div class="kv" style="margin-top:8px"><span class="k">提示年収</span><span class="v">${man(s.salary)}</span></div>
        <div class="kv"><span class="k">採用コスト（紹介料等）</span><span class="v">${money(s.hireCost)}</span></div>
        <div class="kv"><span class="k">定着度</span><span class="v">${(s.loyalty * 100).toFixed(0)}</span></div>
        <div class="btnrow"><button class="btn sm primary" data-hire="${i}">採用する</button></div>
      </div>`).join('') : empty('現在、候補者はいない')}
    <div class="hint">候補者は四半期ごとに入れ替わる。企業ブランドと人事総務部の能力が高いほど良い人材が集まる。</div>`;
  }
  function bind() {
    document.getElementById('modalBody').querySelectorAll('[data-hire]').forEach(b => b.onclick = () => {
      const i = +b.dataset.hire, s = list[i];
      if (!s) return;
      if (g.cash < s.hireCost) return toast('資金が不足している', 'bad');
      g.cash -= s.hireCost;
      g.finance.quarterAcc.sga += s.hireCost;
      hireStaff(g, s, g.news);
      list.splice(i, 1);
      toast(`${s.name}を採用した`, 'good');
      ctx.refresh();
      document.getElementById('modalBody').innerHTML = build(); bind();
    });
  }
}

export function openSalaryPolicy(g, ctx) {
  openModal('給与テーブルの改定', `
    <div class="card">
      ${kv('現在の係数', g.hrPolicy.salaryMul.toFixed(2))}
      ${kv('年間人件費', money(Math.round(personnelCost(g) * 4)))}
      ${kv('市場比の給与水準', pct(payIndex(g), 0))}
    </div>
    <div class="field" style="margin-top:12px">
      <label>給与テーブル係数（1.00 = 業界標準）</label>
      <input type="range" id="rngS" min="0.75" max="1.45" step="0.01" value="${g.hrPolicy.salaryMul}">
      <div id="sInfo" class="hint"></div>
    </div>
    <div class="hint">係数を上げると毎年の定期昇給で全社員の年収が上がり、モチベーションと定着率が改善する。下げれば人件費は減るが、優秀な人材から抜けていく。</div>
  `, [
    { label: 'キャンセル', cls: 'ghost' },
    {
      label: '改定する', cls: 'primary', onClick: () => {
        g.hrPolicy.salaryMul = +document.getElementById('rngS').value;
        toast(`給与テーブル係数を${g.hrPolicy.salaryMul.toFixed(2)}に改定した`);
        ctx.refresh();
      }
    },
  ]);
  const rg = document.getElementById('rngS'), info = document.getElementById('sInfo');
  const sync = () => {
    const v = +rg.value;
    const cur = g.staff.reduce((a, s) => a + s.salary, 0);
    const next = g.staff.reduce((a, s) => a + Math.max(s.salary * 0.62 + baseSalaryFor(s) * v * 0.38, 0), 0);
    info.innerHTML = `係数 <b>${v.toFixed(2)}</b>　次回昇給後の年間人件費 約${money(Math.round(next * 1.16))}（現在 ${money(Math.round(cur * 1.16))}）`;
  };
  rg.oninput = sync; sync();
}

export function openNewGrad(g, ctx) {
  openModal('新卒採用計画', `
    <div class="card">
      ${kv('企業ブランド', g.company.brand.toFixed(0) + ' / 100')}
      ${kv('人事総務部の能力', orgPower(g).hr.quality.toFixed(0))}
      ${kv('採用ブランディング', g.hrPolicy.programs.brandpr ? '実施中' : '未実施')}
    </div>
    <div class="field" style="margin-top:12px">
      <label>採用計画人数</label>
      <input type="number" id="inpN" value="${g.hrPolicy.newGradPlan}" min="0" max="120" step="1">
    </div>
    <div class="field">
      <label>初任給（万円）</label>
      <input type="number" id="inpS" value="${Math.round(g.hrPolicy.newGradSalary * 100)}" min="400" max="1200" step="10">
    </div>
    <div id="ngInfo" class="hint"></div>
    <div class="hint">入社は毎年Q1。ブランドと初任給が低いと計画を充足できず、質も落ちる。採用しすぎれば人件費が先行して利益を圧迫する。</div>
  `, [
    { label: 'キャンセル', cls: 'ghost' },
    {
      label: '計画を確定', cls: 'primary', onClick: () => {
        g.hrPolicy.newGradPlan = Math.max(0, Math.round(+document.getElementById('inpN').value));
        g.hrPolicy.newGradSalary = Math.max(4, (+document.getElementById('inpS').value) / 100);
        toast('新卒採用計画を更新した');
        ctx.refresh();
      }
    },
  ]);
  const n = document.getElementById('inpN'), s = document.getElementById('inpS'), info = document.getElementById('ngInfo');
  const sync = () => {
    const p = orgPower(g);
    const appeal = Math.max(0, Math.min(1, 0.3 + g.company.brand / 160 + p.hr.quality / 320 + (g.hrPolicy.programs.brandpr ? 0.16 : 0) + ((+s.value) / 100 - 5.2) * 0.07));
    const actual = Math.round((+n.value) * Math.max(0.3, Math.min(1.15, 0.55 + appeal * 0.75)));
    info.innerHTML = `想定入社者数 <b>${actual}名</b>（充足率 ${(actual / Math.max(1, +n.value) * 100).toFixed(0)}%）　人件費増 約${money(Math.round(actual * (+s.value) / 100 * 1.16))}／年`;
  };
  n.oninput = sync; s.oninput = sync; sync();
}
