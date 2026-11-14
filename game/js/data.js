// ===== 静的データ =====
// コース形状（直線長・1周距離・回り）はゲーム用の概略値。
window.VENUES = {
  tokyo:     { name: '東京', dir: 'L', straight: 526, lap: 2083, jp: true },
  nakayama:  { name: '中山', dir: 'R', straight: 310, lap: 1667, jp: true },
  kyoto:     { name: '京都', dir: 'R', straight: 404, lap: 1894, jp: true },
  hanshin:   { name: '阪神', dir: 'R', straight: 474, lap: 2089, jp: true },
  chukyo:    { name: '中京', dir: 'L', straight: 412, lap: 1706, jp: true },
  niigata:   { name: '新潟', dir: 'L', straight: 659, lap: 2223, jp: true },
  sapporo:   { name: '札幌', dir: 'R', straight: 266, lap: 1641, jp: true },
  hakodate:  { name: '函館', dir: 'R', straight: 262, lap: 1627, jp: true },
  fukushima: { name: '福島', dir: 'R', straight: 292, lap: 1600, jp: true },
  kokura:    { name: '小倉', dir: 'R', straight: 293, lap: 1615, jp: true },
  riyadh:    { name: 'キングアブドゥルアジーズ', dir: 'L', straight: 400, lap: 1800, country: 'サウジアラビア' },
  meydan:    { name: 'メイダン', dir: 'L', straight: 450, lap: 2400, country: 'UAE' },
  ascot:     { name: 'アスコット', dir: 'R', straight: 450, lap: 2800, country: 'イギリス' },
  longchamp: { name: 'パリロンシャン', dir: 'R', straight: 533, lap: 2400, country: 'フランス' },
  usa:       { name: '米国 BC開催地', dir: 'L', straight: 300, lap: 1609, country: 'アメリカ' },
  flemington:{ name: 'フレミントン', dir: 'L', straight: 450, lap: 2300, country: 'オーストラリア' },
  shatin:    { name: '沙田', dir: 'R', straight: 430, lap: 1900, country: '香港' },
};

// 月ごとの開催場（東 / 西）。夏はローカル開催。ゲーム用の簡略化。
window.MONTH_VENUES = {
  1: ['nakayama', 'kyoto'], 2: ['tokyo', 'kyoto'], 3: ['nakayama', 'hanshin'], 4: ['nakayama', 'hanshin'],
  5: ['tokyo', 'kyoto'], 6: ['tokyo', 'hanshin'], 7: ['fukushima', 'kokura'], 8: ['niigata', 'sapporo'],
  9: ['nakayama', 'hanshin'], 10: ['tokyo', 'kyoto'], 11: ['tokyo', 'kyoto'], 12: ['nakayama', 'hanshin'],
};

// GⅠ: 日付・場・条件は JRA「2026年 GⅠレース一覧」に準拠
// https://www.jra.go.jp/datafile/seiseki/replay/2026/g1.html
// 毎年、2026年と同じ「その月の第n日曜」に開催する扱い（土曜開催は同じ週の日曜カードに含める）。障害GⅠは平地騎手のため除外。
// cond: age 'A2'=2歳 'A3'=3歳 'U3'=3歳以上 'U4'=4歳以上 / sex 'F'=牝馬限定
window.GRADED = [
  { name: 'フェブラリーS', g: 1, date: '2026-02-22', v: 'tokyo', surf: 'D', dist: 1600, age: 'U4' },
  { name: '高松宮記念', g: 1, date: '2026-03-29', v: 'chukyo', surf: 'T', dist: 1200, age: 'U4' },
  { name: '大阪杯', g: 1, date: '2026-04-05', v: 'hanshin', surf: 'T', dist: 2000, age: 'U4' },
  { name: '桜花賞', g: 1, date: '2026-04-12', v: 'hanshin', surf: 'T', dist: 1600, age: 'A3', sex: 'F' },
  { name: '皐月賞', g: 1, date: '2026-04-19', v: 'nakayama', surf: 'T', dist: 2000, age: 'A3' },
  { name: '天皇賞（春）', g: 1, date: '2026-05-03', v: 'kyoto', surf: 'T', dist: 3200, age: 'U4' },
  { name: 'NHKマイルC', g: 1, date: '2026-05-10', v: 'tokyo', surf: 'T', dist: 1600, age: 'A3' },
  { name: 'ヴィクトリアマイル', g: 1, date: '2026-05-17', v: 'tokyo', surf: 'T', dist: 1600, age: 'U4', sex: 'F' },
  { name: 'オークス', g: 1, date: '2026-05-24', v: 'tokyo', surf: 'T', dist: 2400, age: 'A3', sex: 'F' },
  { name: '日本ダービー', g: 1, date: '2026-05-31', v: 'tokyo', surf: 'T', dist: 2400, age: 'A3' },
  { name: '安田記念', g: 1, date: '2026-06-07', v: 'tokyo', surf: 'T', dist: 1600, age: 'U3' },
  { name: '宝塚記念', g: 1, date: '2026-06-14', v: 'hanshin', surf: 'T', dist: 2200, age: 'U3' },
  { name: 'スプリンターズS', g: 1, date: '2026-09-27', v: 'nakayama', surf: 'T', dist: 1200, age: 'U3' },
  { name: '秋華賞', g: 1, date: '2026-10-18', v: 'kyoto', surf: 'T', dist: 2000, age: 'A3', sex: 'F' },
  { name: '菊花賞', g: 1, date: '2026-10-25', v: 'kyoto', surf: 'T', dist: 3000, age: 'A3' },
  { name: '天皇賞（秋）', g: 1, date: '2026-11-01', v: 'tokyo', surf: 'T', dist: 2000, age: 'U3' },
  { name: 'エリザベス女王杯', g: 1, date: '2026-11-15', v: 'kyoto', surf: 'T', dist: 2200, age: 'U3', sex: 'F' },
  { name: 'マイルチャンピオンシップ', g: 1, date: '2026-11-22', v: 'kyoto', surf: 'T', dist: 1600, age: 'U3' },
  { name: 'ジャパンC', g: 1, date: '2026-11-29', v: 'tokyo', surf: 'T', dist: 2400, age: 'U3' },
  { name: 'チャンピオンズC', g: 1, date: '2026-12-06', v: 'chukyo', surf: 'D', dist: 1800, age: 'U3' },
  { name: '阪神ジュベナイルF', g: 1, date: '2026-12-13', v: 'hanshin', surf: 'T', dist: 1600, age: 'A2', sex: 'F' },
  { name: '朝日杯フューチュリティS', g: 1, date: '2026-12-20', v: 'hanshin', surf: 'T', dist: 1600, age: 'A2' },
  { name: 'ホープフルS', g: 1, date: '2026-12-26', v: 'nakayama', surf: 'T', dist: 2000, age: 'A2', sat: true },
  { name: '有馬記念', g: 1, date: '2026-12-27', v: 'nakayama', surf: 'T', dist: 2500, age: 'U3' },
  // GⅡ・GⅢ（開催時期・条件はゲーム用の概略）
  { name: '京成杯', g: 3, date: '2026-01-18', v: 'nakayama', surf: 'T', dist: 2000, age: 'A3' },
  { name: '日経新春杯', g: 2, date: '2026-01-18', v: 'kyoto', surf: 'T', dist: 2400, age: 'U4' },
  { name: 'AJCC', g: 2, date: '2026-01-25', v: 'nakayama', surf: 'T', dist: 2200, age: 'U4' },
  { name: '共同通信杯', g: 3, date: '2026-02-15', v: 'tokyo', surf: 'T', dist: 1800, age: 'A3' },
  { name: '京都記念', g: 2, date: '2026-02-15', v: 'kyoto', surf: 'T', dist: 2200, age: 'U4' },
  { name: '弥生賞', g: 2, date: '2026-03-08', v: 'nakayama', surf: 'T', dist: 2000, age: 'A3' },
  { name: 'チューリップ賞', g: 2, date: '2026-03-01', v: 'hanshin', surf: 'T', dist: 1600, age: 'A3', sex: 'F' },
  { name: '阪神大賞典', g: 2, date: '2026-03-22', v: 'hanshin', surf: 'T', dist: 3000, age: 'U4' },
  { name: 'スプリングS', g: 2, date: '2026-03-15', v: 'nakayama', surf: 'T', dist: 1800, age: 'A3' },
  { name: '青葉賞', g: 2, date: '2026-04-26', v: 'tokyo', surf: 'T', dist: 2400, age: 'A3' },
  { name: '七夕賞', g: 3, date: '2026-07-12', v: 'fukushima', surf: 'T', dist: 2000, age: 'U3' },
  { name: '関屋記念', g: 3, date: '2026-08-09', v: 'niigata', surf: 'T', dist: 1600, age: 'U3' },
  { name: '札幌記念', g: 2, date: '2026-08-23', v: 'sapporo', surf: 'T', dist: 2000, age: 'U3' },
  { name: 'セントライト記念', g: 2, date: '2026-09-20', v: 'nakayama', surf: 'T', dist: 2200, age: 'A3' },
  { name: '毎日王冠', g: 2, date: '2026-10-11', v: 'tokyo', surf: 'T', dist: 1800, age: 'U3' },
  { name: 'アルゼンチン共和国杯', g: 2, date: '2026-11-08', v: 'tokyo', surf: 'T', dist: 2500, age: 'U3' },
  { name: 'ステイヤーズS', g: 2, date: '2026-12-05', v: 'nakayama', surf: 'T', dist: 3600, age: 'U3' },
];

// 海外遠征の対象レース（時期・条件は概略。実際の開催日は年ごとに要確認）
window.OVERSEAS = [
  { name: 'サウジカップ', g: 1, month: 2, nth: 3, v: 'riyadh', surf: 'D', dist: 1800 },
  { name: 'ドバイワールドカップ', g: 1, month: 3, nth: 4, v: 'meydan', surf: 'D', dist: 2000 },
  { name: 'ドバイシーマクラシック', g: 1, month: 3, nth: 4, v: 'meydan', surf: 'T', dist: 2410 },
  { name: 'ドバイターフ', g: 1, month: 3, nth: 4, v: 'meydan', surf: 'T', dist: 1800 },
  { name: 'キングジョージ6世&QES', g: 1, month: 7, nth: 4, v: 'ascot', surf: 'T', dist: 2390 },
  { name: '凱旋門賞', g: 1, month: 10, nth: 1, v: 'longchamp', surf: 'T', dist: 2400 },
  { name: 'ブリーダーズカップ・クラシック', g: 1, month: 11, nth: 1, v: 'usa', surf: 'D', dist: 2000 },
  { name: 'メルボルンカップ', g: 1, month: 11, nth: 1, v: 'flemington', surf: 'T', dist: 3200 },
  { name: '香港カップ', g: 1, month: 12, nth: 2, v: 'shatin', surf: 'T', dist: 2000 },
  { name: '香港マイル', g: 1, month: 12, nth: 2, v: 'shatin', surf: 'T', dist: 1600 },
  { name: '香港スプリント', g: 1, month: 12, nth: 2, v: 'shatin', surf: 'T', dist: 1200 },
];

// 架空馬名の素材（カタカナ9文字以内に収める）
window.NAME_A = ['アース','ブルー','スター','ウインド','ライト','ゴールド','シルバー','サイレント','ミラクル','ロイヤル','ノーブル','グラン','ドリーム','フェアリー','ブレイヴ','ハヤテ','ミライ','ソラノ','ルミナ','セレス','カグラ','アカツキ','ヒカリ','クオン','トワイライト','アイアン','ヴィヴィッド','エターナル','マーベル','リュウセイ','シンク','ハルカ','ネオ','オーロラ','スカイ','フレイム','ウェイヴ','モーニング','ミッドナイト','ルビー','サファイア','アオイ','コハク','シズカ','ユメノ','キセキ','テンクウ','ベル','ロード','レイ'];
window.NAME_B = ['ストーム','ハート','ソング','ロード','ダンサー','フラッシュ','メモリー','クラウン','アロー','ジェム','ノヴァ','リーフ','ブリッツ','ランナー','ウィング','ナイト','ブーケ','ギア','ライン','ホープ','キング','クイーン','ボルト','ラプソディ','タクト','ノート','ゲート','ピーク','フォース','リバー','ムーン','サン','カナタ','ヒメ','マル','オー','ボーイ','ガール','テイル','ステップ','ワルツ','パレード','ソウル','エース','ミント','ラッシュ','シチー','ドーン','ブレス','ジャンプ'];
window.FOREIGN_A = ['グレート','ロイヤル','ノーザン','サザン','ゴールデン','ダーク','ワイルド','ブライト','スイフト','ミスター','レディ','キャプテン','ムーン','シー','デザート','アイリッシュ','オールド','ニュー'];
window.FOREIGN_B = ['プリンス','アドミラル','ファルコン','ドリーマー','エンペラー','ロック','ボーイ','スピリット','ジェネラル','フェイム','ストーム','ナイト','ハンター','レジェンド','ダイヤモンド','ヒーロー','セイバー','リバティ'];

window.SURNAMES = ['佐藤','鈴木','高橋','田中','伊藤','渡辺','山本','中村','小林','加藤','吉田','山田','佐々木','山口','松本','井上','木村','林','清水','山崎','森','阿部','池田','橋本','石川','前田','藤田','後藤','岡田','長谷川','村上','近藤','坂本','遠藤','青木','西村','福田','太田','三浦','藤原','岡本','中島','原田','小野','竹内','金子','和田','中野','原','杉山'];
window.GIVEN = ['翔','蓮','颯','陸','湊','大和','悠真','蒼','樹','朝陽','優斗','拓海','亮','健','誠','大輝','航','隼','創','凛','葵','結衣','陽菜','美咲','彩','真央'];
window.FOREIGN_JOCKEYS = ['R.ムーアズ','W.ブラウン','L.デュポン','M.ギャレット','J.オブライ','C.シャノン','O.マルタン','T.ハーラン','H.ボウマー','F.ロッシ','D.ケリガン','A.フォスター'];

// 勝負服の色
window.SILKS = ['#d32f2f','#1976d2','#388e3c','#fbc02d','#7b1fa2','#f57c00','#0097a7','#c2185b','#5d4037','#455a64','#e64a19','#303f9f','#689f38','#ffffff','#212121','#00796b'];
// 枠色（1〜8枠）
window.WAKU_COLORS = ['#ffffff','#222222','#e53935','#1e88e5','#fdd835','#43a047','#fb8c00','#ec407a'];

// 馬主（架空）。勝負服は JRA の勝負服の柄の考え方（輪・縦縞・山形・襷・菱など）を参考にした架空のデザイン
window.OWNERS = [
  { name: '鳳翔ホースクラブ', size: 14, silks: { base: '#1d3f8f', accent: '#f6c445', pattern: 'hoops', cap: '#f6c445' } },
  { name: '白嶺ファーム', size: 12, silks: { base: '#f2f2f2', accent: '#16794a', pattern: 'sash', cap: '#16794a' } },
  { name: '朱鷺レーシング', size: 10, silks: { base: '#d1495b', accent: '#ffffff', pattern: 'chevron', cap: '#ffffff' } },
  { name: '蒼穹サラブレッド', size: 9, silks: { base: '#55b4e8', accent: '#1b2a4a', pattern: 'stripes', cap: '#1b2a4a' } },
  { name: '翠星商事', size: 7, silks: { base: '#2f6b3a', accent: '#f2f2f2', pattern: 'diamonds', cap: '#2f6b3a' } },
  { name: '暁月牧場', size: 7, silks: { base: '#f08a24', accent: '#3a2a6b', pattern: 'halves', cap: '#3a2a6b' } },
  { name: '紫雲ステーブル', size: 6, silks: { base: '#6b3fa0', accent: '#f2f2f2', pattern: 'spots', cap: '#f2f2f2' } },
  { name: '黒鉄ホールディングス', size: 6, silks: { base: '#202020', accent: '#d8a520', pattern: 'cross', cap: '#d8a520' } },
  { name: '桜川 個人馬主', size: 9, silks: { base: '#f1a7c0', accent: '#7a1c3c', pattern: 'hoops', cap: '#7a1c3c' } },
  { name: '小口の個人馬主', size: 20, silks: { base: '#8b6b3e', accent: '#f2e6c8', pattern: 'plain', cap: '#8b6b3e' } },
];
// エージェント（騎乗依頼の仲介者）。net: 依頼の数と質、fee: 手数料（収入に対する%）
window.AGENTS = [
  { name: '新米エージェント 早瀬', net: 1, fee: 5, needRep: 0 },
  { name: '中堅エージェント 真壁', net: 2, fee: 10, needRep: 25 },
  { name: '敏腕エージェント 久遠', net: 3, fee: 15, needRep: 55 },
];
