// ============================================================
//  ゲーム状態の生成と初期化
//  金額はすべて百万円、面積は坪
// ============================================================
import { RNG, hash2 } from './rng.js';
import { clamp, clamp01 } from './format.js';
import { syncCalendar } from './time.js';
import { initCulture } from '../sim/culture.js';
import { DISTRICTS, MAP_ROWS, MAP_W, MAP_H, TERRAIN, terrainOf, elevationAt, USES, FACADES } from '../data/city.js';
import { RIVAL_DEFS } from '../data/companies.js';
import { seedPopulation } from '../sim/population.js';
import { DEPTS, DEPT_IDS, RANKS, ABILITY_IDS, LAST_NAMES, FIRST_NAMES_CLEAN,
  BRAND_PREFIX, BRAND_CORE, OFFICE_SUFFIX, defaultRankNames, TOP_STAFF_RANK,
  teamsOf } from '../data/hrdata.js';

export const DIFFICULTY = {
  easy:   { equity: 30000, label: 'やさしい', costVol: 0.6, rivalAgg: 0.8, demand: 1.08, rate: 0.009 },
  normal: { equity: 20000, label: 'ふつう',   costVol: 1.0, rivalAgg: 1.0, demand: 1.00, rate: 0.012 },
  hard:   { equity: 12000, label: 'きびしい', costVol: 1.4, rivalAgg: 1.25, demand: 0.93, rate: 0.017 },
};

let _uid = 1;
export const uid = (p = 'x') => `${p}${(_uid++).toString(36)}`;

/**
 * 読み込んだセーブに含まれる通し番号より必ず大きい番号から採番し直す。
 * これを忘れると、続きから始めたときに新しい案件が既存の案件と同じIDになり、
 * 別物を掴んでしまう。セーブを読み込んだ直後に必ず呼ぶこと。
 */
export function syncUid(g) {
  let max = 0;
  const scan = arr => {
    if (!Array.isArray(arr)) return;
    for (const o of arr) {
      const m = /^[A-Za-z]+([0-9a-z]+)$/.exec(o && o.id || '');
      if (!m) continue;                      // 区画ID（p3_7 など）はここに来ない
      const n = parseInt(m[1], 36);
      if (Number.isFinite(n) && n > max) max = n;
    }
  };
  scan(g.staff); scan(g.projects); scan(g.inventory); scan(g.assets);
  scan(g.listings); scan(g.subsidiaries); scan(g.maTargets);
  scan(g.acquisitions); scan(g.brands);
  const ng = g.recruit && g.recruit.ng;
  if (ng) { scan(ng.pool); scan(ng.offers); scan(ng.incoming); }
  const pools = g.recruit && g.recruit.mid && g.recruit.mid.pools;
  if (pools) for (const k of Object.keys(pools)) scan(pools[k]);
  for (const r of g.rivals || []) scan(r.projects);
  if (max >= _uid) _uid = max + 1;
  return _uid;
}

// ------------------------------------------------------------
//  マップ生成
// ------------------------------------------------------------
function buildMap(rng) {
  const cells = [];
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const ch = MAP_ROWS[y][x];
      const terrain = terrainOf(ch);
      const d = DISTRICTS[ch] ? ch : null;
      const cell = {
        id: `p${x}_${y}`, gx: x, gy: y, ch, terrain, d,
        elev: d ? elevationAt(x, y, d) : (terrain === TERRAIN.WATER ? -0.35 : 0),
        owner: null, onSale: null, building: null, projectId: null, assetId: null, invId: null,
      };
      if (terrain === TERRAIN.LOT && d) {
        const dd = DISTRICTS[d];
        const r1 = hash2(x, y, 1), r2 = hash2(x, y, 2), r3 = hash2(x, y, 3);
        // 面積：地区ごとの区画粒度
        cell.area = Math.round(dd.lotSize * (0.6 + r1 * 0.95) / 10) * 10;
        cell.far = Math.round((dd.farRange[0] + r2 * (dd.farRange[1] - dd.farRange[0])) / 50) * 50;
        // 駅距離スコア：地区の駅力 ± ばらつき
        cell.station = clamp01(dd.station * (0.78 + r3 * 0.34));
        cell.baseValue = cell.area * dd.landPrice * (0.72 + cell.station * 0.5) * (0.7 + cell.far / dd.farRange[1] * 0.55);
      }
      cells.push(cell);
    }
  }
  return cells;
}

/** マップの都市名生成用 */
function bldgName(rng, use, d) {
  const dd = DISTRICTS[d];
  if (use === 'office' || use === 'mixed') {
    return rng.pick(['常盤', '汐見', '青葉', '神楽', '北野', '城東', '港南', '桜川', dd.short, '中央', '新都', '湊']) + rng.pick(OFFICE_SUFFIX);
  }
  if (use === 'logi') return `${dd.short}ロジスティクスセンター${rng.pick(['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'])}`;
  if (use === 'hotel') return rng.pick(['ホテル', 'グランドホテル', 'ステイ', 'ザ・']) + rng.pick(['湊都', '常盤', '神楽', '汐見', 'ベイ', '港南']);
  if (use === 'retail') return rng.pick(['モール', 'プラザ', 'アベニュー', 'マルシェ']) + rng.pick(['湊', '汐見', '神楽', '北野', '桜川']);
  if (use === 'house') return `${dd.short}${rng.pick(['タウン', 'ヒルズ', 'ガーデンズ'])}`;
  return rng.pick(BRAND_PREFIX) + dd.short + rng.pick(BRAND_CORE);
}

/** 初期の既存街並みを生成する */
function populateCity(cells, rng, rivals) {
  for (const c of cells) {
    if (c.terrain !== TERRAIN.LOT || !c.d) continue;
    // 1割強は空地（＝将来の売り出し候補）として残す
    if (rng.chance(0.13)) { c.vacant = true; continue; }
    const dd = DISTRICTS[c.d];
    const use = rng.pick(dd.usePool);
    const [lo, hi] = dd.height;
    let floors = rng.int(lo, hi);
    if (use === 'logi') floors = rng.int(1, 5);
    if (use === 'house') floors = rng.int(2, 3);
    // 所有者：3割が競合、残りは一般事業者。
    // 湊都市の大手は海峡の向こうにはあまり出ていないので、鶴見野市では少ない
    let owner = 'other';
    if (rng.chance((dd.city || 'minato') === 'minato' ? 0.34 : 0.10)) {
      const pool = rivals.filter(r => (r.focus[use] ?? 0.3) > 0.45);
      owner = (pool.length ? rng.pick(pool) : rng.pick(rivals)).id;
    }
    c.building = makeBuilding(rng, { use, floors, d: c.d, owner, grade: rng.pick(['standard', 'standard', 'high', 'luxury']), year: 1985 + rng.int(0, 38) });
    c.owner = owner;
  }
}

export function makeBuilding(rng, { use, floors, d, owner, grade = 'standard', year = 2026, name = null, stack = null }) {
  const fl = Math.max(1, Math.round(floors));
  const u = USES[use];
  const fh = use === 'logi' ? 7.2 : use === 'retail' ? 5.4 : use === 'office' ? 4.1 : 3.25;
  // 高層の建物は低層部に商業や別用途が入っているのが普通
  let st = stack;
  if (!st) {
    if (use === 'mixed' && fl >= 12) {
      const podium = Math.min(5, Math.max(2, Math.round(fl * 0.12)));
      const top = Math.max(3, Math.round((fl - podium) * 0.34));
      st = [{ use: 'retail', floors: podium }, { use: 'office', floors: fl - podium - top }, { use: 'resi', floors: top }];
    } else if (fl >= 15 && (use === 'office' || use === 'resi' || use === 'rental' || use === 'hotel') && rng.chance(0.55)) {
      const podium = Math.min(4, Math.max(2, Math.round(fl * 0.1)));
      st = [{ use: 'retail', floors: podium }, { use, floors: fl - podium }];
    }
  }
  if (st) {
    let acc = 0;
    for (const seg of st) { seg.from = acc + 1; seg.to = acc + seg.floors; acc += seg.floors; }
  }
  return {
    stack: st,
    use, floors: fl, grade, owner,
    facade: rng.pick(use === 'logi' ? ['panel', 'panel', 'grid'] : use === 'house' ? ['brick', 'panel', 'stone'] : FACADES),
    height: fl * fh,
    seed: rng.int(0, 99999),
    name: name || bldgName(rng, use, d || 'T'),
    year,
    lit: rng.range(0.35, 0.95),
    antenna: rng.chance(fl > 28 ? 0.7 : 0.15),
    crown: rng.int(0, 4),
  };
}

// ------------------------------------------------------------
//  社員生成
// ------------------------------------------------------------
export function makeStaff(rng, opt = {}) {
  const {
    ageRange = [24, 52], abilityRange = [35, 70], potentialRange = [55, 90],
    rank = null, dept = null, loyalty = 0.6, name = null,
  } = opt;
  const age = opt.age ?? rng.int(ageRange[0], ageRange[1]);
  const abil = {};
  const spec = dept ? DEPTS[dept].key : rng.pick(ABILITY_IDS);
  const base = rng.range(abilityRange[0], abilityRange[1]);
  for (const k of ABILITY_IDS) {
    abil[k] = Math.round(clamp(rng.normal(base * (k === spec ? 1.18 : 0.82), 9), 8, 99));
  }
  // 社長の席（プレイヤー）には誰も座らせない
  const rk = Math.min(TOP_STAFF_RANK,
    rank ?? (age < 28 ? 0 : age < 33 ? rng.int(0, 1) : age < 38 ? rng.int(1, 2) : age < 45 ? rng.int(2, 3) : rng.int(3, 4)));
  const dp = dept || rng.pick(DEPT_IDS);
  const s = {
    id: uid('s'),
    name: name || (rng.pick(LAST_NAMES) + ' ' + rng.pick(FIRST_NAMES_CLEAN)),
    age, dept: dp, rank: rk,
    // 課（部の下の単位）。指定が無ければその部の課から1つ引く
    team: opt.team || (teamsOf(dp)[0] ? rng.pick(teamsOf(dp)).id : null),
    abil, potential: Math.round(rng.range(potentialRange[0], potentialRange[1])),
    salary: 0, loyalty: clamp01(loyalty + rng.range(-0.1, 0.1)),
    morale: clamp01(rng.range(0.55, 0.85)),
    tenure: Math.max(0, age - 22 - rng.int(0, 8)),
    joined: null, channel: opt.channel || 'legacy',
    eval: 3, note: '',
    oversee: [], officerSince: null,       // 役員になったときの管掌部門
  };
  s.salary = baseSalaryFor(s);
  return s;
}

/** 業界標準の年収（百万円）。他社と比べるときの物差しになる */
export function baseSalaryFor(s, gap = 1) {
  return salaryFrom(RANKS[s.rank].baseSalary, s, gap);
}

/** 自社の給与テーブルにおける、その役職の基準額（百万円） */
export function rankPayOf(g, rank) {
  const rp = g && g.hrPolicy && g.hrPolicy.rankPay;
  const v = rp && rp[rank];
  return typeof v === 'number' && isFinite(v) ? v : RANKS[rank].baseSalary;
}

/** 自社の給与テーブルに基づく標準年収（百万円） */
export function stdSalary(g, s, gap = 1) {
  return salaryFrom(rankPayOf(g, s.rank), s, gap);
}

/** 役職の基準額に、能力と勤続を上乗せする */
function salaryFrom(base, s, gap) {
  const ab = avgAbility(s);
  const abilPart = (ab / 100 - 0.55) * 0.32 * gap;
  const tenurePart = Math.min(s.tenure, 25) * 0.06 * (2 - gap);
  return Math.round((base * (1.04 + abilPart) + tenurePart) * 10) / 10;
}

/** 給与テーブルの初期値（業界標準と同じ） */
export function defaultRankPay() { return RANKS.map(r => r.baseSalary); }

export function avgAbility(s) {
  return ABILITY_IDS.reduce((a, k) => a + s.abil[k], 0) / ABILITY_IDS.length;
}

// ------------------------------------------------------------
//  競合初期化
// ------------------------------------------------------------
function initRivals(rng, diff) {
  return RIVAL_DEFS.map(def => ({
    ...def,
    aggression: clamp01(def.aggression * diff.rivalAgg),
    history: [],
    lots: 0, projects: [], momentum: 0,
    lastRev: def.rev, lastOp: def.op, lastEmployees: def.employees,
    // 平均年収の基準。賞与はこの水準のまわりで利益率と市況に応じて振れる
    payBase: def.avgPay, payMargin: def.op / def.rev,
    stock: Math.round(def.equity / (def.employees * 0.4) * (0.8 + rng.next() * 0.5)) / 100,
    news: [],
  }));
}

// ------------------------------------------------------------
//  ゲーム生成
// ------------------------------------------------------------
export function createGame({ companyName = '常盤地所', difficulty = 'normal', home = 'W',
  ceoName = '常盤 宗一郎', ceoAge = 42, seed = Date.now() } = {}) {
  const rng = new RNG(seed);
  const diff = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
  const rivals = initRivals(rng, diff);
  const cells = buildMap(rng);
  populateCity(cells, rng, rivals);

  // 本社ビル（常盤CBDの端の区画）
  const hq = cells.filter(c => c.d === 'T' && c.terrain === TERRAIN.LOT).sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy))[0];
  if (hq) {
    hq.owner = 'player'; hq.vacant = false;
    hq.building = makeBuilding(rng, { use: 'office', floors: 12, d: 'T', owner: 'player', grade: 'standard', year: 1998, name: `${companyName}本社ビル` });
    hq.isHQ = true;
  }

  // 社長はプレイヤー本人なので、社員として作らない
  const staff = [];
  const initialOrg = [
    { dept: 'corp', rank: 6, n: 1 }, { dept: 'land', rank: 4, n: 1 }, { dept: 'sales', rank: 4, n: 1 },
    { dept: 'land', rank: 2, n: 2 }, { dept: 'plan', rank: 2, n: 2 }, { dept: 'cons', rank: 3, n: 1 },
    { dept: 'cons', rank: 1, n: 2 }, { dept: 'sales', rank: 1, n: 3 }, { dept: 'lease', rank: 2, n: 1 },
    { dept: 'fin', rank: 3, n: 1 }, { dept: 'fin', rank: 0, n: 1 }, { dept: 'hr', rank: 2, n: 1 },
    { dept: 'plan', rank: 0, n: 2 }, { dept: 'land', rank: 0, n: 2 }, { dept: 'sales', rank: 0, n: 3 },
    { dept: 'corp', rank: 3, n: 1 }, { dept: 'lease', rank: 0, n: 1 },
  ];
  for (const o of initialOrg) {
    for (let i = 0; i < o.n; i++) {
      const s = makeStaff(rng, {
        dept: o.dept, rank: o.rank,
        ageRange: o.rank >= 6 ? [50, 60] : o.rank >= 4 ? [44, 55] : o.rank >= 2 ? [32, 46] : [23, 33],
        abilityRange: o.rank >= 6 ? [66, 86] : o.rank >= 4 ? [58, 78] : o.rank >= 2 ? [46, 68] : [28, 54],
        loyalty: 0.74,
      });
      s.joined = { year: Math.round(2026 - s.tenure), week: 0 };
      if (o.rank === 6) { s.note = '創業メンバー'; s.abil.lead = Math.max(s.abil.lead, 74); s.oversee = ['corp', 'fin']; }
      staff.push(s);
    }
  }

  const g = {
    seed, rngState: rng.s, difficulty,
    week: 0, year: 2026, month: 1, weekOfMonth: 1, quarter: 1, weekOfYear: 0, weekOfQuarter: 0,
    company: {
      name: companyName,
      // 社長はプレイヤー本人。架空の人物を据えない
      ceo: { name: (ceoName || '社長').slice(0, 12), age: ceoAge, since: 2026 },
      brand: 22,            // ブランド力 0-100
      // 地盤（創業の地）。ここでは商品力も入札も有利になる。
      // 創業時は湊都市の中からしか選べない
      home: (DISTRICTS[home] && (DISTRICTS[home].city || 'minato') === 'minato') ? home : 'W',
      founded: 2026,
      shares: 40000000,     // 発行済株式数（株）
      listed: false,
      creditRating: 'BBB',
      // 決算説明会での受け答えの積み重ね
      irTrust: 0, irPrice: 0, irLastWeek: -1,
      // 株主総会まわり
      payout: 0.22,          // 配当性向
      activistShare: 0.06,   // 物言う株主の持株比率
      mtgLoss: 0,            // 成績不振で総会を迎えた回数
      outsideDirectors: 0,
      stockOption: false,
    },
    cash: Math.round(diff.equity * 0.55),
    debt: Math.round(diff.equity * 0.4),
    equity: diff.equity,
    // 本社ビルの簿価（BSの整合：資産合計 = 純資産 + 有利子負債）
    hqBook: diff.equity + Math.round(diff.equity * 0.4) - Math.round(diff.equity * 0.55),
    goodwill: 0,
    // 売上に応じて解禁した機能（一度入ったら消えない）
    unlocked: [],
    // 中期経営計画（策定していなければ null）と、終わった計画の記録
    midPlan: null,
    planHistory: [],
    // 年1回のエンゲージメントサーベイの記録
    surveys: [],
    awards: [],            // 受賞歴
    disasters: [],         // 被災の記録
    rails: [],             // 鉄道の整備計画
    postings: [],          // 社内公募
    meetings: [],          // 株主総会の記録
    agenda: [],            // 年間の決裁事項（未処理のものが残る）
    bonuses: [],           // 賞与の支給記録
    jvOffers: [],          // 競合からの共同事業の打診
    standing: [],          // 売りに出ている稼働中のビル（一棟買い）
    assemblies: [],        // 進行中の用地集約（種地の取得）
    tenancies: [],         // 大口テナントとの賃貸借契約
    leads: [],             // テナントからの引き合い（リーシング）
    areas: [],             // エリアマネジメント団体
    relations: {},         // 競合との関係値（共同事業の通りやすさ）
    union: { formed: false, disputes: 0, history: [] },   // 労働組合
    pop: null,             // 地区ごとの人口（createGame の最後で seed する）
    ratingReport: null,    // 直近の格付けレポート
    ratingHistory: [],
    cells,
    listings: [],
    projects: [],
    inventory: [],
    assets: [],
    staff,
    subsidiaries: [],
    maTargets: [],
    acquisitions: [],
    rivals,
    hrPolicy: {
      // 役職ごとの基準年収（百万円）。人事タブでいつでも改定できる
      rankPay: defaultRankPay(),
      // 役職名。社長が自由に付け替えられる
      rankNames: defaultRankNames(),
      // 働き方への投資（フレックス・アウトソース・健康経営）
      work: {},
      salaryMul: 1.0,        // 旧版との互換用。いまは rankPay が給与テーブルを決める
      programs: { training: false, welfare: false, dx: false, brandpr: false },
      evalStrict: 0.5,
    },
    // 採用（新卒の年次サイクルと中途の候補者プール）
    recruit: {
      ng: {
        phase: 'idle', year: 2027, plan: 8, salary: 5.4,
        invest: { seminar: 120, intern: 0, ad: 80, recruiter: 0 },
        deptPlan: { land: 2, plan: 1, cons: 1, sales: 2, lease: 1, fin: 1, hr: 0, corp: 0 },
        screenPolicy: 0.5, pool: [], offers: [], incoming: [], hired: 0, declined: 0, spent: 0, log: [],
      },
      mid: { pools: {}, refreshed: {} },
    },
    // 自社ブランド
    brands: [],
    // 企業カルチャー
    culture: initCulture(),
    market: {
      cycle: rng.range(0.15, 0.4),
      priceIdx: 1.0, costIdx: 1.0, rate: diff.rate,
      demand: { resi: 1.0, office: 1.0, retail: 1.0, hotel: 1.0, logi: 1.05, house: 1.0, rental: 1.0, mixed: 1.0 },
      sentiment: 0.55, capShift: 0,
      phaseName: '回復',
    },
    finance: { history: [], pl: null, bs: null, quarterAcc: null },
    kpi: { cumRevenue: 0, cumProfit: 0, builtCount: 0, soldUnits: 0, bestQuarter: 0, publicWon: 0 },
    log: [],
    news: [],
    flags: { tutorialDone: false },
    pendingReport: null,
    diff,
  };

  g.finance.quarterAcc = blankPL();
  g.weather = 'clear';
  syncCalendar(g);
  g.pop = seedPopulation(g);
  return g;
}

export function blankPL() {
  return {
    revSale: 0, revLease: 0, revFee: 0, revOther: 0,
    cogsSale: 0, cogsLease: 0, cogsOther: 0,
    sga: 0, personnel: 0, interest: 0,
    gainSale: 0, impairment: 0, extraordinary: 0, tax: 0,
    landSpend: 0, buildSpend: 0, investCF: 0,
  };
}

/** セル取得 */
export function cellAt(g, x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
  return g.cells[y * MAP_W + x];
}
export function cellById(g, id) { return g.cells.find(c => c.id === id); }

/**
 * 自社の区画か。
 *
 * **合筆済みの種地（`mergedInto`）を1区画として数えないこと。**
 * 区画の集約（`sim/assembly.js`）でまとめたとき、種地の面積・評価額・簿価は
 * すべて母屋に寄せてあり、残った区画は 0坪・0円である。
 * 地図の上では母屋と一体の敷地なので、所有者はプレイヤーのままにしてある
 * （`remapCells()` がIDで突き合わせるため、区画そのものは消せない）。
 *
 * これを弾かずに数えると、用地パネルに
 * 「0坪／取得 0億円／時価 0億円／保有コスト 0億円」のカードが並び、
 * 保有区画数も実際より多く出る。
 */
export const isOwnedCell = c => c.owner === 'player' && !c.mergedInto;

/** 自社が持っていて、まだ何も建っていない用地 */
export const isIdleLot = c => isOwnedCell(c)
  && !c.isHQ && !c.building && !c.projectId && !c.assetId && !c.invId;
