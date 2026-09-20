// ============================================================
//  会社の成長段階 — 地盤（得意な土地）と、売上に応じた解禁
// ============================================================
// ------------------------------------------------------------
//  地盤（ホームグラウンド）
//    その街で何十年もやってきた会社は、地元の地権者にも
//    行政にも顔が利く。三陵地所にとっての常盤、
//    東洋急行にとっての北野がそれにあたる。
// ------------------------------------------------------------
export const HOME = {
  price: 1.035,      // 分譲単価・募集賃料の上乗せ
  occupancy: 0.025,  // 稼働率の上乗せ
  bidQuality: 16,    // 提案コンペでの評価点の上乗せ
  bidPower: 1.06,    // 入札で出せる金額の上限が少し伸びる
  info: 0.30,        // 売却情報が地盤から持ち込まれる割合
};

/** その地区が自社の地盤か */
export function isHome(g, districtId) {
  return !!districtId && g && g.company && g.company.home === districtId;
}

/** 地盤による商品力の倍率（分譲単価・募集賃料） */
export function homeMul(g, districtId) {
  return isHome(g, districtId) ? HOME.price : 1;
}

// ------------------------------------------------------------
//  成長段階（売上高に応じた解禁）
//    直近4四半期の売上高で段階が決まる。
//    一度届いた段階は下がらない（g.unlocked に積む）。
// ------------------------------------------------------------
export const TIERS = [
  {
    id: 'startup', name: '新興デベロッパー', rev: 0,
    unlock: [], desc: '用地を仕入れ、建てて、売る。まずはここから。',
  },
  {
    id: 'mid', name: '中堅デベロッパー', rev: 30000,          // 売上 300億円
    unlock: ['brand'],
    desc: '自社ブランドを立ち上げられるようになる。',
  },
  {
    id: 'major', name: '準大手', rev: 90000,                  // 売上 900億円
    unlock: ['sub'],
    desc: '子会社を設立して、施工・販売・管理を内製化できる。',
  },
  {
    id: 'big', name: '大手', rev: 240000,                     // 売上 2,400億円
    unlock: ['ma'],
    desc: '他社を買収できる。のれんと統合の巧拙が問われる。',
  },
  {
    id: 'top', name: '業界大手', rev: 600000,                 // 売上 6,000億円
    unlock: ['public'],
    desc: '自治体の公募型プロポーザルに参加できる。',
  },
  {
    id: 'giant', name: '総合デベロッパー', rev: 1400000,      // 売上 1兆4,000億円
    unlock: ['city2'],
    desc: '湊都市の外へ出られる。鶴見野市への進出が解禁される。',
  },
  {
    id: 'national', name: '全国デベロッパー', rev: 2400000,   // 売上 2兆4,000億円
    unlock: ['city3'],
    desc: '観光地に足場を築ける。陽ノ浦市への進出が解禁される。',
  },
  {
    id: 'apex', name: '業界の顔', rev: 4000000,               // 売上 4兆円
    unlock: ['city4'],
    desc: '地方中枢都市にも出られる。八雲市への進出が解禁される。',
  },
  {
    id: 'legend', name: '不動産の巨人', rev: 6000000,         // 売上 6兆円
    unlock: ['city5'],
    desc: '雪国にも足場を置ける。雪野市への進出が解禁される。',
  },
];

/** 解禁の説明（画面に出す用） */
export const UNLOCK_INFO = {
  brand: { name: '自社ブランド', icon: '◆', desc: '物件に冠するブランドを立ち上げられる。単価と契約速度が上がり、供給するほど育つ。' },
  sub: { name: '子会社の設立', icon: '⌂', desc: '施工・販売・管理・運用を内製化して、原価と工期を自社で握れる。' },
  ma: { name: '企業買収', icon: '🤝', desc: '同業・関連業種を買収して、規模とシナジーを一気に取りにいける。' },
  public: { name: '公共案件', icon: '⚑', desc: '自治体や公社が出す公募型プロポーザルに参加できる。地価は安いが条件が付く。' },
  city2: { name: '他都市への進出', icon: '🚄', desc: '鶴見野市の用地を取得できるようになる。' },
  city3: { name: '陽ノ浦市への進出', icon: '⛵', desc: '観光地の用地を取得できるようになる。宿泊と商業の単価が地価に対して高い。' },
  city4: { name: '八雲市への進出', icon: '🏯', desc: '地方中枢都市の用地を取得できるようになる。キャップレートが高く、利回りで稼げる。' },
  city5: { name: '雪野市への進出', icon: '❄', desc: '北の工業都市の用地を取得できるようになる。工事費は1割以上高いが、地価は全都市で最も安い。' },
};

/** 直近4四半期の売上高（百万円） */
export function ttmRevenue(g) {
  const h = (g.finance && g.finance.history) || [];
  let v = 0;
  for (const x of h.slice(-4)) v += (x.pl && x.pl.revenue) || 0;
  return v;
}

/** いまの段階 */
export function tierOf(g) {
  const rev = ttmRevenue(g);
  let t = TIERS[0];
  for (const x of TIERS) if (rev >= x.rev) t = x;
  return t;
}

/** 次の段階（最上位なら null） */
export function nextTier(g) {
  const i = TIERS.indexOf(tierOf(g));
  return TIERS[i + 1] || null;
}

/**
 * 解禁済みかどうか。
 * 一度でも届いたものは g.unlocked に積んであるので、
 * 売上が落ちてもできなくなることはない。
 */
export function unlocked(g, key) {
  if (!g) return false;
  if (Array.isArray(g.unlocked) && g.unlocked.includes(key)) return true;
  const rev = ttmRevenue(g);
  for (const t of TIERS) if (rev >= t.rev && t.unlock.includes(key)) return true;
  return false;
}

/** その解禁に必要な売上高（未解禁なら数値、解禁済みなら null） */
export function needFor(g, key) {
  if (unlocked(g, key)) return null;
  for (const t of TIERS) if (t.unlock.includes(key)) return t.rev;
  return null;
}

/**
 * 毎週の判定。新しく届いた段階があれば記録してニュースに出す。
 * 段階が上がるだけで、下がることはない。
 */
export function stepTier(g, news) {
  if (!Array.isArray(g.unlocked)) g.unlocked = [];
  const rev = ttmRevenue(g);
  for (const t of TIERS) {
    if (rev < t.rev) continue;
    for (const key of t.unlock) {
      if (g.unlocked.includes(key)) continue;
      g.unlocked.push(key);
      const info = UNLOCK_INFO[key];
      if (info && news) {
        news.push({
          icon: info.icon, type: 'tier',
          text: `売上高が${Math.round(t.rev / 100).toLocaleString()}億円を超え、当社は「${t.name}」になった。${info.name}が解禁された。`,
        });
      }
    }
  }
}

/**
 * 過去のセーブを読み込んだときの後始末。
 * すでにその機能を使っている（ブランドを持っている、子会社がある…）なら、
 * 売上が段階に届いていなくても取り上げない。
 */
export function grantExisting(g) {
  if (!Array.isArray(g.unlocked)) g.unlocked = [];
  const add = k => { if (!g.unlocked.includes(k)) g.unlocked.push(k); };
  const rev = ttmRevenue(g);
  for (const t of TIERS) if (rev >= t.rev) for (const k of t.unlock) add(k);
  if ((g.brands || []).length) add('brand');
  if ((g.subsidiaries || []).length) add('sub');
  if ((g.acquisitions || []).length || (g.maTargets || []).length) add('ma');
}
