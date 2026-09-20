// ============================================================
//  人事パネル — 組織図・採用・給与・制度
// ============================================================
import { money, num, pct, man, clamp, moneyHTML } from '../core/format.js';
import { section, kv, mini, chip, bar, empty, openModal, closeModal, toast } from './dom.js';
import { DEPTS, DEPT_IDS, RANKS, ABILITIES, ABILITY_IDS, HIRE_CHANNELS, HR_PROGRAMS,
  CEO_RANK, OFFICER_RANKS, TOP_STAFF_RANK, rankName, rankShort, defaultRankNames,
  TEAMS, teamsOf, teamById, affiliation, teamShort } from '../data/hrdata.js';
import { orgPower, personnelCost, personnelCostYear, payIndex, hireStaff, salaryFairness, projectCapacity } from '../sim/hr.js';
import { NG_SCHEDULE, UNIVERSITIES, TIERS, FACULTIES, RECRUIT_INVEST, MID_CHANNELS, employerAppeal, estimate, makeOffer, withdrawOffer, followUp, allocateQuota } from '../sim/recruit.js';
import { AXES, AXIS_IDS, cultureEffects, cultureLabel, cultureAlignment, changeCost, setCulture } from '../sim/culture.js';
import { WEEKS_PER_YEAR } from '../core/time.js';
import { avgAbility, baseSalaryFor, stdSalary, rankPayOf, defaultRankPay } from '../core/state.js';
import { openCard, logoSVG } from './card.js';
import { ranking, industryPay } from '../sim/rivals.js';
import { jobRanking, selfRank, rivalPull } from '../sim/jobrank.js';
import { openPosting, acceptPosting, canFastTrack, fastTrackOdds, fastTrack, fastTrackCandidates } from '../sim/talent.js';
import { workload } from '../sim/workload.js';
import { RNG } from '../core/rng.js';
import { INDUSTRIES } from '../data/employers.js';
import { officers, officerRoom, canAppoint, appoint as appointFn, dismiss as dismissFn,
  setOversight as setOversightFn, oversightOf, uncovered, ceo, ceoPay, payGapView, boardStrength } from '../sim/officers.js';

export const title = '人事・組織';

/**
 * 課ごとの陣容。
 * **ここで能力を計算し直さないこと。** 部の数字は `orgPower()` が持っており、
 * 課は「誰がどこにいるか」を見せるための単位である。
 */
function teamSection(g) {
  const active = g.staff.filter(s => !s.subsidiary);
  const rows = DEPT_IDS.map(d => {
    const teams = teamsOf(d);
    const inDept = active.filter(s => s.dept === d);
    if (!inDept.length && !teams.length) return '';
    const body = teams.map(t => {
      const list = inDept.filter(s => (s.team || teams[0].id) === t.id);
      const head = list.filter(s => s.rank >= 3).sort((a, b) => b.rank - a.rank)[0];
      const ab = list.length ? list.reduce((a, s) => a + avgAbility(s), 0) / list.length : 0;
      return `<tr class="${list.length ? '' : 'warnrow'}">
        <td>${t.name}</td>
        <td>${list.length}</td>
        <td>${list.length ? ab.toFixed(0) : '—'}</td>
        <td>${head ? `${head.name}（${rankName(g, head.rank)}）` : '<span style="color:var(--ink-mute)">長がいない</span>'}</td>
      </tr>`;
    }).join('');
    return `<div class="sec" style="margin-bottom:14px">
      <div class="sec-t"><span>${DEPTS[d].icon} ${DEPTS[d].name}</span><span class="note">${inDept.length}名</span></div>
      <table class="tbl">
        <tr><th>課</th><th>人数</th><th>平均能力</th><th>長</th></tr>
        ${body}
      </table>
    </div>`;
  }).join('');
  return section('課別の陣容', `${Object.values(TEAMS).flat().length}課`, `
    <div class="hint" style="margin-bottom:12px">部の下に課を置いている。
    課長（等級3）以上が課の長になる。人がいない課は赤く出る。<br>
    <b>部門の力（質・量）は部の単位で決まる。</b>課は配属と見せ方の単位である。</div>
    ${rows}`);
}

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

  // 組織図。頂点は社長＝プレイヤー本人
  const me = ceo(g);
  const org = `<div class="org-lv"><div class="org-node me" data-act="hr.ceo">
      <div class="on-r">${rankName(g, CEO_RANK)}</div>
      <div class="on-n">${me.name}</div>
      <div class="on-d">あなた・${g.year - (me.since || g.year) + (me.age || 42)}歳</div>
    </div></div><div class="org-conn"></div>`
    + RANKS.slice().reverse().filter(r => r.id < CEO_RANK).map(r => {
      const members = active.filter(s => s.rank === r.id);
      if (!members.length) return '';
      if (r.id >= 3) {
        return `<div class="org-lv">${members.map(x => nodeHTML(g, x)).join('')}</div><div class="org-conn"></div>`;
      }
      // 係長以下は人数でまとめる。**部でまとめないこと。**
      // 部だけだと「用地に12名」としか出ず、どの課が厚いのかが見えない
      const byTeam = {};
      for (const x of members) {
        const k = x.team || x.dept;
        byTeam[k] = byTeam[k] || { n: 0, dept: x.dept, team: x.team };
        byTeam[k].n++;
      }
      return `<div class="org-lv">${Object.values(byTeam)
        .sort((a, b) => b.n - a.n).map(v => {
          const t = teamById(v.team);
          return `<div class="org-node" data-act="hr.dept" data-id="${v.dept}">
        <div class="on-r">${rankName(g, r.id)}</div><div class="on-n">${v.n}名</div>
        <div class="on-d">${DEPTS[v.dept].short}・${t ? t.short : '—'}</div>
      </div>`;
        }).join('')}</div><div class="org-conn"></div>`;
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
      ${mini('人件費', moneyHTML(personnelCostYear(g)), '年額')}
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

  ${teamSection(g)}

  ${cultureSection(g)}

  ${boardSection(g)}

  ${section('組織図', '課長以上は個人を表示', `<div class="org">${org}</div>`)}

  ${recruitSection(g)}

  ${talentSection(g)}

  ${jobRankSection(g, ctx)}

  ${section('他社との比較', `業界平均 ${man(industryPay(g))}`, `
    <table class="tbl">
      <tr><th>企業</th><th>平均年収</th><th>当社との差</th><th>平均年齢</th><th>勤続</th><th>従業員</th></tr>
      ${ranking(g, 'avgPay').map(r => {
    const d = r.avgPay - avgSal;
    return `<tr class="${r.isPlayer ? 'me' : ''}">
        <td><span style="color:${r.color}">■</span> ${r.name}</td>
        <td><b>${man(r.avgPay)}</b></td>
        <td class="${r.isPlayer ? 'flat' : d > 0 ? 'down' : 'up'}">${r.isPlayer ? '—' : (d > 0 ? '+' : '−') + man(Math.abs(d))}</td>
        <td>${r.avgAge > 0 ? r.avgAge.toFixed(1) + '歳' : '—'}</td>
        <td>${r.avgTenure > 0 ? r.avgTenure.toFixed(1) + '年' : '—'}</td>
        <td>${num(r.employees)}</td>
      </tr>`;
  }).join('')}
    </table>
    <div class="hint">当社より年収の高い会社は、こちらの社員を引き抜きにくる。逆に当社が上回っていれば、中途採用でも新卒採用でも通りやすくなる。各社の数値はこの架空の業界の設定値である。</div>
  `)}

  ${section('報酬制度', `市場比 ${pct(payIndex(g), 0)}`, `
    <div class="card">
      <table class="tbl">
        <tr><th>役職</th><th>人数</th><th>自社の基準</th><th>業界標準</th><th>差</th><th>昇格要件</th></tr>
        ${RANKS.map(r => {
    const n = active.filter(s => s.rank === r.id).length;
    const mine = rankPayOf(g, r.id), mkt = r.baseSalary;
    const d = mine / mkt - 1;
    return `<tr><td>${rankName(g, r.id)}${r.id === CEO_RANK ? '（あなた）' : ''}</td><td>${n}${r.slots !== Infinity ? ` / ${r.slots}` : ''}</td>
          <td><b>${man(mine)}</b></td>
          <td>${man(mkt)}</td>
          <td class="${Math.abs(d) < 0.005 ? 'flat' : d > 0 ? 'up' : 'down'}">${Math.abs(d) < 0.005 ? '—' : (d > 0 ? '+' : '') + (d * 100).toFixed(0) + '%'}</td>
          <td>${r.minAbility ? `能力 ${r.minAbility}以上` : '—'}</td></tr>`;
  }).join('')}
      </table>
      <div class="hint">実際の年収は、この基準額に本人の能力と勤続年数を上乗せして決まる。
      業界標準を下回るとモチベーションが落ち、離職と引き抜きが増える。</div>
      <div class="btnrow">
        <button class="btn sm primary" data-act="hr.salary">役職ごとの年収を改定する</button>
        <button class="btn sm" data-act="hr.ranknames">役職名を改称する</button>
      </div>
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

function nodeHTML(g, s) {
  const ov = Array.isArray(s.oversee) ? s.oversee.filter(d => DEPTS[d]) : [];
  return `<div class="org-node" data-act="hr.staff" data-id="${s.id}">
    <div class="on-r">${rankName(g, s.rank)}</div>
    <div class="on-n">${s.name}</div>
    <div class="on-d">${ov.length ? '管掌 ' + ov.map(d => DEPTS[d].short).join('・') : DEPTS[s.dept].short + '・' + teamShort(s)}</div>
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
      <td>${s.name}</td><td>${DEPTS[s.dept].short}<span style="color:var(--ink-mute)">・${teamShort(s)}</span></td><td>${rankShort(g, s.rank)}</td>
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
  // 役員（執行役員・取締役）は昇格ボタンではなく「役員人事」から任命する
  const canPromote = nextRank && nextRank.id < CEO_RANK && !nextRank.appoint
    && avgAbility(s) >= nextRank.minAbility
    && (nextRank.slots === Infinity || g.staff.filter(x => x.rank === s.rank + 1).length < nextRank.slots);

  openModal(`${s.name}（${rankName(g, s.rank)}）`, `
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
      ${kv('所属', affiliation(s) + (s.subsidiary ? '（子会社へ出向中）' : ''))}
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
      <div class="field"><label>異動先（部）</label>
        <select id="selDept">${DEPT_IDS.map(d => `<option value="${d}" ${d === s.dept ? 'selected' : ''}>${DEPTS[d].name}</option>`).join('')}</select>
      </div>
      <div class="field"><label>異動先（課）</label>
        <select id="selTeam">${teamsOf(s.dept).map(t => `<option value="${t.id}" ${t.id === s.team ? 'selected' : ''}>${t.name}</option>`).join('')}</select>
      </div>
      <div class="field"><label>年収（万円）</label>
        <input type="number" id="inpSal" value="${Math.round(s.salary * 100)}" step="10">
      </div>
      <div class="hint">自社の給与テーブルでは ${man(stdSalary(g, s))}、業界標準は ${man(baseSalaryFor(s))}。
      業界標準を下回るとモチベーションが下がる。</div>
    </div>
  `, [
    { label: '閉じる', cls: 'ghost' },
    { label: '名刺', cls: 'tonal', close: false, onClick: () => openCard(g, s) },
    {
      label: '退職勧奨', cls: 'danger', onClick: () => {
        const cost = Math.round(s.salary * 0.8);
        g.cash -= cost; g.finance.quarterAcc.extraordinary -= cost;
        g.staff.splice(g.staff.indexOf(s), 1);
        // **`Math.random()` を使わないこと。** 乱数はシード付きに統一してある
        const rg = ctx.rng;
        for (const x of g.staff) if (rg.chance(0.3)) x.morale = Math.max(0, x.morale - 0.04);
        toast(`${s.name}が退職した（割増退職金 ${money(cost)}）`, 'bad');
        ctx.refresh();
      }
    },
    {
      label: canPromote ? `${rankName(g, nextRank.id)}に昇格`
        : (nextRank && nextRank.appoint) ? `${rankName(g, nextRank.id)}は役員人事から任命する` : '昇格要件を満たさない',
      cls: 'primary', disabled: !canPromote,
      onClick: () => {
        s.rank++; s.salary = Math.max(s.salary, stdSalary(g, s));
        s.morale = Math.min(1, s.morale + 0.16);
        toast(`${s.name}を${rankName(g, s.rank)}に昇格させた`, 'good');
        ctx.refresh();
      }
    },
    {
      label: '変更を適用', cls: '', onClick: () => {
        const d = document.getElementById('selDept').value;
        const tm = document.getElementById('selTeam').value;
        const sal = (+document.getElementById('inpSal').value) / 100;
        if (d !== s.dept) {
          s.dept = d;
          s.morale = Math.max(0, s.morale - 0.03);
          // **部を移したら課も入れ直すこと。** そのままだと部と課が食い違う
          const list = teamsOf(d);
          s.team = (list.find(t => t.id === tm) ? tm : (list[0] && list[0].id)) || null;
        } else if (tm && tm !== s.team) {
          s.team = tm;
          s.morale = Math.max(0, s.morale - 0.01);   // 同じ部の中の異動は軽い
        }
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
          <span class="card-n">${s.name}（${s.age}歳・${rankName(g, s.rank)}相当）</span>
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
  // 編集中の値（万円）。改定を押すまでゲーム側には反映しない
  let draft = RANKS.map(r => Math.round(rankPayOf(g, r.id) * 100));

  const rows = () => RANKS.map(r => {
    const n = g.staff.filter(s => s.rank === r.id).length;
    const mkt = Math.round(r.baseSalary * 100);
    const d = draft[r.id] / mkt - 1;
    return `<tr>
      <td>${r.name}</td>
      <td>${n}名</td>
      <td style="width:118px"><input type="number" class="payin" data-r="${r.id}"
        value="${draft[r.id]}" min="0" max="20000" step="10"
        style="width:100%;padding:6px 7px;border-radius:6px;background:var(--field-bg);
        border:1px solid var(--line);color:var(--ink);text-align:right;font-variant-numeric:tabular-nums"></td>
      <td>${num(mkt)}</td>
      <td class="${Math.abs(d) < 0.005 ? 'flat' : d > 0 ? 'up' : 'down'}">${
      Math.abs(d) < 0.005 ? '—' : (d > 0 ? '+' : '') + (d * 100).toFixed(0) + '%'}</td>
    </tr>`;
  }).join('');

  const body = () => `
    <div class="hint" style="margin-bottom:10px">役職ごとの基準年収を決める。実際の年収は、ここに本人の能力と勤続年数を上乗せした額になる。
    改定は毎年の定期昇給で少しずつ反映される。</div>
    <table class="tbl">
      <tr><th>役職</th><th>人数</th><th>基準年収（万円）</th><th>業界標準</th><th>差</th></tr>
      ${rows()}
    </table>
    <div class="btnrow">
      <button class="btn sm" data-adj="1.05">全体を +5%</button>
      <button class="btn sm" data-adj="0.95">全体を −5%</button>
      <button class="btn sm" data-reset="1">業界標準に戻す</button>
    </div>
    <div class="card" style="margin-top:12px">
      <div id="payInfo"></div>
    </div>
    <div class="hint">業界標準を大きく下回る役職からは人が抜けていく。逆に上げすぎると人件費が利益を圧迫する。
    役職ごとに差をつければ、たとえば管理職を厚くして現場を絞るといった設計もできる。</div>`;

  openModal('役職ごとの年収', body(), [
    { label: 'キャンセル', cls: 'ghost' },
    {
      label: '改定する', cls: 'primary', onClick: () => {
        g.hrPolicy.rankPay = draft.map(v => Math.round(v) / 100);
        toast('給与テーブルを改定した', 'good');
        ctx.refresh();
      }
    },
  ]);

  const sync = () => {
    const info = document.getElementById('payInfo');
    if (!info) return;
    const cur = g.staff.reduce((a, s) => a + s.salary, 0);
    // 次の定期昇給では、いまの年収と新しい基準額を 62:38 で混ぜた額になる
    const after = g.staff.reduce((a, s) => {
      const std = stdSalary({ hrPolicy: { rankPay: draft.map(v => v / 100) } }, s);
      return a + Math.max(0, s.salary * 0.62 + std * 0.38);
    }, 0);
    const mkt = g.staff.length
      ? g.staff.reduce((a, s) => a + (s.salary * 0.62 + stdSalary({ hrPolicy: { rankPay: draft.map(v => v / 100) } }, s) * 0.38) / Math.max(0.1, baseSalaryFor(s)), 0) / g.staff.length
      : 1;
    info.innerHTML = `
      <div class="kv"><span class="k">いまの年間人件費</span><span class="v">${money(Math.round(cur * 1.16))}</span></div>
      <div class="kv"><span class="k">次回昇給後（見込み）</span><span class="v ${after > cur ? 'down' : after < cur ? 'up' : ''}">${money(Math.round(after * 1.16))}</span></div>
      <div class="kv"><span class="k">改定後の市場比</span><span class="v ${mkt < 0.95 ? 'down' : mkt > 1.05 ? 'up' : ''}">${pct(mkt, 0)}</span></div>`;
  };

  const bind = () => {
    const b = document.getElementById('modalBody');
    b.querySelectorAll('.payin').forEach(el => {
      el.oninput = () => {
        const v = Math.max(0, Math.min(20000, Math.round(+el.value || 0)));
        draft[+el.dataset.r] = v;
        sync();
      };
    });
    b.querySelectorAll('[data-adj]').forEach(el => el.onclick = () => {
      const k = +el.dataset.adj;
      draft = draft.map(v => Math.max(0, Math.round(v * k / 10) * 10));
      b.innerHTML = body(); bind();
    });
    const rs = b.querySelector('[data-reset]');
    if (rs) rs.onclick = () => {
      draft = defaultRankPay().map(v => Math.round(v * 100));
      b.innerHTML = body(); bind();
    };
    sync();
  };
  bind();
}

// ------------------------------------------------------------
//  役員人事 — 社長（プレイヤー）が自分で決める
// ------------------------------------------------------------
function boardSection(g) {
  const me = ceo(g);
  const list = officers(g).sort((a, b) => b.rank - a.rank || avgAbility(b) - avgAbility(a));
  const ov = oversightOf(g);
  const open = uncovered(g);
  const gap = payGapView(g);

  const rows = list.map(s => {
    const mine = Array.isArray(s.oversee) ? s.oversee.filter(d => DEPTS[d]) : [];
    const ab = avgAbility(s);
    const def = RANKS[s.rank];
    return `<div class="card">
      <div class="card-t">
        <span class="card-n">${s.name}</span>
        ${chip(rankName(g, s.rank), s.rank >= 6 ? 'gold' : 'violet')}
        ${ab < def.minAbility ? chip('力不足', 'red') : ''}
      </div>
      <div class="card-s">${s.age}歳／総合能力 ${ab.toFixed(0)}（目安 ${def.minAbility}）／統率 ${s.abil.lead.toFixed(0)}／年収 ${man(s.salary)}</div>
      ${kv('管掌部門', mine.length ? mine.map(d => DEPTS[d].name).join('・') : '<span style="color:var(--ink-mute)">なし（効果が出ていない）</span>')}
      ${mine.length ? `<div class="hint">担当部門の質 +${(ov[mine[0]].quality * 100).toFixed(0)}%／処理能力 +${(ov[mine[0]].capacity * 100).toFixed(0)}%${
      mine.length > 1 ? '（兼務のぶん1部門あたりの効きは薄まる）' : ''}</div>` : ''}
      <div class="btnrow">
        <button class="btn sm" data-act="hr.oversee" data-id="${s.id}">管掌部門を決める</button>
        <button class="btn sm danger" data-act="hr.dismiss" data-id="${s.id}">解任する</button>
      </div>
    </div>`;
  }).join('') || empty('まだ役員を任命していない。<br>執行役員と取締役は自動では決まらない。社長であるあなたが指名する。');

  const roomRows = OFFICER_RANKS.map(r => {
    const room = officerRoom(g, r);
    return `<div class="kv"><span class="k">${rankName(g, r)}</span>
      <span class="v">${g.staff.filter(x => x.rank === r && !x.subsidiary).length} / ${RANKS[r].slots}名　
      ${room ? `<span class="up">空き ${room}</span>` : '<span style="color:var(--ink-mute)">満席</span>'}</span></div>`;
  }).join('');

  return section('役員人事', `執行役員 ${g.staff.filter(x => x.rank === 5 && !x.subsidiary).length}名／取締役 ${g.staff.filter(x => x.rank === 6 && !x.subsidiary).length}名`, `
    <div class="card" style="border-color:rgba(227,181,88,.4);background:var(--gold-soft)">
      <div class="card-t"><span class="card-n">👑 ${me.name}</span>${chip(rankName(g, CEO_RANK), 'gold')}</div>
      <div class="card-s">この会社の社長はあなた自身である。役員は自動では決まらない。誰を引き上げ、どの部門を任せるかがそのまま組織力になる。</div>
      ${kv('役員報酬（年）', `${man(ceoPay(g))}　<span class="${gap.tone === 'bad' ? 'down' : gap.tone === 'warn' ? '' : 'up'}">社員の${gap.ratio.toFixed(1)}倍</span>`)}
      ${kv('役員体制の充実度', `${(boardStrength(g) * 100).toFixed(0)} / 100`)}
      ${bar(boardStrength(g), 'gold')}
      <div class="hint">${gap.text}</div>
    </div>
    <div class="card">
      <div class="card-t"><span class="card-n">役職の枠</span></div>
      ${roomRows}
      ${open.length ? `<div class="hint" style="color:var(--amber)">管掌役員がいない部門：${open.map(d => DEPTS[d].name).join('・')}。役員を置けば、その部門の質と処理能力が上がる。</div>`
      : '<div class="hint">すべての部門に管掌役員がいる。</div>'}
      <div class="btnrow"><button class="btn sm primary" data-act="hr.appoint">役員を任命する</button></div>
    </div>
    ${rows}
  `);
}

// ------------------------------------------------------------
//  役員の任命
// ------------------------------------------------------------
export function openAppoint(g, ctx) {
  let rank = OFFICER_RANKS[0];
  openModal('役員の任命', build(), []);
  bind();

  function build() {
    const def = RANKS[rank];
    const room = officerRoom(g, rank);
    const cands = g.staff
      .filter(s => !s.subsidiary && !canAppoint(g, s, rank))
      .sort((a, b) => (avgAbility(b) + b.abil.lead * 0.5) - (avgAbility(a) + a.abil.lead * 0.5))
      .slice(0, 24);
    return `
    <div class="btnrow" style="margin-bottom:10px">
      ${OFFICER_RANKS.map(r => `<button class="btn sm ${r === rank ? 'primary' : ''}" data-rank="${r}">${rankName(g, r)}</button>`).join('')}
    </div>
    <div class="card">
      <div class="card-t"><span class="card-n">${rankName(g, rank)}</span>${chip(`空き ${room} / ${def.slots}名`, room ? 'green' : 'red')}</div>
      <div class="card-s">能力の目安は ${def.minAbility}。ひとつ下の役職を経ている者から選ぶ。
      目安に届かない人物を引き上げると、本人は喜ぶが、実力のある社員の士気が下がる。</div>
    </div>
    ${cands.length ? `<table class="tbl">
      <tr><th>氏名</th><th>現職</th><th>部署</th><th>年齢</th><th>能力</th><th>統率</th><th></th></tr>
      ${cands.map(s => {
      const ab = avgAbility(s);
      return `<tr>
        <td>${s.name}</td><td>${rankShort(g, s.rank)}</td><td>${DEPTS[s.dept].short}</td>
        <td>${s.age}</td>
        <td class="${ab >= def.minAbility ? 'up' : 'down'}">${ab.toFixed(0)}</td>
        <td>${s.abil.lead.toFixed(0)}</td>
        <td><button class="btn sm primary" data-pick="${s.id}">任命</button></td>
      </tr>`;
    }).join('')}
    </table>` : empty(room ? `${rankName(g, rank)}に任命できる人材がいない。<br>ひとつ下の役職まで育てる必要がある。` : `${rankName(g, rank)}の枠が埋まっている。`)}
    `;
  }

  function refresh() { document.getElementById('modalBody').innerHTML = build(); bind(); }
  function bind() {
    const body = document.getElementById('modalBody');
    body.querySelectorAll('[data-rank]').forEach(b => b.onclick = () => { rank = +b.dataset.rank; refresh(); });
    body.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => {
      const s = g.staff.find(x => x.id === b.dataset.pick);
      if (!s) return;
      const err = appointFn(g, s, rank, g.news);
      if (err) return toast(err, 'bad');
      toast(`${s.name}を${rankName(g, rank)}に任命した`, 'good');
      ctx.refresh(); closeModal();
      openOversee(g, s, ctx);        // 続けて管掌部門を決めてもらう
    });
  }
}

// ------------------------------------------------------------
//  管掌部門の割り当て
// ------------------------------------------------------------
export function openOversee(g, s, ctx) {
  const cap = s.rank >= 6 ? 4 : 2;
  let pick = (Array.isArray(s.oversee) ? s.oversee.filter(d => DEPTS[d]) : []).slice(0, cap);
  openModal(`${s.name}の管掌部門`, build(), []);
  bind();

  function build() {
    return `
    <div class="card">
      <div class="card-s">${rankName(g, s.rank)}は最大 ${cap} 部門まで見られる。
      兼務させると1部門あたりの効きは薄まるので、手薄なところに絞るほうが効く。</div>
      ${kv('統率', s.abil.lead.toFixed(0))}
      ${kv('総合能力', avgAbility(s).toFixed(0))}
    </div>
    <div class="selgrid">
      ${DEPT_IDS.map(d => {
      const other = officers(g).find(x => x !== s && (x.oversee || []).includes(d));
      const on = pick.includes(d);
      return `<button class="selbtn ${on ? 'on' : ''}" data-d="${d}">
        <b>${DEPTS[d].icon} ${DEPTS[d].name}</b>
        <span>${other ? `${other.name}が管掌中` : '管掌者なし'}</span>
      </button>`;
    }).join('')}
    </div>
    <div class="hint">選択中：${pick.length ? pick.map(d => DEPTS[d].name).join('・') : 'なし'}（${pick.length} / ${cap}）</div>
    <div class="btnrow"><button class="btn primary wide" data-save="1">この体制で決める</button></div>`;
  }
  function refresh() { document.getElementById('modalBody').innerHTML = build(); bind(); }
  function bind() {
    const body = document.getElementById('modalBody');
    body.querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
      const d = b.dataset.d;
      if (pick.includes(d)) pick = pick.filter(x => x !== d);
      else if (pick.length < cap) pick.push(d);
      else return toast(`${rankName(g, s.rank)}が見られるのは ${cap} 部門までである`, 'bad');
      refresh();
    });
    body.querySelector('[data-save]').onclick = () => {
      setOversightFn(g, s, pick);
      toast(`${s.name}の管掌を ${pick.length ? pick.map(d => DEPTS[d].short).join('・') : 'なし'} にした`);
      ctx.refresh(); closeModal();
    };
  }
}

// ------------------------------------------------------------
//  役職名の改称
// ------------------------------------------------------------
export function openRankNames(g, ctx) {
  let draft = RANKS.map(r => rankName(g, r.id));
  openModal('役職名の改称', build(), []);
  bind();

  function build() {
    return `
    <div class="card">
      <div class="card-s">この会社での呼び方を決める。等級の意味や給与テーブルは変わらない。
      「シニアマネージャー」「ディレクター」「パートナー」のように、自社らしい呼び方にできる。</div>
    </div>
    ${RANKS.map(r => `
      <div class="field">
        <label>等級 ${r.id}${r.id === CEO_RANK ? '（あなた）' : r.appoint ? '（社長が任命する）' : ''}　既定：${r.name}</label>
        <input type="text" class="rn" data-i="${r.id}" maxlength="10" value="${draft[r.id]}">
      </div>`).join('')}
    <div class="btnrow">
      <button class="btn primary" data-save="1">改称する</button>
      <button class="btn ghost" data-reset="1">既定に戻す</button>
    </div>`;
  }
  function refresh() { document.getElementById('modalBody').innerHTML = build(); bind(); }
  function bind() {
    const body = document.getElementById('modalBody');
    body.querySelectorAll('.rn').forEach(el => el.oninput = e => { draft[+el.dataset.i] = e.target.value; });
    body.querySelector('[data-reset]').onclick = () => { draft = defaultRankNames(); refresh(); };
    body.querySelector('[data-save]').onclick = () => {
      g.hrPolicy.rankNames = draft.map((v, i) => (v && v.trim()) ? v.trim().slice(0, 10) : RANKS[i].name);
      toast('役職名を改称した', 'good');
      ctx.refresh(); closeModal();
    };
  }
}

// ------------------------------------------------------------
//  社長（プレイヤー本人）
// ------------------------------------------------------------
export function openCeo(g, ctx) {
  const me = ceo(g);
  const gap = payGapView(g);
  const list = officers(g);
  const open = uncovered(g);
  let name = me.name;
  let pay = Math.round(ceoPay(g) * 100);

  openModal(`${rankName(g, CEO_RANK)}　${me.name}`, `
    <div class="card" style="border-color:rgba(227,181,88,.4);background:var(--gold-soft)">
      <div class="card-t"><span class="card-n">👑 ${me.name}</span>${chip(`${me.since}年 就任`, 'gold')}</div>
      <div class="card-s">${g.company.name}の代表取締役社長。
      役員の指名も、報酬の決定も、経営計画の公表も、すべてこの席の仕事である。</div>
    </div>
    <div class="grid3" style="margin:12px 0">
      ${mini('在任', `${Math.max(0, g.year - me.since)}年`, `${me.since}年〜`)}
      ${mini('役員', list.length + '名', `管掌なしの部門 ${open.length}`)}
      ${mini('役員体制', (boardStrength(g) * 100).toFixed(0), '充実度')}
    </div>
    <div class="sec">
      <div class="sec-t"><span>氏名</span></div>
      <div class="field"><input type="text" id="inpCeoName" maxlength="12" value="${me.name}"></div>
    </div>
    <div class="sec">
      <div class="sec-t"><span>自分の役員報酬</span></div>
      <div class="field"><label>年額（万円）</label>
        <input type="number" id="inpCeoPay" value="${pay}" step="50" min="0">
      </div>
      <div id="ceoInfo" class="hint">${gap.text}（社員の${gap.ratio.toFixed(1)}倍）</div>
      <div class="hint">高く取りすぎると社員の士気が落ちる。低すぎても経営責任に見合わないと見られる。
      報酬は人件費として毎週計上される。</div>
    </div>
  `, [
    { label: '閉じる', cls: 'ghost' },
    { label: '名刺', cls: 'tonal', close: false, onClick: () => openCard(g, null) },
    {
      label: '変更を適用', cls: 'primary', onClick: () => {
        const n = (document.getElementById('inpCeoName').value || '').trim().slice(0, 12);
        const p2 = +document.getElementById('inpCeoPay').value;
        if (n) me.name = n;
        if (isFinite(p2) && p2 >= 0) {
          if (!Array.isArray(g.hrPolicy.rankPay)) g.hrPolicy.rankPay = [];
          g.hrPolicy.rankPay[CEO_RANK] = Math.round(p2) / 100;
        }
        toast('社長の情報を更新した');
        ctx.refresh();
      }
    },
  ]);
  const inp = document.getElementById('inpCeoPay');
  const info = document.getElementById('ceoInfo');
  if (inp && info) {
    inp.oninput = () => {
      const rp = g.hrPolicy.rankPay || [];
      const base = (typeof rp[0] === 'number' && rp[0] > 0) ? rp[0] : RANKS[0].baseSalary;
      const ratio = (+inp.value / 100) / Math.max(0.1, base);
      info.textContent = `社員の${ratio.toFixed(1)}倍`
        + (ratio > 22 ? '　開きが大きすぎる。士気が落ちる。'
          : ratio > 15 ? '　やや大きい。業績が伴わないと批判される。'
            : ratio < 4 ? '　低すぎる。経営責任に見合っていないと見られる。' : '　常識の範囲である。');
    };
  }
}

// ------------------------------------------------------------
//  就職先人気ランキング
// ------------------------------------------------------------
function jobRankSection(g, ctx) {
  const ap = employerAppeal(g).score;
  const mode = (ctx && ctx.jobRankMode) || 'pop';
  const r = jobRanking(g, ap);
  const me = r.byPop.find(x => x.isPlayer);
  const list = (mode === 'pop' ? r.byPop : r.byHard);
  // 自社の前後が見えるように、上位12社＋自社の周辺を出す
  const idx = list.indexOf(me);
  const head = list.slice(0, 12);
  const near = list.slice(Math.max(12, idx - 2), Math.min(list.length, idx + 3));
  const shown = head.concat(near.filter(x => !head.includes(x)));
  const gapRow = shown.length > 12 && idx > 14;

  const row = x => `<tr class="${x.isPlayer ? 'me' : ''}">
    <td>${mode === 'pop' ? x.popRank : x.hardRank}</td>
    <td>${x.name}<br><span style="font-size:10px;color:var(--ink-mute)">${INDUSTRIES[x.ind].icon} ${INDUSTRIES[x.ind].short}</span></td>
    ${mode === 'pop'
      ? `<td>${x.pop.toFixed(0)}</td><td>${man(x.pay)}</td><td>${num(x.hire)}</td>`
      : `<td><b>${x.ratio.toFixed(1)}倍</b></td><td>${num(x.applicants)}</td><td>${num(x.hire)}</td>`}
  </tr>`;

  return section('就職先ランキング', `${mode === 'pop' ? '学生人気' : '入社難易度'}　全${r.total}社`, `
    <div class="grid3">
      ${mini('学生人気', `${me.popRank}位`, `/ ${r.total}社`, me.popRank <= 10 ? 'var(--gold)' : '')}
      ${mini('入社難易度', `${me.hardRank}位`, `応募倍率 ${me.ratio.toFixed(1)}倍`)}
      ${mini('推定エントリー', num(me.applicants) + '名', `採用予定 ${num(me.hire)}名`)}
    </div>
    <div class="btnrow" style="margin:9px 0">
      <button class="btn sm ${mode === 'pop' ? 'primary' : ''}" data-act="hr.jobrank" data-id="pop">人気順</button>
      <button class="btn sm ${mode === 'hard' ? 'primary' : ''}" data-act="hr.jobrank" data-id="hard">入社難易度順</button>
    </div>
    <table class="tbl">
      <tr><th>順位</th><th>企業</th>
        ${mode === 'pop' ? '<th>人気度</th><th>平均年収</th><th>採用</th>' : '<th>応募倍率</th><th>応募</th><th>採用</th>'}</tr>
      ${shown.map((x, i) => (gapRow && i === 12 ? '<tr><td colspan="5" style="text-align:center;color:var(--ink-mute)">…</td></tr>' : '') + row(x)).join('')}
    </table>
    <div class="hint">デベロッパー以外の業界も含めた序列である。人気は知名度・平均年収・直近の勢いで決まり、
    入社難易度はエントリー数を採用予定数で割った応募倍率で見る。
    いま同業他社に学生を引っ張られる強さは ×${rivalPull(g, ap).toFixed(2)}。
    順位が上がるほど内定辞退が減り、上位校の学生が集まる。<br>
    掲載している企業はすべて架空であり、実在の企業の数値ではない。</div>
  `);
}

// ------------------------------------------------------------
//  社内公募と抜擢人事
// ------------------------------------------------------------
function talentSection(g) {
  const posts = (g.postings || []).filter(p => g.week < p.deadline);
  const cands = fastTrackCandidates(g).slice(0, 5);
  const wl = workload(g, orgPower(g));

  const postCards = posts.length ? posts.map(p => `
    <div class="card">
      <div class="card-t"><span class="card-n">${DEPTS[p.dept].icon} ${DEPTS[p.dept].name}の社内公募</span>
        ${chip(`締切まで ${p.deadline - g.week}週`, p.deadline - g.week <= 1 ? 'red' : 'grey')}</div>
      <div class="card-s">募集 ${p.need}名／応募 ${p.applicants.length}名${p.filled ? `／決定 ${p.filled}名` : ''}</div>
      ${p.applicants.length ? `<table class="tbl" style="margin-top:6px">
        <tr><th>氏名</th><th>現部署</th><th>役職</th><th>能力</th><th>志望度</th><th></th></tr>
        ${p.applicants.slice(0, 8).map(ap => {
    const s = g.staff.find(x => x.id === ap.id);
    if (!s) return '';
    return `<tr><td>${s.name}</td><td>${DEPTS[s.dept].short}</td><td>${rankShort(g, s.rank)}</td>
          <td>${avgAbility(s).toFixed(0)}</td><td>${ap.want}</td>
          <td><button class="btn sm primary" data-act="hr.accept" data-id="${p.id}|${s.id}">受け入れる</button></td></tr>`;
  }).join('')}
      </table>` : '<div class="hint">まだ応募がない。</div>'}
    </div>`).join('') : empty('いま出している公募はない');

  return section('社内公募・抜擢人事', posts.length ? `公募 ${posts.length}件` : '', `
    <div class="card">
      <div class="card-t"><span class="card-n">🙋 社内公募</span></div>
      <div class="card-s">部署を指定して手挙げを募る。通常の異動と違い、自ら希望して移った社員は士気が上がる。
      いまの部署で伸び悩んでいる人や、残業が重い部署の人ほど手を挙げやすい。</div>
      ${kv('いちばん残業の重い部署', `${DEPTS[wl.total.worst].name}　${wl[wl.total.worst].overtime.toFixed(0)}h／月`)}
      <div class="btnrow"><button class="btn sm primary" data-act="hr.posting">社内公募を出す</button></div>
    </div>
    ${postCards}
    <div class="card" style="margin-top:10px">
      <div class="card-t"><span class="card-n">🚀 抜擢人事</span></div>
      <div class="card-s">等級を2つ飛ばして引き上げる。成功すれば一気に伸び、若手の目の色が変わる。
      失敗すると本人が潰れ、飛び越された社員の士気が落ちる。</div>
      ${cands.length ? `<table class="tbl" style="margin-top:6px">
        <tr><th>氏名</th><th>年齢</th><th>現職</th><th>能力</th><th>潜在</th><th>成功率</th><th></th></tr>
        ${cands.map(c => `<tr>
          <td>${c.s.name}</td><td>${c.s.age}</td><td>${rankShort(g, c.s.rank)}</td>
          <td>${avgAbility(c.s).toFixed(0)}</td><td>${c.s.potential}</td>
          <td class="${c.odds >= 0.6 ? 'up' : c.odds < 0.4 ? 'down' : ''}">${(c.odds * 100).toFixed(0)}%</td>
          <td><button class="btn sm" data-act="hr.fast" data-id="${c.s.id}">${rankName(g, c.s.rank + 2)}に抜擢</button></td>
        </tr>`).join('')}
      </table>` : '<div class="hint">いま抜擢できる社員がいない。勤続1年以上で、2つ上の等級に空きがあることが条件である。</div>'}
    </div>
  `);
}

// ------------------------------------------------------------
//  社内公募を出す
// ------------------------------------------------------------
export function openPostingModal(g, ctx) {
  let dept = 'land', n = 2;
  const wl = workload(g, orgPower(g));
  openModal('社内公募を出す', build(), []);
  bind();

  function build() {
    return `
    <div class="card">
      <div class="card-s">募集する部署と人数を決める。締切までに応募が集まれば、そこから選んで異動させられる。
      手を挙げて通った異動は、辞令による異動よりも定着する。</div>
    </div>
    <div class="selgrid">
      ${DEPT_IDS.map(d => `<button class="selbtn ${d === dept ? 'on' : ''}" data-d="${d}">
        <b>${DEPTS[d].icon} ${DEPTS[d].name}</b>
        <span>${orgPower(g)[d].count}名／残業 ${wl[d].overtime.toFixed(0)}h・負荷 ${(wl[d].load * 100).toFixed(0)}%</span>
      </button>`).join('')}
    </div>
    <div class="field" style="margin-top:10px">
      <label>募集人数</label>
      <input type="number" id="inpN" value="${n}" min="1" max="12" step="1">
    </div>
    <div class="hint">${DEPTS[dept].desc}</div>
    <div class="btnrow"><button class="btn primary wide" data-go="1">公募を出す</button></div>`;
  }
  function refresh() { document.getElementById('modalBody').innerHTML = build(); bind(); }
  function bind() {
    const body = document.getElementById('modalBody');
    body.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { dept = b.dataset.d; refresh(); });
    body.querySelector('#inpN').oninput = e => { n = Math.max(1, Math.min(12, +e.target.value || 1)); };
    body.querySelector('[data-go]').onclick = () => {
      const rng = new RNG(g.rngState ^ 777771);
      const err = openPosting(g, dept, n, rng);
      g.rngState = rng.s;
      if (err) return toast(err, 'bad');
      const p = g.postings[g.postings.length - 1];
      toast(`${DEPTS[dept].name}の公募に ${p.applicants.length}名が応募した`, p.applicants.length ? 'good' : 'bad');
      ctx.refresh(); closeModal();
    };
  }
}
