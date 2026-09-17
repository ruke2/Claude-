// ============================================================
//  ホーム画面アイコン(PNG)を生成する
//    node scripts/make-icons.mjs  →  assets/icons/*.png
//  外部ライブラリを使わず、zlib だけで PNG を組み立てる
// ============================================================
import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return buf => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(body));
  return Buffer.concat([len, body, crc]);
}

function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------
//  アイコンの絵：藍色の背景に白いビル群のシルエット
//    inset … 絵を内側に寄せる割合（maskable 用の安全領域）
//    round … 角を丸めるか
// ------------------------------------------------------------
function icon(size, { inset = 0, round = true } = {}) {
  const S = size;
  const buf = Buffer.alloc(S * S * 4);
  const put = (x, y, r, g, b, a = 255) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    const na = a / 255, ia = 1 - na;
    buf[i] = buf[i] * ia + r * na;
    buf[i + 1] = buf[i + 1] * ia + g * na;
    buf[i + 2] = buf[i + 2] * ia + b * na;
    buf[i + 3] = Math.max(buf[i + 3], a);
  };
  const rect = (x0, y0, x1, y1, r, g, b, a = 255) => {
    for (let y = Math.round(y0); y < Math.round(y1); y++)
      for (let x = Math.round(x0); x < Math.round(x1); x++) put(x, y, r, g, b, a);
  };

  // 背景（斜めのグラデーション）— 全面を塗る
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const t = Math.min(1, x / S * 0.45 + y / S * 0.55);
      put(x, y, 42 - t * 21, 99 - t * 36, 184 - t * 59, 255);
    }

  // 絵を描く領域（inset 分だけ内側に寄せる）
  const o = S * inset, D = S * (1 - inset * 2);
  const X = u => o + u * D, Y = v => o + v * D;

  // 地面
  const ground = Y(0.815);
  rect(X(0), ground, X(1), Y(1), 12, 32, 62);

  // ビル（x開始, 幅, 高さ, 明るさ）
  const towers = [
    [0.145, 0.135, 0.300, 0.72],
    [0.300, 0.150, 0.470, 0.90],
    [0.470, 0.175, 0.615, 1.00],
    [0.665, 0.130, 0.395, 0.84],
    [0.805, 0.110, 0.255, 0.68],
  ];
  for (const [bx, bw, bh, bright] of towers) {
    const x0 = X(bx), x1 = X(bx + bw), y0 = Y(0.815 - bh);
    const v = Math.round(255 * bright);
    rect(x0, y0, x1, ground, v, v, v);

    // 窓
    const step = Math.max(3, D * 0.042);
    const wsz = Math.max(1, Math.round(D * 0.017));
    for (let y = y0 + step; y < ground - step * 0.5; y += step)
      for (let x = x0 + step * 0.42; x < x1 - wsz - 1; x += step * 0.72)
        rect(x, y, x + wsz, y + wsz, 21, 58, 108, 235);
  }

  // 角丸に切り抜く
  if (round) {
    const r = S * 0.215;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const cx = Math.min(x + 0.5, S - x - 0.5), cy = Math.min(y + 0.5, S - y - 0.5);
        if (cx < r && cy < r) {
          const d = Math.hypot(r - cx, r - cy);
          if (d > r) buf[(y * S + x) * 4 + 3] = 0;
          else if (d > r - 1.2) buf[(y * S + x) * 4 + 3] = Math.round(255 * (r - d) / 1.2);
        }
      }
  }
  return png(S, S, buf);
}

mkdirSync('assets/icons', { recursive: true });
for (const s of [180, 192, 512]) {
  writeFileSync(`assets/icons/icon-${s}.png`, icon(s));
  console.log(`assets/icons/icon-${s}.png`);
}
// maskable：どの形に切り抜かれても欠けないよう、絵を内側20%に収める
writeFileSync('assets/icons/icon-maskable-512.png', icon(512, { inset: 0.19, round: false }));
console.log('assets/icons/icon-maskable-512.png');
