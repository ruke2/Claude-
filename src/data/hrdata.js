// ============================================================
//  人事マスタ — 部署 / 役職 / 給与 / 人名
// ============================================================

/** 部署（配属先） */
export const DEPTS = {
  land:  { id: 'land',  name: '用地開発部', short: '用地', icon: '◈', key: 'land',  desc: '情報収集と地権者交渉。入札の勝率と仕入れ価格に直結する。' },
  plan:  { id: 'plan',  name: '商品企画部', short: '企画', icon: '✎', key: 'plan',  desc: '商品グレードと設計。販売単価と賃料水準を押し上げる。' },
  cons:  { id: 'cons',  name: '建設管理部', short: '建設', icon: '⚒', key: 'cons',  desc: '工程と原価の管理。工期遅延と建設費超過を抑える。' },
  sales: { id: 'sales', name: '販売事業部', short: '販売', icon: '¥', key: 'sales', desc: '分譲住宅の販売。契約進捗の速さを決める。' },
  lease: { id: 'lease', name: 'ビル事業部', short: '賃貸', icon: '▤', key: 'sales', desc: 'テナントリーシング。保有物件の稼働率を守る。' },
  fin:   { id: 'fin',   name: '財務経理部', short: '財務', icon: '◱', key: 'fin',   desc: '資金調達と与信。借入金利と調達枠に影響する。' },
  hr:    { id: 'hr',    name: '人事総務部', short: '人事', icon: '☗', key: 'lead',  desc: '採用力と定着率を高める。研修効果も上がる。' },
  corp:  { id: 'corp',  name: '経営企画部', short: '経企', icon: '◎', key: 'lead',  desc: 'M&Aと全社戦略。デューデリジェンス精度と統合成功率を上げる。' },
};
export const DEPT_IDS = Object.keys(DEPTS);

/** 役職（index が等級） */
export const RANKS = [
  { id: 0, name: '社員',     short: '社員', baseSalary: 5.4,  slots: Infinity, minAbility: 0,  span: 0 },
  { id: 1, name: '主任',     short: '主任', baseSalary: 7.0,  slots: Infinity, minAbility: 45, span: 0 },
  { id: 2, name: '係長',     short: '係長', baseSalary: 8.6,  slots: Infinity, minAbility: 55, span: 4 },
  { id: 3, name: '課長',     short: '課長', baseSalary: 11.2, slots: 16,       minAbility: 64, span: 8 },
  { id: 4, name: '部長',     short: '部長', baseSalary: 15.4, slots: 8,        minAbility: 72, span: 20 },
  { id: 5, name: '執行役員', short: '執行', baseSalary: 22.0, slots: 5,        minAbility: 79, span: 40 },
  { id: 6, name: '取締役',   short: '取締', baseSalary: 32.0, slots: 3,        minAbility: 85, span: 70 },
  { id: 7, name: '代表取締役社長', short: '社長', baseSalary: 52.0, slots: 1,  minAbility: 88, span: 999 },
];

/** 能力値の定義 */
export const ABILITIES = {
  land:  { id: 'land',  name: '用地',   desc: '地権者交渉・入札判断' },
  plan:  { id: 'plan',  name: '企画',   desc: '商品設計・マーケティング' },
  cons:  { id: 'cons',  name: '施工',   desc: '工程管理・原価管理' },
  sales: { id: 'sales', name: '営業',   desc: '販売・リーシング' },
  fin:   { id: 'fin',   name: '財務',   desc: '資金調達・投資判断' },
  lead:  { id: 'lead',  name: '統率',   desc: '組織運営・部下の育成' },
};
export const ABILITY_IDS = Object.keys(ABILITIES);

/** 採用チャネル */
export const HIRE_CHANNELS = {
  newgrad: {
    id: 'newgrad', name: '新卒採用', icon: '🎓',
    desc: '毎年Q1（4月）に一括入社。能力は低いが伸びしろが大きく、人件費も安い。',
    ageRange: [22, 24], abilityRange: [22, 46], potentialRange: [55, 96],
    costPerHead: 1.8, loyaltyBase: 0.72,
  },
  career: {
    id: 'career', name: 'キャリア採用', icon: '💼',
    desc: '即戦力を随時採用。能力は高いが年収も高く、定着率は新卒に劣る。',
    ageRange: [28, 46], abilityRange: [50, 78], potentialRange: [58, 88],
    costPerHead: 4.2, loyaltyBase: 0.52,
  },
  headhunt: {
    id: 'headhunt', name: 'ヘッドハンティング', icon: '🎯',
    desc: '他社のエースを一本釣りする。極めて高コストだが、一人で事業が変わることもある。',
    ageRange: [34, 52], abilityRange: [72, 95], potentialRange: [76, 99],
    costPerHead: 22.0, loyaltyBase: 0.40,
  },
};

/** 研修・制度投資 */
export const HR_PROGRAMS = [
  { id: 'training', name: '社内研修プログラム', cost: 240, icon: '📘', desc: '全社員の能力成長率 +35%。', field: 'training' },
  { id: 'welfare',  name: '福利厚生の拡充',     cost: 320, icon: '🏥', desc: '全社員のモチベーション +、離職率 −30%。', field: 'welfare' },
  { id: 'dx',       name: '業務DX投資',         cost: 420, icon: '💻', desc: '一人当たり生産性 +12%。販管費も圧縮される。', field: 'dx' },
  { id: 'brandpr',  name: '採用ブランディング', cost: 180, icon: '📣', desc: '採用時の人材の質と応募数が上がる。', field: 'brandpr' },
];

export const LAST_NAMES = [
  '佐藤','鈴木','高橋','田中','伊藤','渡辺','山本','中村','小林','加藤','吉田','山田','佐々木','山口','松本',
  '井上','木村','林','斎藤','清水','山崎','阿部','森','池田','橋本','石川','前田','藤田','後藤','小川',
  '岡田','村上','長谷川','近藤','石井','斉藤','坂本','遠藤','藤井','西村','福田','太田','三浦','藤原','岡本',
  '松田','中川','中野','原田','小野','田村','竹内','金子','和田','中山','石田','上田','森田','原','柴田',
  '宮崎','酒井','工藤','横山','宮本','内田','高木','安藤','島田','谷口','大野','高田','丸山','今井','河野',
];
export const FIRST_NAMES = [
  '大輔','拓也','健太','翔太','直樹','雄大','和也','智也','亮','剛','誠','浩二','隆','聡','学',
  '美咲','さくら','愛','恵','由美','真由','千夏','彩','香織','奈々','里奈','桃子','葵','陽子','麻衣',
  '悠真','蓮','陽翔','湊','大和','颯太','律','新','樹','駿','結菜','陽菜','凛','杏','紬','澪','芽依','莉子',
  '一郎','俊介','慎一','康弘','秀樹','正人','克彦','信二','孝之','章','裕介','哲也','敏之','幸雄','和成',
];
// 生成時に不正なトークンを除去するためのフィルタ
export const FIRST_NAMES_CLEAN = FIRST_NAMES.filter(n => /^[぀-ヿ一-鿿]+$/.test(n));

/** 物件ブランド名の素材 */
export const BRAND_PREFIX = ['グラン', 'ザ・', 'プラウド', 'パーク', 'シティ', 'ブリリア', 'ルジェンテ', 'クレヴィア', 'アトラス', 'オーベル', 'リビオ', 'ドレッセ'];
export const BRAND_CORE = ['タワー', 'レジデンス', 'ヒルズ', 'コート', 'テラス', 'ガーデン', 'スクエア', 'フォレスト', 'マークス', 'プレイス', 'ステージ'];
export const OFFICE_SUFFIX = ['ビルディング', 'タワー', 'センタービル', 'ゲートタワー', 'スクエア', 'フロント'];
