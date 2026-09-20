// ============================================================
//  開示 — 有価証券報告書のように、会社の状態をまとめて見せる
// ============================================================
import { money, moneyHTML, num, pct, man, moneyUnit } from '../core/format.js';
import { section, kv, mini, chip, bar, spark, empty, openModal, closeModal, toast } from './dom.js';
import { DEPTS, DEPT_IDS, RANKS, CEO_RANK, rankName } from '../data/hrdata.js';
import { DISTRICTS, CITIES, cityOf } from '../data/city.js';
import { orgPower, personnelCostYear, payIndex } from '../sim/hr.js';
import { workload, overtimeCostYear, WORK_PROGRAMS, OVERTIME_DANGER, OVERTIME_LIMIT, BASE_HOURS } from '../sim/workload.js';
import { SURVEY_AXES, surveyNow, voices } from '../sim/survey.js';
import { AWARDS, awardSummary, meritOf } from '../sim/awards.js';
import { OUTLOOKS, AGENCY } from '../sim/ir.js';
import { hazardOf, railsOf, seismicOf, retrofitTargets, retrofitCost } from '../sim/cityevents.js';
import { ttm, buildBS, kpis } from '../sim/finance.js';
import { ceo } from '../sim/officers.js';
import { tierOf } from '../sim/company.js';
import { avgAbility } from '../core/state.js';
import { populationRows, cityTotals } from '../sim/population.js';
import { holdersOf, scoreOf } from '../sim/meeting.js';
import { hasUnion, densityOf, avgPay, marketPay } from '../sim/union.js';

export const title = '開示・統合報告';

const TABS = [
  { id: 'people', name: '従業員の状況', icon: '☗' },
  { id: 'survey', name: 'エンゲージメント', icon: '📝' },
  { id: 'rating', name: '格付け', icon: '◱' },
  { id: 'awards', name: '受賞歴', icon: '🏆' },
  { id: 'risk', name: 'リスクと街の変化', icon: '⚠' },
  { id: 'pop', name: '人口と世帯', icon: '👥' },
  { id: 'gov', name: 'コーポレート・ガバナンス', icon: '⚖' },
  { id: 'history', name: '沿革', icon: '📜' },
];

export function render(g, ctx) {
  const tab = (ctx && ctx.discTab) || 'people';
  // M3 のフィルターチップの並びに寄せて、1行で横に流す。
  // 折り返すと8個で4行になり、狭い画面では中身が見えなくなる
  const nav = `<div class="tabrow"><div class="tabrow-in">
    ${TABS.map(t => `<button class="btn sm ${t.id === tab ? 'primary' : ''}" data-act="disc.tab" data-id="${t.id}">${t.icon} ${t.name}</button>`).join('')}
  </div></div>`;
  const body = tab === 'people' ? people(g)
    : tab === 'survey' ? survey(g)
      : tab === 'rating' ? rating(g)
        : tab === 'awards' ? awards(g)
          : tab === 'risk' ? risk(g)
            : tab === 'pop' ? population(g)
              : tab === 'gov' ? governance(g)
                : history(g);
  return nav + body;
}

// ------------------------------------------------------------
//  従業員の状況（有報の「従業員の状況」に相当）
// ------------------------------------------------------------
function people(g) {
  const p = orgPower(g);
  const wl = workload(g, p);
  const active = g.staff.filter(s => !s.subsidiary);
  const n = active.length;
  const avg = f => (n ? active.reduce((a, s) => a + f(s), 0) / n : 0);
  const me = ceo(g);
  const t = ttm(g);
  const prog = (g.hrPolicy && g.hrPolicy.work) || {};

  const deptRows = DEPT_IDS.map(d => {
    const list = active.filter(s => s.dept === d);
    const w = wl[d];
    return `<tr>
      <td>${DEPTS[d].icon} ${DEPTS[d].short}</td>
      <td>${list.length}</td>
      <td>${list.length ? (list.reduce((a, s) => a + s.age, 0) / list.length).toFixed(1) : '—'}</td>
      <td>${list.length ? (list.reduce((a, s) => a + s.tenure, 0) / list.length).toFixed(1) : '—'}</td>
      <td>${list.length ? man(list.reduce((a, s) => a + s.salary, 0) / list.length) : '—'}</td>
      <td class="${w.illegal ? 'down' : w.danger ? '' : ''}" style="${w.illegal ? 'font-weight:700' : ''}">${w.overtime.toFixed(1)}h</td>
      <td>${(w.load * 100).toFixed(0)}%</td>
    </tr>`;
  }).join('');

  const rankRows = RANKS.filter(r => r.id < CEO_RANK).slice().reverse().map(r => {
    const list = active.filter(s => s.rank === r.id);
    if (!list.length) return '';
    return `<tr><td>${rankName(g, r.id)}</td><td>${list.length}</td>
      <td>${(list.reduce((a, s) => a + s.age, 0) / list.length).toFixed(1)}</td>
      <td>${man(list.reduce((a, s) => a + s.salary, 0) / list.length)}</td></tr>`;
  }).join('');

  return `
  ${section('従業員の状況', `${g.year}年 ${g.month}月 第${g.weekOfMonth}週目現在`, `
    <div class="grid4">
      ${mini('従業員数', num(n) + '名', `連結 ${num(g.staff.length)}名`)}
      ${mini('平均年齢', avg(s => s.age).toFixed(1) + '歳', `平均勤続 ${avg(s => s.tenure).toFixed(1)}年`)}
      ${mini('平均年間給与', man(avg(s => s.salary)), `市場比 ${pct(payIndex(g), 0)}`)}
      ${mini('平均残業時間', wl.total.overtime.toFixed(1) + 'h', '月あたり',
    wl.total.overtime > OVERTIME_DANGER ? 'var(--red)' : wl.total.overtime > 35 ? 'var(--amber)' : 'var(--green)')}
    </div>
    <div class="hint">当社は代表取締役社長 ${me.name} 以下 ${num(n)} 名で事業を行っている。
    役員報酬（社長）は年 ${man((g.hrPolicy.rankPay || [])[CEO_RANK] || RANKS[CEO_RANK].baseSalary)}。
    従業員の平均給与に役員は含まない。</div>
  `)}

  ${section('労働時間の状況', wl.total.illegal ? '⚠ 上限超過の部署あり' : '月あたり', `
    <div class="grid3">
      ${mini('所定内', BASE_HOURS + 'h', '月あたり')}
      ${mini('時間外', wl.total.overtime.toFixed(1) + 'h', `総労働 ${wl.total.hours.toFixed(1)}h`)}
      ${mini('時間外手当', moneyHTML(overtimeCostYear(g, p)), '年額')}
    </div>
    ${wl.total.illegal ? `<div class="card" style="border-color:rgba(255,107,122,.5)">
      <div class="card-t"><span class="card-n" style="color:var(--red)">⚠ 時間外労働が上限（月${OVERTIME_LIMIT}時間）を超えている部署がある</span></div>
      <div class="card-s">${DEPT_IDS.filter(d => wl[d].illegal).map(d => DEPTS[d].name).join('・')}。
      このままでは離職が止まらない。人を増やすか、仕事量そのものを減らす必要がある。</div>
    </div>` : ''}
    <table class="tbl" style="margin-top:10px">
      <tr><th>部署</th><th>人数</th><th>年齢</th><th>勤続</th><th>年収</th><th>残業</th><th>負荷</th></tr>
      ${deptRows}
    </table>
    <div class="hint">負荷は「仕事量 ÷ 部署の処理能力」である。100%を超えたぶんが残業になる。
    案件・保有物件・借入が増えると仕事量が増え、人を増やすか子会社に出すまで下がらない。</div>
  `)}

  ${section('働き方への投資', '', `
    ${WORK_PROGRAMS.map(w => `
      <div class="card click" data-act="disc.work" data-id="${w.id}">
        <div class="card-t"><span class="card-n">${w.icon} ${w.name}</span>${chip(prog[w.id] ? '導入中' : '未導入', prog[w.id] ? 'green' : 'grey')}</div>
        <div class="card-s">${w.desc}<br>年間コスト ${money(w.cost)}</div>
      </div>`).join('')}
  `)}

  ${section('役職別の状況', '', `
    <table class="tbl">
      <tr><th>役職</th><th>人数</th><th>平均年齢</th><th>平均年収</th></tr>
      <tr class="me"><td>${rankName(g, CEO_RANK)}</td><td>1</td><td>—</td>
        <td>${man((g.hrPolicy.rankPay || [])[CEO_RANK] || RANKS[CEO_RANK].baseSalary)}</td></tr>
      ${rankRows}
    </table>
    <div class="hint">一人あたり売上高 ${money(Math.round(t.revenue / Math.max(1, n)))}／人件費（年額）${money(personnelCostYear(g))}。</div>
  `)}
  `;
}

// ------------------------------------------------------------
//  エンゲージメント
// ------------------------------------------------------------
function survey(g) {
  const res = surveyNow(g);
  const list = g.surveys || [];
  const prev = list.length ? list[list.length - 1] : null;
  const d = prev ? res.score - prev.score : 0;
  const vs = voices(g, res);

  const axisRows = SURVEY_AXES.map(x => {
    const v = res.axes[x.id] * 100;
    return `<div class="kv"><span class="k">${x.name}<span style="color:var(--ink-mute);font-size:10px">　${x.desc}</span></span>
      <span class="v ${v < 45 ? 'down' : v > 72 ? 'up' : ''}">${v.toFixed(0)}</span></div>
      ${bar(v / 100, v < 45 ? 'red' : v > 72 ? '' : 'gold')}`;
  }).join('');

  const deptRows = DEPT_IDS.map(dd => {
    const x = res.depts[dd];
    if (!x) return '';
    return `<tr class="${x.score < 45 ? 'warnrow' : ''}">
      <td>${DEPTS[dd].icon} ${DEPTS[dd].short}</td>
      <td>${x.n}</td>
      <td class="${x.score < 45 ? 'down' : x.score > 72 ? 'up' : ''}"><b>${x.score.toFixed(1)}</b></td>
      <td>${x.weakest.name}</td>
      <td>${x.overtime.toFixed(0)}h</td>
      <td>${x.officer || '<span style="color:var(--amber)">不在</span>'}</td>
    </tr>`;
  }).join('');

  return `
  ${section('エンゲージメントサーベイ', list.length ? `直近の実施 ${list[list.length - 1].year}年` : '未実施', `
    <div class="grid3">
      ${mini('全社スコア', res.score.toFixed(1), prev ? `前年 ${prev.score.toFixed(1)}（${d >= 0 ? '+' : ''}${d.toFixed(1)}）` : '初回',
    res.score < 45 ? 'var(--red)' : res.score > 70 ? 'var(--green)' : '')}
      ${mini('いちばん弱い柱', res.weakest.name, '')}
      ${mini('最下位の部署', res.worst ? DEPTS[res.worst.id].short : '—', res.worst ? res.worst.score.toFixed(1) : '')}
    </div>
    ${bar(res.score / 100, res.score < 45 ? 'red' : '')}
    ${list.length > 2 ? `<div style="margin-top:10px">${spark(list.map(x => x.score), { color: '#6b4bc4' })}</div>
      <div class="hint">全社スコアの推移（${list.length}年ぶん）。毎年10月に実施している。</div>` : ''}
  `)}

  ${section('設問の柱', '100点満点', axisRows)}

  ${section('部署別', '', `
    <table class="tbl">
      <tr><th>部署</th><th>人数</th><th>スコア</th><th>弱い柱</th><th>残業</th><th>管掌役員</th></tr>
      ${deptRows}
    </table>
    <div class="hint">管掌役員がいない部署は「上司・経営への信頼」が伸びない。人事タブの役員人事で割り当てられる。</div>
  `)}

  ${vs.length ? section('自由記述', '匿名', `
    ${vs.map(v => `<div class="card" style="border-color:${v.tone === 'bad' ? 'rgba(255,107,122,.35)' : v.tone === 'good' ? 'rgba(15,138,85,.3)' : 'rgba(224,168,54,.35)'}">
      <div class="card-s">${v.text}</div>
    </div>`).join('')}
  `) : ''}
  `;
}

// ------------------------------------------------------------
//  格付け
// ------------------------------------------------------------
function rating(g) {
  const r = g.ratingReport;
  const k = kpis(g);
  const hist = (g.ratingHistory || []).slice(-12);
  if (!r) {
    return section('格付け', '未取得', empty('まだ格付けレポートが出ていない。<br>最初の決算を迎えると、格付け会社が評価を公表する。'));
  }
  const o = OUTLOOKS[r.outlook];
  return `
  ${section('格付け', r.agency, `
    <div class="card" style="border-color:${o.id === 'negative' ? 'rgba(255,107,122,.45)' : o.id === 'positive' ? 'rgba(15,138,85,.4)' : 'var(--line)'}">
      <div class="card-t">
        <span class="card-n">長期発行体格付け　<b style="font-size:19px">${r.rating}</b></span>
        ${chip(`見通し ${o.name}`, o.tone)}
      </div>
      <div class="card-s">${r.summary}</div>
      <div class="grid3" style="margin-top:9px">
        ${mini('自己資本比率', pct(r.equityRatio))}
        ${mini('D/Eレシオ', r.de.toFixed(2) + '倍')}
        ${mini('適用金利', pct(k.rate, 2), o.spread ? `見通しで ${o.spread > 0 ? '+' : ''}${(o.spread * 100).toFixed(2)}pt` : '')}
      </div>
      <div class="hint">${o.desc}見通しはそのまま調達コストに乗る。</div>
    </div>
  `)}

  ${section('評価の内訳', `${r.year}年 第${r.q}四半期`, `
    ${r.factors.map(f => `<div class="card" style="padding:9px 11px;margin-bottom:6px;border-color:${f.bad ? 'rgba(255,107,122,.3)' : f.good ? 'rgba(15,138,85,.25)' : 'var(--line)'}">
      <div class="card-t"><span class="card-n">${f.good ? '◎' : f.bad ? '×' : '△'} ${f.name}</span></div>
      <div class="card-s">${f.text}</div>
    </div>`).join('')}
  `)}

  ${hist.length > 1 ? section('格付けの推移', '', `
    <table class="tbl">
      <tr><th>時期</th><th>格付け</th><th>見通し</th></tr>
      ${hist.slice().reverse().map(x => `<tr><td>${x.year}年 Q${x.q}</td><td>${x.rating}</td>
        <td><span class="chip ${OUTLOOKS[x.outlook].tone}">${OUTLOOKS[x.outlook].name}</span></td></tr>`).join('')}
    </table>
  `) : ''}

  ${section('IRの状況', '', `
    ${kv('決算説明会での信頼', `${((g.company.irTrust || 0) * 100).toFixed(0)} / 100`)}
    ${bar(((g.company.irTrust || 0) + 1) / 2, (g.company.irTrust || 0) < -0.2 ? 'red' : '')}
    <div class="hint">${g.company.listed
    ? '決算説明会での受け答えが積み重なる。率直な説明は短期の株価を下げても、市場の信頼を厚くする。'
    : '未上場のため決算説明会は開いていない。上場すると四半期ごとにアナリストの質問を受けることになる。'}</div>
  `)}
  `;
}

// ------------------------------------------------------------
//  受賞歴
// ------------------------------------------------------------
function awards(g) {
  const sum = awardSummary(g);
  const cands = (g.assets || []).concat(g.inventory || [])
    .filter(a => a.completedWeek != null && g.week - a.completedWeek <= 104 && !a.awarded)
    .map(a => ({ a, m: meritOf(g, a), can: AWARDS.filter(x => meritOf(g, a) >= x.need) }))
    .sort((x, y) => y.m - x.m).slice(0, 8);

  return `
  ${section('受賞歴', `累計 ${sum.total}件`, sum.total ? `
    <div class="grid3">
      ${AWARDS.slice(0, 3).map(x => mini(x.name.replace(/（.*/, ''), (sum.byId[x.id] || 0) + '件', x.icon)).join('')}
    </div>
    <table class="tbl" style="margin-top:10px">
      <tr><th>年</th><th>賞</th><th>物件</th></tr>
      ${sum.recent.map(x => `<tr><td>${x.year}</td><td>${x.icon} ${x.name}</td><td>${x.asset}</td></tr>`).join('')}
    </table>
  ` : empty('まだ受賞はない。<br>規模が大きく、仕様の良い物件を、良い立地で建てると賞が付いてくる。'))}

  ${section('審査対象', '竣工から2年以内', cands.length ? `
    <table class="tbl">
      <tr><th>物件</th><th>地区</th><th>仕様</th><th>評点</th><th>狙える賞</th></tr>
      ${cands.map(x => `<tr>
        <td>${x.a.name}</td>
        <td>${DISTRICTS[x.a.district] ? DISTRICTS[x.a.district].short : '—'}</td>
        <td>${{ standard: '標準', high: 'ハイ', luxury: 'ラグジュ' }[x.a.grade] || '—'}</td>
        <td><b>${x.m}</b></td>
        <td>${x.can.length ? x.can.map(c => c.icon).join(' ') : '<span style="color:var(--ink-mute)">なし</span>'}</td>
      </tr>`).join('')}
    </table>
    <div class="hint">評点は仕様・延床・階数・立地・企業ブランドで決まる。四半期ごとに審査があり、1物件につき1つまで受賞する。</div>
  ` : empty('審査の対象となる物件がない'))}

  ${section('賞の一覧', '', `
    <table class="tbl">
      <tr><th>賞</th><th>主催</th><th>必要評点</th><th>受賞数</th></tr>
      ${AWARDS.map(x => `<tr><td>${x.icon} ${x.name}</td><td>${x.body}</td><td>${x.need}</td><td>${sum.byId[x.id] || 0}</td></tr>`).join('')}
    </table>
  `)}
  `;
}

// ------------------------------------------------------------
//  リスクと街の変化
// ------------------------------------------------------------
function risk(g) {
  const dis = (g.disasters || []).slice(-8).reverse();
  const rails = railsOf(g);
  const targets = retrofitTargets(g);
  const assets = g.assets || [];
  const weak = assets.filter(a => seismicOf(a) < 0.8).length;

  const hazRows = Object.values(DISTRICTS).map(d => {
    const h = hazardOf(d.id);
    const mine = assets.filter(a => a.district === d.id).length;
    if (!mine) return '';
    const tone = v => v >= 1.3 ? 'down' : v <= 0.8 ? 'up' : '';
    return `<tr><td>${CITIES[d.city || 'minato'].short}・${d.short}</td><td>${mine}件</td>
      <td class="${tone(h.quake)}">${h.quake.toFixed(2)}</td>
      <td class="${tone(h.storm)}">${h.storm.toFixed(2)}</td>
      <td class="${tone(h.flood)}">${h.flood.toFixed(2)}</td></tr>`;
  }).join('');

  return `
  ${section('耐震性能', `${assets.length}件中 ${weak}件が要改修`, assets.length ? `
    <div class="grid3">
      ${mini('保有物件', assets.length + '件')}
      ${mini('耐震性能が低い', weak + '件', '0.80未満', weak ? 'var(--red)' : 'var(--green)')}
      ${mini('被災の累計', moneyHTML((g.disasters || []).reduce((a, x) => a + x.loss, 0)), '特別損失')}
    </div>
    ${targets.length ? `<table class="tbl" style="margin-top:10px">
      <tr><th>物件</th><th>地区</th><th>築年</th><th>耐震</th><th>改修費</th><th></th></tr>
      ${targets.slice(0, 12).map(a => `<tr>
        <td>${a.name}</td>
        <td>${DISTRICTS[a.district] ? DISTRICTS[a.district].short : '—'}</td>
        <td>${Math.round(a.age || 0)}年</td>
        <td class="${seismicOf(a) < 0.7 ? 'down' : ''}">${(seismicOf(a) * 100).toFixed(0)}</td>
        <td>${money(retrofitCost(a))}</td>
        <td><button class="btn sm primary" data-act="disc.retrofit" data-id="${a.id}">改修する</button></td>
      </tr>`).join('')}
    </table>
    <div class="hint">耐震改修は地震のときの損害を大きく減らす。工事費の一部は資本的支出として簿価に乗る。</div>`
    : '<div class="hint">いま改修が必要な物件はない。</div>'}
  ` : empty('保有物件がない'))}

  ${section('地区ごとの災害リスク', '1.00 = 標準', assets.length ? `
    <table class="tbl">
      <tr><th>地区</th><th>保有</th><th>地震</th><th>風水害</th><th>浸水</th></tr>
      ${hazRows}
    </table>
    <div class="hint">埋立地は揺れと浸水に弱く、高台は強い。同じ利回りでも、抱えているリスクは同じではない。</div>
  ` : empty('保有物件がない'))}

  ${section('被災の記録', `${(g.disasters || []).length}件`, dis.length ? `
    ${dis.map(x => `<div class="card">
      <div class="card-t"><span class="card-n">${x.icon} ${x.title}</span>${chip(`${x.year}年`, 'grey')}</div>
      <div class="card-s">被災 ${x.hits}件／復旧費 ${money(x.loss)}${x.delayed ? `／工期が延びた案件 ${x.delayed}件` : ''}
        ${x.worst ? `<br>最大の被害：${x.worst.name}（${money(x.worst.cost)}）` : ''}</div>
    </div>`).join('')}
  ` : empty('大きな災害は起きていない'))}

  ${section('鉄道の整備計画', `${rails.filter(r => r.status === 'building').length}件が進行中`, rails.length ? `
    ${rails.slice().reverse().map(r => `<div class="card" style="border-color:${r.status === 'open' ? 'rgba(15,138,85,.3)' : 'rgba(227,181,88,.35)'}">
      <div class="card-t"><span class="card-n">${r.icon} ${r.name}</span>${
    chip(r.status === 'open' ? `${r.openedYear}年 開業` : `${r.openYear}年 開業予定`, r.status === 'open' ? 'green' : 'gold')}</div>
      <div class="card-s">沿線：${r.districts.map(d => DISTRICTS[d].name).join('・')}</div>
      ${r.status === 'building' ? `${kv('工事の進捗', pct(r.progress || 0, 0))}${bar(r.progress || 0, 'gold')}
        <div class="hint">開業までに期待のぶんが少しずつ地価に乗る。仕込むなら開業前である。</div>` : ''}
    </div>`).join('')}
  ` : empty('いま動いている鉄道の計画はない'))}
  `;
}

// ------------------------------------------------------------
//  沿革
// ------------------------------------------------------------
function history(g) {
  const me = ceo(g);
  const ev = [];
  const push = (year, icon, text) => ev.push({ year, icon, text });
  push(g.company.founded, '🏢', `${g.company.name}を創業。${DISTRICTS[g.company.home] ? DISTRICTS[g.company.home].name : ''}を地盤に事業を開始。`);
  for (const a of (g.awards || [])) push(a.year, a.icon, `「${a.asset}」が${a.name}を受賞。`);
  for (const d of (g.disasters || [])) push(d.year, d.icon, `${d.title}。保有${d.hits}件が被災し、復旧費${Math.round(d.loss / 100).toLocaleString()}億円を計上。`);
  for (const r of railsOf(g)) {
    push(r.announcedYear, r.icon, `${r.name}の事業計画が認可される。`);
    if (r.status === 'open') push(r.openedYear, r.icon, `${r.name}が開業。`);
  }
  for (const p of (g.planHistory || [])) {
    push(p.endYear, '📋', `中期経営計画「${p.name}」が${{ achieved: '達成', partial: '一部達成', missed: '未達', abandoned: '取り下げ' }[p.status]}（進捗 ${(p.score * 100).toFixed(0)}%）。`);
  }
  for (const a of (g.acquisitions || [])) push(g.year, '🤝', `${a.name}を買収。`);
  ev.sort((a, b) => b.year - a.year);

  const t = ttm(g);
  const bs = buildBS(g);
  return `
  ${section('会社の概要', '', `
    <table class="tbl">
      <tr><td>商号</td><td>${g.company.name}</td></tr>
      <tr><td>代表者</td><td>${rankName(g, CEO_RANK)}　${me.name}</td></tr>
      <tr><td>設立</td><td>${g.company.founded}年</td></tr>
      <tr><td>本店所在地</td><td>${DISTRICTS.T.name}</td></tr>
      <tr><td>地盤</td><td>${DISTRICTS[g.company.home] ? DISTRICTS[g.company.home].name : '—'}</td></tr>
      <tr><td>事業の段階</td><td>${tierOf(g).name}</td></tr>
      <tr><td>従業員数</td><td>${num(g.staff.length)}名</td></tr>
      <tr><td>売上高（直近4四半期）</td><td>${money(t.revenue)}</td></tr>
      <tr><td>純資産</td><td>${money(bs.equity)}</td></tr>
      <tr><td>上場</td><td>${g.company.listed ? '上場' : '未上場'}</td></tr>
    </table>
  `)}

  ${section('沿革', `${ev.length}件`, ev.length ? `
    <div class="tl">
      ${ev.slice(0, 40).map(x => `<div class="tl-row"><span class="tl-y">${x.year}年</span>
        <span class="tl-i">${x.icon}</span><span class="tl-t">${x.text}</span></div>`).join('')}
    </div>
  ` : empty('まだ記録がない'))}
  `;
}


// ------------------------------------------------------------
//  人口と世帯
//    数字はすべて population.js から引く。ここで計算しない
// ------------------------------------------------------------
function population(g) {
  const rows = populationRows(g);
  const tot = cityTotals(g);
  const cityCard = (cid) => {
    const t = tot[cid]; if (!t || !t.base) return '';
    const ch = (t.people / t.base - 1) * 100;
    return `<div class="card">
      <div class="card-t"><span class="card-n">${CITIES[cid].name}</span>
        ${chip(`${ch >= 0 ? '+' : ''}${ch.toFixed(1)}%`, ch >= 0 ? 'good' : 'bad')}</div>
      <div class="card-s">
        ${kv('人口', num(t.people) + '人')}
        ${kv('世帯数', num(t.households) + '世帯')}
        ${kv('1世帯あたり', (t.people / Math.max(1, t.households)).toFixed(2) + '人')}
      </div></div>`;
  };
  const table = (cid) => {
    const rs = rows.filter(r => r.city === cid);
    if (!rs.length) return '';
    return `<div class="sec"><div class="sec-t"><span>${CITIES[cid].name}の地区別</span></div>
      <table class="tbl">
        <tr><th>地区</th><th>人口</th><th>世帯数</th><th>1世帯</th><th>創業時比</th><th>引力</th></tr>
        ${rs.map(r => `<tr>
          <td>${r.short}</td>
          <td>${num(r.people)}</td>
          <td>${num(r.households)}</td>
          <td>${r.size.toFixed(2)}</td>
          <td style="color:${r.change >= 0 ? 'var(--good)' : 'var(--bad)'}">${r.change >= 0 ? '+' : ''}${r.change.toFixed(1)}%</td>
          <td>${r.pull >= 0.2 ? '強い' : r.pull >= -0.1 ? 'ふつう' : '弱い'}</td>
        </tr>`).join('')}
      </table></div>`;
  };
  return `<div class="hint">人が増えている地区は住宅と商業の引き合いが強く、空室が埋まりやすい。
    減っている地区では稼働率が落ちる。新線の開業は人の流れを変える。</div>
    <div class="grid2" style="margin:10px 0">${Object.keys(CITIES).map(cityCard).join('')}</div>
    ${Object.keys(CITIES).map(table).join('')}`;
}

// ------------------------------------------------------------
//  コーポレート・ガバナンス（株主構成・総会・労使）
// ------------------------------------------------------------
function governance(g) {
  const c = g.company;
  if (!c.listed) {
    return `<div class="hint">未上場のため、株主総会に関する開示はない。</div>` + laborSection(g);
  }
  const sc = scoreOf(g);
  const hs = holdersOf(g);
  const last = (g.meetings || []).slice(-1)[0];
  return `<div class="grid3" style="margin-bottom:10px">
      ${mini('配当性向', ((c.payout ?? 0.22) * 100).toFixed(0) + '%', c.lastDividend ? `${c.lastDividend.year}年 ${money(c.lastDividend.amount)}` : '—')}
      ${mini('物言う株主', ((c.activistShare ?? 0.06) * 100).toFixed(1) + '%', c.mtgLoss ? `不振${c.mtgLoss}期` : '安定')}
      ${mini('社外取締役', (c.outsideDirectors || 0) + '名', c.stockOption ? '株式報酬あり' : '—')}
    </div>
    <div class="card">
      <div class="card-t"><span class="card-n">経営に対する評価</span>
        ${chip(sc.total > 0.15 ? '良好' : sc.total < -0.15 ? '厳しい' : '中立', sc.total > 0.15 ? 'good' : sc.total < -0.15 ? 'bad' : 'grey')}</div>
      <div class="card-s">
        ${kv('ROE（年換算）', (sc.roe * 100).toFixed(1) + '%')}
        ${kv('株価（直近1年）', (sc.priceUp >= 0 ? '+' : '') + (sc.priceUp * 100).toFixed(1) + '%')}
      </div>
    </div>
    <div class="sec"><div class="sec-t"><span>株主構成</span></div>
      <div class="card"><div class="card-s">${hs.map(h => kv(h.name, (h.share * 100).toFixed(1) + '%')).join('')}</div></div>
    </div>
    ${last ? `<div class="sec"><div class="sec-t"><span>直近の株主総会（${last.year}年）</span></div>
      ${last.results.length ? last.results.map(r => `<div class="card">
        <div class="card-t"><span class="card-n">${r.name}</span>
          ${chip(r.pass ? '可決' : '否決', (r.kind === 'proposal') === r.pass ? 'bad' : 'good')}</div>
        <div class="card-s">賛成 ${(r.yes * 100).toFixed(1)}%（必要 ${(r.need * 100).toFixed(0)}%）</div>
      </div>`).join('') : '<div class="hint">付議された議案はなかった。</div>'}</div>` : ''}
    ${laborSection(g)}`;
}

function laborSection(g) {
  if (!hasUnion(g)) {
    return `<div class="sec"><div class="sec-t"><span>労使関係</span></div>
      <div class="hint">労働組合は組織されていない。従業員が増え、士気が下がるか残業が長引くと結成される。</div></div>`;
  }
  const h = (g.union.history || []).slice(-8).reverse();
  const KIND = { full: ['満額回答', 'good'], settle: ['妥結', 'good'], grudging: ['不満を残して決着', 'amber'], break: ['決裂', 'bad'] };
  return `<div class="sec"><div class="sec-t"><span>労使関係</span>
      ${chip(`組織率 ${(densityOf(g) * 100).toFixed(0)}%`, 'grey')}</div>
    <div class="card"><div class="card-s">
      ${kv('組合結成', g.union.since + '年')}
      ${kv('自社の平均年収', avgPay(g).toFixed(1) + '百万円')}
      ${kv('同業他社の中央値', marketPay(g).toFixed(1) + '百万円')}
      ${kv('交渉が決裂した回数', (g.union.disputes || 0) + '回')}
    </div></div>
    ${h.length ? `<table class="tbl" style="margin-top:8px">
      <tr><th>年</th><th>要求</th><th>回答</th><th>結果</th></tr>
      ${h.map(x => `<tr>
        <td>${x.year}</td><td>${x.demand.toFixed(1)}%</td><td>${x.answer.toFixed(1)}%</td>
        <td>${KIND[x.kind][0]}</td>
      </tr>`).join('')}</table>` : ''}</div>`;
}
