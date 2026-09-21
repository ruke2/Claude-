// ============================================================
//  REIT・私募ファンドの組成
//
//    保有している賃貸物件を、自社が組成したファンドに売る。
//    物件は貸借対照表から外れ、かわりに
//    「運用報酬（AMフィー）」と「出資持分に応じた配当」が入り続ける。
//
//    なぜ要るか。保有物件は増えるほど総資産を重くし、ROE を押し下げる。
//    実際の大手デベロッパーは、開発した物件を REIT や私募ファンドに
//    移して資産を軽くしながら、運用報酬とスポンサー持分で稼いでいる。
//    「持ち続ける」以外の出口を作るのがこの仕組みである。
//
//    **「売って現金化して終わり」にしないこと。** それでは単なる売却と同じである。
//    運用報酬と持分配当が続くこと、そして自分が組成した器に
//    次の物件を入れ続けられることが、ファンドの旨みである。
//
//    **「オフバランスすれば必ず得」にしないこと。**
//    賃貸NOIそのものは失う。中期経営計画の「賃貸NOI」「保有物件数」は下がるし、
//    ファンドは自社の査定より少し安く買う（投資家の要求利回りが高いため）。
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { uid } from '../core/state.js';
import { DISTRICTS } from '../data/city.js';
import { assetValue, currentNOI } from './valuation.js';
import { WEEKS_PER_YEAR, WEEKS_PER_QUARTER } from '../core/time.js';

/**
 * ファンドの型。
 *
 * myShare … 自社（スポンサー）の出資比率。
 *            **運用資産ではなく「出資部分」に対する比率である。**
 *            ファンドは `ltv` のぶん借入を使うので、出資部分は運用資産の (1 − ltv) しかない。
 *            ここを運用資産に対する比率として扱うと、私募ファンドで
 *            自社が出資の57%を握ることになり、配当を取りすぎる
 * fee     … 運用報酬（年率／運用資産に対して）
 * acqFee  … 取得報酬（取得価格に対して・1回きり）
 * growth  … 第三者から物件を取得する勢い（四半期あたりの確率）
 * ltv     … ファンドが使う借入比率
 * cap     … 投資家の要求利回りの上乗せ（自社査定に対する割引になる）
 * years   … 運用期間（0 なら無期限）
 * minAssets / minValue … 組成に必要な物件数と拠出額
 */
export const FUND_TYPES = {
  private: {
    id: 'private', name: '私募ファンド', icon: '🧾',
    myShare: 0.20, fee: 0.0045, acqFee: 0.009, growth: 0.28, ltv: 0.65, cap: 0.0035, years: 7,
    minAssets: 3, minValue: 30000, listed: false,
    desc: '機関投資家から資金を集め、期間を決めて運用する。組成は軽く、'
      + '自社の出資は2割。7年で解散し、そのとき値上がりしていれば持分ぶんの売却益が返る。',
  },
  reit: {
    id: 'reit', name: '上場REIT', icon: '🏛',
    myShare: 0.05, fee: 0.0032, acqFee: 0.007, growth: 0.45, ltv: 0.45, cap: 0.0015, years: 0,
    minAssets: 6, minValue: 100000, listed: true, needListed: true,
    desc: '証券取引所に上場する投資法人を立ち上げ、スポンサーとして運用会社を持つ。'
      + '自社の出資は5%で済み、期間の定めがない。物件を入れ続けられる恒久的な出口になる。',
  },
};

export const typeOf = id => FUND_TYPES[id] || FUND_TYPES.private;

/**
 * 第三者から取得できる額の上限（自社が拠出した額に対する倍率）。
 *
 * **青天井にしないこと。** 組成しただけで勝手に太るなら、
 * 器を1つ作って放置するのが最適手になる。
 * 投資家は自社が入れた実績を見て金を出す、という形にしてある。
 */
export const EXTERNAL_CAP = 1.5;

/** 名前の部品 */
const PRIVATE_NAMES = ['アーバン', 'ベイサイド', 'メトロ', 'コア', 'グロース', 'ハーバー', 'サミット'];
const REIT_NAMES = ['シティ', 'プライム', 'アーバン', 'グランド'];

/**
 * ファンドが物件を買う価格。
 *
 * **自社の査定額をそのまま使わないこと。** 投資家の要求利回りは
 * 自社の査定より高いので、同じNOIでも少し安く評価される。
 * ここを等価にすると「出せば出すだけ得」になる。
 */
export function fundPrice(g, a, type) {
  const t = typeOf(type);
  const base = assetValue(g, a);
  if (!(base > 0)) return 0;
  const noi = currentNOI(g, a);
  if (!(noi > 0)) return Math.round(base * 0.92);
  // 自社の査定に使ったキャップレートを逆算し、要求利回りの上乗せを足す
  const myCap = noi / base;
  const theirCap = clamp(myCap + t.cap, 0.024, 0.12);
  // 市況が良いとファンドの買う意欲も上がる
  const heat = 0.97 + clamp01(g.market.sentiment) * 0.06;
  return Math.round(noi / theirCap * heat);
}

/** 拠出できる物件（工事中・改修中は出せない） */
export function contributable(g) {
  return (g.assets || []).filter(a => !a.retrofit && !(a.repairUntil && g.week < a.repairUntil));
}

/** その型のファンドを組成できるか。理由を返す（できるときは null） */
export function canForm(g, typeId, picked) {
  const t = typeOf(typeId);
  if (t.needListed && !g.company.listed) return '上場していなければ投資法人のスポンサーにはなれない';
  if ((g.funds || []).some(f => f.type === typeId && f.status === 'active' && t.years === 0)) {
    return `${t.name}はすでに組成している。物件の追加拠出で大きくしていくこと`;
  }
  const list = picked || [];
  if (list.length < t.minAssets) return `${t.name}の組成には物件が${t.minAssets}棟必要である（いま${list.length}棟）`;
  const total = list.reduce((s, a) => s + fundPrice(g, a, typeId), 0);
  if (total < t.minValue) {
    return `拠出額が足りない。${Math.round(t.minValue / 100).toLocaleString()}億円以上が必要である`
      + `（いま${Math.round(total / 100).toLocaleString()}億円）`;
  }
  return null;
}

/** ファンドの運用資産（簿価ではなく取得時の価格の合計） */
export const fundAUM = f => (f.assets || []).reduce((s, x) => s + x.price, 0);

/** ファンドの年間NOI */
export function fundNOI(g, f) {
  let noi = 0;
  for (const x of f.assets || []) noi += x.noi;
  return noi;
}

/**
 * 自社が受け取る年間の運用報酬。
 * 運用資産に対する率なので、**物件を入れるほど増える**。
 */
export const fundFee = (g, f) => Math.round(fundAUM(f) * typeOf(f.type).fee);

/**
 * 自社が受け取る年間の配当。
 * ファンドのNOIから、借入の利息と運営費を引いた残りを持分で取る。
 */
export function fundDividend(g, f) {
  const t = typeOf(f.type);
  const noi = fundNOI(g, f);
  const debt = fundAUM(f) * t.ltv;
  const interest = debt * (g.market.rate + 0.006);
  const opex = fundAUM(f) * 0.0022;                 // 事務受託・監査・上場維持
  const dist = Math.max(0, noi - interest - opex - fundFee(g, f));
  return Math.round(dist * shareNow(g, f));
}

/** 自社の出資持分の簿価 */
export const fundEquityOf = f => Math.round(f.equity || 0);

/** ファンド全体の出資（借入を除いた部分） */
export const fundTotalEquity = (g, f) => Math.max(1, Math.round(fundAUM(f) * (1 - typeOf(f.type).ltv)));

/**
 * いまの自社の持分比率。
 * 第三者から取得するたび、投資家の出資が増えて**自社の持分は薄まる**。
 * 報酬（運用資産に対する率）は増えるが、配当の取り分は増えない、という形である。
 */
export function shareNow(g, f) {
  return clamp01(fundEquityOf(f) / fundTotalEquity(g, f));
}

/** 第三者から取得した額 */
export const externalAUM = f => Math.max(0, fundAUM(f) - (f.contributed || 0));

/** 全ファンドの出資持分（貸借対照表に載る） */
export function totalFundEquity(g) {
  return (g.funds || []).filter(f => f.status === 'active').reduce((s, f) => s + fundEquityOf(f), 0);
}

/**
 * ファンドを組成して、物件を拠出する。
 *
 * 物件は `g.assets` から外れる（オフバランス）。
 * 入ってくるのは「売却価格 − 自社の出資ぶん」の現金で、
 * 自社の出資ぶんは投資有価証券として資産に残る。
 */
export function formFund(g, typeId, picked, rng, news) {
  const err = canForm(g, typeId, picked);
  if (err) return { ok: false, message: err };
  const t = typeOf(typeId);
  const name = typeId === 'reit'
    ? `${rng.pick(REIT_NAMES)}${g.company.name.replace(/(不動産|地所|興産|都市開発)$/, '')}投資法人`
    : `${rng.pick(PRIVATE_NAMES)}ファンド${(g.funds || []).filter(f => f.type === 'private').length + 1}号`;

  const f = {
    id: uid('F'), type: typeId, name, status: 'active',
    myShare: t.myShare, since: g.week,
    endWeek: t.years > 0 ? g.week + Math.round(t.years * WEEKS_PER_YEAR) : 0,
    assets: [], equity: 0, cumFee: 0, cumDiv: 0, contributed: 0,
  };
  g.funds = g.funds || [];
  g.funds.push(f);
  const r = contribute(g, f, picked, news, true);
  news && news.push({
    icon: t.icon, type: 'fin', major: true,
    text: `【${name}】を組成した。${picked.length}物件・${Math.round(r.price / 100).toLocaleString()}億円を拠出し、`
      + `${Math.round(r.cash / 100).toLocaleString()}億円を回収。自社は${Math.round(t.myShare * 100)}%を出資して運用会社を持つ。`,
  });
  return { ok: true, fund: f, ...r };
}

/**
 * 既存のファンドに物件を追加で拠出する。
 *
 * **売却益をここで計上すること。** 簿価より高く売れているのに
 * 利益が立たないと、オフバランスしても財務諸表が動かない。
 */
export function contribute(g, f, picked, news, silent) {
  let price = 0, book = 0;
  for (const a of picked) {
    const p = fundPrice(g, a, f.type);
    if (!(p > 0)) continue;
    price += p;
    book += (a.bookLand || 0) + (a.bookBuild || 0);
    f.assets.push({
      assetId: a.id, cellId: a.cellId, name: a.name, district: a.district, use: a.use,
      nra: a.nra, gfa: a.gfa || 0, price: p, noi: currentNOI(g, a), week: g.week,
    });
    // 物件を手放す。区画は他社のものにはしない（自社が運用している器なので）
    const cell = g.cells.find(c => c.id === a.cellId);
    if (cell) { cell.assetId = null; cell.fundId = f.id; }
    const i = g.assets.indexOf(a);
    if (i >= 0) g.assets.splice(i, 1);
  }
  const t = typeOf(f.type);
  // 出資部分（運用資産 − 借入）のうち、自社が持つぶん
  const myEquity = Math.round(price * (1 - t.ltv) * f.myShare);
  const cash = price - myEquity;
  const gain = price - book;
  // 取得報酬。運用会社としての稼ぎで、**売却益とは別に立つ**
  const acq = Math.round(price * t.acqFee);
  g.cash += cash + acq;
  g.finance.quarterAcc.gainSale += gain;
  g.finance.quarterAcc.revFee += acq;
  f.equity = (f.equity || 0) + myEquity;
  f.contributed = (f.contributed || 0) + price;
  f.cumFee = (f.cumFee || 0) + acq;

  if (!silent && news) {
    news.push({
      icon: '🧾', type: 'fin', major: true,
      text: `【${f.name}】に${picked.length}物件・${Math.round(price / 100).toLocaleString()}億円を追加拠出した。`
        + `${Math.round(cash / 100).toLocaleString()}億円を回収し、`
        + `売却${gain >= 0 ? '益' : '損'}${Math.round(Math.abs(gain) / 100).toLocaleString()}億円を計上。`,
    });
  }
  return { price, cash, gain, equity: myEquity };
}

/**
 * 毎週の処理。
 * 運用報酬と配当は四半期に1回まとめて入れる（毎週入れると端数で消える）。
 */
export function stepFunds(g, rng, news) {
  if (!g.funds || !g.funds.length) return;
  for (const f of g.funds) {
    if (f.status !== 'active') continue;
    // ファンドが持つ物件のNOIと価格も、市況につれて動く
    if (g.week % WEEKS_PER_QUARTER === 0) {
      const drift = 1 + (g.market.sentiment - 0.5) * 0.02;
      for (const x of f.assets) { x.noi = Math.round(x.noi * drift); x.price = Math.round(x.price * drift); }
      const fee = Math.round(fundFee(g, f) / 4);
      const div = Math.round(fundDividend(g, f) / 4);
      g.cash += fee + div;
      g.finance.quarterAcc.revFee += fee;
      g.finance.quarterAcc.revOther += div;
      f.cumFee = (f.cumFee || 0) + fee;
      f.cumDiv = (f.cumDiv || 0) + div;
      // 出資持分も資産価値につれて動かす
      f.equity = Math.round(fundAUM(f) * f.myShare);
    }
    // 第三者からの物件取得。投資家の資金で買うので自社の現金は出ない
    if (g.week % WEEKS_PER_QUARTER === 0) growExternal(g, f, rng, news);
    // 期限のあるファンドは解散して出口を迎える
    if (f.endWeek && g.week >= f.endWeek) dissolveFund(g, f, rng, news);
  }
}

/**
 * 第三者から物件を取得してファンドを大きくする。
 *
 * **これがスポンサーの本当の稼ぎである。** 自社の物件を入れ続けなくても、
 * 投資家の資金で買った物件にも運用報酬と取得報酬がかかる。
 * そのかわり出資は投資家が出すので、**自社の持分比率は薄まる**（`shareNow`）。
 *
 * **自社が何も入れていないのに太らせないこと。** 外から買える額は
 * 自社が拠出した額の `EXTERNAL_CAP` 倍までである。
 * 器を1つ作って放置するのが最適手にならないようにしてある。
 */
export function growExternal(g, f, rng, news) {
  const t = typeOf(f.type);
  if (!t.growth || !rng) return;
  const room = (f.contributed || 0) * EXTERNAL_CAP - externalAUM(f);
  if (room < 2000) return;
  // 市況が悪い年は投資家も動かない
  const heat = 0.45 + clamp01(g.market.sentiment) * 1.1;
  if (!rng.chance(t.growth * heat)) return;

  const price = Math.round(Math.min(room, fundAUM(f) * rng.range(0.05, 0.16)));
  if (price < 1500) return;
  // 取得する物件の利回りは、ファンドの既存物件と同じ帯で引く
  const cap = fundAUM(f) > 0 ? fundNOI(g, f) / fundAUM(f) : 0.05;
  f.assets.push({
    assetId: null, cellId: null, external: true,
    name: `第三者取得（${rng.int(1, 4)}物件）`, district: null, use: 'office',
    nra: 0, gfa: 0, price, noi: Math.round(price * cap * rng.range(0.96, 1.06)), week: g.week,
  });
  const acq = Math.round(price * t.acqFee);
  g.cash += acq;
  g.finance.quarterAcc.revFee += acq;
  f.cumFee = (f.cumFee || 0) + acq;
  news && news.push({
    icon: '📥', type: 'fin',
    text: `【${f.name}】が第三者から${Math.round(price / 100).toLocaleString()}億円の物件を取得した。`
      + `運用資産は${Math.round(fundAUM(f) / 100).toLocaleString()}億円に。`
      + `取得報酬${Math.round(acq / 100).toLocaleString()}億円を受け取り、当社の持分は${(shareNow(g, f) * 100).toFixed(1)}%になった。`,
  });
}

/**
 * 私募ファンドの解散（出口）。
 * 物件を市場で売り、持分に応じて売却益が返る。
 *
 * **物件を自社に戻さないこと。** 戻すと「7年寝かせて取り返す」だけの仕組みになり、
 * オフバランスの意味が無くなる。買うのは市場の投資家である。
 */
export function dissolveFund(g, f, rng, news) {
  const aum = fundAUM(f);
  const t = typeOf(f.type);
  const debt = aum * t.ltv;
  // 出口の値付けは市況次第
  const exit = Math.round(aum * (0.95 + clamp01(g.market.sentiment) * 0.14) * (rng ? rng.range(0.97, 1.04) : 1));
  const proceeds = Math.round((exit - debt) * shareNow(g, f));
  const gain = proceeds - fundEquityOf(f);
  g.cash += proceeds;
  g.finance.quarterAcc.gainSale += gain;
  // ファンドが持っていた区画は市場（他の投資家）に渡る。
  // **`g.cells.find()` で毎回探さないこと。** 同じ区画を何度も引いてしまう。
  // 拠出のときに控えた `cellId` で1件ずつ突き合わせる
  for (const x of f.assets) {
    const cell = g.cells.find(c => c.id === x.cellId);
    if (!cell || cell.fundId !== f.id) continue;
    cell.fundId = null;
    cell.owner = 'other';
    if (cell.building) cell.building.owner = 'other';
  }
  f.status = 'closed';
  f.closedWeek = g.week;
  f.exitPrice = exit;
  f.equity = 0;
  news && news.push({
    icon: '🏁', type: 'fin', major: true,
    text: `【${f.name}】が運用期間を終えて解散した。保有${f.assets.length}物件を`
      + `${Math.round(exit / 100).toLocaleString()}億円で売却し、持分ぶん`
      + `${Math.round(proceeds / 100).toLocaleString()}億円を回収（${gain >= 0 ? '益' : '損'}`
      + `${Math.round(Math.abs(gain) / 100).toLocaleString()}億円）。`
      + `運用期間中の報酬と配当は累計${Math.round(((f.cumFee || 0) + (f.cumDiv || 0)) / 100).toLocaleString()}億円。`,
  });
}

/** 表示用：ファンド全体のまとめ */
export function fundSummary(g) {
  const active = (g.funds || []).filter(f => f.status === 'active');
  let aum = 0, fee = 0, div = 0, eq = 0, n = 0, cum = 0, ext = 0;
  for (const f of active) {
    aum += fundAUM(f); fee += fundFee(g, f); div += fundDividend(g, f);
    eq += fundEquityOf(f); n += f.assets.filter(x => !x.external).length;
    ext += externalAUM(f);
  }
  for (const f of g.funds || []) cum += (f.cumFee || 0) + (f.cumDiv || 0);
  return { count: active.length, aum, fee, div, equity: eq, assets: n, cum, external: ext };
}
