// ============================================================
//  セーブの圧縮（LZW）
//    localStorage は1オリジンあたり 5MB 前後しか使えない。
//    長く遊んだセーブは素のJSONで 2MB を超え、
//    オート＋退避＋手動3つを置くと入りきらなくなる。
//
//    ここは**保存するときだけ**通す層である。
//    ゲームの状態そのものには一切触らない。
//    書き出しファイル（.json）は読める形のまま残す。
//
//    ・まず UTF-8 のバイト列にする（文字の種類を 0〜255 に閉じ込める）
//    ・LZW で縮める
//    ・コードを UTF-16 の1文字に1つずつ載せる
//
//    **サロゲート領域（0xD800〜0xDFFF）を避けること。**
//    単独のサロゲートは localStorage を往復する間に
//    置き換えられることがあり、二度と復元できなくなる。
// ============================================================

/** 目印。これが先頭にあれば圧縮済みとみなす */
export const MARK = 'LZW1:';

// --- コードと文字の行き来（サロゲート領域を飛ばす）---
const LOW_MAX = 0xD800 - 0x20;          // 0x20 を足しても手前に収まる範囲
const HIGH_ROOM = 0x10000 - 0xE000;     // サロゲートの後ろに残っている幅
const MAX_CODE = LOW_MAX + HIGH_ROOM;   // 辞書の上限（63,488）

const toChar = c => String.fromCharCode(c < LOW_MAX ? c + 0x20 : 0xE000 + (c - LOW_MAX));
const toCode = ch => {
  const n = ch.charCodeAt(0);
  return n >= 0xE000 ? LOW_MAX + (n - 0xE000) : n - 0x20;
};

const BASE = 256;                        // 0〜255 は1バイトそのもの

/** 文字列 → 1バイト1文字の並び（UTF-8） */
function toBytes(str) {
  const b = new TextEncoder().encode(str);
  let out = '';
  // 一度に渡しすぎると引数の上限で落ちるので、小分けにする
  for (let i = 0; i < b.length; i += 8192) {
    out += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
  }
  return out;
}

/** 1バイト1文字の並び → 文字列 */
function fromBytes(latin) {
  const b = new Uint8Array(latin.length);
  for (let i = 0; i < latin.length; i++) b[i] = latin.charCodeAt(i) & 0xFF;
  return new TextDecoder().decode(b);
}

/** 縮める。失敗したら素の文字列をそのまま返す（保存を止めないため） */
export function compress(input) {
  const s = String(input);
  if (!s) return '';
  try {
    const src = toBytes(s);
    const dict = new Map();
    let next = BASE;
    const out = [];
    let w = src[0] || '';
    for (let i = 1; i < src.length; i++) {
      const c = src[i];
      const wc = w + c;
      if (dict.has(wc)) { w = wc; continue; }
      out.push(w.length === 1 ? w.charCodeAt(0) : dict.get(w));
      if (next < MAX_CODE) dict.set(wc, next++);
      else { dict.clear(); next = BASE; }      // いっぱいになったら引き直す
      w = c;
    }
    if (w !== '') out.push(w.length === 1 ? w.charCodeAt(0) : dict.get(w));
    const parts = [MARK];
    // += で1文字ずつ足すと長い文字列で遅くなるので、小分けにして繋ぐ
    for (let i = 0; i < out.length; i += 4096) {
      let chunk = '';
      const end = Math.min(i + 4096, out.length);
      for (let j = i; j < end; j++) chunk += toChar(out[j]);
      parts.push(chunk);
    }
    return parts.join('');
  } catch (e) {
    return s;
  }
}

/** 戻す。目印が無ければ素の文字列とみなしてそのまま返す */
export function decompress(input) {
  const s = String(input);
  if (!s.startsWith(MARK)) return s;
  const body = s.slice(MARK.length);
  if (!body) return '';
  const dict = [];
  let next = BASE;
  let prev = String.fromCharCode(toCode(body[0]));
  const parts = [prev];
  for (let i = 1; i < body.length; i++) {
    const code = toCode(body[i]);
    let entry;
    if (code < BASE) entry = String.fromCharCode(code);
    else if (dict[code - BASE] !== undefined) entry = dict[code - BASE];
    else entry = prev + prev[0];               // 辞書に入る直前のコード
    parts.push(entry);
    if (next < MAX_CODE) { dict[next - BASE] = prev + entry[0]; next++; }
    else { dict.length = 0; next = BASE; }
    prev = entry;
  }
  return fromBytes(parts.join(''));
}
