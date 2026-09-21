// ============================================================
//  IR — 格付け会社のレポートと、決算説明会
//    数字は同じでも、どう説明するかで市場の受け取りは変わる。
// ============================================================
import { clamp, clamp01 } from '../core/format.js';
import { ratingOf, buildBS, overdraft, debtCapacity } from './finance.js';
import { planProgress } from './midplan.js';
import { greenShare } from './build.js';

// ------------------------------------------------------------
//  格付け会社のレポート
// ------------------------------------------------------------
/** 見通し */
export const OUTLOOKS = {
  positive: { id: 'positive', name: 'ポジティブ', tone: 'green', spread: -0.0015, desc: '次の見直しで格上げの可能性がある。' },
  stable: { id: 'stable', name: '安定的', tone: 'grey', spread: 0, desc: '当面、格付けの変更は想定していない。' },
  negative: { id: 'negative', name: 'ネガティブ', tone: 'red', spread: 0.0022, desc: '次の見直しで格下げの可能性がある。' },
};

/** 格付け会社（架空） */
export const AGENCY = { name: '湊都格付投資情報センター', short: 'MRI' };

/**
 * 見通しを決める材料。
 * 格付けそのものは自己資本比率で決まるが、
 * 見通しは「これからどちらに動きそうか」を見る。
 */
export function outlookFactors(g) {
  // ここで kpis() を呼ばないこと。
  // kpis → effectiveRate → outlookSpread → ここ、と一周して無限再帰になる
  const bs = g.finance.bs || buildBS(g);
  const equityRatio = bs.total > 0 ? bs.equity / bs.total : 0;
  const h = g.finance.history.slice(-4);
  const prev = g.finance.history.slice(-8, -4);
  const rev = h.reduce((a, x) => a + x.pl.revenue, 0);
  const prevRev = prev.reduce((a, x) => a + x.pl.revenue, 0);
  const op = h.reduce((a, x) => a + x.pl.op, 0);
  const prevOp = prev.reduce((a, x) => a + x.pl.op, 0);
  const growth = prevRev > 0 ? rev / prevRev - 1 : 0;
  const opTrend = prevOp !== 0 ? (op - prevOp) / Math.abs(prevOp) : (op > 0 ? 1 : 0);
  const losses = h.filter(x => x.pl.net < 0).length;
  const od = overdraft(g);
  const room = Math.max(0, debtCapacity(g) - g.debt);
  const green = greenShare(g);
  const hasStock = (g.assets || []).length >= 4;

  return [
    { id: 'equity', name: '自己資本比率', v: equityRatio, good: equityRatio >= 0.34, bad: equityRatio < 0.20,
      text: equityRatio >= 0.34 ? '資本の厚みは十分である。' : equityRatio < 0.20 ? '資本が薄く、外部環境の変化に耐える余力が乏しい。' : '資本の厚みは標準的である。' },
    { id: 'profit', name: '収益の安定性', v: losses, good: losses === 0 && op > 0, bad: losses >= 2,
      text: losses === 0 && op > 0 ? '直近4四半期はいずれも黒字を確保している。' : losses >= 2 ? `直近4四半期のうち${losses}期が赤字であり、収益基盤に不安が残る。` : '収益は概ね安定しているが、期による振れがある。' },
    { id: 'growth', name: '事業の拡大', v: growth, good: growth > 0.12, bad: growth < -0.08,
      text: growth > 0.12 ? `売上高は前年同期比 +${(growth * 100).toFixed(0)}% と順調に拡大している。` : growth < -0.08 ? `売上高は前年同期比 ${(growth * 100).toFixed(0)}% と縮小しており、事業基盤の弱まりが懸念される。` : '事業規模はほぼ横ばいで推移している。' },
    { id: 'margin', name: '利益率の方向', v: opTrend, good: opTrend > 0.15, bad: opTrend < -0.2,
      text: opTrend > 0.15 ? '営業利益は改善傾向にある。' : opTrend < -0.2 ? '営業利益が悪化しており、原価管理に課題がある。' : '利益水準に大きな変化はない。' },
    { id: 'liquidity', name: '流動性', v: room, good: od === 0 && room > rev * 0.3, bad: od > 0,
      text: od > 0 ? '借入枠を超過しており、資金繰りに強い警戒を要する。' : room > rev * 0.3 ? '調達余力は厚く、手元流動性に懸念はない。' : '調達余力はやや限られている。' },
    { id: 'green', name: '環境性能', v: green, good: green >= 0.45, bad: green < 0.10 && hasStock,
      text: green >= 0.45 ? '保有物件の環境認証取得が進んでおり、規制強化とテナント需要の変化に耐性がある。'
        : green < 0.10 && hasStock ? '環境認証の取得がほとんど進んでおらず、将来の陳腐化リスクを織り込む必要がある。'
          : '環境認証の取得は途上にある。' },
    { id: 'lease', name: 'ストック収益', v: (g.assets || []).length, good: (g.assets || []).length >= 8, bad: (g.assets || []).length === 0,
      text: (g.assets || []).length >= 8 ? '賃貸ストックからの安定収益が下支えとなっている。' : (g.assets || []).length === 0 ? '分譲に依存しており、市況悪化時の緩衝材がない。' : '賃貸ストックの積み上がりは途上にある。' },
  ];
}

/** 見通しを判定する */
export function outlookOf(g) {
  const f = outlookFactors(g);
  const good = f.filter(x => x.good).length;
  const bad = f.filter(x => x.bad).length;
  // 決算説明会での説明ぶりも、わずかに効く
  const ir = clamp(g.company.irTrust || 0, -1, 1);
  const net = good - bad * 1.35 + ir * 0.9;
  if (net >= 2.2) return OUTLOOKS.positive;
  if (net <= -1.2) return OUTLOOKS.negative;
  return OUTLOOKS.stable;
}

/** 見通しによる金利の上乗せ */
export function outlookSpread(g) { return outlookOf(g).spread; }

/**
 * 四半期ごとのレポートを作る。
 * 格付けの変更があればニュースに出す。
 */
export function stepRating(g, news) {
  const r = ratingOf(g);
  const o = outlookOf(g);
  const prev = g.ratingReport;
  const f = outlookFactors(g);
  const bs = g.finance.bs || buildBS(g);

  const rep = {
    year: g.year, q: g.quarter, week: g.week,
    rating: r.id, outlook: o.id,
    agency: AGENCY.name,
    summary: buildSummary(g, r, o, f),
    factors: f.map(x => ({ id: x.id, name: x.name, good: x.good, bad: x.bad, text: x.text })),
    equityRatio: bs.total > 0 ? bs.equity / bs.total : 0,
    de: bs.equity > 0 ? g.debt / bs.equity : 0,
    rate: g.market.rate + r.spread + o.spread,
  };
  g.ratingReport = rep;
  g.ratingHistory = g.ratingHistory || [];
  g.ratingHistory.push({ year: g.year, q: g.quarter, rating: r.id, outlook: o.id });
  if (g.ratingHistory.length > 60) g.ratingHistory.shift();

  if (prev && prev.rating !== r.id) {
    const up = RANK_ORDER.indexOf(r.id) < RANK_ORDER.indexOf(prev.rating);
    news && news.push({
      icon: up ? '⬆' : '⬇', type: 'fin', major: true,
      text: `${AGENCY.name}は当社の格付けを ${prev.rating} から ${r.id} に${up ? '引き上げた' : '引き下げた'}。`
        + `見通しは「${o.name}」。${up ? '調達コストが下がる。' : '調達コストが上がる。'}`,
    });
  } else if (prev && prev.outlook !== o.id) {
    news && news.push({
      icon: o.id === 'positive' ? '📈' : o.id === 'negative' ? '📉' : '📄',
      type: 'fin', major: o.id === 'negative',
      text: `${AGENCY.name}は当社の格付け見通しを「${OUTLOOKS[prev.outlook].name}」から「${o.name}」に変更した。${o.desc}`,
    });
  }
  return rep;
}

const RANK_ORDER = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC'];

function buildSummary(g, r, o, f) {
  const bad = f.filter(x => x.bad);
  const good = f.filter(x => x.good);
  const head = `当社は${g.company.name}の長期発行体格付けを「${r.id}」、見通しを「${o.name}」とする。`;
  const body = good.length ? good.slice(0, 2).map(x => x.text).join('') : '';
  const risk = bad.length ? `一方で、${bad.slice(0, 2).map(x => x.text).join('')}` : '';
  const tail = o.id === 'positive' ? '今後1〜2年で収益基盤の厚みが確認できれば、格上げを検討する。'
    : o.id === 'negative' ? '財務規律の回復が確認できない場合、格下げを検討する。'
      : '当面、格付けの変更は想定していない。';
  return head + body + risk + tail;
}

// ------------------------------------------------------------
//  決算説明会
// ------------------------------------------------------------
/**
 * アナリストの質問。
 * 状況に応じて出る質問が変わり、答え方で市場の受け取りが変わる。
 *  answers: { label, trust, brand, price, text }
 *    trust … IR信頼度（格付け見通しと株価に効く）
 */
export function questionsFor(g) {
  const h = g.finance.history;
  const last = h[h.length - 1];
  const prev = h[h.length - 5];
  const qs = [];

  const revDown = prev && last && last.pl.revenue < prev.pl.revenue * 0.92;
  const opNeg = last && last.pl.op < 0;
  const od = overdraft(g) > 0;

  if (opNeg) {
    qs.push({
      id: 'op', who: '機関投資家',
      q: '今期の営業赤字について、一時的なものなのか、構造的なものなのか。見解を伺いたい。',
      answers: [
        { label: '一時的な要因であり、来期には戻ると説明する', trust: -0.35, brand: 0, price: 0.03,
          say: '今期の赤字は竣工のタイミングによる一時的なものであり、来期には回復する見込みである。',
          after: '市場は額面どおりには受け取らなかった。次の決算で戻らなければ、信頼は大きく削られる。' },
        { label: '原価管理に課題があったと率直に認める', trust: 0.42, brand: -1.2, price: -0.025,
          say: '建設費の上昇を価格に転嫁しきれなかった。原価管理の甘さであり、責任は経営にある。',
          after: '株価は下げたが、説明の率直さは評価された。' },
        { label: '質問には直接答えず、中長期の成長を語る', trust: -0.5, brand: -0.6, price: -0.01,
          say: '当社は中長期の企業価値向上を目指しており、単年度の数字に一喜一憂していない。',
          after: '会場の空気が冷えた。アナリストは同じ質問を繰り返すことになる。' },
      ],
    });
  }
  if (revDown) {
    qs.push({
      id: 'rev', who: '証券アナリスト',
      q: '売上高が前年同期を下回っている。供給戸数の計画に変更はないのか。',
      answers: [
        { label: '計画は変えない。仕込みは進んでいると説明する', trust: 0.2, brand: 0.3, price: 0.02,
          say: '用地の仕込みは計画どおり進んでおり、引き渡し時期のずれによるものである。',
          after: '手元の用地が本当にあるかどうかを、次の四半期で見られることになる。' },
        { label: '市況を踏まえ、あえて供給を絞っていると説明する', trust: 0.3, brand: 0.2, price: -0.005,
          say: '高値掴みを避けるため、意図的に取得を抑えている。無理に数字を作るつもりはない。',
          after: '規律ある姿勢として受け止められた。' },
      ],
    });
  }
  if (od) {
    qs.push({
      id: 'debt', who: '銀行系アナリスト',
      q: '有利子負債が借入枠を超過している。財務規律についてどう考えているか。',
      answers: [
        { label: '保有物件の一部売却で圧縮すると明言する', trust: 0.45, brand: -0.4, price: 0.02,
          say: '保有資産の一部を売却し、次の1年でD/Eレシオを正常化させる。',
          after: '具体策を示したことで、当面の懸念は和らいだ。実行しなければ跳ね返る。' },
        { label: '不動産事業の性質上、問題ないと説明する', trust: -0.55, brand: -0.3, price: -0.04,
          say: '不動産事業は資産を持つ業態であり、この水準の負債は問題ではない。',
          after: '格付け会社の目が厳しくなった。' },
      ],
    });
  }
  if (g.midPlan) {
    const pr = planProgress(g, g.midPlan);
    const late = pr < 0.45;
    qs.push({
      id: 'plan', who: '長期保有の投資家',
      q: `中期経営計画「${g.midPlan.name}」の進捗は${(pr * 100).toFixed(0)}%である。達成の確度をどう見ているか。`,
      answers: late
        ? [
          { label: '目標は下方修正せず、やり切ると宣言する', trust: 0.3, brand: 0.8, price: 0.035,
            say: '掲げた数字は下ろさない。残りの期間で必ず届かせる。',
            after: '覚悟は伝わった。届かなければ、その反動も大きい。' },
          { label: '前提が変わったとして、計画の見直しを示唆する', trust: -0.25, brand: -1.4, price: -0.03,
            say: '市況の前提が変わっており、計画の見直しも選択肢である。',
            after: '掲げた数字を自ら緩めたことで、計画そのものの重みが落ちた。' },
        ]
        : [
          { label: '進捗は計画線上にあると説明する', trust: 0.35, brand: 0.6, price: 0.03,
            say: '進捗は計画線上にある。残る課題は明確で、手は打ってある。',
            after: '落ち着いた説明として受け止められた。' },
          { label: '上振れの可能性にも言及する', trust: 0.1, brand: 0.4, price: 0.05,
            say: '足元の受注環境を踏まえれば、計画を上回る可能性もある。',
            after: '株価は跳ねたが、期待も上がった。' },
        ],
    });
  }
  // 平時の定番
  qs.push({
    id: 'strategy', who: '業界紙の記者',
    q: '今後、どの領域に資本を振り向けるのか。方針を伺いたい。',
    answers: [
      { label: '賃貸ストックの積み上げを最優先だと答える', trust: 0.25, brand: 0.5, price: 0.015,
        say: '賃貸ストックを積み上げ、収益の振れを小さくすることを最優先とする。',
        after: '安定志向として受け止められた。' },
      { label: '分譲の回転で利益を最大化すると答える', trust: 0.1, brand: 0.2, price: 0.03,
        say: '資本効率を重視し、分譲の回転で利益を最大化する。',
        after: '成長期待は上がったが、市況が崩れたときの脆さも意識された。' },
      { label: '人と組織への投資だと答える', trust: 0.2, brand: 0.9, price: -0.005,
        say: 'この事業は人がすべてである。採用と育成に資本を振り向ける。',
        after: '短期の株価には効かないが、採用市場での評判は上がった。' },
    ],
  });

  return qs.slice(0, 3);
}

/** 回答を反映する */
export function answerQuestion(g, q, a, news) {
  g.company.irTrust = clamp((g.company.irTrust || 0) + a.trust * 0.45, -1, 1);
  g.company.brand = clamp(g.company.brand + a.brand, 0, 100);
  g.company.irPrice = clamp((g.company.irPrice || 0) + a.price, -0.12, 0.12);
  if (a.brand >= 0.8) {
    for (const s of g.staff) s.morale = clamp01(s.morale + 0.02);
  }
  return a.after;
}

/** 説明会が終わったときの後始末 */
export function closeBriefing(g, news) {
  g.company.irLastWeek = g.week;
  const t = g.company.irTrust || 0;
  news && news.push({
    icon: '🎙', type: 'fin',
    text: `${g.year}年第${g.quarter}四半期の決算説明会を終えた。`
      + (t > 0.35 ? '説明は好意的に受け止められ、市場の信頼は厚くなっている。'
        : t < -0.3 ? '説明に対する市場の目は厳しい。次の四半期で結果を示す必要がある。'
          : '市場の受け止めは中立的である。'),
  });
}

/** 説明会での受け答えが株価に与える係数 */
export function irPremium(g) {
  return clamp(1 + (g.company.irPrice || 0) + (g.company.irTrust || 0) * 0.035, 0.85, 1.15);
}

/** 信頼度は放っておくと中立に戻る（週次） */
export function decayIr(g) {
  g.company.irTrust = (g.company.irTrust || 0) * 0.994;
  g.company.irPrice = (g.company.irPrice || 0) * 0.985;
}
