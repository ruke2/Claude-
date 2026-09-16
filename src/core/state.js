// ============================================================
//  ゲーム状態の生成と初期化
//  金額はすべて百万円、面積は坪
// ============================================================
import { RNG, hash2 } from './rng.js';
import { clamp, clamp01 } from './format.js';
import { DISTRICTS, MAP_ROWS, MAP_W, MAP_H, TERRAIN, terrainOf, elevationAt, USES, FACADES } from '../data/city.js';
import { RIVAL_DEFS } from '../data/companies.js';
import { DEPTS, DEPT_IDS, RANKS, ABILITY_IDS, LAST_NAMES, FIRST_NAMES_CLEAN, BRAND_PREFIX, BRAND_CORE, OFFICE_SUFFIX } from '../data/hrdata.js';

export const DIFFICULTY = {
  easy:   { equity: 30000, label: 'やさしい', costVol: 0.6, rivalAgg: 0.8, demand: 1.08, rate: 0.009 },
  normal: { equity: 20000, label: 'ふつう',   costVol: 1.0, rivalAgg: 1.0, demand: 1.00, rate: 0.012 },
  hard:   { equity: 12000, label: 'きびしい', costVol: 1.4, rivalAgg: 1.25, demand: 0.93, rate: 0.017 },
};

let _uid = 1;
export const uid = (p = 'x') => `${p}${(_uid++).toString(36)}`;

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
        const areaBase = { T: 1900, B: 1650, A: 420, K: 380, N: 640, J: 2600 }[d];
        cell.area = Math.round(areaBase * (0.6 + r1 * 0.95) / 10) * 10;
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
    return rng.pick(['常盤', '汐見', '青葉', '神楽', '北野', '城東', dd.short, '中央', '新都', '湊']) + rng.pick(OFFICE_SUFFIX);
  }
  if (use === 'logi') return `${dd.short}ロジスティクスセンター${rng.pick(['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'])}`;
  if (use === 'hotel') return rng.pick(['ホテル', 'グランドホテル', 'ステイ']) + rng.pick(['湊都', '常盤', '神楽', '汐見', 'ベイ']);
  if (use === 'retail') return rng.pick(['モール', 'プラザ', 'アベニュー', 'マルシェ']) + rng.pick(['湊', '汐見', '神楽', '北野']);
  if (use === 'house') return `${dd.short}${rng.pick(['タウン', 'ヒルズ', 'ガーデンズ'])}`;
  return rng.pick(BRAND_PREFIX) + dd.short + rng.pick(BRAND_CORE);
}

/** 初期の既存街並みを生成する */
function populateCity(cells, rng, rivals) {
  const HEIGHT = {
    T: [14, 54], B: [6, 44], A: [2, 5], K: [3, 13], N: [3, 15], J: [1, 5],
  };
  const USE_POOL = {
    T: ['office', 'office', 'office', 'mixed', 'retail', 'hotel', 'rental'],
    B: ['resi', 'rental', 'resi', 'retail', 'office', 'hotel', 'mixed'],
    A: ['house', 'house', 'resi', 'rental'],
    K: ['retail', 'hotel', 'office', 'rental', 'retail'],
    N: ['house', 'resi', 'rental', 'retail', 'house'],
    J: ['logi', 'logi', 'logi', 'house', 'retail'],
  };
  for (const c of cells) {
    if (c.terrain !== TERRAIN.LOT || !c.d) continue;
    // 1割強は空地（＝将来の売り出し候補）として残す
    if (rng.chance(0.13)) { c.vacant = true; continue; }
    const use = rng.pick(USE_POOL[c.d]);
    const [lo, hi] = HEIGHT[c.d];
    let floors = rng.int(lo, hi);
    if (use === 'logi') floors = rng.int(1, 5);
    if (use === 'house') floors = rng.int(2, 3);
    // 所有者：3割が競合、残りは一般事業者
    let owner = 'other';
    if (rng.chance(0.34)) {
      const pool = rivals.filter(r => (r.focus[use] ?? 0.3) > 0.45);
      owner = (pool.length ? rng.pick(pool) : rng.pick(rivals)).id;
    }
    c.building = makeBuilding(rng, { use, floors, d: c.d, owner, grade: rng.pick(['standard', 'standard', 'high', 'luxury']), year: 1985 + rng.int(0, 38) });
    c.owner = owner;
  }
}

export function makeBuilding(rng, { use, floors, d, owner, grade = 'standard', year = 2026, name = null }) {
  const fl = Math.max(1, Math.round(floors));
  const u = USES[use];
  const fh = use === 'logi' ? 7.2 : use === 'retail' ? 5.4 : use === 'office' ? 4.1 : 3.25;
  return {
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
  const rk = rank ?? (age < 28 ? 0 : age < 33 ? rng.int(0, 1) : age < 38 ? rng.int(1, 2) : age < 45 ? rng.int(2, 3) : rng.int(3, 4));
  const s = {
    id: uid('s'),
    name: name || (rng.pick(LAST_NAMES) + ' ' + rng.pick(FIRST_NAMES_CLEAN)),
    age, dept: dept || rng.pick(DEPT_IDS), rank: rk,
    abil, potential: Math.round(rng.range(potentialRange[0], potentialRange[1])),
    salary: 0, loyalty: clamp01(loyalty + rng.range(-0.1, 0.1)),
    morale: clamp01(rng.range(0.55, 0.85)),
    tenure: Math.max(0, age - 22 - rng.int(0, 8)),
    joined: null, channel: opt.channel || 'legacy',
    eval: 3, note: '',
  };
  s.salary = baseSalaryFor(s);
  return s;
}

/** 役職・能力から標準年収を求める（百万円） */
export function baseSalaryFor(s) {
  const r = RANKS[s.rank];
  const ab = avgAbility(s);
  return Math.round((r.baseSalary * (0.86 + ab / 100 * 0.32) + Math.min(s.tenure, 25) * 0.06) * 10) / 10;
}

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
    lastRev: def.rev, lastOp: def.op,
    stock: Math.round(def.equity / (def.employees * 0.4) * (0.8 + rng.next() * 0.5)) / 100,
    news: [],
  }));
}

// ------------------------------------------------------------
//  ゲーム生成
// ------------------------------------------------------------
export function createGame({ companyName = '常盤地所', difficulty = 'normal', seed = Date.now() } = {}) {
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

  const staff = [];
  const initialOrg = [
    { dept: 'corp', rank: 7, n: 1 }, { dept: 'land', rank: 4, n: 1 }, { dept: 'sales', rank: 4, n: 1 },
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
      s.joined = { year: 2026 - s.tenure, q: 1 };
      if (o.rank === 7) { s.name = '常盤 宗一郎'; s.note = '創業社長'; s.abil.lead = Math.max(s.abil.lead, 82); }
      staff.push(s);
    }
  }

  const g = {
    seed, rngState: rng.s, difficulty,
    turn: 0, year: 2026, quarter: 1, phase: 'idle',
    company: {
      name: companyName,
      brand: 22,            // ブランド力 0-100
      founded: 2026,
      shares: 40000000,     // 発行済株式数（株）
      listed: false,
      creditRating: 'BBB',
    },
    cash: Math.round(diff.equity * 0.55),
    debt: Math.round(diff.equity * 0.4),
    equity: diff.equity,
    // 本社ビルの簿価（BSの整合：資産合計 = 純資産 + 有利子負債）
    hqBook: diff.equity + Math.round(diff.equity * 0.4) - Math.round(diff.equity * 0.55),
    goodwill: 0,
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
      salaryMul: 1.0,
      programs: { training: false, welfare: false, dx: false, brandpr: false },
      newGradPlan: 8, newGradSalary: 5.4,
      evalStrict: 0.5,
    },
    market: {
      cycle: rng.range(0.15, 0.4),
      priceIdx: 1.0, costIdx: 1.0, rate: diff.rate,
      demand: { resi: 1.0, office: 1.0, retail: 1.0, hotel: 1.0, logi: 1.05, house: 1.0, rental: 1.0, mixed: 1.0 },
      sentiment: 0.55, capShift: 0,
      phaseName: '回復',
    },
    finance: { history: [], pl: null, bs: null, quarterAcc: null },
    kpi: { cumRevenue: 0, cumProfit: 0, builtCount: 0, soldUnits: 0, bestQuarter: 0 },
    log: [],
    news: [],
    flags: { tutorialDone: false },
    pendingReport: null,
    diff,
  };

  g.finance.quarterAcc = blankPL();
  g.weather = 'clear';
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
