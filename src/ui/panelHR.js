// ============================================================
//  人事パネル — 組織図・採用・給与・制度
// ============================================================
import { money, num, pct, man, clamp } from '../core/format.js';
import { section, kv, mini, chip, bar, empty, openModal, closeModal, toast } from './dom.js';
import { DEPTS, DEPT_IDS, RANKS, ABILITIES, ABILITY_IDS, HIRE_CHANNELS, HR_PROGRAMS } from '../data/hrdata.js';
import { orgPower, personnelCost, personnelCostYear, payIndex, hireStaff, salaryFairness, projectCapacity } from '../sim/hr.js';
import { NG_SCHEDULE, UNIVERSITIES, TIERS, FACULTIES, RECRUIT_INVEST, MID_CHANNELS, employerAppeal, estimate, makeOffer, withdrawOffer, followUp, allocateQuota } from '../sim/recruit.js';
import { AXES, AXIS_IDS, cultureEffects, cultureLabel, cultureAlignment, changeCost, setCulture } from '../sim/culture.js';
import { WEEKS_PER_YEAR } from '../core/time.js';
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
      ${mini('人件費', money(personnelCostYear(g), { unit: false }), '年額')}
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

  ${cultureSection(g)}

  ${section('組織図', '課長以上は個人を表示', `<div class="org">${org}</div>`)}

  ${recruitSection(g)}

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

/** 企業文化セクション */
function cultureSection(g) {
  const c = g.culture;
  const ce = cultureEffects(g);
  const align = cultureAlignment(g);
  const moving = AXIS_IDS.some(a => Math.abs((c.target[a] ?? 0.5) - c[a]) > 0.01);
  return section('企業文化', cultureLabel(g), `
    <div class="card" style="border-color:rgba(26,79,156,.25)">
      <div class="card-t"><span class="card-n">🧭 ${cultureLabel(g)}</span>
        ${chip(moving ? `浸透中 ${(align * 100).toFixed(0)}%` : '浸透済み', moving ? 'amber' : 'green')}</div>
      <div class="card-s">組織の性格は、採用での学生との相性、社員の定着と成長、工期と原価、竣工品質にまで影響する。</div>
      ${AXES.map(a => {
    const v = c[a.id], t = c.target[a.id] ?? v;
    return `<div style="margin-top:9px">
          <div class="kv"><span class="k">${a.name}</span>
            <span class="v" style="font-size:11px">${a.low} ←→ ${a.high}</span></div>
          <div style="position:relative">
            ${bar(v, v > 0.5 ? 'gold' : '')}
            ${Math.abs(t - v) > 0.01 ? `<div style="position:absolute;top:0;left:${(t * 100).toFixed(0)}%;width:2px;height:7px;background:var(--red)"></div>` : ''}
          </div>
          <div class="hint" style="margin-top:0">${v >= 0.62 ? a.highDesc : v <= 0.38 ? a.lowDesc : '中庸。どちらの長所も短所も薄い。'}</div>
        </div>`;
  }).join('')}
      <div class="grid3" style="margin-top:12px">
        ${mini('成長速度', '×' + ce.growthMul.toFixed(2))}
        ${mini('定着', '×' + (2 - ce.leaveMul).toFixed(2), '高いほど辞めにくい')}
        ${mini('処理能力', '×' + ce.capacityMul.toFixed(2))}
      </div>
      <div class="grid3" style="margin-top:8px">
        ${mini('工期', '×' + ce.speedMul.toFixed(2), '高いほど速い')}
        ${mini('原価の安定', '×' + (2 - ce.costRisk).toFixed(2))}
        ${mini('竣工品質', '×' + ce.qualityMul.toFixed(2))}
      </div>
      <div class="btnrow"><button class="btn sm primary" data-act="hr.culture">方針を見直す</button></div>
    </div>
  `);
}

/** 採用セクション */
function recruitSection(g) {
  const r = g.recruit.ng;
  const ap = employerAppeal(g);
  const PH = {
    idle: { n: '準備期間', c: 'grey', d: `${NG_SCHEDULE.open === 9 ? '3月' : ''}の募集開始に向けて、計画人数・初任給・採用活動への投資を決める時期である。` },
    attract: { n: '母集団形成', c: 'cyan', d: 'エントリーを受け付けている。インターンやリクルーターへの投資が志望度を押し上げる。' },
    screening: { n: '選考中', c: 'amber', d: '書類選考と面接が進んでいる。面接を重ねるほど学生の実力が正確に見えてくる。' },
    offer: { n: '内定出し', c: 'gold', d: '内定を出す学生を選ぶ時期である。放っておくと他社に決まってしまう。' },
    waiting: { n: '入社待ち', c: 'green', d: '内定式を終えた。4月の入社を待つ。' },
  }[r.phase] || { n: '—', c: 'grey', d: '' };

  const entries = r.pool.length;
  const interview = r.pool.filter(c => c.status === 'interview').length;
  const offered = r.offers.length;
  const accepted = r.offers.filter(c => c.status === 'accepted').length;

  const midCards = Object.values(MID_CHANNELS).map(ch => {
    const pool = (g.recruit.mid.pools[ch.id] || []);
    return `<div class="card click" data-act="hr.mid" data-id="${ch.id}">
      <div class="card-t"><span class="card-n">${ch.icon} ${ch.name}</span>${chip(`${pool.length}名`, pool.length ? 'cyan' : 'grey')}</div>
      <div class="card-s">${ch.desc}</div>
      ${pool.length ? `<div class="hint">最上位：${pool[0].name}（総合 ${avgAbility(pool[0]).toFixed(0)}／提示年収 ${man(pool[0].salary)}）</div>` : '<div class="hint">現在、候補者はいない。</div>'}
    </div>`;
  }).join('');

  return section('採用', `${PH.n}`, `
    <div class="card" style="border-color:rgba(227,181,88,.28)">
      <div class="card-t"><span class="card-n">🎓 ${r.year}年度 新卒採用</span>${chip(PH.n, PH.c)}</div>
      <div class="card-s">${PH.d}</div>
      <div class="grid4" style="margin-top:9px">
        ${mini('計画', r.plan + '名')}
        ${mini('エントリー', entries + '名')}
        ${mini('面接中', interview + '名')}
        ${mini('内定', offered + '名', accepted ? `承諾 ${accepted}名` : (r.incoming || []).length ? `入社待ち ${(r.incoming || []).length}名` : '')}
      </div>
      <div class="kv" style="margin-top:8px"><span class="k">初任給</span><span class="v">${man(r.salary)}</span></div>
      <div class="kv"><span class="k">採用力（母集団の集まりやすさ）</span><span class="v">${(ap.score * 100).toFixed(0)} / 100</span></div>
      ${bar(ap.score, 'gold')}
      <div class="hint">企業ブランド ${ap.brand.toFixed(0)}／人事総務部 ${ap.hr.toFixed(0)}／給与水準 ${pct(ap.pay, 0)}／採用投資 ${money(ap.invest)}</div>
      <div class="btnrow">
        <button class="btn sm primary" data-act="hr.newgrad">${r.phase === 'offer' ? '内定を出す' : r.phase === 'idle' ? '採用計画を立てる' : '新卒採用を管理する'}</button>
      </div>
    </div>
    <div class="sec-t" style="margin-top:14px"><span>中途採用</span><span class="note">チャネル別</span></div>
    ${midCards}
  `);
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
      ${kv('入社', s.joined ? `${s.joined.year}年（${{ newgrad: '新卒', career: 'キャリア', headhunt: 'ヘッドハント', agent: 'エージェント', open: '公募', referral: '社員紹介', legacy: '創業期' }[s.channel] || '—'}）` : '—')}
      ${s.uniName ? kv('出身', `${s.uniName} ${s.facultyName || ''}`) : ''}
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
//  新卒採用モーダル
// ------------------------------------------------------------
export function openNewGrad(g, ctx) {
  const r = g.recruit.ng;
  openModal(`${r.year}年度 新卒採用`, build(), [{ label: '閉じる', cls: 'ghost' }]);
  bind();

  function candCard(c, mode) {
    const p = orgPower(g);
    const est = estimate(c, c.stage, p.hr.quality);
    const T = TIERS[c.tier] || {};
    const dept = DEPTS[c.wishDept || c.dept];
    return `<div class="card">
      <div class="card-t">
        <span class="card-n">${c.name}（${c.age}歳）</span>
        ${chip(c.uniName || '—', c.tier === 'S' ? 'gold' : c.tier === 'A' ? 'cyan' : 'grey')}
      </div>
      <div class="card-s">${c.facultyName || ''}　${c.facultyNote ? `<span style="color:var(--ink-mute)">${c.facultyNote}</span>` : ''}<br>
        希望部署：${dept.name}／希望年収 ${man(c.expected)}</div>
      <div class="kv"><span class="k">推定される実力</span><span class="v">${est.lo} 〜 ${est.hi}<span style="color:var(--ink-mute);font-size:10px">（誤差±${est.err}）</span></span></div>
      <div class="kv"><span class="k">潜在能力</span><span class="v">${c.stage >= 2 ? c.potential : '—'}</span></div>
      <div class="kv"><span class="k">自社への志望度</span><span class="v ${c.interest > 0.7 ? 'up' : c.interest < 0.45 ? 'down' : ''}">${(c.interest * 100).toFixed(0)}</span></div>
      ${bar(c.interest)}
      ${c.rivalOffer ? `<div class="hint" style="color:var(--amber)">他社からも内定が出ている。</div>` : ''}
      ${c.followed ? `<div class="hint" style="color:var(--green)">フォロー面談を実施済み。</div>` : ''}
      <div class="btnrow">
        ${mode === 'offer' ? `<button class="btn sm primary" data-offer="${c.id}">内定を出す</button>` : ''}
        ${mode === 'offered' ? `<button class="btn sm" data-follow="${c.id}" ${c.followed ? 'disabled' : ''}>フォロー面談（${money(2.4)}）</button>
          <button class="btn sm danger" data-withdraw="${c.id}">内定を取り消す</button>` : ''}
      </div>
    </div>`;
  }

  function build() {
    const ap = employerAppeal(g);
    const invTotal = RECRUIT_INVEST.reduce((a, x) => a + r.invest[x.id], 0);

    // --- 計画・投資 ---
    const lockSalary = r.phase === 'waiting';
    const canAddInvest = r.phase === 'attract' || r.phase === 'screening';
    const quota = allocateQuota(r.deptPlan, r.plan);
    const planUI = `
      <div class="sec">
        <div class="sec-t"><span>採用計画</span><span class="note">${lockSalary ? '内定式後は初任給を変更できない' : 'いつでも変更できる'}</span></div>
        <div class="grid2">
          <div class="field"><label>計画人数</label>
            <input type="number" id="inpPlan" value="${r.plan}" min="0" max="150"></div>
          <div class="field"><label>初任給（万円）</label>
            <input type="number" id="inpSal" value="${Math.round(r.salary * 100)}" min="380" max="1200" step="10" ${lockSalary ? 'disabled' : ''}></div>
        </div>
        <div class="hint">初任給が業界水準（約540万円）を上回ると、応募と内定承諾の両方に効く。${r.phase === 'offer' ? '内定出し中に引き上げれば、承諾率が上がる。' : ''}</div>
        <div class="btnrow"><button class="btn sm primary" data-save="1">計画を更新する</button></div>
      </div>
      <div class="sec">
        <div class="sec-t"><span>部署別の受入希望</span><span class="note">合計 ${DEPT_IDS.reduce((a, d) => a + ((r.deptPlan || {})[d] || 0), 0)}名</span></div>
        <div class="grid2">
          ${DEPT_IDS.map(dk => `
            <div style="display:flex;align-items:center;gap:6px;padding:3px 0">
              <span style="flex:1;font-size:11.5px">${DEPTS[dk].icon} ${DEPTS[dk].name}</span>
              <button class="btn sm" data-dp="minus" data-d="${dk}">−</button>
              <span style="min-width:24px;text-align:center;font-family:Oswald,sans-serif">${(r.deptPlan || {})[dk] || 0}</span>
              <button class="btn sm" data-dp="plus" data-d="${dk}">＋</button>
              <span style="min-width:52px;text-align:right;font-size:10.5px;color:var(--ink-mute)">→ ${quota[dk] || 0}名</span>
            </div>`).join('')}
        </div>
        <div class="hint">右側は、計画どおり${r.plan}名が入社した場合の配属数である。実際の入社数が前後しても、この希望比率のまま按分して配属する（端数は四捨五入）。</div>
      </div>
      <div class="sec">
        <div class="sec-t"><span>採用活動への投資</span><span class="note">年間 ${money(invTotal)}</span></div>
        ${RECRUIT_INVEST.map(x => `
          <div class="field">
            <label>${x.icon} ${x.name}　<b style="color:var(--gold)">${money(r.invest[x.id])}</b></label>
            <input type="range" class="invRange" data-inv="${x.id}" min="0" max="${x.max}" step="20" value="${r.invest[x.id]}">
            <div class="hint">${x.desc}</div>
          </div>`).join('')}
        ${canAddInvest ? `<div class="card" style="border-color:rgba(176,120,26,.3)">
          <div class="card-s">募集期間中に投資を増やすと、その差額を追加で支出して母集団と志望度を押し上げられる。</div>
          <div class="btnrow"><button class="btn sm primary" data-addinv="1">増やした分を追加投資する</button></div>
        </div>` : ''}
        <div class="card">
          ${kv('想定エントリー数', Math.round(r.plan * (1.6 + ap.score * 5.2)) + '名')}
          ${kv('採用力', (ap.score * 100).toFixed(0) + ' / 100')}
          ${kv('現預金', money(g.cash))}
          <div class="hint">投資額は募集開始（3月第1週目）に一括で計上される。</div>
        </div>
      </div>
      <div class="sec">
        <div class="sec-t"><span>採用力の内訳</span></div>
        ${[['scale', '事業規模（売上高）'], ['size', '従業員数'], ['brand', '企業ブランド'], ['listed', '上場'],
        ['hr', '人事総務部の力'], ['invest', '採用活動への投資'], ['salary', '初任給'], ['programs', '人事制度'], ['culture', '企業文化']]
        .map(([k, n]) => `<div class="kv"><span class="k">${n}</span><span class="v">${((ap.parts[k] || 0) * 100).toFixed(0)}</span></div>
          ${bar((ap.parts[k] || 0) / 0.3)}`).join('')}
        <div class="hint">売上高が伸びて会社が知られるようになると、学生の応募は自然に増える。上位校の学生が集まるかどうかもここで決まる。</div>
      </div>`;

    if (r.phase === 'idle') {
      return `<div class="hint" style="margin-bottom:12px">${r.year}年度の採用計画を立てる。3月第1週目に募集が始まり、6月に選考、7月に内定出し、10月に内定式、翌4月に入社という流れである。</div>
        ${planUI}
        <div class="btnrow"><button class="btn primary wide" data-save="1">計画を確定する</button></div>`;
    }

    if (r.phase === 'attract') {
      const top = r.pool.slice().sort((a, b) => b.interest - a.interest).slice(0, 6);
      const byTier = Object.values(TIERS).map(t => `${t.label} ${r.pool.filter(c => c.tier === t.id).length}名`).join('　');
      const topUni = Object.entries(r.pool.reduce((a, c) => { a[c.uniName] = (a[c.uniName] || 0) + 1; return a; }, {}))
        .sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, v]) => `${n} ${v}`).join('　');
      return `
        <div class="grid3" style="margin-bottom:12px">
          ${mini('エントリー', r.pool.length + '名')}
          ${mini('計画', r.plan + '名')}
          ${mini('倍率', (r.pool.length / Math.max(1, r.plan)).toFixed(1) + '倍')}
        </div>
        <div class="hint">${byTier}</div>
        <div class="hint">${topUni}</div>
        <div class="hint">6月第1週目から選考が始まる。それまでは学生の志望度が動くだけである。</div>
        <div class="sec"><div class="sec-t"><span>志望度の高い学生</span></div>
        ${top.map(c => candCard(c, 'view')).join('')}</div>
        ${planUI}`;
    }

    if (r.phase === 'screening') {
      const list = r.pool.filter(c => c.status === 'interview').sort((a, b) => (b.seen || 0) - (a.seen || 0));
      return `
        <div class="grid3" style="margin-bottom:12px">
          ${mini('面接中', list.length + '名')}
          ${mini('計画', r.plan + '名')}
          ${mini('見極め精度', (55 + orgPower(g).hr.quality / 2.4).toFixed(0) + '%')}
        </div>
        <div class="hint">7月第1週目から内定を出せる。面接を重ねるほど推定の幅が狭まる。</div>
        ${list.slice(0, 20).map(c => candCard(c, 'view')).join('')}
        ${planUI}`;
    }

    if (r.phase === 'offer') {
      const list = r.pool.filter(c => c.status === 'interview').sort((a, b) => (b.seen || 0) - (a.seen || 0));
      const lost = r.pool.filter(c => c.status === 'lost').length;
      return `
        <div class="grid4" style="margin-bottom:12px">
          ${mini('内定済み', r.offers.length + '名')}
          ${mini('候補', list.length + '名')}
          ${mini('計画', r.plan + '名')}
          ${mini('他社へ', lost + '名')}
        </div>
        <div class="hint">内定は多めに出すのが定石である。10月の内定式で志望度の低い学生は辞退する。フォロー面談は承諾率を大きく引き上げる。</div>
        ${r.offers.length ? `<div class="sec"><div class="sec-t"><span>内定を出した学生</span></div>
          ${r.offers.map(c => candCard(c, 'offered')).join('')}</div>` : ''}
        <div class="sec"><div class="sec-t"><span>面接通過者</span></div>
          ${list.length ? list.slice(0, 24).map(c => candCard(c, 'offer')).join('') : empty('候補者がいない')}</div>
        ${planUI}`;
    }

    // waiting
    const acc = r.offers.filter(c => c.status === 'accepted');
    return `
      <div class="grid3" style="margin-bottom:12px">
        ${mini('内定承諾', acc.length + '名')}
        ${mini('辞退', r.declined + '名')}
        ${mini('計画', r.plan + '名', `充足率 ${Math.round(acc.length / Math.max(1, r.plan) * 100)}%`)}
      </div>
      <div class="hint">4月第1週目に入社する。配属予定：${DEPT_IDS.filter(d => allocateQuota(r.deptPlan, acc.length)[d] > 0).map(d => `${DEPTS[d].short} ${allocateQuota(r.deptPlan, acc.length)[d]}名`).join('・') || '—'}</div>
      ${acc.map(c => candCard(c, 'view')).join('')}
      ${planUI}`;
  }

  function refresh() { document.getElementById('modalBody').innerHTML = build(); bind(); ctx.refresh(); }

  function bind() {
    const body = document.getElementById('modalBody');
    body.querySelectorAll('[data-dp]').forEach(el => el.onclick = () => {
      const d = el.dataset.d;
      r.deptPlan = r.deptPlan || {};
      const v = r.deptPlan[d] || 0;
      r.deptPlan[d] = el.dataset.dp === 'plus' ? Math.min(40, v + 1) : Math.max(0, v - 1);
      refresh();
    });
    body.querySelectorAll('.invRange').forEach(el => el.oninput = e => {
      r.invest[e.target.dataset.inv] = +e.target.value;
      const lab = e.target.previousElementSibling.querySelector('b');
      if (lab) lab.textContent = money(+e.target.value);
    });
    const save = body.querySelector('[data-save]');
    if (save) save.onclick = () => {
      r.plan = Math.max(0, Math.round(+body.querySelector('#inpPlan').value));
      const sal = body.querySelector('#inpSal');
      if (sal && !sal.disabled) {
        const nv = Math.max(3.8, (+sal.value) / 100);
        if (nv > r.salary && r.offers.length) {
          for (const c of r.offers) c.interest = Math.min(1, c.interest + (nv - r.salary) * 0.12);
        }
        r.salary = nv;
      }
      toast('採用計画を更新した'); refresh();
    };
    const addInv = body.querySelector('[data-addinv]');
    if (addInv) addInv.onclick = () => {
      const now = RECRUIT_INVEST.reduce((a, x) => a + r.invest[x.id], 0);
      const extra = Math.max(0, now - (r.spent || 0));
      if (extra <= 0) return toast('追加分がない。スライダーを動かしてから実行すること', 'bad');
      if (g.cash < extra) return toast('資金が不足している', 'bad');
      g.cash -= extra;
      g.finance.quarterAcc.sga += extra;
      r.spent = (r.spent || 0) + extra;
      // 追加投資は母集団と志望度に効く
      const boost = Math.min(0.14, extra / 2400);
      for (const c of r.pool) c.interest = Math.min(1, c.interest + boost);
      toast(`${money(extra)}を追加投資した`, 'good');
      ctx.refresh(); refresh();
    };
    body.querySelectorAll('[data-offer]').forEach(b => b.onclick = () => {
      const c = r.pool.find(x => x.id === b.dataset.offer);
      if (c && makeOffer(g, c)) { toast(`${c.name}に内定を出した`, 'good'); refresh(); }
    });
    body.querySelectorAll('[data-withdraw]').forEach(b => b.onclick = () => {
      const c = r.offers.find(x => x.id === b.dataset.withdraw);
      if (c) { withdrawOffer(g, c); toast('内定を取り消した'); refresh(); }
    });
    body.querySelectorAll('[data-follow]').forEach(b => b.onclick = () => {
      const c = r.offers.find(x => x.id === b.dataset.follow);
      if (c && followUp(g, c)) { toast(`${c.name}とフォロー面談を行った`, 'good'); refresh(); }
      else toast('資金が不足している', 'bad');
    });
  }
}

// ------------------------------------------------------------
//  中途採用モーダル
// ------------------------------------------------------------
export function openMid(g, channelId, ctx) {
  const ch = MID_CHANNELS[channelId];
  openModal(`${ch.icon} ${ch.name}`, build(), [{ label: '閉じる', cls: 'ghost' }]);
  bind();

  function build() {
    const list = g.recruit.mid.pools[channelId] || [];
    return `<div class="hint" style="margin-bottom:12px">${ch.desc}　候補者は${ch.refresh}週ごとに入れ替わる。</div>
    ${list.length ? list.map((s, i) => `
      <div class="card">
        <div class="card-t">
          <span class="card-n">${s.name}（${s.age}歳・${RANKS[s.rank].name}相当）</span>
          ${chip(`総合 ${avgAbility(s).toFixed(0)}`, avgAbility(s) > 72 ? 'gold' : 'grey')}
        </div>
        <div class="card-s">前職：${s.prevCompany}／適性：${DEPTS[s.dept].name}</div>
        <div class="grid3" style="margin:8px 0">
          ${ABILITY_IDS.slice(0, 3).map(k => `<div class="mini"><div class="mini-k">${ABILITIES[k].name}</div><div class="mini-v">${s.abil[k].toFixed(0)}</div></div>`).join('')}
        </div>
        <div class="grid3">
          ${ABILITY_IDS.slice(3).map(k => `<div class="mini"><div class="mini-k">${ABILITIES[k].name}</div><div class="mini-v">${s.abil[k].toFixed(0)}</div></div>`).join('')}
        </div>
        <div class="kv" style="margin-top:8px"><span class="k">提示年収</span><span class="v">${man(s.salary)}</span></div>
        <div class="kv"><span class="k">採用にかかる費用</span><span class="v">${money(s.hireCost)}</span></div>
        <div class="kv"><span class="k">定着度</span><span class="v ${s.loyalty < 0.5 ? 'down' : ''}">${(s.loyalty * 100).toFixed(0)}</span></div>
        <div class="kv"><span class="k">潜在能力</span><span class="v">${s.potential}</span></div>
        <div class="btnrow"><button class="btn sm primary" data-hire="${i}">採用する</button></div>
      </div>`).join('') : empty('現在、候補者はいない。<br>企業ブランドと給与水準が上がると、より多くの応募が集まる。')}`;
  }
  function bind() {
    document.getElementById('modalBody').querySelectorAll('[data-hire]').forEach(b => b.onclick = () => {
      const list = g.recruit.mid.pools[channelId] || [];
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

export function openCulture(g, ctx) {
  const c = g.culture;
  const draft = {};
  for (const a of AXIS_IDS) draft[a] = c.target[a] ?? c[a];

  openModal('企業文化の方針', build(), []);
  bind();

  function build() {
    const cost = changeCost(g, draft);
    return `
    <div class="hint" style="margin-bottom:12px">方針を変えても組織はすぐには変わらない。数年かけて少しずつ浸透する。急な転換は現場を混乱させ、一時的に士気が下がる。</div>
    ${AXES.map(a => `
      <div class="sec">
        <div class="sec-t"><span>${a.name}</span><span class="note">${(draft[a.id] * 100).toFixed(0)}</span></div>
        <div style="display:flex;align-items:center;gap:9px">
          <span style="font-size:11px;color:var(--ink-dim);min-width:70px;text-align:right">${a.low}</span>
          <input type="range" class="cax" data-a="${a.id}" min="0" max="1" step="0.05" value="${draft[a.id]}" style="flex:1">
          <span style="font-size:11px;color:var(--ink-dim);min-width:70px">${a.high}</span>
        </div>
        <div class="hint">${draft[a.id] >= 0.62 ? a.highDesc : draft[a.id] <= 0.38 ? a.lowDesc : '中庸。どちらの長所も短所も薄い。'}</div>
      </div>`).join('')}
    <div class="card">
      ${kv('現在の方針', cultureLabel(g))}
      ${kv('組織変革コスト', money(cost))}
      ${kv('現預金', money(g.cash))}
      <div class="hint">コストは変更幅と社員数に比例する。会社が大きくなるほど、方針転換は重くなる。</div>
    </div>
    <div class="btnrow">
      <button class="btn primary wide" data-apply="1" ${g.cash < cost || cost === 0 ? 'disabled' : ''}>この方針に変える</button>
    </div>`;
  }
  function refresh() { document.getElementById('modalBody').innerHTML = build(); bind(); }
  function bind() {
    const body = document.getElementById('modalBody');
    body.querySelectorAll('.cax').forEach(el => el.oninput = e => {
      draft[e.target.dataset.a] = +e.target.value;
      refresh();
    });
    const ap = body.querySelector('[data-apply]');
    if (ap) ap.onclick = () => {
      setCulture(g, draft, g.news);
      toast('企業文化の方針を変更した', 'good');
      ctx.refresh(); closeModal();
    };
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
