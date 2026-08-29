/* =========================================================
 *  SOGO SHOSHA - static game data
 *  金額の単位はすべて「億円」
 * ======================================================= */
window.GAME = (function () {
  const D = {};

  /* ---- 商品市況 -------------------------------------- */
  D.COMMODITIES = {
    crude:   { name: '原油',     vol: 0.085, drift: 0.0004 },
    lng:     { name: 'LNG',      vol: 0.095, drift: 0.0006 },
    iron:    { name: '鉄鉱石',   vol: 0.070, drift: 0.0002 },
    copper:  { name: '銅',       vol: 0.062, drift: 0.0008 },
    grain:   { name: '穀物',     vol: 0.072, drift: 0.0003 },
    freight: { name: '海上運賃', vol: 0.105, drift: 0.0001 },
  };
  D.COMM_KEYS = Object.keys(D.COMMODITIES);

  /* ---- 営業本部 -------------------------------------- */
  D.DIVISIONS = [
    { id: 'energy',    name: 'エネルギー本部',       short: 'エネルギー', icon: '⛽', comms: ['crude', 'lng'] },
    { id: 'metals',    name: '金属資源本部',         short: '金属資源',   icon: '⛏️', comms: ['iron', 'copper'] },
    { id: 'chem',      name: '化学品本部',           short: '化学品',     icon: '🧪', comms: ['crude', 'freight'] },
    { id: 'machinery', name: '機械・インフラ本部',   short: '機械',       icon: '🏗️', comms: ['copper', 'freight'] },
    { id: 'food',      name: '食料本部',             short: '食料',       icon: '🌾', comms: ['grain', 'freight'] },
    { id: 'consumer',  name: '生活産業・次世代本部', short: '生活産業',   icon: '🏬', comms: ['grain', 'copper'] },
  ];
  D.DIV_BY_ID = {};
  D.DIVISIONS.forEach(function (d) { D.DIV_BY_ID[d.id] = d; });

  /* ---- 成長ステージ ---------------------------------- */
  /* goal = 純資産(億円) */
  D.STAGES = [
    { name: '街の貿易商',   title: '創業',           goal: 200,     scale: 1 },
    { name: '専門商社',     title: '専業で名を上げる', goal: 900,    scale: 4 },
    { name: '中堅商社',     title: '総合化への布石',  goal: 4500,    scale: 18 },
    { name: '大手商社',     title: '財閥系に並ぶ',    goal: 25000,   scale: 90 },
    { name: '総合商社',     title: '五大商社の一角',  goal: 130000,  scale: 420 },
    { name: '世界最大の商社', title: 'グローバル覇権', goal: Infinity, scale: 1800 },
  ];

  /* ---- 拠点 ------------------------------------------ */
  D.REGIONS = [
    { id: 'jp',   name: '国内',       flag: '🇯🇵' },
    { id: 'asia', name: '東南アジア', flag: '🌏' },
    { id: 'cn',   name: '中国',       flag: '🇨🇳' },
    { id: 'me',   name: '中東',       flag: '🕌' },
    { id: 'oc',   name: '豪州',       flag: '🇦🇺' },
    { id: 'na',   name: '北米',       flag: '🇺🇸' },
    { id: 'sa',   name: '南米',       flag: '🌎' },
    { id: 'eu',   name: '欧州',       flag: '🇪🇺' },
    { id: 'af',   name: 'アフリカ',   flag: '🌍' },
    { id: 'in',   name: 'インド',     flag: '🇮🇳' },
  ];
  D.REGION_BY_ID = {};
  D.REGIONS.forEach(function (r) { D.REGION_BY_ID[r.id] = r; });

  /* ---- 案件テンプレ ---------------------------------- */
  /* type: trade(トレード) / project(EPC) / concession(権益) / investment(事業投資) */
  D.TYPE_LABEL = {
    trade: 'トレード', project: 'プロジェクト',
    concession: '資源権益', investment: '事業投資',
  };
  D.TYPE_DESC = {
    trade: '運転資金を拠出し、口銭（マージン）を抜く短期取引。市況で採算が振れる。',
    project: 'EPC/インフラ案件。毎月工事原価が出て、竣工時に一括で代金を回収する。',
    concession: '鉱区・権益の取得。巨額の初期投資と引き換えに長期の配当を得るが、市況低迷時は減損リスクを負う。',
    investment: '事業会社への出資。安定した持分法配当が毎月入り、投資先は自律的に成長する。',
  };

  D.ITEMS = {
    trade: {
      energy:    ['原油カーゴ', 'LNGスポット', 'ナフサ', '一般炭', '低硫黄重油', 'SAF原料'],
      metals:    ['鉄鉱石', '銅精鉱', 'アルミ地金', 'ニッケル', 'レアアース', '鉄スクラップ'],
      chem:      ['エチレン', 'メタノール', '塩ビ樹脂', '尿素肥料', '硫黄', '電池材料'],
      machinery: ['建設機械', '中古船舶', '自動車部品', '鉄道車両', '風力タービン', '産業用ロボット'],
      food:      ['小麦', '大豆', 'とうもろこし', '冷凍水産物', 'コーヒー生豆', '飼料原料'],
      consumer:  ['アパレル生地', '日用品', '医薬中間体', '半導体材料', '木材チップ', 'リサイクルPET'],
    },
    project: {
      energy:    ['LNG受入基地建設', 'ガス火力発電所EPC', '製油所改修'],
      metals:    ['選鉱プラント建設', 'アルミ製錬所増設'],
      chem:      ['肥料プラント建設', '石化コンプレックス建設'],
      machinery: ['都市鉄道', '高速道路', '海水淡水化プラント', '大規模データセンター建設', '空港ターミナル'],
      food:      ['穀物輸出ターミナル', '大型冷蔵倉庫網'],
      consumer:  ['スマートシティ開発', '大規模物流施設'],
    },
    concession: {
      energy:    ['LNG液化事業権益', '海洋油田権益', '洋上風力事業権益'],
      metals:    ['鉄鉱山権益', '銅鉱山権益', 'リチウム鉱区権益'],
      chem:      ['石化コンビナート持分', 'アンモニア製造権益'],
      machinery: ['IPP発電事業', '空港運営コンセッション', '港湾運営権'],
      food:      ['大規模農地開発', '養殖事業権益'],
      consumer:  ['地熱・再エネ事業', '水事業コンセッション'],
    },
    investment: {
      energy:    ['燃料小売チェーン', '電力小売事業者'],
      metals:    ['非鉄加工メーカー', '金属リサイクル企業'],
      chem:      ['機能性化学メーカー', '農薬販売網'],
      machinery: ['建機レンタル大手', '船舶リース会社', '自動車販売網'],
      food:      ['食品卸大手', '外食チェーン', '製粉会社'],
      consumer:  ['コンビニチェーン', 'EC物流企業', 'ヘルスケア事業', '人材サービス', '総合リース'],
    },
  };

  /* ---- コーポレート投資枠（年次の資源配分） ---------- */
  D.BUDGET_CORP = [
    { id: 'dx',  name: 'デジタル・IT投資',   icon: '💻',
      desc: '商談枠が増え、販管費率が下がる' },
    { id: 'hr',  name: '人材・組織投資',     icon: '🧑‍💼',
      desc: '案件の同時処理能力が上がり、人が定着する' },
    { id: 'esg', name: 'サステナ・内部統制', icon: '🌱',
      desc: '減損と不祥事が減り、格付が上がる' },
  ];

  /* ---- 中期経営計画：重点戦略カード ------------------ */
  /* fx のキーは engine 側の fx()/fxAdd() が解釈する */
  D.PLAN_CARDS = [
    { id: 'resource', name: '資源メジャー化', icon: '⛏️',
      good: '権益案件が数多く持ち込まれ、利回りが26%上がる',
      bad:  '減損リスクが3割増しになる',
      fx: { concW: 2.6, concYield: 1.26, impair: 1.32 } },
    { id: 'nonres', name: '非資源シフト', icon: '🏬',
      good: 'トレードと事業投資が増え、採算も改善する',
      bad:  '資源権益はほとんど回ってこなくなる',
      fx: { tradeW: 1.22, invW: 1.32, concW: 0.35, margin: 1.05 } },
    { id: 'asia', name: 'アジア・パシフィック深耕', icon: '🌏',
      good: '東南アジア・中国・インドの案件が大型化し、落札力 +9pt。拠点開設費も3割安い',
      bad:  'その他地域の落札力 −4pt',
      fx: { officeCost: 0.65 }, prefRegions: ['asia', 'cn', 'in'], prefWin: 9, otherWin: -4, prefSize: 1.35 },
    { id: 'green', name: '脱炭素トランジション', icon: '🌱',
      good: '生活産業・機械の案件が増え、サステナ水準が毎年上がる。減損も減る',
      bad:  '化石燃料権益の利回りが下がる',
      fx: { impair: 0.80, fossilYield: 0.85, esgYear: 0.45 }, divBoost: { consumer: 1.6, machinery: 1.4 } },
    { id: 'digital', name: 'デジタル戦略', icon: '💻',
      good: '商談枠 +1、販管費 −10%、DX水準が毎年上がる',
      bad:  '目に見える売上を生まない（他のカードを1枚諦めることになる）',
      fx: { slots: 1, sga: 0.90, dxYear: 0.34 } },
    { id: 'talent', name: '人材投資', icon: '🧑‍💼',
      good: '同時に回せる案件が +4、人材水準が毎年上がる',
      bad:  '人件費が1割上がる',
      fx: { cap: 4, wage: 1.10, hrYear: 0.45 } },
    { id: 'discipline', name: '財務規律', icon: '🏦',
      good: '調達金利 −0.7%、信用が積み上がりやすい',
      bad:  '借入枠が15%縮む＝成長が鈍る',
      fx: { spread: 0.007, lev: 0.85, credit: 0.06 } },
    { id: 'partner', name: 'グローバル・パートナーシップ', icon: '🤝',
      good: '大型案件（💎）が持ち込まれやすく、全案件が15%大型化する',
      bad:  '競合が1社増える',
      fx: { bigChance: 0.06, rivals: 1, sizeAll: 1.15 } },
  ];
  D.CARD_BY_ID = {};
  D.PLAN_CARDS.forEach(function (c) { D.CARD_BY_ID[c.id] = c; });

  /* ---- 中期経営計画：目標の難易度 -------------------- */
  D.PLAN_TIERS = ['保守的', '標準', '挑戦的'];
  D.PLAN_ITEMS = [
    { id: 'profit', name: '最終年度 純利益', unit: 'money',
      desc: '3年目の通期純利益。素直な規模の目標' },
    { id: 'roe', name: '最終年度 ROE', unit: 'pct',
      desc: '経営の質。規模を追うと下がるので上の目標と綱引きになる' },
    { id: 'invest', name: '3年累計 投資額', unit: 'money',
      desc: '予算配分・権益取得・本部投資の累計。守りに入ることを許さない' },
  ];

  /* ---- ライバル商社 ---------------------------------- */
  D.RIVALS = [
    { name: '蒼海商事',   base: 96000, g: 0.0072 },
    { name: '帝都物産',   base: 88000, g: 0.0080 },
    { name: '大和通商',   base: 61000, g: 0.0090 },
    { name: '富嶽商事',   base: 42000, g: 0.0102 },
    { name: '東邦物産',   base: 27000, g: 0.0118 },
    { name: '極洋実業',   base: 14000, g: 0.0135 },
    { name: '南洋交易',   base: 5200,  g: 0.0155 },
    { name: '北辰商会',   base: 1900,  g: 0.0175 },
    { name: '明和物産',   base: 620,   g: 0.0195 },
    { name: '新星トレード', base: 180,  g: 0.0215 },
  ];

  /* ---- 格付 ------------------------------------------ */
  D.RATINGS = [
    { min: 88, label: 'AAA', spread: 0.004, lev: 3.4, win: 12 },
    { min: 78, label: 'AA',  spread: 0.008, lev: 3.0, win: 9 },
    { min: 66, label: 'A',   spread: 0.013, lev: 2.6, win: 6 },
    { min: 52, label: 'BBB', spread: 0.020, lev: 2.2, win: 3 },
    { min: 38, label: 'BB',  spread: 0.031, lev: 1.7, win: 0 },
    { min: 22, label: 'B',   spread: 0.045, lev: 1.2, win: -4 },
    { min: -99, label: 'CCC', spread: 0.065, lev: 0.7, win: -9 },
  ];

  /* ---- 交渉スタンス ---------------------------------- */
  D.STANCES = [
    { n: '捨値', mult: 0.55, win: +26, desc: '採算度外視。シェアと実績を取りにいく。' },
    { n: '薄利', mult: 0.78, win: +13, desc: '確実に取る。利は薄い。' },
    { n: '標準', mult: 1.00, win: 0,   desc: '相場並みの条件で提示する。' },
    { n: '強気', mult: 1.32, win: -14, desc: '利幅を取りにいく。落札は遠のく。' },
    { n: '暴利', mult: 1.75, win: -30, desc: '足元を見た条件。通れば大きい。' },
  ];

  /* ---- イベント -------------------------------------- */
  /* w: 抽選ウェイト / shock: 市況インパクト */
  D.EVENTS = [
    { id: 'me_war',   ic: '🔥', w: 10, title: '中東で地政学リスク再燃',
      text: 'ホルムズ海峡の緊張が高まり、原油・LNG価格が急騰。エネルギー本部には追い風だが、輸送コストも跳ね上がる。',
      shock: { crude: 0.22, lng: 0.18, freight: 0.12 } },
    { id: 'recession', ic: '📉', w: 10, title: '世界的な景気後退局面',
      text: '主要国の需要が一斉に鈍化。資源価格が総崩れとなり、各社の取扱高も縮小している。',
      shock: { crude: -0.14, iron: -0.16, copper: -0.15, freight: -0.10 }, credit: -2 },
    { id: 'cn_boom',  ic: '🏙️', w: 9, title: '中国のインフラ投資が加速',
      text: '大型景気対策により鉄鋼・非鉄需要が急拡大。金属資源本部の採算が大きく改善する。',
      shock: { iron: 0.20, copper: 0.16, freight: 0.08 } },
    { id: 'drought',  ic: '🌵', w: 9, title: '主要穀倉地帯で記録的干ばつ',
      text: '南米・北米で不作。穀物相場が高騰し、食料本部のトレード採算が跳ね上がる。',
      shock: { grain: 0.24, freight: 0.05 } },
    { id: 'harvest',  ic: '🌾', w: 7, title: '世界的な豊作',
      text: '穀物在庫が積み上がり相場は軟調。売り手優位から一転、買い手市場になった。',
      shock: { grain: -0.17 } },
    { id: 'yen_weak', ic: '💴', w: 10, title: '急速な円安進行',
      text: '日米金利差の拡大で円が売られている。海外収益の円換算額が膨らみ、含み益が発生した。',
      fx: 0.055 },
    { id: 'yen_strong', ic: '💹', w: 8, title: '円高転換',
      text: 'リスクオフで円が買い戻された。海外事業の円建て収益が目減りする。',
      fx: -0.05 },
    { id: 'freight_up', ic: '🚢', w: 8, title: '海上運賃が急騰',
      text: '運河の通航制限で船腹需給が逼迫。物流コストが跳ね上がっている。',
      shock: { freight: 0.26 } },
    { id: 'green',    ic: '🌱', w: 8, title: '脱炭素規制の強化',
      text: '主要国が化石燃料事業への規制を強化。座礁資産化の懸念が広がる。',
      shock: { crude: -0.10, lng: -0.06, copper: 0.09 }, impairRisk: 1.6 },
    { id: 'ev_boom',  ic: '🔋', w: 8, title: 'EV・蓄電池需要が爆発',
      text: '電池材料と銅の需要が構造的に拡大。金属資源と化学品に強い追い風。',
      shock: { copper: 0.20, iron: 0.05 } },
    { id: 'default',  ic: '⚠️', w: 7, title: '取引先の信用不安',
      text: '大口カウンターパーティの資金繰り悪化が報じられた。進行中トレードの与信リスクが上昇している。',
      creditRisk: 2.0 },
    { id: 'scandal',  ic: '📰', w: 5, title: 'コンプライアンス問題が報道',
      text: '海外子会社の不適切会計が指摘された。信用が毀損し、当面の入札で不利になる。',
      credit: -8 },
    { id: 'award',    ic: '🏅', w: 6, title: '国際的な表彰を受ける',
      text: 'サステナビリティ経営が高く評価され、企業ブランドが向上。取引先からの信認が厚くなった。',
      credit: +7 },
    { id: 'nationalize', ic: '🚩', w: 5, title: '資源国で政変',
      text: '産出国の新政権が資源国有化を示唆。保有権益の評価に暗雲が立ち込める。',
      impairRisk: 2.4 },
    { id: 'boom',     ic: '📈', w: 8, title: '資源スーパーサイクル到来',
      text: '構造的な供給不足を背景に、資源価格が全面高となっている。',
      shock: { crude: 0.12, lng: 0.12, iron: 0.13, copper: 0.13, grain: 0.07 } },
    { id: 'rate_up',  ic: '🏦', w: 7, title: '世界的な金融引き締め',
      text: '各国中銀が利上げ。借入コストが上昇し、財務レバレッジの高い企業には重荷となる。',
      rate: 0.008 },
    { id: 'rate_dn',  ic: '🕊️', w: 6, title: '金融緩和への転換',
      text: '利下げ観測から調達環境が改善。借入コストが低下する。',
      rate: -0.007 },
    { id: 'bigdeal',  ic: '💎', w: 7, title: '大型商談の打診',
      text: '長年の取引実績が評価され、通常より規模の大きい案件が持ち込まれた。商談リストを確認せよ。',
      bigDeal: true },
    { id: 'pandemic', ic: '🦠', w: 4, title: '感染症の再拡大',
      text: 'サプライチェーンが混乱。進行中プロジェクトに遅延が発生しやすくなっている。',
      shock: { freight: 0.14, crude: -0.09 }, delayRisk: 2.0 },
    { id: 'talent',   ic: '🧑‍💼', w: 6, title: '人材獲得競争が激化',
      text: '同業他社の引き抜きが加速。人件費水準が上昇している。',
      wageUp: 0.06 },
  ];

  return D;
})();
