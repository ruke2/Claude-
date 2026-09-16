// ============================================================
//  UIヘルパー
// ============================================================
export const $ = s => document.querySelector(s);
export const $$ = s => Array.from(document.querySelectorAll(s));

/** タグ付きテンプレート：HTMLをそのまま返す（可読性のため） */
export const h = (strings, ...vals) => strings.reduce((a, s, i) => a + s + (vals[i] ?? ''), '');

let modalCb = null;

export function openModal(title, bodyHTML, buttons = []) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHTML;
  const foot = $('#modalFoot');
  foot.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.className = 'btn ' + (b.cls || '');
    el.textContent = b.label;
    el.disabled = !!b.disabled;
    el.onclick = () => { if (b.onClick) b.onClick(); if (b.close !== false) closeModal(); };
    foot.appendChild(el);
  }
  $('#modalWrap').classList.remove('hidden');
  return $('#modalBody');
}
export function closeModal() { $('#modalWrap').classList.add('hidden'); modalCb = null; }

let toastTimer = null;
export function toast(msg, kind = '') {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = msg;
  document.body.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3400);
}

/** 小さなスパークライン */
export function spark(values, opt = {}) {
  const { w = 260, hgt = 46, color = '#54d6ff', fill = true, zero = false } = opt;
  if (!values || values.length < 2) return '';
  const min = Math.min(...values, zero ? 0 : Infinity);
  const max = Math.max(...values, zero ? 0 : -Infinity);
  const rng = (max - min) || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = hgt - ((v - min) / rng) * (hgt - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = fill ? `<polygon points="0,${hgt} ${pts.join(' ')} ${w},${hgt}" fill="url(#sg)" opacity=".28"/>` : '';
  const zeroLine = (min < 0 && max > 0)
    ? `<line x1="0" x2="${w}" y1="${(hgt - ((0 - min) / rng) * (hgt - 6) - 3).toFixed(1)}" y2="${(hgt - ((0 - min) / rng) * (hgt - 6) - 3).toFixed(1)}" stroke="rgba(255,255,255,.18)" stroke-dasharray="3 3"/>` : '';
  return `<svg class="spark" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="none">
    <defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    ${area}${zeroLine}<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round"/>
  </svg>`;
}

/** 横棒グラフ */
export function bar(ratio, cls = '') {
  const w = Math.max(0, Math.min(1, ratio)) * 100;
  return `<div class="bar ${cls}"><i style="width:${w.toFixed(1)}%"></i></div>`;
}

/** キー・バリュー行 */
export function kv(k, v, cls = '') {
  return `<div class="kv ${cls}"><span class="k">${k}</span><span class="v">${v}</span></div>`;
}

export function mini(k, v, s = '', color = '') {
  return `<div class="mini"><div class="mini-k">${k}</div><div class="mini-v" ${color ? `style="color:${color}"` : ''}>${v}</div>${s ? `<div class="mini-s">${s}</div>` : ''}</div>`;
}

export function chip(text, cls = 'grey') { return `<span class="chip ${cls}">${text}</span>`; }

export function section(title, note, inner) {
  return `<div class="sec"><div class="sec-t"><span>${title}</span>${note ? `<span class="note">${note}</span>` : ''}</div>${inner}</div>`;
}

export function empty(msg) { return `<div class="empty">${msg}</div>`; }
