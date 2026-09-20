// ============================================================
//  名刺
//
//    社名はタイトル画面で入れたもの、氏名は社長（プレイヤー）本人。
//    社員と役員の名刺も同じ形で出せる。
//
//    **ロゴは SVG で描くこと。** 外から画像を読むと
//    オフラインで壊れるし、単一HTMLの容量も膨らむ（デザインの決めごとを見ること）。
//    紅と紺のΛを組み合わせた、山にも見えるマークである。
// ============================================================
import { openModal, closeModal, toast } from './dom.js';
import { DISTRICTS, CITIES, cityOf } from '../data/city.js';
import { DEPTS, CEO_RANK, rankName, affiliation, teamById } from '../data/hrdata.js';
import { ceo } from '../sim/officers.js';

/** ブランドカラー */
export const MARK_RED = '#9E1B32';
export const MARK_NAVY = '#12294A';

/**
 * 社章。
 * 紅と紺のΛが組み合わさって1つの山になる。
 * `size` は表示の一辺（px）。色は固定で、名刺以外でも使える。
 */
export function logoSVG(size = 64, opt = {}) {
  const red = opt.red || MARK_RED;
  const navy = opt.navy || MARK_NAVY;
  const w = Math.round(size * 220 / 160);
  return `<svg viewBox="0 0 220 160" width="${w}" height="${size}" role="img" aria-label="社章"
    style="display:block;overflow:visible">
    <g fill="none" stroke-linecap="square" stroke-linejoin="miter">
      <!-- 外側：左の斜面が紅、右の斜面が紺 -->
      <path d="M14 142 L110 14" stroke="${red}" stroke-width="13"/>
      <path d="M110 14 L206 142" stroke="${navy}" stroke-width="13"/>
      <!-- 内側：色を入れ替えて組み合わせる -->
      <path d="M58 142 L110 72" stroke="${navy}" stroke-width="10"/>
      <path d="M110 72 L162 142" stroke="${red}" stroke-width="10"/>
      <!-- 頂の小さなΛ -->
      <path d="M86 62 L110 34 L134 62" stroke="${red}" stroke-width="8"/>
    </g>
  </svg>`;
}

/**
 * 会社の代表電話。社名から決めるので、同じ会社ならいつ見ても同じ番号になる。
 * **毎回ランダムに振らないこと。** 名刺を開くたびに番号が変わる
 */
function phoneOf(g) {
  let h = 0;
  for (const ch of String(g.company.name || '')) h = (h * 131 + ch.charCodeAt(0)) >>> 0;
  // **符号付きシフト（>>）を使わないこと。** h が 2^31 を超えると負になり、
  // 剰余も負になって「03-7636--365」のような番号ができる
  const a = 3000 + (h % 6000);
  const b = 1000 + ((h >>> 7) % 9000);
  return `03-${a}-${b}`;
}

/** 郵便番号（架空）。これも社名から決める */
function zipOf(g) {
  let h = 7;
  for (const ch of String(g.company.name || '')) h = (h * 37 + ch.charCodeAt(0)) >>> 0;
  return `${100 + (h % 60)}-${String((h >>> 5) % 10000).padStart(4, '0')}`;
}

/** 本社の所在地。地盤の地区を使う */
function addressOf(g) {
  const d = DISTRICTS[g.company.home] || DISTRICTS.T;
  const c = CITIES[cityOf(d.id)] || CITIES.minato;
  let h = 11;
  for (const ch of String(g.company.name || '')) h = (h * 17 + ch.charCodeAt(0)) >>> 0;
  const chome = 1 + (h % 5), ban = 1 + ((h >>> 3) % 20), go = 1 + ((h >>> 6) % 30);
  return {
    line: `${c.name}${d.short}${'一二三四五'[chome - 1]}丁目${ban}番${go}号`,
    kana: d.kana || '',
  };
}

/**
 * 名刺1枚ぶんのHTML。
 * 日本の名刺（91×55mm）の比率に合わせてある。
 *
 * person を省くと社長（プレイヤー本人）の名刺になる。
 */
export function cardHTML(g, person = null) {
  const me = ceo(g);
  const isCeo = !person;
  const name = isCeo ? me.name : person.name;
  const title = isCeo ? rankName(g, CEO_RANK) : rankName(g, person.rank);
  const belong = isCeo ? '' : affiliation(person);
  const addr = addressOf(g);
  return `
  <div class="meishi">
    <div class="meishi-top">
      <div class="meishi-logo">${logoSVG(46)}</div>
      <div class="meishi-co">
        <div class="meishi-name">${g.company.name}</div>
        <div class="meishi-kicker">REAL ESTATE &amp; URBAN DEVELOPMENT</div>
      </div>
    </div>
    <div class="meishi-person">
      ${belong ? `<div class="meishi-belong">${belong}</div>` : ''}
      <div class="meishi-title">${title}</div>
      <div class="meishi-pname">${name}</div>
    </div>
    <div class="meishi-foot">
      <div>〒${zipOf(g)}　${addr.line}</div>
      <div>TEL ${phoneOf(g)}　／　創業 ${me.since || g.year}年</div>
    </div>
  </div>`;
}

/**
 * 名刺のダイアログ。
 * 社長のほか、役員と社員の名刺も同じ形で出せる。
 */
export function openCard(g, person = null) {
  const isCeo = !person;
  const title = isCeo ? '名刺' : `名刺　${person.name}`;
  const t = person && teamById(person.team);
  openModal(title, `
    ${cardHTML(g, person)}
    <div class="hint" style="margin-top:14px">
      社名はタイトル画面で入れたもの、住所は地盤（${(DISTRICTS[g.company.home] || DISTRICTS.T).name}）から作っている。
      ${isCeo
    ? '肩書は <b>人事パネルの「役職名を改称する」</b> で変えられる。'
    : `所属は ${DEPTS[person.dept].name}${t ? ' ' + t.name : ''}。異動すればこの名刺も変わる。`}
    </div>`, [
    { label: '閉じる', cls: 'ghost' },
  ]);
}
