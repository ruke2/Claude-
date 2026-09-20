// ============================================================
//  ブランドパネル — 自社ブランドの創設と育成
// ============================================================
import { money, num, pct } from '../core/format.js';
import { section, kv, mini, chip, bar, empty, lockCard, openModal, closeModal, toast } from './dom.js';
import { unlocked, needFor, ttmRevenue, UNLOCK_INFO } from '../sim/company.js';
import { BRAND_CATEGORIES, BRAND_GRADES, createBrand, brandEffect, brandPortfolioScore } from '../sim/brands.js';
import { USES } from '../data/city.js';

export const title = 'ブランド';

export function render(g, ctx) {
  const cards = g.brands.length ? g.brands.map(b => {
    const C = BRAND_CATEGORIES[b.category], G = BRAND_GRADES[b.grade];
    const e = brandEffect(g, b.id);
    const used = [...g.inventory, ...g.assets, ...g.projects].filter(x => x.brandId === b.id).length;
    return `<div class="card">
      <div class="card-t">
        <span class="card-n">${C.icon} ${b.name}</span>
        ${chip(G.name, b.grade === 'premium' ? 'gold' : b.grade === 'upper' ? 'cyan' : 'grey')}
      </div>
      <div class="card-s">${C.name}／${b.supplied}件・${num(Math.round(b.area))}坪を供給／稼働中 ${used}件</div>
      <div class="kv"><span class="k">認知度</span><span class="v">${b.awareness.toFixed(1)} / ${G.cap}</span></div>
      ${bar(b.awareness / 100, 'gold')}
      <div class="kv"><span class="k">評判</span><span class="v ${b.reputation < 45 ? 'down' : b.reputation > 70 ? 'up' : ''}">${b.reputation.toFixed(0)} / 100</span></div>
      ${bar(b.reputation / 100, b.reputation < 45 ? 'red' : '')}
      <div class="grid3" style="margin-top:9px">
        ${mini('分譲単価', '+' + pct(e.price - 1, 1))}
        ${mini('契約速度', '+' + pct(e.speed - 1, 1))}
        ${mini('賃料', '+' + pct(e.rent - 1, 1))}
      </div>
      <div class="kv" style="margin-top:8px"><span class="k">年間の広告投資</span><span class="v">${money(b.adSpend)}</span></div>
      <div class="btnrow">
        <button class="btn sm" data-act="brand.ad" data-id="${b.id}">広告投資を設定する</button>
        <button class="btn sm ghost" data-act="brand.rename" data-id="${b.id}">名称変更</button>
      </div>
    </div>`;
  }).join('') : empty('まだブランドを立ち上げていない。<br>ブランドは分譲単価・契約速度・賃料を押し上げ、供給を重ねるほど強くなる。');

  const catRows = Object.values(BRAND_CATEGORIES).map(c => {
    const owned = g.brands.filter(b => b.category === c.id);
    return `<tr>
      <td>${c.icon} ${c.name}</td>
      <td>${owned.length ? owned.map(b => b.name).join('・') : '<span style="color:var(--ink-mute)">なし</span>'}</td>
      <td>${owned.length ? owned.reduce((a, b) => Math.max(a, b.awareness), 0).toFixed(0) : '—'}</td>
    </tr>`;
  }).join('');

  return `
  ${section('ブランド・ポートフォリオ', `${g.brands.length}ブランド`, `
    <div class="grid3">
      ${mini('保有ブランド', g.brands.length + '件')}
      ${mini('平均認知度', g.brands.length ? (g.brands.reduce((a, b) => a + b.awareness, 0) / g.brands.length).toFixed(0) : '—')}
      ${mini('企業ブランド', g.company.brand.toFixed(0), '全社の信用力')}
    </div>
    <div class="hint">物件にブランドを冠すると、そのブランドの認知度に応じて分譲単価・契約速度・賃料が上乗せされる。供給を重ねるほど認知度は上がるが、値下げや長期在庫、減損は評判を傷つける。</div>
    <table class="tbl" style="margin-top:12px">
      <tr><th>カテゴリ</th><th>保有ブランド</th><th>最高認知度</th></tr>
      ${catRows}
    </table>
  `)}

  ${section('保有ブランド', '', cards)}

  ${section('新しいブランドを立ち上げる', '', `
    ${unlocked(g, 'brand') ? `<div class="card">
      <div class="card-s">カテゴリごとにブランドを持てる。立ち上げには初期の広告宣伝費がかかり、格が高いほど育成に時間はかかるが、最終的な効果は大きい。</div>
      <div class="btnrow"><button class="btn primary" data-act="brand.new">ブランドを立ち上げる</button></div>
    </div>` : lockCard(UNLOCK_INFO.brand, needFor(g, 'brand'), ttmRevenue(g))}
    ${Object.values(BRAND_GRADES).map(G => `
      <div class="card">
        <div class="card-t"><span class="card-n">${G.name}</span>${chip(money(G.cost), 'gold')}</div>
        <div class="card-s">${G.desc}</div>
        <div class="kv"><span class="k">単価補正</span><span class="v">×${G.priceMul.toFixed(2)}</span></div>
        <div class="kv"><span class="k">認知度の上限</span><span class="v">${G.cap}</span></div>
        <div class="kv"><span class="k">育ちやすさ</span><span class="v">×${G.growth.toFixed(2)}</span></div>
      </div>`).join('')}
  `)}
  `;
}

export function openNew(g, ctx) {
  let cat = 'resi', grade = 'upper';
  openModal('ブランドの立ち上げ', build(), []);
  bind();

  function build() {
    const C = BRAND_CATEGORIES[cat], G = BRAND_GRADES[grade];
    return `
    <div class="field">
      <label>カテゴリ</label>
      <select id="selCat">${Object.values(BRAND_CATEGORIES).map(c => `<option value="${c.id}" ${c.id === cat ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}</select>
    </div>
    <div class="hint">対象用途：${C.uses.map(u => USES[u].name).join('・')}　（実在の例：${C.example}）</div>
    <div class="field" style="margin-top:12px">
      <label>ブランドの格</label>
      <select id="selGrade">${Object.values(BRAND_GRADES).map(x => `<option value="${x.id}" ${x.id === grade ? 'selected' : ''}>${x.name}（立ち上げ費 ${money(x.cost)}）</option>`).join('')}</select>
    </div>
    <div class="hint">${G.desc}</div>
    <div class="field" style="margin-top:12px">
      <label>ブランド名</label>
      <input type="text" id="inpName" maxlength="16" placeholder="例：パークコート" value="">
    </div>
    <div class="card" style="margin-top:10px">
      ${kv('立ち上げ費用', money(G.cost))}
      ${kv('現預金', money(g.cash))}
      ${kv('初期の認知度', (6 + (grade === 'premium' ? 4 : 0)) + ' / ' + G.cap)}
      <div class="hint">立ち上げ直後の効果はごく小さい。物件を供給するたびに認知度が上がり、効果が積み上がっていく。</div>
    </div>
    <div class="btnrow"><button class="btn primary wide" data-create="1" ${g.cash < G.cost ? 'disabled' : ''}>このブランドを立ち上げる</button></div>`;
  }
  function refresh() { document.getElementById('modalBody').innerHTML = build(); bind(); }
  function bind() {
    const body = document.getElementById('modalBody');
    body.querySelector('#selCat').onchange = e => { cat = e.target.value; refresh(); };
    body.querySelector('#selGrade').onchange = e => { grade = e.target.value; refresh(); };
    body.querySelector('[data-create]').onclick = () => {
      const name = (body.querySelector('#inpName').value || '').trim();
      if (!name) return toast('ブランド名を入力すること', 'bad');
      if (g.brands.some(b => b.name === name)) return toast('同じ名前のブランドがある', 'bad');
      const b = createBrand(g, { name, category: cat, grade });
      toast(`ブランド「${b.name}」を立ち上げた`, 'good');
      g.news.push({ icon: '◆', type: 'brand', major: true, text: `${BRAND_CATEGORIES[cat].name}の新ブランド「${b.name}」を立ち上げた。` });
      ctx.refresh(); closeModal();
    };
  }
}

export function openAd(g, b, ctx) {
  openModal(`広告投資 — ${b.name}`, `
    <div class="card">
      ${kv('現在の認知度', b.awareness.toFixed(1))}
      ${kv('現在の年間広告費', money(b.adSpend))}
      ${kv('認知度の上限', BRAND_GRADES[b.grade].cap)}
    </div>
    <div class="field" style="margin-top:12px">
      <label>年間の広告投資額（億円）</label>
      <input type="number" id="inpAd" value="${Math.round(b.adSpend / 100)}" min="0" step="1">
    </div>
    <div class="hint">広告は物件の供給がなくても認知度を維持・向上させる。ただし供給実績を伴わない認知はすぐ頭打ちになる。</div>
  `, [
    { label: 'キャンセル', cls: 'ghost' },
    {
      label: '設定する', cls: 'primary', onClick: () => {
        b.adSpend = Math.max(0, Math.round((+document.getElementById('inpAd').value) * 100));
        toast('広告投資を設定した'); ctx.refresh();
      }
    },
  ]);
}

export function openRename(g, b, ctx) {
  openModal('ブランド名の変更', `
    <div class="field"><label>新しい名称</label><input type="text" id="inpN" maxlength="16" value="${b.name}"></div>
    <div class="hint">既存物件の名称は変わらない。以後に供給する物件から新しい名称が使われる。</div>
  `, [
    { label: 'キャンセル', cls: 'ghost' },
    {
      label: '変更する', cls: 'primary', onClick: () => {
        const v = (document.getElementById('inpN').value || '').trim();
        if (v) { b.name = v.slice(0, 16); toast('名称を変更した'); ctx.refresh(); }
      }
    },
  ]);
}
