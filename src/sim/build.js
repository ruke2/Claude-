// ============================================================
//  ゼネコン選定と環境認証
//
//    着工のときに「誰に建てさせるか」と「環境認証を取るか」を決める。
//
//    なぜ要るか。これまで着工の判断は用途とグレードだけで、
//    総事業費と工期は与えられた数字でしかなかった。
//    実際のデベロッパーは、同じ計画でも発注先で事業費が1割動くし、
//    環境認証を取るかどうかでテナントの顔ぶれが変わる。
//
//    **安いゼネコンを「ただ得」にしないこと。**
//    請負金額は安くても、工期が延び、工事中の事故や増額が増え、
//    出来上がりの質が落ちる。そして手に余る規模の仕事は受けきれない。
//
//    **環境認証も「ただ得」にしないこと。**
//    賃料のプレミアムと建設費の上乗せはほぼ釣り合わせてある。
//    効いてくるのは、大口テナントの目線・表彰・格付けの見通しといった、
//    その場の収支には出てこないところである。
// ============================================================
import { clamp, clamp01 } from '../core/format.js';

/**
 * ゼネコン。
 *
 * `empId` は `data/employers.js` の就職先と同じ会社である
 * （就職先ランキングで見た会社に発注する、という繋がりを出すため）。
 *
 * cost    … 請負金額の倍率
 * weeks   … 工期の倍率
 * quality … 出来上がりの質（0〜1）。収益と、表彰・テナントの目線に効く
 * risk    … 工事中の悪いできごとの起きやすさ（1.00 が標準）
 * cap     … 同時に受けられる自社案件の数
 * fitGfa  … 得意な規模の上限（坪）。これを超えると割高になり、工程も乱れる
 * sizeMul … 規模が手に余ったときの跳ね返りの大きさ
 */
export const BUILDERS = [
  {
    id: 'obashi', name: '大橋組', short: '大橋', empId: 'obashi', tier: 'スーパーゼネコン',
    cost: 1.055, weeks: 0.94, quality: 0.93, risk: 0.62, cap: 5, fitGfa: 200000, sizeMul: 0.05,
    desc: '業界最大手。超高層と大規模再開発の実績が厚く、工程も品質も揺れない。請負金額は最も高い。',
  },
  {
    id: 'kajiyama', name: '梶山建設', short: '梶山', empId: 'kajiyama', tier: 'スーパーゼネコン',
    cost: 1.025, weeks: 0.97, quality: 0.85, risk: 0.72, cap: 5, fitGfa: 120000, sizeMul: 0.08,
    desc: '大橋組と並ぶ大手。設計施工一貫の提案力に定評があり、複雑な用途構成に強い。',
  },
  {
    id: 'takanawa', name: '高縄組', short: '高縄', tier: '準大手',
    cost: 1.000, weeks: 1.00, quality: 0.72, risk: 0.92, cap: 4, fitGfa: 60000, sizeMul: 0.16,
    desc: '準大手の中核。可もなく不可もなく、どの用途でも標準的にまとめる。中規模までが本領である。',
  },
  {
    id: 'shinwa', name: '新和建設', short: '新和', tier: '準大手',
    cost: 0.975, weeks: 1.05, quality: 0.64, risk: 1.06, cap: 3, fitGfa: 30000, sizeMul: 0.24,
    desc: '価格で勝負する準大手。工程は後ろ倒しになりがちだが、事業費は確実に抑えられる。',
  },
  {
    id: 'kitami', name: '北見工務店', short: '北見', tier: '中堅',
    cost: 0.940, weeks: 1.13, quality: 0.52, risk: 1.30, cap: 2, fitGfa: 12000, sizeMul: 0.34,
    desc: '中堅。請負金額は最も安いが、手持ち工事が重なると工程が乱れる。大規模には向かない。',
  },
];

export const builderById = id => BUILDERS.find(b => b.id === id) || null;

/** 既定の発注先（何も選ばなかったとき） */
export const DEFAULT_BUILDER = 'takanawa';

/**
 * 環境認証。
 * 架空の「建築環境性能評価機構」が出す「グリーンビル認証」である。
 *
 * cost  … 建設費の上乗せ率
 * weeks … 設計・申請のぶん延びる週数
 * rent  … 賃料・資産価値のプレミアム（分譲単価には SALE_RATE を掛けて効かせる）
 * occ   … 稼働率の底上げ（`sales.js`）
 * brand … 竣工時の会社ブランド加算
 * merit … 表彰の評点（`awards.js` の `meritOf`）
 * grade … 大口テナントから見た建物の格（`tenants.js` の `qualityOf`）
 * min   … 取得に必要な最低グレード
 *
 * **`cost` と `rent` を素朴に釣り合わせないこと。**
 * 建設費は総事業費の一部（平均 64%）だが、賃料プレミアムは完成時の価値
 * （総事業費の1.3〜1.4倍）にそのまま乗る。同じ率を置くと認証が一方的に得になり、
 * 実測で利益率が プラチナ +1.12pt も跳ねていた。
 *
 * 釣り合いは次の式で見る（賃貸の場合）。
 *   利益率の変化 ≒ (1 − 利益率) × ( rent − cost × 建設費比率 )
 * いまは計画段階の利益率が **わずかに沈む**（プラチナで −0.5pt 前後）ように置いてある。
 * 取り返すのは稼働率・大口テナントの目線・表彰・格付けの見通しである。
 *
 * **釣り合いを1つの区画だけで測らないこと。** 建設費比率は土地の高い都心で4割、
 * 地方で7割を超える。常盤の1区画だけで測ると −0.37pt に見えたものが、
 * 全都市で測ると −2.21pt だった。
 */
export const CERTS = [
  { id: 'none', name: '認証を取得しない', short: '—', cost: 0, weeks: 0, rent: 0, occ: 0, brand: 0, merit: 0, grade: 0,
    desc: '環境認証を取らない。建設費も工期も増えないが、環境性能を重く見るテナントの候補からは外れる。' },
  { id: 'bronze', name: 'グリーンビル認証 ブロンズ', short: 'ブロンズ', cost: 0.014, weeks: 2, rent: 0.007, occ: 0.006, brand: 0.5, merit: 3, grade: 0.03,
    desc: '断熱と設備の基本性能を満たす。取りやすく、費用もほとんどかからない。' },
  { id: 'silver', name: 'グリーンビル認証 シルバー', short: 'シルバー', cost: 0.030, weeks: 5, rent: 0.016, occ: 0.014, brand: 1.2, merit: 7, grade: 0.07,
    desc: '高効率の空調と照明制御を入れる。大手テナントの選定基準に並ぶ水準である。' },
  { id: 'gold', name: 'グリーンビル認証 ゴールド', short: 'ゴールド', cost: 0.050, weeks: 9, rent: 0.027, occ: 0.024, brand: 2.4, merit: 12, grade: 0.12, min: 'high',
    desc: '再生可能エネルギーの導入と徹底した省エネ設計。上場企業のオフィス選定で優位に立つ。' },
  { id: 'platinum', name: 'グリーンビル認証 プラチナ', short: 'プラチナ', cost: 0.078, weeks: 14, rent: 0.044, occ: 0.036, brand: 4.0, merit: 18, grade: 0.18, min: 'high',
    desc: '実質ゼロエネルギー。取得に時間も金もかかるが、街の看板になる。' },
];

export const certById = id => CERTS.find(c => c.id === id) || CERTS[0];

/** 分譲単価に効かせるときの割引率。買う人は借りる人ほど環境性能に払わない */
const SALE_RATE = 0.55;

/** グレードの順序（認証の下限判定に使う） */
const GRADE_ORDER = ['standard', 'high', 'luxury'];

/** そのグレードで取れる認証か */
export function certAvailable(cert, gradeId) {
  if (!cert.min) return true;
  return GRADE_ORDER.indexOf(gradeId) >= GRADE_ORDER.indexOf(cert.min);
}

/** いまその会社が抱えている、そのゼネコンの工事の数 */
export function builderLoad(g, id) {
  return (g.projects || []).filter(pj => pj.status === 'construction' && pj.builderId === id).length;
}

/** 受注枠が空いているか。理由を返す（空いていれば null） */
export function builderBusy(g, id) {
  const b = builderById(id);
  if (!b) return null;
  const n = builderLoad(g, id);
  return n >= b.cap ? `${b.name}は当社の工事を${n}件抱えており、これ以上は受けられない` : null;
}

/** 発注実績（0〜1）。積むほど値引きが効き、工程も落ち着く */
export function relOf(g, id) {
  return clamp01(((g.builderRel || {})[id] || 0));
}

/** 着工したときに実績を積む */
export function recordOrder(g, id) {
  if (!id) return;
  g.builderRel = g.builderRel || {};
  g.builderRel[id] = clamp01((g.builderRel[id] || 0) + 0.12);
}

/**
 * 規模が手に余ったときの割増。
 * 得意な規模（`fitGfa`）を超えたぶんだけ、請負金額と工事の荒れ方が効いてくる。
 * **桁で効かせること。** 線形だと、中堅に10万坪を出しても数%しか変わらない
 */
export function sizePenalty(b, gfa) {
  if (!b || !(gfa > 0)) return 1;
  const over = Math.log10(Math.max(1, gfa) / b.fitGfa);
  return over <= 0 ? 1 : 1 + over * (b.sizeMul || 0.15);
}

/** 出来上がりの質が収益に効く倍率 */
export function qualityMul(b, g) {
  if (!b) return 1;
  return 0.94 + b.quality * 0.09;
}

/**
 * 発注先と認証を事業計画に織り込む。
 * `project.js` の `applyProgram()` / `applyRebuild()` と同じ位置で呼ぶ。
 *
 * **`plan.totalCost` を出す前に呼ぶこと。** あとから呼ぶと
 * 利益率と開発利回りが古い建設費のまま残る。
 */
export function applyBuild(g, plan, opt = {}) {
  const b = builderById(opt.builderId || DEFAULT_BUILDER);
  const cert = certById(opt.certId || 'none');
  if (!b) return;

  const pen = sizePenalty(b, plan.gfa);
  const rel = relOf(g, b.id);
  // 繰り返し発注すると値引きが効く（最大 3.5%）
  const costMul = b.cost * pen * (1 - rel * 0.035) * (1 + cert.cost);
  const weekMul = b.weeks * (1 + (pen - 1) * 0.6);

  const before = plan.buildCost;
  plan.buildCost = Math.round(plan.buildCost * costMul);
  plan.builderCost = plan.buildCost - before;
  plan.certCost = Math.round(before * b.cost * pen * (1 - rel * 0.035) * cert.cost);
  plan.weeks = Math.max(8, Math.round(plan.weeks * weekMul) + cert.weeks);

  // 出来上がりの質と環境性能が、賃料と単価に乗る
  const qm = qualityMul(b, g);
  const rentMul = qm * (1 + cert.rent);
  const saleMul = qm * (1 + cert.rent * SALE_RATE);
  if (plan.rent) plan.rent = Math.round(plan.rent * rentMul);
  if (plan.noi) plan.noi = Math.round(plan.noi * rentMul);
  if (plan.assetValue) plan.assetValue = Math.round(plan.assetValue * rentMul);
  if (plan.salePrice) plan.salePrice = plan.salePrice * saleMul;
  if (plan.saleRevenue) plan.saleRevenue = Math.round(plan.saleRevenue * saleMul);

  plan.builder = b;
  plan.cert = cert;
  plan.builderId = b.id;
  plan.certId = cert.id;
  plan.sizePenalty = pen;
}

// ------------------------------------------------------------
//  竣工したあとに効くもの
//    保有資産・分譲在庫は `a.certId` と `a.builderId` を持つ。
//    古いセーブには無いので、どの読み手も必ず既定値に落ちるようにする
// ------------------------------------------------------------

/** 稼働率の底上げ（`sales.js` が読む） */
export function certOccBonus(a) {
  return certById(a && a.certId).occ;
}

/** 表彰の評点への加算（`awards.js` が読む） */
export function certMerit(a) {
  const c = certById(a && a.certId);
  const b = builderById(a && a.builderId);
  // 施工の質も作品の評価に入る
  return c.merit + (b ? Math.round((b.quality - 0.72) * 18) : 0);
}

/** 大口テナントから見た建物の格への加算（`tenants.js` が読む） */
export function certGradeBonus(a) {
  const c = certById(a && a.certId);
  const b = builderById(a && a.builderId);
  return c.grade + (b ? (b.quality - 0.72) * 0.10 : 0);
}

/**
 * 認証を取得した床の割合（延床ベース）。
 * 格付けの見通し（`ir.js`）が読む。
 * **棟数で数えないこと。** 小さな倉庫にブロンズを付けて回れば
 * 比率だけ上がってしまう
 */
export function greenShare(g) {
  let all = 0, green = 0;
  for (const a of (g.assets || []).concat(g.inventory || [])) {
    const gfa = a.gfa || a.nra || a.area || 0;
    if (!(gfa > 0)) continue;
    all += gfa;
    const c = certById(a.certId);
    if (c.id !== 'none') green += gfa * (c.id === 'bronze' ? 0.5 : c.id === 'silver' ? 0.8 : 1);
  }
  return all > 0 ? clamp01(green / all) : 0;
}

/** 表示用：いまの発注状況 */
export function builderStatus(g) {
  return BUILDERS.map(b => ({
    ...b,
    load: builderLoad(g, b.id),
    rel: relOf(g, b.id),
    busy: !!builderBusy(g, b.id),
  }));
}
