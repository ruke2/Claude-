// ===== 画面遷移・UI =====
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let W = null, quick = false, selColor = SILKS[0], tab = 'home', newsPage = 0;
  const STYLE = ['逃げ', '先行', '差し', '追込'];
  const SURF = { T: '芝', D: 'ダ', B: '芝・ダ' };
  const ORDERS = ['ハナを切って自分のペースで', '好位で流れに乗って', '中団で脚をためて', '後方で脚をためて直線勝負'];

  // ---- 画面の向き：縦（向きロック中）なら、画面ごと横向きに回す ----
  let rotDir = 'cw';
  try { rotDir = localStorage.getItem('jl-rot') || 'cw'; } catch (e) {}
  function applyRotation() {
    // Safari はアドレスバーの分だけ 100vh が実際より大きいので、見えている大きさ（px）で合わせる
    // 実際に描ける範囲は、画面に固定した body の大きさで測る（visualViewport は下の帯の分だけ小さいことがある）
    const br = document.body.getBoundingClientRect();
    const vv = window.visualViewport;
    const w = Math.round(br.width || (vv ? vv.width : window.innerWidth)), h = Math.round(br.height || (vv ? vv.height : window.innerHeight));
    const portrait = h > w;
    const root = document.documentElement, app = $('app');
    root.classList.toggle('rot', portrait);
    root.classList.toggle('ccw', portrait && rotDir === 'ccw');
    if (portrait) {
      // 時計やノッチのある帯（上）には何も描かない。そこにアプリ側のぼかしが重なって白っぽく見えるため。下は端まで使う
      const top = parseFloat(getComputedStyle($('safe-probe')).paddingTop) || 0;
      const len = h - top;
      app.style.width = len + 'px'; app.style.height = w + 'px';
      app.style.transform = rotDir === 'ccw' ? `translate(0px, ${h}px) rotate(-90deg)` : `translate(${w}px, ${top}px) rotate(90deg)`;
    } else { app.style.width = ''; app.style.height = ''; app.style.transform = ''; }
    window.scrollTo(0, 0);
    if (window.__R3) setTimeout(() => window.__R3.resize(), 50);
  }
  window.addEventListener('resize', applyRotation);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', applyRotation);
  window.addEventListener('orientationchange', () => setTimeout(applyRotation, 250));
  applyRotation();
  // 回転中は画面上の左右と指の動きの向きが変わる
  function uiDX(e, x0, y0) {
    if (!document.documentElement.classList.contains('rot')) return e.clientX - x0;
    return rotDir === 'ccw' ? -(e.clientY - y0) : (e.clientY - y0);
  }

  function show(id) { if (id !== 's-week' && window.Home3D) Home3D.stop(); document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id)); closeDrawer(); flushToasts(); if (window.Sound) Sound.bgm(id !== 'race'); }
  // 最初に画面に触れたときに音声を準備する（ブラウザは操作の前に音を出せない）
  document.addEventListener('pointerdown', () => { if (window.Sound) { Sound.init(); if (!$('race').classList.contains('on')) Sound.bgm(true); } }, { once: true, capture: true });
  function gradeTag(race) {
    if (race.graded) return `<span class="badge g${race.graded}">G${'ⅠⅡⅢ'[race.graded - 1]}</span>`;
    if (race.overseas) return '<span class="badge g1">海外GⅠ</span>';
    if (race.label === race.name) return '';
    return `<span class="badge">${esc(race.label)}</span>`;
  }
  function raceCond(race) { return `${SURF[race.surf]}${race.dist}m・${race.ground || '良'}`; }
  function condLine(race) { return `天気 <b>${race.weather || '晴'}</b>　馬場 <b>${race.ground || '良'}</b>　傾向 <b>${World.biasText(race.bias)}</b>`; }
  const BIAS_TIP = '馬場の傾向（トラックバイアス）。内有利なら内ラチ沿いが伸び、外有利なら外めが伸びる。前有利なら前の馬が止まりにくく、差し有利なら後ろから届きやすい。天気と馬場はその日のうちにも変わる。';
  const horseAge = (h) => W.year - h.born;
  const sexAge = (h) => `${h.sex}${horseAge(h)}`;
  function realTag(h) { if (h.legend) return ` <span class="badge gold" title="往年の名馬と同じ名の新馬（${h.legend.b}年生まれの${esc(h.legend.w.slice(0, 3).join('・'))}${h.legend.w.length > 3 ? 'など' : ''}）">名馬</span>`; return h.real ? ' <span class="badge gold" title="実在馬（2026年JRA GⅠ出走馬）">実在</span>' : h.foreign ? ' <span class="badge">外国馬</span>' : h.story === 'partner' ? ' <span class="badge gold">相棒</span>' : ''; }
  // 能力の点数（0〜100）。出走メンバーの中での順位と、平均との差も出す
  function abilityHtml(race, h) {
    const field = race.field.map(f => W.horses[f.hid]).filter(Boolean);
    const abs = field.map(x => ({ x, a: World.ability(x, W.year), r: World.rating(x, W.year) }));
    const me = abs.find(o => o.x === h) || { a: World.ability(h, W.year), r: World.rating(h, W.year) };
    const rows = [['総合', 'r', '能力の総合点（スピード5割・スタミナ2.5割・瞬発力2.5割）'], ['スピード', 'spd', '巡航の速さ。高いほど楽に前へ行ける'], ['スタミナ', 'sta', '脚の持ち。長い距離や早めの仕掛けで効く'], ['瞬発力', 'kick', '追い出してからの伸び。直線の切れ']];
    const val = (o, k) => k === 'r' ? o.r : o.a[k];
    const color = (v) => v >= 85 ? 'var(--red)' : v >= 75 ? 'var(--gold)' : v >= 62 ? 'var(--green)' : '#7d8a99';
    let out = '<div class="abil">';
    rows.forEach(([name, k, help]) => {
      const v = val(me, k), avg = abs.reduce((a, o) => a + val(o, k), 0) / Math.max(1, abs.length);
      const rank = 1 + abs.filter(o => val(o, k) > v + 1e-9).length, d = v - avg;
      out += `<div class="ab-row${k === 'r' ? ' tot' : ''}"><span class="ab-n">${name} ${tip(help)}</span><span class="ab-bar"><i style="width:${clamp(v, 0, 100)}%;background:${color(v)}"></i><em style="left:${clamp(avg, 0, 100)}%"></em></span><b class="tnum">${v.toFixed(1)}</b><span class="ab-d tnum ${d >= 0 ? 'up' : 'dn'}">${d >= 0 ? '+' : ''}${d.toFixed(1)}</span><span class="ab-k small muted">${rank}位</span></div>`;
    });
    const mud = World.mudOf(h), tmp = h.tmp;
    out += `<div class="ab-row"><span class="ab-n">気性 ${tip('数字が大きいほど激しい。激しい馬は前に馬がいないとかかりやすい。馬の後ろに入れて落ち着かせる。')}</span><span class="ab-bar"><i style="width:${tmp}%;background:${tmp > 65 ? 'var(--red)' : tmp > 40 ? 'var(--gold)' : 'var(--blue)'}"></i></span><b class="tnum">${tmp.toFixed(0)}</b><span class="ab-d small">${tmp > 65 ? '激しい' : tmp > 40 ? 'ふつう' : '素直'}</span><span></span></div>`;
    const mv = 50 + 50 * mud;
    out += `<div class="ab-row"><span class="ab-n">道悪 ${tip('雨で湿った芝の巧拙。50がふつうで、高いほど得意。芝のレースで馬場が悪いほど差が出る。')}</span><span class="ab-bar"><i style="width:${mv}%;background:${mv > 70 ? 'var(--green)' : mv < 30 ? '#7d8a99' : 'var(--gold)'}"></i></span><b class="tnum">${mv.toFixed(0)}</b><span class="ab-d small">${mud > 0.4 ? '得意' : mud < -0.4 ? '苦手' : 'ふつう'}</span><span></span></div>`;
    out += '<div class="small muted" style="margin-top:2px">数字の右は出走馬の平均との差と、メンバー中の順位。棒の細い線が平均。</div></div>';
    return out;
  }
  function stars(v) { const n = clamp(Math.round((v - 40) / 12), 1, 5); return '★'.repeat(n) + '☆'.repeat(5 - n); }
  function silkChip(o) { const s = o.silks; return `<span class="silk" style="background:linear-gradient(90deg,${s.base} 50%,${s.accent} 50%)"></span>`; }
  function waku(n) { const c = WAKU_COLORS[n - 1]; return `<span class="waku" style="background:${c};color:${[1, 5].includes(n) ? '#000' : '#fff'}">${n}</span>`; }
  function tip(text) { return `<span class="tip" tabindex="0" role="button" aria-label="説明">?<span class="tt">${esc(text)}</span></span>`; }
  const P = () => W.player;
  const money = (v) => `${Math.round(v).toLocaleString()}万円`;
  function confirmTap(btn, label, fn) {
    if (btn.dataset.armed) { fn(); return; }
    const orig = btn.textContent; btn.dataset.armed = '1'; btn.textContent = label;
    setTimeout(() => { delete btn.dataset.armed; btn.textContent = orig; }, 3000);
  }
  function modal(html, bind, head = '') { $('modal-body').innerHTML = (head ? `<div class="mh">${esc(head)}</div>` : '') + `<div class="mb">${html}</div>`; $('modal').classList.add('on'); if (bind) bind($('modal-body')); }
  function closeModal() { $('modal').classList.remove('on'); }
  // ツールチップはタップでも開く
  document.addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('.tip'); document.querySelectorAll('.tip.open').forEach(x => { if (x !== t) x.classList.remove('open'); }); if (t) t.classList.toggle('open'); });

  // ---- トースト ----
  function toast(text) {
    const el = document.createElement('div'); el.className = 'toast'; el.textContent = text;
    $('toasts').appendChild(el); setTimeout(() => el.remove(), 3200);
  }
  function flushToasts() { if (W && W.toasts && W.toasts.length) { W.toasts.splice(0).slice(-4).forEach((t, i) => setTimeout(() => toast(t), i * 400)); } }

  // ---- グローバルナビゲーション ----
  function gnav(id, extra = '') {
    const p = P(); const ys = p.years[W.year] || { wins: 0, rides: 0 };
    const allow = World.apprenticeAllowance(p);
    const gw = World.gearOf(p);
    $(id).innerHTML = `<div class="logo">ジョッキー・ライフ<small>${esc(Progress.title(W))}</small></div>
      <div class="date"><b>${esc(W.date.replace('(日)', ''))}</b> ${esc(VENUES[W.venue].name)}${W.isOverseas ? '（遠征）' : ''}</div>
      <div class="stats grow">
        <span class="gchip">Lv<b>${p.lv}</b></span>
        <span class="gchip">今年<b>${ys.wins}</b>勝</span>
        <span class="gchip">評価<b>${Math.round(p.rep)}</b></span>
        <span class="gchip">ファン<b>${p.fans.toLocaleString()}</b></span>
        <span class="gchip ${p.weight + gw > 55 ? 'warn' : ''}">体重${p.weight.toFixed(1)}kg</span>
        <span class="gchip ${p.cond < 50 ? 'warn' : ''}">体調${Math.round(p.cond)}</span>
        <span class="gchip">${money(p.money)}</span>${allow ? `<span class="gchip">▲${allow}kg減</span>` : ''}
      </div>${extra}${W && !quick ? '<button class="gsave" data-save>セーブ</button>' : ''}<button class="burger" aria-label="メニュー" data-menu>☰</button>`;
    $(id).querySelector('[data-menu]').onclick = openDrawer;
    const sv = $(id).querySelector('[data-save]'); if (sv) sv.onclick = () => { World.save(W); CloudSave.flush(); const d = new Date(); toast(`セーブした（${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}）`); };
  }
  function crumbs(id, items) {
    $(id).innerHTML = items.map((it, i) => (i ? '<span class="sep">›</span>' : '') + (it[1] ? `<a data-i="${i}">${esc(it[0])}</a>` : `<span>${esc(it[0])}</span>`)).join('');
    $(id).querySelectorAll('a').forEach(a => a.onclick = items[+a.dataset.i][1]);
  }
  const weekLabel = () => `${W.year}年 ${W.month}月`;

  // ---- ドロワーメニュー ----
  function openDrawer() {
    const inGame = !!W && !quick;
    $('drawer').innerHTML = `<h3>メニュー</h3>
      ${inGame ? '<button class="item" data-a="save">💾 セーブする</button><button class="item" data-a="export">📤 セーブを書き出す（ファイル）</button><button class="item" data-a="home">🏠 今週の画面へ</button>' : ''}
      <button class="item" data-a="tut">🎓 チュートリアル</button>
      <button class="item" data-a="rot">🔄 画面の回転方向を反転（縦持ち時）</button>
      <button class="item" data-a="snd">🔈 効果音：${Sound.isMuted() ? 'OFF' : 'ON'}</button>
      <button class="item" data-a="bgm">🎵 BGM：${Sound.bgmEnabled() ? 'ON' : 'OFF'}</button>
      <button class="item" data-a="credit">ⓘ 素材のクレジット</button>
      <button class="item" data-a="title">↩ タイトルへ${inGame ? '（自動でセーブ）' : ''}</button>
      <p class="small muted" style="margin-top:auto">縦向きのまま（向きロック中）でも、画面は横向きに回して表示する。</p>`;
    $('drawer').classList.add('on'); $('drawer-bg').classList.add('on');
    $('drawer').querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a; closeDrawer();
      if (a === 'save') { World.save(W); CloudSave.flush(); toast('セーブした'); }
      if (a === 'export') exportSave();
      if (a === 'home') showWeek();
      if (a === 'credit') modal(`<div class="small" style="line-height:1.8">歓声："Arrowhead Stadium crowd noise" by Kj1595（CC BY-SA 4.0、Wikimedia Commons）を切り出して使用<br>ファンファーレ："Call to the Post (First Call)" U.S. Army Bands Online（パブリックドメイン）<br>BGM："Green Hills" by Igor Gundarev（CC0、OpenGameArt）<br>馬のモデル："Horse" by Henry S（Sketchfab、CC BY 4.0）を変換・加工して使用<br>芝・砂・空の画像：Poly Haven（CC0）</div><div class="choices"><button class="btn primary" id="m-ok">閉じる</button></div>`, () => { $('m-ok').onclick = closeModal; }, '素材のクレジット');
      if (a === 'tut') { if (W && !quick) World.save(W); startTutorial(); }
      if (a === 'rot') { rotDir = rotDir === 'cw' ? 'ccw' : 'cw'; try { localStorage.setItem('jl-rot', rotDir); } catch (e) {} applyRotation(); }
      if (a === 'snd') Sound.toggleMute();
      if (a === 'bgm') { Sound.init(); const on = Sound.toggleBgm(); toast('BGM：' + (on ? 'ON' : 'OFF')); }
      if (a === 'title') { setTimeout(refreshTitle, 0); if (W && !quick) World.save(W); W = null; quick = false; refreshTitle(); show('s-title'); }
    });
  }
  function closeDrawer() { $('drawer').classList.remove('on'); $('drawer-bg').classList.remove('on'); }
  $('drawer-bg').onclick = closeDrawer;

  // ---------- タイトル ----------
  const fmtStamp = (t) => { if (!t) return ''; const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
  function refreshTitle() {
    $('b-continue').disabled = !World.hasSave();
    const loc = World.rawSave(), li = loc ? World.saveInfo(loc) : null, cs = CloudSave.state(), cl = cs.last;
    let t = li ? `この端末：${esc(li.name)}・${esc(li.date || '')}・${li.wins}勝${li.savedAt ? `（${fmtStamp(li.savedAt)} 保存）` : ''}` : 'この端末：セーブなし';
    if (cs.available) t += `<br>クラウド：${cl ? `${esc(cl.name)}・${esc(cl.date || '')}・${cl.wins}勝（${fmtStamp(cl.savedAt)} 保存）` : 'まだ保存なし（遊ぶと自動で保存される）'}`;
    $('save-status').innerHTML = `<span class="muted">${t}</span>`;
    // 端末のセーブがない、またはクラウドの方が新しいときに復元ボタンを出す
    const newer = cl && (!li || (cl.savedAt || 0) > (li.savedAt || 0) + 1000);
    $('b-cloud').style.display = newer ? '' : 'none';
  }
  refreshTitle();
  CloudSave.onChange(() => { if ($('s-title').classList.contains('on')) refreshTitle(); });
  CloudSave.init().then(() => refreshTitle());
  // 保存するたびにクラウドへも送る（claude.ai 上でだけ動く）
  World.setOnSaved((str) => { const i = World.saveInfo(str); CloudSave.queue(str, i); });
  function startLoaded(w) { W = w; Progress.ensure(W); quick = false; tab = 'home'; showWeek(); }
  $('b-cloud').onclick = async () => {
    const b = $('b-cloud'); b.disabled = true; b.textContent = '読み込み中…';
    try {
      const str = await CloudSave.fetchSave();
      const w = str && World.parse(str);
      if (!w) { toast('クラウドのセーブを読めなかった'); return; }
      World.save(w); toast('クラウドのセーブを復元した'); startLoaded(w);
    } catch (e) { toast('クラウドに接続できなかった'); } finally { b.disabled = false; b.textContent = 'クラウドのセーブから再開'; }
  };
  async function exportSave() {
    const str = W && !quick ? World.serialize(W) : World.rawSave();
    if (!str) { toast('書き出すセーブがない'); return; }
    const i = World.saveInfo(str) || {};
    const d = new Date(), fn = `jockey-life-${(i.name || 'save').replace(/[^\w\u3040-\u30ff\u4e00-\u9fff-]/g, '')}-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    let dl = null; try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) {}
    if (dl) {
      try { await dl.save({ filename: fn, data: new Blob([str]) }); toast('書き出した'); } catch (e) { if (e && e.code !== 'declined') toast('書き出せなかった（' + (e.code || 'error') + '）'); }
      return;
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([str], { type: 'application/json' })); a.download = fn; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  $('b-export').onclick = exportSave;
  $('b-import').onclick = () => $('f-import').click();
  $('f-import').onchange = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    const str = await f.text(), w = World.parse(str);
    if (!w) { toast('セーブのファイルとして読めなかった'); return; }
    const i = World.saveInfo(str);
    modal(`<p>${esc(i.name)}（${esc(i.date || '')}・${i.wins}勝）のセーブを読み込む。いまの端末のセーブは控えに残る。</p><div class="choices"><button class="btn primary" id="m-imp">読み込んで再開</button><button class="btn" id="m-cancel">やめる</button></div>`, () => {
      $('m-imp').onclick = () => { closeModal(); World.save(w); toast('読み込んだ'); startLoaded(w); };
      $('m-cancel').onclick = closeModal;
    }, 'セーブの読み込み');
  };
  $('b-new').onclick = () => { renderSwatches(); show('s-new'); };
  $('b-continue').onclick = () => { const w = World.load(); if (w) startLoaded(w); else toast('セーブを読めなかった。クラウドかファイルから戻せる'); };
  $('b-quick').onclick = quickRace;
  $('b-tut').onclick = () => startTutorial();
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
  document.querySelectorAll('#s-new .radio input').forEach(r => r.onchange = () => document.querySelectorAll('#s-new .radio').forEach(l => l.classList.toggle('on', l.querySelector('input').checked)));
  function renderSwatches() {
    const box = $('swatches'); box.innerHTML = '';
    SILKS.slice(0, 10).forEach(c => {
      const d = document.createElement('button'); d.className = 'swatch'; d.style.cssText = `width:26px;height:26px;border-radius:50%;background:${c};border:${c === selColor ? '3px solid var(--gold)' : '1px solid var(--rule)'}`;
      d.setAttribute('aria-label', '色を選ぶ');
      d.onclick = () => { selColor = c; renderSwatches(); }; box.appendChild(d);
    });
  }
  $('b-start').onclick = () => {
    if (World.hasSave() && !$('b-start').dataset.armed) return confirmTap($('b-start'), 'もう一度押すとセーブを上書き', () => {});
    const name = $('in-name').value.trim() || '新人 騎手';
    const region = document.querySelector('input[name=region]:checked').value;
    W = World.newGame({ name, region, color: selColor });
    quick = false;
    W.log.push({ abs: 0, text: `${W.date} ${region}所属の見習騎手としてデビュー` });
    World.news(W, `${name}騎手が${region}所属でデビュー`, 'me');
    World.save(W);
    tab = 'home';
    let seen = false; try { seen = localStorage.getItem('jl-tut') === '1'; } catch (e) {}
    if (seen) showWeek();
    else { show('s-week'); gnav('week-nav'); modal(`<h2>操作に慣れておこう</h2><p>レースの操作と画面の見方を、練習レースで1つずつ説明するチュートリアルがある（3分ほど）。</p><div class="choices"><button class="btn primary" id="m-tut">チュートリアルをやる（キャリアは保存済み。終わったら「つづきから」）</button><button class="btn" id="m-no">あとで</button></div>`, () => { $('m-tut').onclick = () => { closeModal(); startTutorial(); }; $('m-no').onclick = () => { closeModal(); showWeek(); }; }, 'ようこそ'); }
  };

  // ---------- 週の画面（タブ） ----------
  const TABS = [['home', 'ホーム'], ['week', '今週'], ['horses', 'お手馬'], ['goal', '目標・成績'], ['me', '騎手'], ['skill', 'スキル'], ['fans', '人気'], ['shop', 'ショップ'], ['people', '人脈'], ['life', '私生活'], ['news', 'ニュース'], ['ach', '実績'], ['career', 'キャリア']];
  function showWeek() {
    if (P().retired) return showRetire();
    Progress.ensure(W);
    show('s-week');
    gnav('week-nav');
    const sp = P().sp;
    $('tabs').innerHTML = TABS.map(([k, n]) => `<button class="tab ${tab === k ? 'on' : ''}" role="tab" data-t="${k}">${n}${(k === 'news' && W.news.some(x => x.abs >= W.abs - 1)) || (k === 'skill' && sp > 0) ? '<span class="dot"></span>' : ''}</button>`).join('');
    $('tabs').querySelectorAll('.tab').forEach(b => b.onclick = () => { tab = b.dataset.t; showWeek(); });
    const pane = $('tabpane');
    $('s-week').classList.toggle('home', tab === 'home');
    if (tab !== 'home' && window.Home3D) Home3D.stop();
    ({ home: renderHome, horses: renderHorses, week: renderWeekTab, goal: renderGoal, me: renderMe, skill: renderSkill, fans: renderFans, shop: renderShop, people: renderPeople, life: renderLife, news: renderNews, ach: renderAch, career: renderCareer }[tab] || renderWeekTab)(pane);
    // ストーリー → シーズン目標 → 出来事
    if (W.story && W.story.pending.length) playScenes(() => showWeek());
    else if (W.pendingGoal) showGoalPick();
    else if (W.events && W.events.length) showEvent();
  }
  function sceneHorse(h, raceName) {
    if (!h) return '';
    const a = World.ability(h, W.year), r = World.rating(h, W.year), g = raceName && GRADED.find(x => x.name === raceName);
    const col = (v) => v >= 85 ? 'var(--red)' : v >= 75 ? 'var(--gold)' : v >= 62 ? 'var(--green)' : '#7d8a99';
    const bar = (n, v) => `<div class="sh-ab"><span>${n}</span><i><b style="width:${clamp(v, 0, 100)}%;background:${col(v)}"></b></i><em>${Math.round(v)}</em></div>`;
    const fit = g ? Math.abs((h.dist || 1800) - g.dist) <= 200 ? '◎' : Math.abs((h.dist || 1800) - g.dist) <= 500 ? '○' : '△' : '';
    return `<div class="sh-card"><div class="sh-top"><b>${esc(h.name)}</b><span class="small muted">${sexAge(h)}・${h.starts}戦${h.wins}勝${(h.g1 || []).length ? `・GⅠ${h.g1.length}勝` : ''}</span><span class="sh-r" style="color:${col(r)}">${Math.round(r)}<small>総合</small></span></div>
      ${bar('スピード', a.spd)}${bar('スタミナ', a.sta)}${bar('瞬発力', a.kick)}
      <div class="small muted" style="margin-top:2px">${STYLE[h.style]}・得意 ${h.dist}m前後・${SURF[h.surf]}${g ? `・${esc(g.name)}（${g.dist}m）への距離適性 ${fit}` : ''}・絆 ${Math.round(P().bond[h.id] || 0)}</div></div>`;
  }
  function playScenes(done) {
    const S = W && W.story;
    if (!S || !S.pending.length) { if (done) done(); return; }
    const sc = S.pending[0]; let i = 0;
    const render = () => {
      const [who, text] = sc.lines[i];
      const last = i >= sc.lines.length - 1;
      let extra = '';
      // 馬を選ぶ場面（騎乗の打診・路線の相談）では、その馬の能力を並べて見せる
      const hs = last ? (sc.ride ? [sc.ride.hid].concat(sc.ride.other != null ? [sc.ride.other] : []) : sc.route ? [sc.route.hid] : []) : [];
      if (hs.length) extra += `<div class="sc-horses">${hs.map(id => sceneHorse(W.horses[id], sc.ride ? sc.ride.race : null)).join('')}</div>`;
      if (last && sc.input) extra += `<div style="margin-top:10px"><label class="small muted" for="sc-in">${esc(sc.inputLabel || '名前（カタカナ9文字まで）')}</label><br><input type="text" id="sc-in" maxlength="9" placeholder="例：${esc(sc.inputPh || 'ツギノカゼ')}" style="margin-top:4px"></div>`;
      const btns = last && sc.choice ? sc.choice.opts.map((o, k) => `<button class="btn ${k ? '' : 'primary'}" data-k="${k}">${esc(o)}</button>`).join('') : `<button class="btn primary" id="sc-next">${last ? (sc.input ? (sc.inputBtn || '名付ける') : '閉じる') : '次へ ›'}</button>`;
      modal(`${who ? `<div class="speaker">${esc(who)}</div>` : ''}<p style="margin:2px 0 6px;font-size:15px;line-height:1.75;font-family:var(--serif)">${esc(text)}</p>${extra}<div class="choices">${btns}</div>`, (el) => {
        const finish = (val) => { S.pending.shift(); Story.answer(W, sc, val); closeModal(); World.save(W); playScenes(done); };
        el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => finish(+b.dataset.k));
        const nx = $('sc-next');
        if (nx) nx.onclick = () => { if (!last) { i++; render(); } else finish(sc.input ? ($('sc-in').value || sc.inputPh || 'ツギノカゼ') : null); };
      }, `ストーリー　${i + 1} / ${sc.lines.length}`);
    };
    render();
  }
  function showEvent() {
    const e = W.events[0];
    modal(`<h2 style="margin:0 0 6px">${esc(e.title)}</h2><p style="margin:0;line-height:1.7">${esc(e.text)}</p>
      <div class="choices">${e.choices.map((c, i) => `<button class="btn ${i ? '' : 'primary'}" data-c="${i}">${esc(c[0])}</button>`).join('')}</div>`, (el) => {
      el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { World.applyEvent(W, e, +b.dataset.c); W.events.shift(); closeModal(); World.save(W); showWeek(); });
    }, '今週の出来事');
  }
  function showGoalPick() {
    const opts = Progress.goalOptions(W);
    modal(`<h2 style="margin-bottom:4px">${W.year}年のシーズン目標</h2><p class="small muted" style="margin:0 0 8px">年末に達成度で評価される。達成すると報酬、届かないと評価が少し下がる。</p>
      ${opts.map((o, i) => `<label class="radio ${i === 0 ? 'on' : ''}"><input type="radio" name="sg" value="${i}" ${i === 0 ? 'checked' : ''}><span><b>${esc(o.name)}</b> <span class="badge">${esc(o.diff)}</span><br><span class="small muted">報酬：${esc(o.reward)}</span></span></label>`).join('')}
      <div class="choices"><button class="btn primary" id="sg-ok">この目標で始める</button></div>`, (el) => {
      el.querySelectorAll('input[name=sg]').forEach(r => r.onchange = () => el.querySelectorAll('.radio').forEach(l => l.classList.toggle('on', l.querySelector('input').checked)));
      $('sg-ok').onclick = () => { Progress.setGoal(W, +el.querySelector('input[name=sg]:checked').value); closeModal(); World.save(W); showWeek(); };
    }, 'シーズン目標');
  }

  // ---------- ホーム：日本地図 → 美浦・栗東トレセンの町 ----------
  let homeView = 'japan'; // 'japan' | '美浦' | '栗東'
  const TC_KEY = { '美浦': 'miho', '栗東': 'ritto' };
  function renderHome(pane) {
    const p = P();
    const off = W.injury > 0 || p.suspended > 0 || !!W.away;
    const nReq = (W.requests || []).filter(q => q.okWeight).length;
    const main = W.card.find(r => r.graded) || W.card[W.card.length - 2] || W.card[0];
    const sg = window.Story && W.story ? Story.goal(W) : null;
    const gp = Progress.goalProgress(W);
    const newsNew = W.news.filter(x => x.abs >= W.abs - 1).length;
    const L = W.life || {};
    const st = Progress.spotState(W), left = Progress.SPOT_MAX - st.used.length;
    const japan = homeView === 'japan', isHome = homeView === p.region;
    const weekSub = off ? (W.away ? `${W.away.name}で修行中 あと${W.away.left}週` : W.injury > 0 ? `療養中 あと${W.injury}週` : `騎乗停止 あと${p.suspended}週`) : `騎乗依頼 ${nReq}件`;
    let items;
    if (japan) {
      items = [
        { tab: 'week', text: W.isOverseas ? '海外遠征' : `今週は${VENUES[W.venue].name}`, sub: weekSub, main: true },
        { tab: 'tc:miho', text: '美浦トレセン', sub: p.region === '美浦' ? '所属・自宅' : '出張する', cls: 'tc' },
        { tab: 'tc:ritto', text: '栗東トレセン', sub: p.region === '栗東' ? '所属・自宅' : '出張する', cls: 'tc' },
        { tab: 'note:hidaka', text: '日高', sub: '馬産地', note: true },
      ].concat(Object.keys(VENUES).filter(k => VENUES[k].jp && k !== W.venue).map(k => ({ tab: 'v:' + k, text: VENUES[k].name, note: true, cls: 'tiny' })));
    } else {
      const spots = Object.entries(Progress.SPOTS).filter(([, v]) => v.tc === homeView).map(([k, v]) => ({ tab: 'spot:' + k, text: v.name, sub: st.used.includes(k + '@' + homeView) ? '今週は済み' : `${homeView}だけ`, cls: 'uniq' }));
      items = isHome ? [
        { tab: 'week', text: '調教スタンド', sub: weekSub, main: true },
        { tab: 'people', text: '厩舎', sub: '調教師・馬主' },
        { tab: 'horses', text: '放牧地', sub: `お手馬 ${Object.keys(p.bond).filter(k => W.horses[k] && !W.horses[k].retired).length}頭` },
        { tab: 'goal', text: '本部', sub: gp ? `目標 ${gp.cur}/${gp.target}` : '目標・成績' },
        { tab: 'me', text: '騎手会館', sub: `Lv${p.lv} ${Progress.title(W)}` },
        { tab: 'life', text: '自宅', sub: L.stage === 'married' ? '家族' : '私生活' },
        { tab: 'skill', text: 'ジム', sub: p.sp > 0 ? `スキル ${p.sp}pt` : 'スキル・特訓', badge: p.sp > 0 ? p.sp : null },
        { tab: 'shop', text: 'ショップ', sub: money(p.money) },
        { tab: 'news', text: '新聞', sub: 'ニュース', badge: newsNew || null },
        { tab: 'ach', text: '記念館', sub: '実績・称号' },
        { tab: 'fans', text: 'ファン広場', sub: `${p.fans.toLocaleString()}人` },
        { tab: 'career', text: '資料館', sub: 'キャリア' },
      ].concat(spots) : [
        { tab: 'stand', text: '調教スタンド', sub: `${homeView}の馬が調教中`, note: true },
        { tab: 'spot:visit', text: '厩舎', sub: st.used.includes('visit@' + homeView) ? '今週は済み' : 'あいさつ回り', cls: 'uniq' },
        { tab: 'inn', text: '出張宿舎', sub: '泊まり先', note: true },
      ].concat(spots);
    }
    const head = japan ? '' : `<button class="home-back" id="home-back">◀ 日本地図</button><div class="home-title">${homeView}トレセン<small>${isHome ? '所属' : '出張先'}・限定はあと${Math.max(0, left)}回</small></div>`;
    pane.innerHTML = `<div id="home3d"></div>${head}
      <div class="home-info">
        <div class="hi-venue">${W.isOverseas ? '海外遠征' : esc(VENUES[W.venue].name) + '競馬場'}</div>
        <div class="hi-main">${main ? `${gradeTag(main)} <b>${esc(main.name)}</b> <span class="small">${main.surf === 'D' ? 'ダート' : '芝'}${main.dist}m</span>` : ''}</div>
        ${sg ? `<div class="hi-goal"><span>${esc(sg.title)}</span>${esc(sg.goal)}</div>` : ''}
      </div>
      <div class="home-hint">${japan ? 'トレセンか、今週の競馬場を押す' : '建物の札を押すと移動　左右になぞると回せる'}</div>`;
    const go = (t) => {
      if (t.startsWith('tc:')) { homeView = t === 'tc:miho' ? '美浦' : '栗東'; return showWeek(); }
      if (t.startsWith('spot:')) return spotModal(t.slice(5), homeView);
      tab = t; showWeek();
    };
    const el = $('home3d');
    try { Home3D.mount(el, { view: japan ? 'japan' : TC_KEY[homeView], home: isHome, venue: W.isOverseas ? '' : W.venue, month: W.month, items, onGo: go }); }
    catch (err) { console.error(err); const fb = items.filter(i => !i.note); el.innerHTML = `<div class="home-fallback">${fb.map(i => `<button class="btn" data-go="${i.tab}">${esc(i.text)}<br><span class="small muted">${esc(i.sub || '')}</span></button>`).join('')}</div>`; el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go)); }
    if ($('home-back')) $('home-back').onclick = () => { homeView = 'japan'; showWeek(); };
    // 左右になぞって回す
    let px = null, py = null;
    el.onpointerdown = (e) => { px = e.clientX; py = e.clientY; };
    el.onpointermove = (e) => { if (px == null) return; Home3D.drag(uiDX(e, px, py)); px = e.clientX; py = e.clientY; };
    el.onpointerup = el.onpointercancel = el.onpointerleave = () => { px = null; };
  }
  // 限定の場所：内容を見て、行うか決める
  function spotModal(id, tc) {
    const sp = Progress.SPOTS[id], p = P(), st = Progress.spotState(W);
    const no = Progress.spotCheck(W, id, tc), away = tc !== p.region;
    modal(`<div class="small muted">${esc(tc)}トレセン${sp.tc ? `　${esc(tc)}だけの場所` : ''}</div><h2 style="margin:2px 0 6px">${esc(sp.name)}</h2>
      <p style="margin:0 0 6px;line-height:1.7">${esc(sp.desc)}</p>
      <div class="kv"><span>効果</span><b>${esc(sp.eff)}</b></div>
      ${away && !st.trip ? `<div class="kv"><span>出張</span><b>交通費5万円・疲労+3（今週の最初の1回だけ）</b></div>` : ''}
      <div class="kv"><span>今週の残り</span><b>${Math.max(0, Progress.SPOT_MAX - st.used.length)}回</b></div>
      ${no ? `<p class="small" style="color:var(--red);margin:6px 0 0">${esc(no)}</p>` : ''}
      <div class="choices"><button class="btn primary" id="sp-do" ${no ? 'disabled' : ''}>${esc(sp.act)}</button><button class="btn" id="sp-no">やめる</button></div>`, () => {
      $('sp-no').onclick = () => closeModal();
      $('sp-do').onclick = () => { const out = Progress.spotDo(W, id, tc); closeModal(); if (out) { out.forEach(t => toast(t)); toast(sp.eff); World.save(W); } showWeek(); };
    }, '限定の場所');
  }
  // ---------- 追い切り ----------
  function uiDY(e, x0, y0) {
    if (!document.documentElement.classList.contains('rot')) return e.clientY - y0;
    return rotDir === 'ccw' ? (e.clientX - x0) : -(e.clientX - x0);
  }
  function startWorkout(hid, race) {
    const h = W.horses[hid], t = W.trainers[h.trainer], kind = Progress.workoutKind(W, race, h);
    const pl = Workout.plan(kind, World.rating(h, W.year)), tn = t ? t.name.replace('厩舎', '') + '調教師' : '調教師';
    modal(`<div class="speaker">${esc(tn)}</div><p style="margin:2px 0 8px;line-height:1.7">${esc(h.name)}の追い切りだ。${esc(pl.say)}</p>
      <div class="kv"><span>指示</span><b>${pl.name}</b></div><div class="kv"><span>4ハロンの時計</span><b>${pl.t4.toFixed(1)}秒</b></div><div class="kv"><span>終い1ハロン</span><b>${pl.l1.toFixed(1)}秒</b></div>
      <p class="small muted" style="margin:6px 0 0">ペース計の針を緑の帯に合わせ続ける。1ハロンごとに判定が出て、途中の「合図」を合わせると加点。${h.tmp >= 60 ? 'この馬は気性が激しく、抑えすぎると行きたがる。' : ''}</p>
      <div class="choices"><button class="btn primary" id="wo-go">自分で乗る</button><button class="btn" id="wo-skip">スキップ（おまかせで乗る）</button><button class="btn" id="wo-cancel">やめておく</button></div>`, () => {
      const done = (r) => { if (r) { const fx = Progress.workoutDone(W, hid, r); toast(`追い切り 評価${r.g}${r.auto ? '（おまかせ）' : ''}：調子${fx.tune >= 0 ? '+' : ''}${fx.tune}・絆+${fx.bond}${fx.trust ? `・信頼${fx.trust > 0 ? '+' : ''}${fx.trust}` : ''}`); World.save(W); } showWeek(); };
      $('wo-cancel').onclick = () => closeModal();
      $('wo-skip').onclick = () => { closeModal(); done(Workout.auto(kind, World.rating(h, W.year), P().tech)); };
      $('wo-go').onclick = () => {
        closeModal(); if (window.Home3D) Home3D.stop();
        const o = W.owners[h.owner], sk = o && o.silks ? o.silks : { base: '#ff5c7a', accent: '#ffffff' };
        const go = () => Workout.open($('app'), { name: h.name, marks: Horse3D.marksFor(h, W.year), coatMat: Horse3D.coatFor(h), coatKey: h.coatKey, socks: h.socks, hood: h.hood, silks: { base: sk.base, accent: sk.accent, pattern: sk.pattern || 'plain', cap: sk.cap || sk.base }, rating: World.rating(h, W.year), tmp: h.tmp, kind, dy: uiDY, onDone: done });
        // レースと同じ馬のモデルを使う（まだ読み込んでいなければ待つ）
        if (window.HorseGLB && !HorseGLB.ready) { toast('馬を準備中…'); HorseGLB.load().then(go, go); } else go();
      };
    }, '追い切り');
  }

  // ---------- お手馬 ----------
  let hsSel = null, hsFilter = null, hsSort = 'bond';
  const COAT = { bay: ['鹿毛', '#8a5a36'], darkbay: ['黒鹿毛', '#4a3020'], brown: ['青鹿毛', '#2f241d'], chestnut: ['栗毛', '#b5773f'], grey: ['芦毛', '#cfd2d6'], black: ['青毛', '#15110e'], liver: ['栃栗毛', '#6a3418'], flaxen: ['尾花栗毛', '#a8602c'], darkgrey: ['芦毛', '#7a7672'], white: ['白毛', '#f4f1ec'] };
  const posCls = (n) => n === 1 ? 'p1' : n === 2 ? 'p2' : n === 3 ? 'p3' : '';
  function renderHorses(pane) {
    const p = P();
    const all = Object.keys(p.bond).map(k => W.horses[k]).filter(Boolean);
    const myRec = (h) => { const m = (h.hist || []).filter(x => x.me); return { n: m.length, w: m.filter(x => x.pos === 1).length }; };
    const F = { active: (h) => !h.retired, main: (h) => !h.retired && h.mainJ === -1, graded: (h) => (h.hist || []).some(x => x.g && x.pos === 1) || (h.g1 || []).length, retired: (h) => h.retired, all: () => true };
    const SORT = { bond: (h) => p.bond[h.id] || 0, rate: (h) => World.rating(h, W.year), earn: (h) => h.earn || 0, wins: (h) => h.wins };
    if (!hsFilter) hsFilter = all.some(F.main) ? 'main' : 'active'; // 最初は主戦の馬を出す
    const list = all.filter(F[hsFilter]).sort((a, b) => SORT[hsSort](b) - SORT[hsSort](a));
    if (!list.some(h => h.id === hsSel)) hsSel = list[0] ? list[0].id : null;
    const chips = [['active', '現役'], ['main', '主戦'], ['graded', '重賞馬'], ['retired', '引退'], ['all', 'すべて']].map(([k, n]) => `<button class="hs-chip ${hsFilter === k ? 'on' : ''}" data-f="${k}">${n}<small>${all.filter(F[k]).length}</small></button>`).join('');
    const sorts = [['bond', '絆'], ['rate', '能力'], ['earn', '賞金'], ['wins', '勝利']].map(([k, n]) => `<button class="hs-chip s ${hsSort === k ? 'on' : ''}" data-s="${k}">${n}順</button>`).join('');
    const row = (h) => {
      const np = !h.retired ? World.nextPlan(W, h) : null, c = COAT[h.coatKey] || COAT.bay;
      return `<button class="hs-row ${h.id === hsSel ? 'on' : ''}" data-h="${h.id}">
        <span class="hs-coat" style="background:${c[1]}"></span>
        <span class="hs-nm"><b>${esc(h.name)}</b><small>${h.retired ? '引退' : sexAge(h) + '・' + World.CLASS_NAMES[Math.min(5, h.cls)]}・${h.starts}戦${h.wins}勝</small></span>
        <span class="hs-tags">${h.story === 'partner' ? '<i class="g">相棒</i>' : ''}${!h.retired && h.mainJ === -1 ? '<i class="m">主戦</i>' : ''}${(h.g1 || []).length ? `<i class="g">GⅠ${h.g1.length}</i>` : ''}${h.hof ? '<i class="g">顕彰馬</i>' : ''}${np ? `<i>${esc(np.name)}</i>` : ''}</span>
        <span class="hs-bond"><em style="width:${Math.min(100, p.bond[h.id] || 0)}%"></em></span></button>`;
    };
    pane.innerHTML = `<div class="hs-wrap"><div class="hs-left"><div class="hs-bar">${chips}<span class="hs-sep"></span>${sorts}</div>
      <div class="scroll hs-list">${list.length ? list.map(row).join('') : '<p class="muted small" style="padding:10px">当てはまる馬がいない。レースで騎乗した馬がここに並ぶ。</p>'}</div></div>
      <div class="scroll hs-detail card">${hsSel != null ? horseDetail(W.horses[hsSel]) : '<p class="muted">馬を選ぶと、くわしい情報が出る。</p>'}</div></div>`;
    pane.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { hsFilter = b.dataset.f; showWeek(); });
    pane.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { hsSort = b.dataset.s; showWeek(); });
    pane.querySelectorAll('[data-h]').forEach(b => b.onclick = () => { hsSel = +b.dataset.h; const st = pane.querySelector('.hs-list').scrollTop; showWeek(); const l = $('tabpane').querySelector('.hs-list'); if (l) l.scrollTop = st; });
  }
  function horseDetail(h) {
    const p = P(), a = World.ability(h, W.year), r = World.rating(h, W.year), c = COAT[h.coatKey] || COAT.bay;
    const t = W.trainers[h.trainer], o = W.owners[h.owner];
    const hist = (h.hist || []).slice().reverse(), mine = hist.filter(x => x.me);
    const np = !h.retired ? World.nextPlan(W, h) : null;
    const col = (v) => v >= 85 ? 'var(--red)' : v >= 75 ? 'var(--gold)' : v >= 62 ? 'var(--green)' : '#7d8a99';
    const bar = (n, v) => `<div class="hd-ab"><span>${n}</span><span class="ab-bar"><i style="width:${clamp(v, 0, 100)}%;background:${col(v)}"></i></span><b class="tnum">${Math.round(v)}</b></div>`;
    const mud = World.mudOf(h), mudT = mud > 0.4 ? '得意' : mud < -0.4 ? '苦手' : '普通';
    const main = h.retired ? '' : h.mainJ === -1 ? `<span class="badge green">主戦はあなた</span>` : h.mainJ != null && W.jockeys[h.mainJ] ? `<span class="badge">主戦 ${esc(W.jockeys[h.mainJ].name)}</span>` : '';
    const plan = !h.retired && h.plan && h.plan.y === W.year && h.plan.races.length ? h.plan.races.map(n => { const ran = hist.find(x => x.y === W.year && x.n === n); return `<span class="hd-step ${ran ? 'done' : np && np.name === n ? 'next' : ''}">${esc(n)}${ran ? ` ${ran.pos}着` : ''}</span>`; }).join('<i>→</i>') : '';
    const gl = (x) => x.g === 9 ? '<span class="badge g1">海外</span>' : x.g ? `<span class="badge g${x.g}">G${'ⅠⅡⅢ'[x.g - 1]}</span>` : '';
    return `<div class="hd-head"><span class="hs-coat big" style="background:${c[1]}"></span><div class="grow"><h2>${esc(h.name)}${realTag(h)}</h2>
        <div class="small muted">${h.legend ? `往年の名馬と同じ名を持つ馬（元の${esc(h.name)}：${h.legend.b}年生まれ${h.legend.hof ? '・顕彰馬' : ''}　${esc(h.legend.w.join('、'))}）` : h.nameMean ? '馬名の意味：' + esc(h.nameMean) : ''}</div></div>
        <div class="hd-rate"><small>総合</small><b style="color:${col(r)}">${Math.round(r)}</b></div></div>
      <div class="row wrap" style="gap:4px;margin:4px 0 6px">${h.retired ? '<span class="badge">引退</span>' : `<span class="badge">${World.CLASS_NAMES[Math.min(5, h.cls)]}</span>`}${main}${h.hof ? `<span class="badge gold">顕彰馬（${h.hof}年）</span>` : ''}${h.promise ? `<span class="badge green">次走 ${esc(h.promise)} に騎乗の約束</span>` : ''}</div>
      <div class="hd-grid">
        <div><span>性齢</span><b>${sexAge(h)}</b></div><div><span>毛色</span><b>${c[0]}</b></div>
        <div><span>脚質</span><b>${STYLE[h.style]}</b></div><div><span>得意な距離</span><b>${h.dist}m前後</b></div>
        <div><span>馬場</span><b>${h.surf === 'T' ? '芝' : h.surf === 'D' ? 'ダート' : '芝・ダート'}</b></div><div><span>道悪</span><b>${mudT}</b></div>
        <div><span>成長</span><b>${h.grow === '早' ? '早熟' : h.grow === '晩' ? '晩成' : '普通'}</b></div><div><span>気性</span><b>${h.tmp >= 60 ? 'かかりやすい' : h.tmp <= 30 ? '素直' : '普通'}</b></div>
        <div><span>調教師</span><b>${t ? esc(t.name.replace('厩舎', '')) + '（' + t.region + '）' : '-'}</b></div><div><span>馬主</span><b>${o ? silkChip(o) + ' ' + esc(o.name) : '-'}</b></div>
        <div><span>通算</span><b>${h.starts}戦${h.wins}勝</b></div><div><span>獲得賞金</span><b>${money(h.earn || 0)}</b></div>
        <div><span>あなたの騎乗</span><b>${mine.length}戦${mine.filter(x => x.pos === 1).length}勝</b></div><div><span>絆</span><b>${Math.round(p.bond[h.id] || 0)}</b></div>
      </div>
      <div class="hd-sec">能力${tip('今の年齢での力。若い馬は成長で伸び、年を取ると少しずつ落ちる。')}</div>
      ${bar('スピード', a.spd)}${bar('スタミナ', a.sta)}${bar('瞬発力', a.kick)}
      ${plan ? `<div class="hd-sec">今年の路線　${esc(h.plan.route || '')}</div><div class="hd-plan">${plan}</div>${np ? `<div class="small muted" style="margin-top:3px">次の目標は${esc(np.name)}（${np.inW === 0 ? '今週' : np.inW + '週後'}）</div>` : ''}` : ''}
      ${(h.g1 || []).length ? `<div class="hd-sec">GⅠ勝利</div><div class="small">${h.g1.map(x => esc(x)).join('　')}</div>` : ''}
      <div class="hd-sec">戦績${hist.length ? '' : '（記録はこれから残る）'}</div>
      ${hist.length ? `<table class="hd-hist"><tr><th>日付</th><th>レース</th><th>条件</th><th>着</th><th>人気</th><th>騎手</th><th>タイム</th></tr>${hist.map(x => `<tr class="${x.me ? 'me' : ''}"><td>${x.y % 100}/${esc(x.d.replace('月', '/').replace('日', ''))}</td><td>${gl(x)} ${esc(x.n)}</td><td>${esc(x.v)} ${esc(x.c)} ${esc(x.gr)}</td><td><b class="${posCls(x.pos)}">${x.pos}</b><small>/${x.of}</small></td><td>${x.pop || '-'}</td><td>${esc(x.j)}</td><td>${RaceEngine.fmtTime(x.t)}</td></tr>`).join('')}</table>` : ''}`;
  }
  function renderWeekTab(pane) {
    const p = P();
    const sg = window.Story && W.story ? Story.goal(W) : null;
    const gp = Progress.goalProgress(W);
    if (W.injury > 0 || p.suspended > 0 || W.away) {
      const why = W.away ? `${W.away.name}で武者修行中（あと${W.away.left}週）` : W.injury > 0 ? `負傷療養中（あと${W.injury}週）` : `騎乗停止中（あと${p.suspended}週）`;
      pane.innerHTML = `<div class="cols"><div class="card"><div class="sec"><h3>${why}</h3></div><p class="muted">今週は騎乗できない。平日の予定はこなせる。</p><button class="btn primary" id="b-skip">次の週へ</button></div><div class="card">${scheduleHtml()}</div></div>`;
      bindSchedule(pane);
      $('b-skip').onclick = () => { W.card.forEach(r => { if (!r.result) World.simulate(W, r, null); }); advanceWeek(); };
      return;
    }
    let L = '';
    if (sg) L += `<div class="card" style="margin-bottom:8px;border-left:4px solid var(--gold)"><div class="small muted">${esc(sg.title)}</div><div style="font-family:var(--serif);font-weight:700">${esc(sg.goal)}</div></div>`;
    if (W.isOverseas) {
      const race = W.card[0], h = W.horses[W.booked[1]];
      L += `<div class="card"><div class="sec"><h3>海外遠征</h3><span class="sub">${esc(VENUES[race.venue].country)}・${esc(VENUES[race.venue].name)}</span></div>
        <div class="big" style="font-size:20px">${esc(race.name)} ${gradeTag(race)}</div><div class="small">${raceCond(race)}　騎乗馬 <b>${esc(h.name)}</b>${realTag(h)}（${sexAge(h)}）</div></div>`;
    } else {
      const n = W.requests.length;
      L += `<div class="sec"><h3>騎乗依頼</h3><span class="sub">${n}件・タップで受ける（1レース1頭）</span>${tip('体重＋装備が斤量を超える依頼は受けられない。相棒・お手馬・主戦の馬には印が付く。')}</div>`;
      if (!n) L += `<p class="muted">今週の依頼はない。</p>`;
      L += `<div class="ctrack" id="reqs">${W.requests.map((q, i) => {
        const race = W.card[q.raceNo - 1], h = W.horses[q.hid], t = W.trainers[h.trainer], o = W.owners[h.owner];
        const tags = [q.story ? '<span class="badge gold">相棒</span>' : q.bondHorse ? '<span class="badge gold">お手馬</span>' : '', q.promised ? '<span class="badge green">騎乗の約束</span>' : q.main ? '<span class="badge green">主戦</span>' : p.contract === h.owner ? '<span class="badge green">主戦契約</span>' : '', q.viaAgent ? '<span class="badge">仲介</span>' : '', q.clash ? '<span class="badge warn">2頭から依頼</span>' : '', q.pitched ? '<span class="badge green">売り込み</span>' : '', q.contest && !q.contest.won ? `<span class="badge warn">争奪：${esc(W.jockeys[q.contest.jid].name)}騎手（見込み${Math.round(q.contest.chance * 100)}%）</span>` : '', q.contest && q.contest.won ? '<span class="badge green">騎乗を勝ち取った</span>' : '', !q.okWeight ? '<span class="badge warn">斤量オーバー</span>' : ''].join(' ');
        return `<div class="reqcard ${q.accepted ? 'on' : ''} ${q.okWeight ? '' : 'ng'}" data-i="${i}"><span class="ck">✓</span>
          <div class="row"><span class="rno">${q.raceNo}R</span>${gradeTag(race)}<span class="small muted">${raceCond(race)}</span></div>
          <div class="small" style="margin-top:2px">${esc(race.name)}</div>
          <div class="hn">${esc(h.name)}${realTag(h)}</div>
          <div class="small muted">${sexAge(h)}・${STYLE[h.style]}・斤量${q.kin}kg</div>
          <div class="row" style="margin-top:4px"><span class="big" style="font-size:18px">${q.pop}<small>番人気</small></span><span class="small muted">${q.odds}倍</span></div>
          <div class="small muted" style="margin-top:2px">${esc(t.name)}・${silkChip(o)} ${esc(o.name)}</div>
          <div style="margin-top:3px">${tags}</div></div>`;
      }).join('')}</div>
      ${W.pitchUsed !== W.wk ? '<button class="btn small" id="b-pitch" style="margin-top:6px">有力馬に売り込む（今週1回）</button>' : '<div class="small muted" style="margin-top:6px">今週の売り込みは済んだ</div>'}
      ${n > 2 ? `<div class="cnav"><button class="cbtnn" id="c-prev" aria-label="前へ">‹</button>${W.requests.map((_, i) => `<span class="cdot" data-d="${i}"></span>`).join('')}<button class="cbtnn" id="c-next" aria-label="次へ">›</button></div>` : ''}`;
      (W.offers || []).forEach((o, i) => {
        const h = W.horses[o.hid];
        L += `<div class="card" style="margin-top:8px;border-color:var(--blue)"><div class="small muted">海外遠征の騎乗依頼（${esc(o.date)}）</div>
          <div><b>${esc(o.race.name)}</b>（${esc(VENUES[o.race.v].country)}・${SURF[o.race.surf]}${o.race.dist}m）　騎乗馬 ${esc(h.name)}${realTag(h)}</div>
          <div class="row" style="margin-top:6px"><button class="btn small primary" data-oa="${i}">受ける</button><button class="btn small" data-od="${i}">断る</button></div></div>`;
      });
      if (W.pendingOverseas) L += `<div class="card" style="margin-top:8px"><span class="small muted">予定：</span>${esc(W.pendingOverseas.date)} ${esc(W.pendingOverseas.race.name)} へ遠征</div>`;
    }
    const n = W.isOverseas ? 1 : W.requests.filter(q => q.accepted).length;
    // 追い切り：受けた依頼の馬に、週1回だけ自分で乗れる
    const woList = W.isOverseas ? [{ raceNo: 1, hid: W.booked[1] }] : W.requests.filter(q => q.accepted);
    woList.sort((a, b) => ((W.card[b.raceNo - 1].graded ? 10 : 0) + (p.bond[b.hid] || 0) / 10) - ((W.card[a.raceNo - 1].graded ? 10 : 0) + (p.bond[a.hid] || 0) / 10));
    const woDone = W.workoutAbs === W.abs;
    const woCard = `<div class="card" style="margin-bottom:8px"><div class="sec"><h3>追い切り</h3><span class="sub">${woDone ? '今週は済み' : '週1回・自分で乗る'}</span>${tip('調教師の指示した時計で4ハロンを乗る。指示どおりに乗れると、その週のレースで馬の調子が上がり、絆と信頼も上がる。')}</div>
      ${woDone ? woList.filter(q => W.horses[q.hid].tune && W.horses[q.hid].tune.abs === W.abs).map(q => { const h = W.horses[q.hid]; return `<div class="kv"><span>${esc(h.name)}</span><b>評価 ${h.tune.g}（調子 ${h.tune.v >= 0 ? '+' : ''}${h.tune.v}）</b></div>`; }).join('') || '<p class="small muted" style="margin:0">今週の追い切りは終わった。</p>'
        : woList.length ? woList.slice(0, 3).map(q => { const h = W.horses[q.hid], race = W.card[q.raceNo - 1], k = Progress.workoutKind(W, race, h); return `<div class="kv"><span><b>${esc(h.name)}</b> <span class="small muted">${race.no}R ${esc(race.name)}・指示「${Workout.ORDERS[k].name}」</span></span><button class="btn small primary" data-wo="${q.hid}:${q.raceNo}">乗る</button></div>`; }).join('')
          : '<p class="small muted" style="margin:0">騎乗依頼を受けると、その馬の追い切りに乗れる。</p>'}</div>`;
    const goalCard = gp ? `<div class="card" style="margin-bottom:8px"><div class="sec"><h3>シーズン目標</h3><span class="sub">${esc(gp.name)}</span></div><div class="row"><span class="big">${gp.cur}<small> / ${gp.target}</small></span><div class="grow"><div class="bar gold"><i style="width:${gp.rate * 100}%"></i></div></div></div></div>` : '';
    pane.innerHTML = `<div class="cols"><div class="scroll">${L}</div><div class="scroll">
      ${goalCard}
      ${woCard}
      <div class="card" style="margin-bottom:8px">${scheduleHtml()}</div>
      <button class="btn primary" style="width:100%;padding:11px" id="b-day">開催日へ進む（${n}鞍に騎乗）</button>
    </div></div>`;
    const rerender = () => { const sc = $('reqs') ? $('reqs').scrollLeft : 0; showWeek(); if ($('reqs')) $('reqs').scrollLeft = sc; };
    pane.querySelectorAll('[data-wo]').forEach(b => b.onclick = () => { const [hid, no] = b.dataset.wo.split(':').map(Number); startWorkout(hid, W.card[no - 1]); });
    pane.querySelectorAll('.reqcard').forEach(el => el.onclick = () => {
      const q = W.requests[+el.dataset.i];
      if (!q.okWeight) { toast('斤量オーバーで受けられない'); return; }
      // 同じレースの2頭から依頼：比べて選ぶ
      if (!q.accepted && q.clash && W.requests.filter(o => o.raceNo === q.raceNo).length > 1) return chooseRide(q.raceNo, rerender);
      if (!q.accepted && q.contest && !q.contest.won) return contestRide(q, rerender);
      const on = !q.accepted;
      W.requests.forEach(o => { if (o.raceNo === q.raceNo) o.accepted = false; });
      q.accepted = on;
      rerender();
    });
    if ($('b-pitch')) $('b-pitch').onclick = () => pitchMenu(rerender);
    // カルーセル
    const tr = $('reqs');
    if (tr && $('c-prev')) {
      const step = () => (tr.firstElementChild ? tr.firstElementChild.getBoundingClientRect().width + 8 : 200);
      $('c-prev').onclick = () => tr.scrollBy({ left: -step(), behavior: 'smooth' });
      $('c-next').onclick = () => tr.scrollBy({ left: step(), behavior: 'smooth' });
      const dots = () => { const i = Math.round(tr.scrollLeft / step()); document.querySelectorAll('.cdot').forEach((d, k) => d.classList.toggle('on', k === i)); };
      tr.addEventListener('scroll', dots); dots();
    }
    pane.querySelectorAll('[data-oa]').forEach(b => b.onclick = () => { const o = W.offers[+b.dataset.oa]; W.pendingOverseas = o; W.offers = []; W.log.push({ abs: W.abs, text: `${W.date} ${o.race.name}への遠征が決定（${W.horses[o.hid].name}）` }); World.news(W, `${P().name}騎手が${W.horses[o.hid].name}で${o.race.name}へ遠征`, 'me'); showWeek(); });
    pane.querySelectorAll('[data-od]').forEach(b => b.onclick = () => { W.offers.splice(+b.dataset.od, 1); showWeek(); });
    bindSchedule(pane);
    $('b-day').onclick = () => {
      if (!W.isOverseas) {
        W.booked = {}; W.requests.filter(q => q.accepted).forEach(q => W.booked[q.raceNo] = q.hid);
        // 2頭から依頼が来ていたレースで、選ばなかった馬（どちらも選ばなければ両方）の陣営には断りを入れる
        W.requests.filter(q => q.clash && !q.accepted && !q.declined).forEach(q => { q.declined = true; World.declineRide(W, W.card[q.raceNo - 1], q); });
      }
      W.dayIdx = W.dayIdx || 0; World.save(W);
      bigRaceEvents(() => showDay());
    };
  }
  // ---------- 大レースの前：公開枠順抽選会と共同記者会見 ----------
  // 有馬記念の公開枠順抽選会は、馬名の入ったボールを1つずつ引き、呼ばれた馬の関係者が馬番のボールを引く方式（2023年の報道による）
  function bigRaceEvents(done) {
    const list = W.card.filter(r => W.booked[r.no] && (r.graded === 1 || r.overseas) && !r.pressDone);
    if (!list.length) return done();
    const race = list[0];
    const next = () => { race.pressDone = true; World.save(W); bigRaceEvents(done); };
    if (/有馬記念/.test(race.name) && !race.drawDone) drawCeremony(race, () => pressConference(race, next));
    else pressConference(race, next);
  }
  function drawCeremony(race, done) {
    const n = race.field.length, hid = W.booked[race.no];
    const order = race.field.map((f, i) => i).sort(() => Math.random() - 0.5); // 馬名のボールを引く順
    const balls = Array.from({ length: n }, (_, i) => i + 1);                    // 馬番のボール
    const got = {}; let k = 0, timer = 0, fast = false, waiting = false;
    const nameOf = (f) => W.horses[f.hid].name;
    const wakuOfNum = (num) => wakuOf(num, n);
    const render = (msg) => {
      const rows = Array.from({ length: n }, (_, i) => i + 1).map(num => {
        const f = Object.keys(got).map(Number).find(j => got[j] === num);
        const fl = f != null ? race.field[f] : null;
        return `<tr class="${fl && fl.hid === hid ? 'me' : ''}"><td>${waku(wakuOfNum(num))}</td><td><b>${num}</b></td><td>${fl ? esc(nameOf(fl)) : '<span class="muted">—</span>'}</td></tr>`;
      }).join('');
      const pick = waiting ? `<div class="small" style="margin:6px 0 4px"><b>あなたの番。</b>ポットから好きなボールを1つ引く。</div><div class="row wrap" style="gap:6px">${balls.map((b, i) => `<button class="btn" data-ball="${i}" style="width:44px;height:44px;border-radius:50%;padding:0">？</button>`).join('')}</div>` : '';
      modal(`<div class="cols" style="grid-template-columns:1fr 1.1fr;gap:10px;padding:0"><div><p class="small muted" style="margin:0 0 6px">馬名の入ったボールを1つずつ引き、呼ばれた馬の関係者が登壇して馬番のボールを引く。</p>
        <div class="card" style="text-align:center;min-height:64px"><div class="small muted">${k}/${n}頭</div><div style="font-family:var(--serif);font-weight:900;font-size:18px;line-height:1.4">${msg || ''}</div></div>${pick}
        ${!waiting && k < n ? `<button class="btn ghost small" id="dc-fast">${fast ? '早送り中…' : '早送り'}</button>` : ''}${k >= n ? '<button class="btn primary" id="dc-ok" style="width:100%;margin-top:6px">枠順確定</button>' : ''}</div>
        <div class="scroll" style="max-height:58vh"><table><tr><th>枠</th><th>番</th><th>馬名</th></tr>${rows}</table></div></div>`, (el) => {
        el.querySelectorAll('[data-ball]').forEach(b => b.onclick = () => { const i = +b.dataset.ball; const num = balls.splice(i, 1)[0]; got[order[k]] = num; waiting = false; k++; render(`${esc(nameOf(race.field[order[k - 1]]))}<br>${num}番（${wakuOfNum(num)}枠）`); Sound.init(); setTimeout(step, 1400); });
        const fb = $('dc-fast'); if (fb) fb.onclick = () => { fast = true; clearTimeout(timer); step(); };
        const ok = $('dc-ok'); if (ok) ok.onclick = finish;
      }, `${race.name}　公開枠順抽選会`);
    };
    const step = () => {
      clearTimeout(timer);
      if (k >= n) return render('すべての枠順が決まった');
      const f = race.field[order[k]];
      if (f.hid === hid) { waiting = true; return render(`${esc(nameOf(f))}<br><span class="small">（あなたの騎乗馬）</span>`); }
      const num = balls.splice(Math.floor(Math.random() * balls.length), 1)[0];
      got[order[k]] = num; k++;
      render(`${esc(nameOf(f))}<br>${num}番（${wakuOfNum(num)}枠）`);
      timer = setTimeout(step, fast ? 120 : 1100);
    };
    const finish = () => {
      clearTimeout(timer);
      const nf = []; race.field.forEach((f, i) => { nf[got[i] - 1] = f; });
      race.field = nf; race.drawDone = true; nf.forEach((f, i) => { if (f.waku) f.waku = wakuOf(i + 1, n); });
      const myNum = nf.findIndex(f => f.hid === hid) + 1;
      World.news(W, `${race.name}の枠順が決定。${P().name}騎手の${W.horses[hid].name}は${wakuOfNum(myNum)}枠${myNum}番`, 'me');
      race.myDraw = { num: myNum, waku: wakuOfNum(myNum), n };
      closeModal(); World.save(W); done();
    };
    render('抽選を始める'); timer = setTimeout(step, 900);
  }
  function pressConference(race, done) {
    const hid = W.booked[race.no], h = W.horses[hid], f = race.field.find(x => x.hid === hid) || {};
    if (f.pop == null) World.estimateOdds(W, race);
    const pop = f.pop, isPartner = W.story && W.story.partner === hid;
    // 騎手の割り当てを先に決めて、同期が本当にこのレースに乗るときだけ聞く
    if (!race.field[0].waku) World.setupRace(W, race, hid, 'manual');
    const rj0 = W.rivals && W.rivals[0] ? W.rivals[0].jid : null;
    const rivalJ = rj0 != null && race.field.some(f => f.jid === rj0) ? W.jockeys[rj0] : null;
    const Q = [];
    Q.push(pop === 1 ? { q: `${h.name}は1番人気が予想されています。プレッシャーは？`, kind: 'fav' } : pop <= 3 ? { q: `上位人気の一角です。${h.name}の状態はいかがですか？`, kind: 'cond' } : { q: `${pop}番人気前後の評価です。ここから巻き返す手応えは？`, kind: 'dark' });
    if (race.myDraw) Q.push({ q: `${race.myDraw.waku}枠${race.myDraw.num}番を引きました。この枠をどう見ますか？`, kind: 'draw', good: race.myDraw.num <= Math.ceil(race.myDraw.n / 2) });
    else if (race.overseas) Q.push({ q: `${VENUES[race.venue].country}での大一番です。遠征の手応えは？`, kind: 'abroad' });
    else if (race.ground && race.ground !== '良') Q.push({ q: `馬場は${race.ground}の見込みです。影響は？`, kind: 'ground' });
    else Q.push({ q: `${VENUES[race.venue].name}の${SURF[race.surf]}${race.dist}mはこの馬に合いますか？`, kind: 'course' });
    if (isPartner) Q.push({ q: `デビュー前から主戦を務める${h.name}。特別な思いはありますか？`, kind: 'partner' });
    else if (rivalJ) Q.push({ q: `同期の${rivalJ.name}騎手も出走予定です。意識しますか？`, kind: 'rival' });
    else Q.push({ q: 'ファンにひと言お願いします。', kind: 'fans' });
    const A = [
      ['強気', (q) => q.kind === 'fav' ? '負けられない一戦。勝つ競馬をするだけです' : q.kind === 'draw' ? (q.good ? '最高の枠です。もう勝ったつもりでいます' : '枠は関係ない。力でねじ伏せます') : q.kind === 'rival' ? 'もちろん。今回はきっちり先着します' : '勝ちに行きます。見ていてください', { pop: 1.6, young: 60 }],
      ['謙虚', (q) => q.kind === 'fav' ? '評価していただいて光栄です。馬の力を信じて乗ります' : q.kind === 'draw' ? '与えられた枠で、馬にとって一番いい競馬を考えます' : q.kind === 'partner' ? 'この馬に育ててもらいました。恩返しがしたいです' : '厩舎の皆さんが仕上げてくれました。あとは自分次第です', { rep: 0.6, core: 50, trust: 2 }],
      ['冗談まじり', (q) => q.kind === 'fav' ? '昨日は緊張で3時間しか眠れませんでした（笑）' : q.kind === 'rival' ? '向こうが勝手に意識してるんでしょう（笑）' : '馬の方が落ち着いてます。僕が一番そわそわしてます（笑）', { pop: 0.8, women: 70, cond: 2 }],
    ];
    const ans = [];
    const ask = (i) => {
      if (i >= Q.length) {
        const tone = ans.filter(a => a === 0).length >= 2 ? 'bold' : ans.filter(a => a === 1).length >= 2 ? 'humble' : 'mixed';
        race.press = { tone };
        const quote = A[ans[0]][1](Q[0]);
        World.news(W, `${race.name}共同会見　${P().name}騎手「${quote}」`, 'me');
        World.save(W);
        return modal(`<p>会見が終わった。${tone === 'bold' ? '強気な発言が見出しになりそうだ。勝てば評判が上がるが、負ければ叩かれるかもしれない。' : tone === 'humble' ? '落ち着いた受け答えで、関係者の印象はよさそうだ。' : 'いつも通りの受け答えができた。'}</p><div class="choices"><button class="btn primary" id="m-ok">開催日へ</button></div>`, () => { $('m-ok').onclick = () => { closeModal(); done(); }; }, `${race.name}　共同記者会見`);
      }
      const q = Q[i];
      modal(`<div class="small muted" style="margin-bottom:4px">${race.overseas ? '現地での会見' : '共同記者会見'}・${esc(h.name)}（${pop}番人気想定）</div><div class="speaker">記者</div><p style="font-family:var(--serif);font-size:15px;line-height:1.7;margin:2px 0 8px">${esc(q.q)}</p>
        <div class="choices" style="flex-direction:column;align-items:stretch">${A.map((a, k) => `<button class="btn ${k ? '' : 'primary'}" data-pa="${k}" style="text-align:left"><b>${a[0]}</b>　「${esc(a[1](q))}」</button>`).join('')}</div>`, (el) => {
        el.querySelectorAll('[data-pa]').forEach(b => b.onclick = () => {
          const k = +b.dataset.pa, e = A[k][2], p = P(); ans.push(k);
          if (e.pop) p.pop = clamp(p.pop + e.pop / Q.length, 0, 100);
          if (e.rep) p.rep = clamp(p.rep + e.rep / Q.length, 0, 100);
          if (e.cond) p.cond = clamp(p.cond + e.cond, 0, 100);
          if (e.trust && h.trainer != null) p.trust[h.trainer] = clamp((p.trust[h.trainer] || 0) + e.trust, 0, 100);
          ['young', 'core', 'women'].forEach(sg => { if (e[sg]) Progress.addFans(W, sg, e[sg] / Q.length); });
          ask(i + 1);
        });
      }, `${race.name}　共同記者会見　${i + 1} / ${Q.length}`);
    };
    ask(0);
  }
  // 会見の発言と結果
  function pressAftermath(race, ev) {
    if (!race.press || race.press.done) return;
    race.press.done = true;
    const p = P();
    if (race.press.tone === 'bold') {
      if (ev.pos === 1) { p.pop = clamp(p.pop + 2, 0, 100); World.news(W, `有言実行。${p.name}騎手が宣言どおり${race.name}を制す`, 'me'); }
      else if (ev.pos >= 6) { p.rep = clamp(p.rep - 0.5, 0, 100); World.news(W, `強気発言の${p.name}騎手、${race.name}は${ev.pos}着に沈む`, 'bad'); }
    } else if (race.press.tone === 'humble' && ev.pos <= 3) p.rep = clamp(p.rep + 0.4, 0, 100);
  }
  // ---------- 騎乗依頼の選択・取り合い・売り込み ----------
  function chooseRide(raceNo, done) {
    const race = W.card[raceNo - 1], qs = W.requests.filter(o => o.raceNo === raceNo);
    const p = P();
    const col = (q) => {
      const h = W.horses[q.hid], t = W.trainers[h.trainer], o = W.owners[h.owner];
      return `<div class="card" style="margin:0"><div class="hn" style="font-family:var(--serif);font-weight:900;font-size:17px">${esc(h.name)}${realTag(h)}</div>
        <div class="small muted">${sexAge(h)}・${STYLE[h.style]}・斤量${q.kin}kg</div>
        <div class="kv"><span>人気（想定）</span><b>${q.pop}番人気・${q.odds}倍</b></div>
        <div class="kv"><span>総合点</span><b class="tnum">${World.rating(h, W.year).toFixed(1)}</b></div>
        <div class="kv"><span>これまでの相性 ${tip('一緒に走った経験。高いほど馬の癖を知っていて、陣営からの信頼もある')}</span><b class="tnum">${Math.round(p.bond[h.id] || 0)}</b></div>
        <div class="kv"><span>${esc(t.name)}の信頼</span><b class="tnum">${Math.round(p.trust[h.trainer] || 0)}</b></div>
        <div class="kv"><span>馬主</span><b class="small">${silkChip(o)} ${esc(o.name)}${p.contract === h.owner ? ' <span class="badge green">主戦</span>' : ''}</b></div>
        <button class="btn primary" style="width:100%;margin-top:6px" data-pick="${q.hid}">${esc(h.name)}に乗る</button></div>`;
    };
    modal(`<p class="small" style="margin:0 0 6px">${race.no}R ${esc(race.name)}（${raceCond(race)}）で、これまで乗ってきた馬の両方から依頼が来た。選ばなかった陣営からの信頼は下がり、その馬には別の騎手が乗る。</p>
      <div class="cols" style="grid-template-columns:repeat(${qs.length},1fr);gap:8px;padding:0">${qs.map(col).join('')}</div>
      <div class="choices"><button class="btn" id="m-cancel">あとで決める</button></div>`, (el) => {
      el.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { const hid = +b.dataset.pick; qs.forEach(q => { q.accepted = q.hid === hid; }); closeModal(); toast(`${W.horses[hid].name}に乗ると決めた`); done(); });
      $('m-cancel').onclick = closeModal;
    }, 'どちらに乗るか');
  }
  function contestRide(q, done) {
    const h = W.horses[q.hid], j = W.jockeys[q.contest.jid], race = W.card[q.raceNo - 1];
    modal(`<p>${esc(h.name)}（${race.no}R ${esc(race.name)}）の騎乗は、${esc(j.name)}騎手と取り合いになっている。陣営が決めるまで結果は分からない。</p>
      <div class="kv"><span>自分に決まる見込み ${tip('評価・人気・陣営の信頼・この馬との相性と、相手騎手の腕と人気で決まる')}</span><b>${Math.round(q.contest.chance * 100)}%</b></div>
      <div class="choices"><button class="btn primary" id="m-go">騎乗を申し出る</button><button class="btn" id="m-cancel">やめておく</button></div>`, () => {
      $('m-go').onclick = () => {
        closeModal();
        const won = Math.random() < q.contest.chance; W.contestFails = won ? 0 : (W.contestFails || 0) + 1;
        if (won) {
          q.contest.won = true; W.requests.forEach(o => { if (o.raceNo === q.raceNo) o.accepted = false; }); q.accepted = true;
          j.pop = Math.max(0, j.pop - 1); World.news(W, `${h.name}の鞍上は${P().name}騎手に。${j.name}騎手との争奪を制す`, 'me');
          toast(`${h.name}の騎乗を勝ち取った`); if (window.Drama) Drama.onContest(W, j.id, true, h);
        } else {
          W.requests.splice(W.requests.indexOf(q), 1); World.giveRide(W, race, h.id, j.id, '（争奪の末）');
          toast(`${h.name}は${j.name}騎手に決まった`); if (window.Drama) Drama.onContest(W, j.id, false, h);
        }
        World.save(W); done();
      };
      $('m-cancel').onclick = closeModal;
    }, '騎乗の争奪');
  }
  function pitchMenu(done) {
    const ts = World.pitchTargets(W);
    if (!ts.length) { toast('売り込める有力馬がいない'); return; }
    modal(`<p class="small" style="margin:0 0 6px">今週の出走馬で、まだ依頼の来ていない有力馬の陣営に騎乗を申し出る（週1回）。決まれば依頼が来る。断られると、その調教師の信頼が少し下がる。${W.pitchFails ? `<br><b>断られた回数 ${W.pitchFails}回</b>：続けて断られるほど、次は決まりやすくなる（見込みに含めてある）` : ''}</p>
      <table><tr><th>R</th><th>馬名</th><th>人気</th><th>いまの騎手</th><th>見込み</th><th></th></tr>${ts.map(t => { const race = W.card[t.raceNo - 1], f = race.field.find(x => x.hid === t.hid), h = W.horses[t.hid]; const jn = f.jid >= 0 ? W.jockeys[f.jid].name : (f.jname || '未定'); return `<tr><td>${t.raceNo}R ${gradeTag(race)}</td><td>${esc(h.name)}${realTag(h)}</td><td>${t.pop}</td><td class="small">${esc(jn)}</td><td>${Math.round(t.chance * 100)}%</td><td><button class="btn small" data-pt="${t.hid}" data-r="${t.raceNo}">申し出る</button></td></tr>`; }).join('')}</table>
      <div class="choices"><button class="btn" id="m-cancel">やめる</button></div>`, (el) => {
      el.querySelectorAll('[data-pt]').forEach(b => b.onclick = () => { const ok = World.pitch(W, +b.dataset.r, +b.dataset.pt); closeModal(); toast(ok ? `${W.horses[+b.dataset.pt].name}の騎乗依頼が来た` : '今回は断られた'); World.save(W); done(); });
      $('m-cancel').onclick = closeModal;
    }, '有力馬への売り込み');
  }
  // 平日の予定：チェックボックスで3つ選ぶ
  function scheduleHtml() {
    const p = P();
    const opts = Object.entries(World.ACTIVITIES).filter(([k, a]) => !a.needPop || p.pop >= a.needPop);
    const sel = new Set(p.schedule);
    return `<div class="sec"><h3>平日の予定</h3><span class="sub">3つ選ぶ（${sel.size}/3）</span></div><div class="checks">${opts.map(([k, a]) => `<label class="chk ${sel.has(k) ? 'on' : ''} ${!sel.has(k) && sel.size >= 3 ? 'dis' : ''}" title="${esc(a.desc)}"><input type="checkbox" data-act="${k}" ${sel.has(k) ? 'checked' : ''} ${!sel.has(k) && sel.size >= 3 ? 'disabled' : ''}>${esc(a.name)}</label>`).join('')}</div>
      <div class="small muted" style="margin-top:5px">${[...sel].map(k => `${World.ACTIVITIES[k].name}：${World.ACTIVITIES[k].desc}`).join('　')}</div>`;
  }
  function bindSchedule(root) {
    root.querySelectorAll('input[data-act]').forEach(c => c.onchange = () => {
      const p = P(); const set = new Set(p.schedule);
      if (c.checked) set.add(c.dataset.act); else set.delete(c.dataset.act);
      p.schedule = [...set].slice(0, 3); showWeek();
    });
  }

  function renderGoal(pane) {
    const p = P(), gp = Progress.goalProgress(W), ys = p.years[W.year] || { rides: 0, wins: 0, seconds: 0, thirds: 0, g: [], income: 0 };
    const table = W.jockeys.map(j => ({ name: j.name, wins: j.years[W.year] || 0 })).concat([{ name: p.name, wins: ys.wins, me: true }]).sort((a, b) => b.wins - a.wins);
    const rank = table.findIndex(t => t.me) + 1;
    pane.innerHTML = `<div class="cols"><div class="scroll">
      <div class="card"><div class="sec"><h3>${W.year}年の成績</h3><span class="sub">リーディング ${rank}位</span></div>
        <div class="row wrap" style="gap:18px">
          <div><div class="small muted">勝利</div><div class="big">${ys.wins}<small>勝</small></div></div>
          <div><div class="small muted">騎乗</div><div class="big">${ys.rides}</div></div>
          <div><div class="small muted">勝率</div><div class="big">${ys.rides ? (ys.wins / ys.rides * 100).toFixed(1) : '0.0'}<small>%</small></div></div>
          <div><div class="small muted">連対率</div><div class="big">${ys.rides ? ((ys.wins + ys.seconds) / ys.rides * 100).toFixed(1) : '0.0'}<small>%</small></div></div>
          <div><div class="small muted">重賞</div><div class="big">${ys.g.length}</div></div>
        </div></div>
      <div class="card"><div class="sec"><h3>シーズン目標</h3></div>${gp ? `<div class="kv"><span>${esc(gp.name)}</span><b>${gp.cur} / ${gp.target}</b></div><div class="bar gold"><i style="width:${gp.rate * 100}%"></i></div><div class="small muted" style="margin-top:4px">報酬：${esc(gp.reward)}</div>` : '<p class="small muted">未設定</p>'}</div>
    </div><div class="scroll card" style="padding:0"><table><tr><th>順位</th><th>騎手</th><th>勝利</th></tr>${table.slice(0, 15).map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td><td>${r.wins}</td></tr>`).join('')}${rank > 15 ? `<tr class="me"><td>${rank}</td><td>${esc(p.name)}</td><td>${ys.wins}</td></tr>` : ''}</table></div></div>`;
  }

  function radarSVG(vals) {
    const n = vals.length, R = 80, cx = 110, cy = 105;
    const pt = (i, r) => [cx + r * Math.sin(i / n * Math.PI * 2), cy - r * Math.cos(i / n * Math.PI * 2)];
    const grid = [0.25, 0.5, 0.75, 1].map(k => `<polygon points="${vals.map((_, i) => pt(i, R * k).join(',')).join(' ')}" fill="none" stroke="#d8d4c7" stroke-width="1"/>`).join('');
    const axes = vals.map((_, i) => `<line x1="${cx}" y1="${cy}" x2="${pt(i, R)[0]}" y2="${pt(i, R)[1]}" stroke="#ebe8de"/>`).join('');
    const poly = vals.map((v, i) => pt(i, R * clamp(v[1] / 100, 0, 1)).join(',')).join(' ');
    const labels = vals.map((v, i) => { const [x, y] = pt(i, R + 16); return `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="11" fill="#1c1c1a">${v[0]} ${Math.round(v[1])}</text>`; }).join('');
    return `<svg class="radar" viewBox="0 0 220 215" role="img" aria-label="能力">${grid}${axes}<polygon points="${poly}" fill="rgba(11,93,59,.22)" stroke="#0b5d3b" stroke-width="2"/>${labels}</svg>`;
  }
  function renderMe(pane) {
    const p = P(), need = Progress.xpNeed(p.lv), gw = World.gearOf(p);
    const L = W.life;
    pane.innerHTML = `<div class="cols"><div class="scroll"><div class="card">
      <div class="profile"><div class="avatar" style="background:radial-gradient(circle at 50% 35%,#fff 0 18%,${p.color} 19%)"></div>
        <div class="grow"><div style="font-family:var(--serif);font-size:19px;font-weight:900">${esc(p.name)}</div>
        <div class="small muted">${p.age}歳・${esc(p.region)}所属・騎手${(p.yearsActive || 0) + 1}年目</div>
        <div><span class="badge gold">${esc(Progress.title(W))}</span> <span class="badge green">Lv ${p.lv}</span> ${p.sp ? `<span class="badge warn">スキルポイント ${p.sp}</span>` : ''}</div></div></div>
      <div class="small muted" style="margin-top:8px">次のレベルまで ${Math.max(0, Math.round(need - p.xp))} 経験値</div><div class="bar"><i style="width:${p.xp / need * 100}%"></i></div>
      ${radarSVG([['技術', p.tech], ['判断', p.judge], ['体力', p.phys], ['評価', p.rep], ['人気', p.pop]])}
    </div></div><div class="scroll">
      <div class="card"><div class="sec"><h3>コンディション</h3></div>
        <div class="kv"><span>体重 ${tip('体重＋装備が斤量以下でないと騎乗できない。装備の重さはショップの鞍で軽くできる。')}</span><b>${p.weight.toFixed(1)}kg（装備${gw.toFixed(1)}kg → 斤量${(p.weight + gw).toFixed(1)}kg〜）</b></div>
        <div class="kv"><span>体調 ${tip('レースでの馬の力の出方に影響する。疲労がたまると下がる。')}</span><b>${Math.round(p.cond)}</b></div>
        <div class="kv"><span>疲労</span><b>${Math.round(p.fatigue)}</b></div></div>
      <div class="card"><div class="sec"><h3>装備・暮らし</h3></div>
        ${Object.keys(Progress.GEAR).filter(k => p.gear[k]).map(k => `<div class="kv"><span>${Progress.GEAR_LABEL[k]}</span><b>${esc(Progress.GEAR[k][p.gear[k]].name)}${Progress.upLv(W, k) ? ` +${Progress.upLv(W, k)}` : ''}</b></div>`).join('') || '<div class="kv"><span>装備</span><b>支給品のみ</b></div>'}
        <div class="kv"><span>住まい</span><b>${esc(Progress.HOMES[p.home].name)}</b></div>
        <div class="kv"><span>所持金</span><b>${money(p.money)}</b></div></div>
    </div></div>`;
  }
  function renderSkill(pane) {
    const p = P(), cats = [...new Set(Progress.SKILLS.map(s => s.cat))];
    pane.innerHTML = `<div class="scroll" style="padding-top:8px"><div class="row" style="margin-bottom:6px"><h2>スキル</h2><span class="badge warn">スキルポイント ${p.sp}</span><span class="small muted">レベルが上がると1ポイント。シーズン目標の報酬や、重賞の勝利でももらえる。</span></div>
      ${cats.map((c, ci) => `<details class="acc" ${ci === 0 ? 'open' : ''}><summary>${esc(c)}のスキル <span class="small muted">${Progress.SKILLS.filter(s => s.cat === c && p.skills[s.id]).length}/${Progress.SKILLS.filter(s => s.cat === c).length}習得</span></summary><div class="in">
        ${Progress.SKILLS.filter(s => s.cat === c).map(s => `<div class="kv"><span><b>${esc(s.name)}</b> <span class="small muted">${esc(s.desc)}</span></span>${p.skills[s.id] ? '<span class="badge green">習得済み</span>' : `<button class="btn small ${p.sp >= s.cost ? 'primary' : ''}" data-sk="${s.id}" ${p.sp >= s.cost ? '' : 'disabled'}>習得（${s.cost}pt）</button>`}</div>`).join('')}
      </div></details>`).join('')}
      <details class="acc" open><summary>特訓 <span class="small muted">スキルポイントで能力を上げる（能力が高いほど多く必要）</span></summary><div class="in">
        ${Progress.TRAIN.map(t => `<div class="kv"><span><b>${t.name}</b> ${Math.round(p[t.id] * 10) / 10} <span class="small muted">${esc(t.desc)}</span></span>${(() => { const c = Progress.trainCost(p, t.id), ok = p.sp >= c && p[t.id] < 99; return `<button class="btn small ${ok ? 'primary' : ''}" data-tr="${t.id}" ${ok ? '' : 'disabled'}>+${t.add}（${c}pt）</button>`; })()}</div>`).join('')}
        <p class="small muted" style="margin:6px 0 0">スキルポイントはレベルアップのほか、重賞を勝つともらえる（GⅢ・GⅡ +1、GⅠ +2、海外GⅠ +3、初重賞や初制覇でさらに+1）。</p></div></details></div>`;
    pane.querySelectorAll('[data-tr]').forEach(b => b.onclick = () => { if (Progress.train(W, b.dataset.tr)) { toast('特訓した'); World.save(W); showWeek(); } });
    pane.querySelectorAll('[data-sk]').forEach(b => b.onclick = () => { if (Progress.learn(W, b.dataset.sk)) { toast('スキルを習得した'); World.save(W); showWeek(); } });
  }
  function renderFans(pane) {
    const p = P(), tot = Math.max(1, p.fans);
    const popRank = W.jockeys.filter(j => j.pop > p.pop).length + 1;
    pane.innerHTML = `<div class="cols"><div class="scroll">
      <div class="card"><div class="sec"><h3>人気</h3><span class="sub">騎手人気 ${popRank}位</span></div>
        <div class="row wrap" style="gap:18px"><div><div class="small muted">ファン</div><div class="big">${p.fans.toLocaleString()}<small>人</small></div></div>
        <div><div class="small muted">SNSフォロワー</div><div class="big">${(p.sns || 0).toLocaleString()}</div></div>
        <div><div class="small muted">人気度 ${tip('勝利、取材、ファンサービスで上がる。年末の人気投票に影響する。')}</div><div class="big">${Math.round(p.pop)}</div></div>
        <div><div class="small muted">人気投票1位</div><div class="big">${p.voteWins}<small>回</small></div></div></div></div>
      <div class="card"><div class="sec"><h3>ファン層</h3></div>${Progress.SEGS.map(([k, n]) => `<div class="kv"><span>${n}</span><b>${Math.round(p.fanSeg[k]).toLocaleString()}人（${Math.round(p.fanSeg[k] / tot * 100)}%）</b></div><div class="bar ${k === 'women' || k === 'young' ? 'gold' : ''}"><i style="width:${p.fanSeg[k] / tot * 100}%"></i></div>`).join('')}
        <p class="small muted" style="margin:6px 0 0">GⅠを勝つと女性・若い世代、穴馬で勝つと競馬ファン、地元の競馬場で勝つと地元ファンが増える。</p></div>
    </div><div class="scroll card"><div class="sec"><h3>応援メッセージ</h3></div>${p.cheers.length ? p.cheers.map(c => `<div class="cheer">「${esc(c.text)}」<div class="m">${esc(c.date)}・${esc(c.race)}（${esc(c.horse)}）</div></div>`).join('') : '<p class="small muted">勝つと届く。</p>'}</div></div>`;
  }
  function gearRow(p, k) {
    const G = Progress.GEAR[k], lv = p.gear[k] || 0, top = Progress.topLv(k), n = Progress.upLv(W, k), cur = G[lv];
    const name = `${esc(cur.name)}${lv === top && n ? ` <span class="badge warn">+${n}</span>` : ''}`;
    let act;
    if (lv < top) act = G.slice(lv + 1).map((it, i) => `<button class="btn small" data-gear="${k}:${lv + i + 1}" ${p.money >= it.price ? '' : 'disabled'}>${esc(it.name)} ${it.price.toLocaleString()}万<br><span class="small muted">${esc(it.desc)}</span></button>`).join('');
    else if (n >= Progress.UP_MAX) act = '<span class="badge green">強化MAX</span>';
    else { const c = Progress.upCost(k, n); act = `<button class="btn small ${p.money >= c ? 'primary' : ''}" data-up="${k}" ${p.money >= c ? '' : 'disabled'}>+${n + 1}に強化 ${c.toLocaleString()}万<br><span class="small">${esc(Progress.gearEffect(W, k, 1))}</span></button>`; }
    const now = lv === top ? Progress.gearEffect(W, k) : (cur.desc || '効果なし');
    return `<div class="kv"><span><b>${Progress.GEAR_LABEL[k]}</b>：${name}<br><span class="small muted">いま：${esc(now)}</span>${lv === top ? `<div class="bar gold" style="margin-top:3px;max-width:160px"><i style="width:${n / Progress.UP_MAX * 100}%"></i></div>` : ''}</span><span class="row wrap" style="justify-content:flex-end;gap:4px">${act}</span></div>`;
  }
  function renderShop(pane) {
    const p = P();
    pane.innerHTML = `<div class="scroll" style="padding-top:8px"><div class="row" style="margin-bottom:6px"><h2>ショップ</h2><span class="small muted">所持金 ${money(p.money)}</span></div>
      ${Progress.GEAR_CAT.map(([cid, cname, keys], ci) => `<details class="acc" ${ci === 0 ? 'open' : ''}><summary>${cname} <span class="small muted">${keys.filter(k => (p.gear[k] || 0) === Progress.topLv(k)).length}/${keys.length}最上位</span></summary><div class="in">${keys.map(k => gearRow(p, k)).join('')}</div></details>`).join('')}
      <p class="small muted" style="margin:2px 2px 8px">最上位の品は強化できる（最大+${Progress.UP_MAX}）。強化するほど費用が上がり、上がり幅は少しずつ小さくなる。</p>
      <details class="acc"><summary>スタッフ <span class="small muted">（毎週の費用がかかる）</span></summary><div class="in"><div class="checks">${Progress.STAFF.map(s => `<label class="chk ${p.staff[s.id] ? 'on' : ''}"><input type="checkbox" data-staff="${s.id}" ${p.staff[s.id] ? 'checked' : ''}>${esc(s.name)}（週${s.weekly}万）</label>`).join('')}</div>
        <p class="small muted" style="margin:6px 0 0">${Progress.STAFF.map(s => `${s.name}：${s.desc}`).join('　')}</p></div></details>
      <details class="acc"><summary>住まい</summary><div class="in">${Progress.HOMES.map((h, i) => `<div class="kv"><span><b>${esc(h.name)}</b> <span class="small muted">体調の回復 +${h.cond}・週${h.weekly}万</span></span>${p.home === i ? '<span class="badge green">住んでいる</span>' : i < p.home ? '' : `<button class="btn small" data-home="${i}" ${p.money >= h.price ? '' : 'disabled'}>引っ越す ${h.price}万</button>`}</div>`).join('')}</div></details></div>`;
    pane.querySelectorAll('[data-up]').forEach(b => b.onclick = () => { const k = b.dataset.up; if (Progress.upgradeGear(W, k)) { toast(`${Progress.GEAR[k][Progress.topLv(k)].name}を +${Progress.upLv(W, k)} に強化した`); World.save(W); showWeek(); } });
    pane.querySelectorAll('[data-gear]').forEach(b => b.onclick = () => { const [k, l] = b.dataset.gear.split(':'); if (Progress.buyGear(W, k, +l)) { toast('購入した'); World.save(W); showWeek(); } });
    pane.querySelectorAll('[data-staff]').forEach(c => c.onchange = () => { Progress.toggleStaff(W, c.dataset.staff); World.save(W); showWeek(); });
    pane.querySelectorAll('[data-home]').forEach(b => b.onclick = () => { if (Progress.moveHome(W, +b.dataset.home)) { toast('引っ越した'); World.save(W); showWeek(); } });
  }
  function renderPeople(pane) {
    const p = P();
    const trs = W.trainers.slice().sort((a, b) => (p.trust[b.id] || 0) - (p.trust[a.id] || 0)).slice(0, 10);
    const ag = p.agent != null ? W.agents[p.agent] : null;
    pane.innerHTML = `<div class="cols" style="grid-template-columns:1fr 1fr"><div class="scroll">
      <div class="card"><div class="sec"><h3>馬主</h3>${tip('信頼が高いと良い馬の依頼が来る。信頼が45を超えると主戦契約の話が来ることがある。')}</div>${W.owners.map(o => `<div class="kv"><span>${silkChip(o)} ${esc(o.name)}${p.contract === o.id ? ' <span class="badge green">主戦</span>' : ''}</span><b>${Math.round(p.otrust[o.id] || 0)}</b></div><div class="bar"><i style="width:${p.otrust[o.id] || 0}%"></i></div>`).join('')}
        ${p.contract != null ? `<button class="btn small" id="b-endc" style="margin-top:6px">主戦契約を解消する</button>` : ''}</div>
      <div class="card"><div class="sec"><h3>調教師</h3><span class="sub">信頼の高い順</span></div>${trs.map(t => `<div class="kv"><span>${esc(t.name)}（${t.region}）${t.id === p.stable ? ' <span class="badge">所属</span>' : ''}</span><b>${Math.round(p.trust[t.id] || 0)}</b></div>`).join('')}</div>
    </div><div class="scroll">
      <div class="card"><div class="sec"><h3>エージェント</h3>${tip('騎乗依頼の数と質が上がる。収入から手数料が引かれる。')}</div>
        ${ag ? `<div class="kv"><span>${esc(ag.name)}</span><b>手数料 ${ag.fee}%</b></div><button class="btn small" id="b-fire" style="margin-top:6px">契約を解除する</button>` : W.agents.map(a => `<div class="kv"><span>${esc(a.name)}（手数料${a.fee}%）</span>${p.rep >= a.needRep ? `<button class="btn small primary" data-hire="${a.id}">契約する</button>` : `<span class="small muted">評価${a.needRep}以上</span>`}</div>`).join('')}</div>
      <div class="card"><div class="sec"><h3>ライバル</h3>${window.Drama ? `<span class="sub">今年 ${Drama.leading(W).my}勝・全国${Drama.leading(W).rank}位</span>` : ''}</div>${(W.rivals || []).map(r => { const j = W.jockeys[r.jid]; const hh = p.hh[r.jid] || { w: 0, l: 0 }; const c = r.cid && window.Drama ? Drama.CAST[r.cid] : null; const on = !window.Drama || Drama.avail(W, j); return `<div class="kv"><span>${esc(j.name)}<span class="small muted">（${r.kind}・${Math.max(18, j.age)}歳${on ? '' : j.from && W.year < j.from ? '・デビュー前' : '・帰国中'}）</span></span><b>今年${j.years[W.year] || 0}勝・対戦${hh.w}勝${hh.l}敗</b></div>${c ? `<div class="small muted" style="margin:-2px 0 2px">${esc(c.persona)}</div><div class="bar gold" style="margin-bottom:6px" title="関係"><i style="width:${Drama.rel(W, r.cid)}%"></i></div>` : ''}`; }).join('')}<p class="small muted" style="margin:4px 0 0">金色のバーは関係の深さ。会話の受け答えで変わる。${p.free ? '現在はフリー。' : '現在は厩舎所属。'}</p></div>
    </div></div>`;
    pane.querySelectorAll('[data-hire]').forEach(b => b.onclick = () => { p.agent = +b.dataset.hire; World.news(W, `${p.name}騎手が${W.agents[p.agent].name}と契約`, 'me'); showWeek(); });
    if ($('b-fire')) $('b-fire').onclick = () => { p.agent = null; showWeek(); };
    if ($('b-endc')) $('b-endc').onclick = () => confirmTap($('b-endc'), 'もう一度押すと解消', () => { p.otrust[p.contract] = Math.max(0, (p.otrust[p.contract] || 0) - 15); p.contract = null; showWeek(); });
  }
  function renderLife(pane) {
    const L = W.life, p = P();
    if (window.Life) Life.ensure(W);
    const stage = { none: 'ひとり', met: `${L.partner}さん（${L.job || '知人'}）と知り合った`, dating: `${L.partner}さん（${L.job || ''}）と交際中`, engaged: `${L.partner}さんと婚約中`, married: `${L.partner}さんと結婚` }[L.stage] || 'ひとり';
    pane.innerHTML = `<div class="cols" style="grid-template-columns:1fr 1fr"><div class="scroll card"><div class="sec"><h3>私生活</h3></div>
      <div class="kv"><span>パートナー</span><b>${esc(stage)}</b></div>${L.stage !== 'none' ? `<div class="kv"><span>${esc(L.partner)}さんとの仲</span><b>${Math.round(L.love)}</b></div><div class="bar gold"><i style="width:${L.love}%"></i></div>` : ''}
      ${(L.kids || []).map(k => `<div class="kv"><span>子ども</span><b>${esc(k.name)}（${W.year - k.born}歳）</b></div>`).join('')}
      <div class="kv"><span>家族との関係</span><b>${Math.round(L.family)}</b></div><div class="bar"><i style="width:${L.family}%"></i></div>
      <div class="kv"><span>友人との関係</span><b>${Math.round(L.friends)}</b></div><div class="bar"><i style="width:${L.friends}%"></i></div>
      <p class="small muted" style="margin:6px 0 0">出会い・交際・プロポーズ・結婚・子どもの誕生などは、会話のシーンとして届く。選んだ答えで関係や体調、物語の行き先が変わる。</p></div>
      <div class="scroll card"><div class="sec"><h3>住まい</h3></div><div class="kv"><span>今の住まい</span><b>${esc(Progress.HOMES[p.home].name)}</b></div><p class="small muted">ショップから引っ越せる。広い家ほど体調が回復しやすい。</p></div></div>`;
  }
  function renderNews(pane) {
    const per = 9, pages = Math.max(1, Math.ceil(W.news.length / per));
    newsPage = Math.min(newsPage, pages - 1);
    const items = W.news.slice(newsPage * per, newsPage * per + per);
    pane.innerHTML = `<div class="scroll card" style="margin-top:8px"><div class="sec"><h3>ニュース</h3><span class="sub">${W.news.length}件</span></div><ul class="news">${items.map(n => `<li class="${n.kind}"><span class="d">${esc(n.date || '')}</span><span class="t">${esc(n.text)}</span></li>`).join('') || '<li class="muted">まだニュースはない</li>'}</ul>
      <div class="pager">${pages > 1 ? `<button data-pg="${Math.max(0, newsPage - 1)}" aria-label="前のページ">‹</button>` + Array.from({ length: pages }, (_, i) => `<button class="${i === newsPage ? 'on' : ''}" data-pg="${i}">${i + 1}</button>`).join('') + `<button data-pg="${Math.min(pages - 1, newsPage + 1)}" aria-label="次のページ">›</button>` : ''}</div></div>`;
    pane.querySelectorAll('[data-pg]').forEach(b => b.onclick = () => { newsPage = +b.dataset.pg; showWeek(); });
  }
  function renderAch(pane) {
    const p = P(), cats = [...new Set(Progress.ACH.map(a => a.cat))];
    const got = Progress.ACH.filter(a => p.ach[a.id]).length;
    pane.innerHTML = `<div class="scroll" style="padding-top:8px">
      <div class="card"><div class="sec"><h3>トロフィー棚</h3><span class="sub">GⅠ・海外GⅠの優勝 ${p.trophies.length}個</span></div>
        ${p.trophies.length ? `<div class="ctrack">${p.trophies.map(t => `<div class="trophy"><div class="cup">🏆</div><b>${esc(t.name)}</b><div class="small muted">${t.year}年・${esc(t.horse)}</div></div>`).join('')}</div>` : '<p class="small muted">GⅠを勝つと並ぶ。</p>'}</div>
      <div class="card"><div class="sec"><h3>実績</h3><span class="sub">${got} / ${Progress.ACH.length}</span></div>
        ${cats.map(c => `<div class="small muted" style="margin:6px 0 3px">${esc(c)}</div><div class="ach">${Progress.ACH.filter(a => a.cat === c).map(a => { const pr = a.prog ? a.prog(W) : null; return `<div class="achi ${p.ach[a.id] ? 'on' : 'off'}${a.title ? ' ttl' : ''}">${p.ach[a.id] ? (a.title || a.cat === '騎手の記録' ? '👑' : '🏅') : '🔒'} <b>${esc(a.name)}</b>${a.desc ? `<div class="small muted">${esc(a.desc)}</div>` : ''}${pr && !p.ach[a.id] ? `<div class="bar" style="margin-top:3px"><i style="width:${pr.best / pr.total * 100}%"></i></div><div class="small muted">${pr.best} / ${pr.total}</div>` : ''}${p.ach[a.id] ? `<div class="small muted">${esc(p.ach[a.id])}</div>` : ''}</div>`; }).join('')}</div>`).join('')}</div></div>`;
  }
  function renderCareer(pane) {
    const p = P();
    const years = Object.keys(p.years).sort();
    const bonds = Object.entries(p.bond).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => W.horses[id]).filter(Boolean);
    pane.innerHTML = `<div class="cols" style="grid-template-columns:1fr 1fr"><div class="scroll">
      <div class="card"><div class="sec"><h3>通算成績</h3></div>
        <div class="kv"><span>勝利</span><b>${p.wins}勝（2着${p.seconds} 3着${p.thirds}）/ ${p.rides}騎乗</b></div>
        <div class="kv"><span>勝率</span><b>${p.rides ? (p.wins / p.rides * 100).toFixed(1) : '0.0'}%</b></div>
        <div class="kv"><span>獲得賞金（騎乗馬）</span><b>${money(p.earn)}</b></div>
        <div class="kv"><span>重賞</span><b>${p.gWins.length}勝（GⅠ ${p.g1Wins.length}勝）</b></div></div>
      <div class="card" style="padding:0"><table><tr><th>年</th><th>騎乗</th><th>勝利</th><th>重賞</th></tr>${years.map(y => `<tr><td>${y}</td><td>${p.years[y].rides}</td><td>${p.years[y].wins}</td><td>${p.years[y].g.length}</td></tr>`).join('')}</table></div>
    </div><div class="scroll">
      <button class="btn" id="b-horses" style="width:100%;margin-top:8px">お手馬の一覧を見る（${Object.keys(p.bond).filter(k => W.horses[k]).length}頭）</button>
      <details class="acc"><summary>歩み</summary><div class="in"><ul class="log" style="padding-left:16px;margin:4px 0">${W.log.slice(-20).reverse().map(l => `<li>${esc(l.text)}</li>`).join('')}</ul></div></details>
      <button class="btn small" id="b-retire" style="margin-top:6px">引退する</button>
    </div></div>`;
    $('b-horses').onclick = () => { tab = 'horses'; showWeek(); };
    $('b-retire').onclick = () => confirmTap($('b-retire'), 'もう一度押すと引退', () => { p.retired = true; W.log.push({ abs: W.abs, text: `${W.date} ${p.age}歳で現役引退` }); World.save(W); showRetire(); });
  }

  // ---------- 開催日 ----------
  function showDay() {
    show('s-day');
    gnav('day-nav');
    crumbs('day-crumbs', [['今週', () => showWeek()], [weekLabel(), null], [`${VENUES[W.venue].name} 開催日`, null]]);
    if (W.story && W.story.pending.length) setTimeout(() => playScenes(), 0);
    const nRide = Object.keys(W.booked).length;
    // 騎乗するレースごとに「自分で乗る（手動）」か「オート」かを選ぶ。最初は全部手動
    if (!W.manual || W.manual.abs !== W.abs) W.manual = { abs: W.abs, no: {} };
    const isMan = (no) => W.manual.no[no] !== false;
    let t = `<table><tr><th>R</th><th>手動</th><th>レース</th><th>条件</th><th>頭数</th><th>騎乗馬</th><th>結果</th></tr>`;
    W.card.forEach((race, i) => {
      const hid = W.booked[race.no];
      const h = hid ? W.horses[hid] : null;
      let res = '';
      if (race.result) {
        const w = race.result[0], wh = W.horses[w.hid];
        const me = race.result.find(r => r.isP);
        res = me ? `<b style="color:${me.pos === 1 ? 'var(--green)' : 'inherit'}">${me.pos}着</b>（${me.pop}人気）${me.demoted ? ' <span class="badge warn">降着</span>' : ''}` : `<span class="muted small">1着 ${esc(wh ? wh.name : '')}</span>`;
      }
      t += `<tr class="${i === W.dayIdx ? 'cur' : ''}"><td><b>${race.overseas ? '-' : race.no}</b></td><td>${h && !race.result ? `<label class="mchk"><input type="checkbox" data-man="${race.no}" ${isMan(race.no) ? 'checked' : ''}><span></span></label>` : h && race.result ? '<span class="small muted">済</span>' : ''}</td><td>${gradeTag(race)} ${esc(race.name)}</td><td>${raceCond(race)}</td><td>${race.field.length}</td><td>${h ? '<b>' + esc(h.name) + '</b>' : '<span class="muted">—</span>'}</td><td>${res}</td></tr>`;
    });
    $('day-table').innerHTML = t + '</table>';
    $('day-table').querySelectorAll('[data-man]').forEach(cb => cb.onchange = () => { W.manual.no[+cb.dataset.man] = cb.checked; World.save(W); showDay(); });
    const S = $('day-side');
    if (W.dayIdx >= W.card.length) {
      S.innerHTML = `<div class="card"><div class="sec"><h3>本日の全レース終了</h3></div><p class="muted small">お疲れさまでした。</p><button class="btn primary" style="width:100%" id="b-wend">今週の結果へ</button></div>`;
      $('b-wend').onclick = showWeekEnd; return;
    }
    const race = W.card[W.dayIdx];
    const hid = W.booked[race.no];
    let html = `<div class="card" style="margin-top:8px"><div class="small muted">次のレース</div><div style="font-family:var(--serif);font-size:18px;font-weight:900">${race.overseas ? '' : race.no + 'R '}${esc(race.name)} ${gradeTag(race)}</div><div class="small">${raceCond(race)}・${race.field.length}頭・騎乗 ${nRide}鞍</div><div class="small" style="margin-top:3px">${condLine(race)} ${tip(BIAS_TIP)}</div>`;
    const nextMan = W.card.slice(W.dayIdx).find(r => W.booked[r.no] && isMan(r.no));
    const autoBefore = W.card.slice(W.dayIdx, nextMan ? W.card.indexOf(nextMan) : W.card.length).filter(r => W.booked[r.no]).length;
    if (hid && isMan(race.no)) {
      const h = W.horses[hid];
      html += `<div style="margin-top:6px">騎乗馬 <b style="font-family:var(--serif);font-size:15px">${esc(h.name)}</b>${realTag(h)}</div></div><button class="btn primary" style="width:100%;margin-top:8px;padding:11px" id="b-pad">パドックへ</button>`;
    } else if (hid) {
      const h = W.horses[hid];
      html += `<div style="margin-top:6px">騎乗馬 <b style="font-family:var(--serif);font-size:15px">${esc(h.name)}</b>${realTag(h)} <span class="badge">オート</span></div></div>
        <button class="btn primary" style="width:100%;margin-top:8px;padding:11px" id="b-skipn">${nextMan ? `次の手動のレース（${nextMan.no}R）まで進める` : '残りをオートで進める'}${autoBefore ? `<br><span class="small">オートで${autoBefore}鞍に騎乗</span>` : ''}</button>`;
    } else {
      html += `<div class="muted small" style="margin-top:6px">このレースは騎乗なし</div></div>
        <button class="btn" style="width:100%;margin-top:8px" id="b-skip1">見送る（結果だけ見る）</button>
        <button class="btn primary" style="width:100%;margin-top:6px" id="b-skipn">${nextMan ? `次の手動のレース（${nextMan.no}R）まで進める` : '残りを進める'}${autoBefore ? `<br><span class="small">途中、オートで${autoBefore}鞍に騎乗</span>` : ''}</button>`;
    }
    html += `<button class="btn ghost small" style="width:100%;margin-top:6px" id="b-allauto">残りをすべてオートで進める</button>`;
    S.innerHTML = html;
    // オートのレースは結果だけ出して進む。手動にしたレースの手前で止まる
    const runAuto = (r) => { const hh = W.booked[r.no] || null; const ev = World.simulate(W, r, hh, 'auto'); if (ev && hh) { logRide(r, hh, ev, 'auto'); if (ev.interview) W.pendingInterviews = (W.pendingInterviews || []).concat([{ iv: ev.interview, hid: hh }]); } };
    if ($('b-pad')) $('b-pad').onclick = () => showPaddock(race);
    if ($('b-skip1')) $('b-skip1').onclick = () => { World.simulate(W, race, null); W.dayIdx++; World.save(W); showDay(); };
    if ($('b-skipn')) $('b-skipn').onclick = () => { while (W.dayIdx < W.card.length && !(W.booked[W.card[W.dayIdx].no] && isMan(W.card[W.dayIdx].no))) { runAuto(W.card[W.dayIdx]); W.dayIdx++; } World.save(W); showDay(); nextInterview(); };
    $('b-allauto').onclick = () => {
      while (W.dayIdx < W.card.length) {
        const r = W.card[W.dayIdx]; const hh = W.booked[r.no] || null;
        const ev = World.simulate(W, r, hh, 'auto');
        if (ev) { logRide(r, hh, ev, 'auto'); if (ev.interview) W.pendingInterviews = (W.pendingInterviews || []).concat([{ iv: ev.interview, hid: hh }]); }
        W.dayIdx++;
      }
      World.save(W); showDay(); nextInterview();
    };
  }
  function nextInterview() { const q = W.pendingInterviews && W.pendingInterviews.shift(); if (q) showInterview(q.iv, q.hid, nextInterview); }
  function logRide(race, hid, ev, mode) { W.weekLog.push({ no: race.no, name: race.name, graded: race.graded, horse: W.horses[hid].name, pos: ev.pos, pop: ev.pop, grade: ev.grade, mode, income: ev.income }); }

  // ---------- パドック（出馬表） ----------
  function showPaddock(race) {
    show('s-paddock');
    gnav('pad-nav');
    const hid = W.booked[race.no];
    const h = W.horses[hid];
    crumbs('pad-crumbs', quick ? [['タイトル', () => { quick = false; W = null; show('s-title'); }], ['お試し騎乗', null]] : [['今週', () => showWeek()], [`${VENUES[race.venue].name} 開催日`, () => showDay()], [`${race.overseas ? '' : race.no + 'R '}${race.name}`, null], ['パドック', null]]);
    World.setupRace(W, race, hid, 'manual');
    const f = race.field.find(x => x.hid === hid);
    const ab = World.ability(h, W.year);
    const t = W.trainers[h.trainer], o = W.owners[h.owner];
    let src = '';
    if (h.real) src = `<div class="small muted" style="margin-top:6px">2026年GⅠ：${h.runs2026.map(r => `${esc(r[0])} ${r[1]}着`).join(' / ')}<br>出典：${h.src.map(u => `<a href="${u}" target="_blank" rel="noopener" style="color:var(--green)">JRA</a>`).join(' ')}</div>`;
    $('pad-left').innerHTML = `<div class="card" style="margin-top:8px">
      <div class="row">${waku(f.waku)}<span class="small muted">${race.field.indexOf(f) + 1}番</span><div class="grow"></div>${realTag(h)}</div>
      <div style="font-family:var(--serif);font-size:21px;font-weight:900;margin:2px 0">${esc(h.name)}</div>${h.nameMean ? `<div class="small muted">馬名の意味：${esc(h.nameMean)}</div>` : ''}
      <div class="small muted">${sexAge(h)}・${esc(t.name)}・${silkChip(o)} ${esc(o.name)}</div>
      <div class="row" style="margin:6px 0"><span class="big">${f.pop}<small>番人気</small></span><span class="muted">単勝 ${f.odds}倍</span></div>
      <div class="kv"><span>脚質</span><b>${STYLE[h.style]}</b></div>
      <div class="kv"><span>得意距離・馬場</span><b>${h.dist}m前後・${SURF[h.surf]}</b></div>
      ${abilityHtml(race, h)}
      <div class="kv"><span>本作での戦績</span><b>${h.starts}戦${h.wins}勝${h.g1.length ? '・GⅠ' + h.g1.length + '勝' : ''}</b></div>${src}</div>
      <div class="card"><div class="small">${condLine(race)} ${tip(BIAS_TIP)}</div></div>
      ${(() => { const od = World.orderFor(W, race, h); return `<div class="card" style="border-left:4px solid var(--blue)"><div class="small muted">調教師の指示 ${tip('道中（レースの中ほど）の位置が指示に合っていれば、調教師の信頼が上がる。外れても3着以内なら不問で、それ以外でも下がり幅は小さい。')}</div><div style="font-family:var(--serif)">「${esc(od.text)}」</div>${od.free ? '' : `<div class="small" style="margin-top:3px">めやす：道中 <b>${od.lo}〜${od.hi}番手</b>${od.save ? '・仕掛けは直線まで待つ' : ''}</div>`}${h.tune && h.tune.abs === W.abs ? `<div class="small" style="margin-top:3px">追い切り評価 <b>${h.tune.g}</b>（調子 ${h.tune.v >= 0 ? '+' : ''}${h.tune.v}）</div>` : ''}</div>`; })()}
      <button class="btn primary" style="width:100%;margin-top:8px;padding:11px" id="b-ride">ジョッキーカメラで騎乗</button>
      <button class="btn" style="width:100%;margin-top:6px" id="b-auto">オート騎乗（結果のみ）</button>`;
    let tb = `<table><tr><th>枠</th><th>番</th><th>馬名</th><th>性齢</th><th>騎手</th><th>斤量</th><th>総合</th><th>人気</th><th>単勝</th></tr>`;
    race.field.forEach((x, i) => {
      const hh = W.horses[x.hid];
      const jn = x.hid === hid ? P().name : x.jid >= 0 ? W.jockeys[x.jid].name : x.jname;
      tb += `<tr class="${x.hid === hid ? 'me' : ''}"><td>${waku(x.waku)}</td><td>${i + 1}</td><td>${esc(hh.name)}${realTag(hh)}</td><td>${sexAge(hh)}</td><td>${esc(jn)}${x.hid !== hid && hh.mainJ != null && hh.mainJ >= 0 && x.jid >= 0 && x.jid !== hh.mainJ && W.jockeys[hh.mainJ] ? ` <span class="badge" title="主戦は${esc(W.jockeys[hh.mainJ].name)}騎手">乗替</span>` : ''}</td><td>${World.kinryo(W, race, hh, x.hid === hid)}</td><td class="tnum">${World.rating(hh, W.year).toFixed(1)}</td><td>${x.pop}</td><td>${x.odds}</td></tr>`;
    });
    $('pad-right').innerHTML = tb + '</table>';
    $('b-ride').onclick = () => startRace(race, hid);
    $('b-auto').onclick = () => {
      const r = World.setupRace(W, race, hid, 'auto');
      const res = r.runToEnd();
      race.laps = r.laps(); race.my3F = null; race.trace = r.trace || [];
      const ev = World.applyResult(W, race, res, hid, 'auto', null);
      if (!quick && ev) ev.order = World.judgeOrder(W, race, hid, race.trace, ev.pos);
      if (!quick) pressAftermath(race, ev);
      if (!quick) logRide(race, hid, ev, 'auto');
      showResult(race, hid, ev);
    };
  }

  // ---------- レース ----------
  let glbDone = false;
  HorseGLB.load().then(() => { glbDone = true; });
  let engine = null, R3 = null, rafId = 0, lastT = 0, acc = 0, paused = false, endAt = 0, curRace = null, curHid = null, camMode = 'jockey', hudT = 0;
  const CAMS = [['jockey', '騎手'], ['chase', '後方'], ['tv', '中継']];
  try { camMode = localStorage.getItem('jl-cam') || 'jockey'; } catch (e) {}
  // 3D描画に渡すレースの情報（ゼッケンの色と書く内容）
  function raceInfo3d(race) {
    const V = VENUES[race.venue] || {};
    return { label: race.graded || race.overseas ? race.name : '', cloth: { kind: Zekken.kindOf(race), race: race.name, no: race.overseas ? null : race.no, venue: V.name || '', intl: !!race.overseas || /ジャパンC|ジャパンカップ/.test(race.name) } };
  }
  function startRace(race, hid, opt = {}) {
    curRace = race; curHid = hid; introStage = ''; snaps = []; rp = null; raceSeq++; loopErr = 0;
    if (!opt.noIntro) { tut = null; document.querySelectorAll('.hl').forEach(el => el.classList.remove('hl')); }
    $('race').classList.remove('replay');
    Sound.init();
    $('tut').style.display = 'none';
    engine = World.setupRace(W, race, hid, 'manual');
    engine.onEvent = (t) => { if (t === 'gate') { Sound.gate(); Sound.cheer(0.6); } else if (t === 'whip') Sound.whip(); else if (t === 'bump' || t === 'foul') Sound.bump(); else if (t === 'finish') Sound.cheer(1.4); };
    window.__cheered = false;
    Comm.reset(engine);
    show('race');
    if (!glbDone) {
      const seq = raceSeq;
      HorseGLB.load().then(() => {
        if (glbDone) return; glbDone = true;
        // 馬のモデルが遅れて届いたら、同じレースの最中に限って描き直す。発走前の演出中ならやり直す
        if (seq !== raceSeq || !R3 || !$('race').classList.contains('on') || rp) return;
        const hadIntro = !!R3.intro;
        R3.setupRace(engine, raceInfo3d(race)); R3.setCamMode(camMode);
        if (hadIntro) { R3.startIntro(introOpts(race)); introStage = ''; }
      });
    }
    if (!R3) { R3 = new Render3D($('r3d')); window.__R3 = R3; R3.onHoof = () => Sound.hoof(engine.surf); R3.onKickHit = (k, kind) => goggleHit(k, kind); window.addEventListener('resize', () => R3 && R3.resize()); }
    R3.setupRace(engine, raceInfo3d(race));
    goggleClear();
    R3.setCamMode(camMode); updateCamBtn();
    $('b-snd').textContent = Sound.isMuted() ? '音OFF' : '音ON';
    const L = engine.course.dir === 'L';
    $('lbl-l').textContent = L ? '◀ 内へ' : '◀ 外へ'; $('lbl-r').textContent = L ? '外へ ▶' : '内へ ▶';
    engine.input.steer = 0; setPower(0.42);
    $('startBtn').style.display = '';
    $('loading').style.display = 'flex';
    paused = false; endAt = 0; acc = 0;
    cancelAnimationFrame(rafId);
    const waitStart = performance.now();
    const wait = () => {
      // 素材の読み込みが遅くても、12秒たったら始める（読み込めた分だけで描く）
      const ready = (Render3D.loaded >= Render3D.toLoad && glbDone) || performance.now() - waitStart > 12000;
      if (!ready) { $('loading').textContent = `コースを準備中…（${Render3D.loaded}/${Render3D.toLoad}）`; rafId = requestAnimationFrame(wait); return; }
      $('loading').style.display = 'none';
      R3.resize();
      if (!opt.noIntro) { const io = introOpts(race); R3.startIntro(io); $('race').classList.add('intro'); $('race').classList.toggle('big', !!io.perHorse); } else $('race').classList.remove('intro', 'big');
      lastT = performance.now();
      rafId = requestAnimationFrame(loop);
    };
    wait();
  }
  let loopErr = 0;
  // 前の馬が蹴り上げた砂・泥がゴーグルに当たる（騎手視点のときだけ）。当たった跡は少しずつ薄れる
  const gog = { cv: null, x: null, last: 0, raf: 0 };
  function goggleHit(k, kind) {
    if (camMode !== 'jockey' || !engine || (R3 && (R3.replay || R3.cer))) return;
    const now = performance.now();
    if (now - gog.last < 90) return; gog.last = now;
    if (!gog.cv) {
      gog.cv = document.createElement('canvas'); gog.cv.id = 'goggle';
      gog.cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2';
      $('r3d').after(gog.cv); gog.x = gog.cv.getContext('2d');
    }
    const cv = gog.cv, dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const x = gog.x, n = 1 + Math.round(k * 4);
    const col = kind === 'mud' ? [62, 48, 34] : [128, 102, 74];
    for (let i = 0; i < n; i++) {
      // 画面の中央寄り（ゴーグルの前面）に当たりやすい
      const px = w * (0.5 + (Math.random() - 0.5) * 0.9), py = h * (0.45 + (Math.random() - 0.5) * 0.7);
      const r = (2 + Math.random() * (kind === 'mud' ? 9 : 5)) * dpr * (0.6 + k);
      x.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.55 + Math.random() * 0.35})`;
      x.beginPath();
      for (let a = 0; a <= 12; a++) { const t = a / 12 * Math.PI * 2, rr = r * (0.7 + Math.random() * 0.5); x[a ? 'lineTo' : 'moveTo'](px + Math.cos(t) * rr, py + Math.sin(t) * rr); }
      x.fill();
      // 飛び散った細かい粒
      for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(px + (Math.random() - 0.5) * r * 5, py + (Math.random() - 0.5) * r * 5, r * 0.2, 0, 7); x.fill(); }
    }
    if (!gog.raf) gog.raf = requestAnimationFrame(goggleFade);
  }
  function goggleFade() {
    const x = gog.x, cv = gog.cv;
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = 'rgba(0,0,0,0.035)'; x.fillRect(0, 0, cv.width, cv.height); x.globalCompositeOperation = 'source-over';
    gog.raf = performance.now() - gog.last < 4000 ? requestAnimationFrame(goggleFade) : 0;
    if (!gog.raf) x.clearRect(0, 0, cv.width, cv.height);
  }
  function goggleClear() { if (gog.x) gog.x.clearRect(0, 0, gog.cv.width, gog.cv.height); }
  function loop(now) {
    try { loopBody(now); } catch (err) {
      console.error(err);
      if (!loopErr++) toast('描画でエラーが出たが、レースは続ける');
      if (loopErr > 300) { toast('レースを続けられないため、オートで結果を出す'); return bailOut(); }
      rafId = requestAnimationFrame(loop);
    }
  }
  function bailOut() {
    try { const e = engine; e.player.auto = true; if (e.player.reaction == null) e.player.reaction = 0.3; let g = 0; while (!e.done && g++ < 60000) e.step(1 / 30); } catch (e2) { console.error(e2); }
    $('race').classList.remove('intro', 'replay'); if (R3) { R3.intro = null; R3.replay = false; }
    Sound.stopAll(); finishRace();
  }
  function loopBody(now) {
    const rdt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    const Pl = engine.player;
    let sdt = 0;
    if (tut) tutTick(rdt);
    // 出走前の演出（コース紹介 → 枠入り → ゲートの中）。この間レースの時計は進めない
    $('race').classList.toggle('intro', !!R3.intro);
    if (R3.intro) {
      const I = R3.intro;
      if (I.stage !== introStage) {
        introStage = I.stage; introCard(I.stage);
        if (I.stage === 'horses') Comm.say('出走馬を紹介します。', 2);
        if (I.stage === 'load') { Sound.fanfare(fanfareKind(curRace)); Comm.say(curRace.graded === 1 || curRace.overseas ? 'ファンファーレが鳴り響きます。各馬、ゲートへ。' : '各馬、ゲートに入っていきます。', 3); }
        if (I.stage === 'set') Comm.say('最後の馬が収まって、態勢完了。', 2);
      }
      if (I.stage === 'horses' && I.hIdx !== introHorse) { introHorse = I.hIdx; introCard('horse', I.hIdx); }
      R3.render(engine, rdt);
      Sound.update(0, 0, 0.16, RAIN[engine.cfg.weather] || 0);
      Comm.fade();
      if (I.done) endIntro();
      rafId = requestAnimationFrame(loop);
      return;
    }
    if (!paused && !(tut && tut.hold)) {
      const speed = (Pl.finished ? 4 : !Pl.started ? 1 : 1.15) * (tut ? tut.speed : 1);
      acc += rdt * speed; sdt = rdt * speed;
      let n = 0;
      while (acc >= 1 / 60 && n++ < 300) { engine.step(1 / 60); acc -= 1 / 60; }
      if (Pl.started || Pl.auto) $('startBtn').style.display = 'none';
      Comm.tick();
      // ゴール前のリプレイ用に、最後の150mの動きを記録する
      if (engine.open && snaps.length < 4000) {
        let lead = 0; for (const r of engine.runners) if (r.s > lead) lead = r.s;
        if (lead > engine.D - 150) snaps.push({ t: engine.t, a: engine.runners.map(r => [r.s, r.X, r.phase, r.v, r.effort, r.whipT, r.latV || 0]) });
      }
    }
    Comm.fade();
    R3.render(engine, paused || (tut && tut.hold) ? 0 : sdt);
    updateHud(rdt);
    const nearby = engine.runners.filter(r => r !== Pl && Math.abs(r.s - Pl.s) < 15).length;
    const inStraight = engine.pAt(Pl.s) % engine.course.lap;
    if (!window.__cheered && engine.open && engine.D - Pl.s < 300) { window.__cheered = true; Sound.cheer(1); }
    const crowd = engine.open ? (Pl.s > engine.D - engine.course.H ? 0.5 + 0.5 * Math.min(1, (Pl.s - (engine.D - engine.course.H)) / (engine.course.H * 0.6)) : 0.1) : 0.2;
    Sound.update(paused ? 0 : Pl.v, paused ? 0 : nearby, paused ? 0.05 : crowd, RAIN[engine.cfg.weather] || 0);
    if (engine.done) {
      if (!endAt) endAt = now;
      if (now - endAt > 1500) { curRace.commentary = Comm.lines.slice(); return startReplay(); }
    }
    rafId = requestAnimationFrame(loop);
  }
  const RAIN = { '小雨': 0.45, '雨': 1 };
  // ---- 実況（文字で出す。全文は結果画面で読める） ----
  const Comm = {
    e: null, lines: [], next: 0, F: {}, sec: null, rot: 0, shown: 0,
    reset(e) { this.e = e; this.lines = []; this.next = 0; this.F = {}; this.sec = null; this.rot = 0; this.shown = 0; $('caption').classList.remove('on'); $('caption-t').textContent = ''; },
    say(text, hold = 2.4) {
      const e = this.e;
      this.lines.push({ t: e.open ? e.t - e.gateOpenAt : null, text });
      $('caption-t').textContent = text; $('caption').classList.add('on');
      this.next = e.t + hold; this.shown = performance.now();
    },
    fade() { if (this.shown && performance.now() - this.shown > 5200) { $('caption').classList.remove('on'); this.shown = 0; } },
    nm(r) { return `${r.num}番${r.horse.name}`; },
    len(m) { const L = m / 2.4; return L < 0.15 ? 'ハナ' : L < 0.4 ? 'クビ' : L < 0.8 ? '半馬身' : L < 1.4 ? '1馬身' : `${Math.round(L)}馬身`; },
    tick() {
      const e = this.e, F = this.F; if (!e || !e.open) return;
      const t = e.t - e.gateOpenAt, nm = this.nm;
      const ord = e.runners.slice().sort((a, b) => b.s - a.s), lead = ord[0], sec2 = ord[1], Pl = e.player;
      const rem = e.D - lead.s, c = e.course;
      if (!F.start) { F.start = 1; return this.say('スタートしました！', 1.3); }
      if (!F.start2 && t > 1.7) {
        F.start2 = 1;
        const late = e.runners.filter(r => !r.started || (r.reaction || 0) > 0.6);
        return this.say(late.length ? `${late.slice(0, 2).map(nm).join('、')}は出遅れました。` : '各馬そろったスタートです。');
      }
      // ゴール
      const fin = e.runners.filter(r => r.finished).sort((a, b) => a.finishTime - b.finishTime);
      if (fin.length && !F.fin) { F.fin = t; return this.say(`${nm(fin[0])}、ゴールイン！`, 2.2); }
      if (F.fin && !F.fin2 && fin.length >= 3 && t > F.fin + 2) {
        F.fin2 = 1;
        const mg = (fin[1].finishTime - fin[0].finishTime) * e.D / fin[0].finishTime;
        return this.say(`勝ったのは${nm(fin[0])}。${this.len(mg)}差の2着に${nm(fin[1])}、3着は${nm(fin[2])}。勝ちタイムは${RaceEngine.fmtTime(fin[0].finishTime)}。`, 6);
      }
      if (F.fin) return;
      const inStr = lead.s > e.D - c.H + 5 || rem < 420;
      if (inStr && !F.str) { F.str = 1; return this.say(`さあ直線コースに向きました！ 先頭は${nm(lead)}、リードは${this.len(lead.s - sec2.s)}！`, 2); }
      if (rem < 200 && !F.r200) { F.r200 = 1; return this.say(`残り200メートル！ 先頭は${nm(lead)}！`, 1.6); }
      if (e.t < this.next) return;
      if (F.str) { // 直線の攻防
        const gap = lead.s - sec2.s;
        const mover = ord.slice(1, 9).filter(r => r.v - lead.v > 0.22 && lead.s - r.s < 14).sort((a, b) => (b.v - lead.v) - (a.v - lead.v))[0];
        if (mover && mover !== this.lastMover) {
          this.lastMover = mover;
          const dx = (mover.X - lead.X);
          return this.say(`${dx > 1 ? '外から' : dx < -1 ? '内から' : '間を割って'}${nm(mover)}！ ${mover.horse.name}が伸びてくる！`, 1.7);
        }
        if (gap < 1.2) return this.say(`${nm(lead)}と${nm(sec2)}、並んだ並んだ！`, 1.5);
        const v = this.rot++ % 3;
        if (gap > 9.5) return this.say(v ? `${lead.horse.name}、これは強い！ リードは${this.len(gap)}！` : `${nm(lead)}の独走になりました！`, 2.2);
        if (v === 0) return this.say(`先頭は${nm(lead)}、リード${this.len(gap)}！ 2番手${nm(sec2)}！`, 1.8);
        if (v === 1) return this.say(`${lead.horse.name}が粘る！ ${sec2.horse.name}が${this.len(gap)}差まで迫る！`, 1.8);
        return this.say(`${nm(lead)}、${nm(sec2)}、3番手に${nm(ord[2])}！`, 1.8);
      }
      if (lead.s > 170 && !F.early) { F.early = 1; return this.say(`先手を取ったのは${nm(ord[0])}。2番手に${nm(ord[1])}、その後ろ${nm(ord[2])}。`, 3.2); }
      if (e.D >= 1600 && e.leaderSplits[5] && !F.k1000) {
        F.k1000 = 1;
        const sp = e.leaderSplits[5], ratio = (1000 / sp) / (e.vBase * 0.975 * 0.97);
        return this.say(`1000メートルの通過は${sp.toFixed(1)}秒。${ratio > 1.012 ? '速い流れです。' : ratio < 0.985 ? 'ゆったりした流れです。' : '平均的な流れです。'}`, 3.2);
      }
      const sec = RaceEngine.sectionName(c, e.pAt(lead.s));
      if (sec !== this.sec) { const first = this.sec == null; this.sec = sec; if (!first && sec !== '直線') return this.say(`${sec}に入ります。先頭は${nm(lead)}。`, 3); }
      if (lead.s > 350 && !F.me && Pl && !Pl.auto) { F.me = 1; return this.say(`${nm(Pl)}は${Pl.rank === 1 ? '先頭' : Pl.rank + '番手'}。${Pl.X < 2.2 ? '内ラチ沿い' : Pl.X > 5 ? '外め' : '馬群の中'}を進んでいます。`, 3.2); }
      const k = this.rot++ % 4, n = ord.length;
      if (k === 0) return this.say(`先頭は${nm(lead)}、${this.len(lead.s - sec2.s)}差で${nm(sec2)}。`, 4.5);
      if (k === 1) return this.say(`中団に${nm(ord[Math.floor(n / 2)])}、${nm(ord[Math.floor(n / 2) + 1] || ord[n - 1])}。`, 4.5);
      if (k === 2) return this.say(`後方からは${nm(ord[n - 2] || ord[n - 1])}、最後方に${nm(ord[n - 1])}。`, 4.5);
      return this.say(lead.s - ord[n - 1].s > 45 ? '馬群は縦長になりました。' : '馬群は一団で進んでいます。', 4.5);
    },
  };
  // ---- ゴール前のリプレイ ----
  let snaps = [], rp = null;
  const SNAPF = ['s', 'X', 'phase', 'v', 'effort', 'whipT', 'latV'];
  function startReplay() {
    const fin = engine.runners.filter(r => r.finished).sort((a, b) => a.finishTime - b.finishTime);
    if (tut || snaps.length < 8 || !fin.length) { Sound.stopAll(); return afterRace(); }
    const tW = engine.gateOpenAt + fin[0].finishTime;
    rp = { t: Math.max(snaps[0].t, tW - 2.3), end: Math.min(snaps[snaps.length - 1].t, tW + 0.6), tW, hold: 0, i: 0, win: fin[0], saved: engine.runners.map(r => SNAPF.map(k => r[k])) };
    R3.setReplay(true); $('race').classList.add('replay'); $('replay-res').style.display = 'none';
    Sound.update(0, 0, 0.9, RAIN[engine.cfg.weather] || 0);
    lastT = performance.now(); rafId = requestAnimationFrame(replayLoop);
  }
  function replayLoop(now) {
    if (!rp) return;
    try { replayBody(now); } catch (err) { console.error(err); endReplay(); }
  }
  function replayBody(now) {
    const rdt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    const slow = Math.abs(rp.t - rp.tW) < 0.22 ? 0.12 : 0.3;
    if (rp.t < rp.end) rp.t = Math.min(rp.end, rp.t + rdt * slow); else rp.hold += rdt;
    while (rp.i < snaps.length - 2 && snaps[rp.i + 1].t < rp.t) rp.i++;
    const A = snaps[rp.i], B = snaps[Math.min(snaps.length - 1, rp.i + 1)], k = clamp((rp.t - A.t) / Math.max(1e-6, B.t - A.t), 0, 1);
    engine.runners.forEach((r, j) => SNAPF.forEach((f, q) => { r[f] = A.a[j][q] + (B.a[j][q] - A.a[j][q]) * k; }));
    R3.render(engine, rp.t < rp.end ? rdt * slow : 0);
    if (rp.t >= rp.tW && $('replay-res').style.display === 'none') { $('replay-res').textContent = `1着　${rp.win.num}番 ${rp.win.horse.name}`; $('replay-res').style.display = 'block'; Sound.cheer(1.2); }
    if (rp.hold > 1.6) return endReplay();
    rafId = requestAnimationFrame(replayLoop);
  }
  function endReplay() {
    if (!rp) return;
    cancelAnimationFrame(rafId);
    engine.runners.forEach((r, j) => SNAPF.forEach((f, q) => { r[f] = rp.saved[j][q]; }));
    rp = null; R3.setReplay(false); $('race').classList.remove('replay'); Sound.stopAll();
    afterRace();
  }
  $('replay-skip').addEventListener('pointerdown', (e) => { e.preventDefault(); endReplay(); });
  // ---- 勝ったあと：ウイニングラン（GⅠ）→ 口取り（記念撮影。重賞は優勝レイ） ----
  let cer = null;
  const LEI = { g1: ['#4b2c83', '#ffffff', '#f2c318'], classic: ['#4b2c83', '#f2c318', '#ffffff'], derby: ['#c9a13b', '#ffffff', '#c8102e'], g2: ['#9c2a1f', '#ffffff', '#f2c318'], g3: ['#1d6b40', '#ffffff', '#f2c318'] };
  function afterRace() {
    const res = engine.results();
    const Pl = engine.player, won = res[0] && res[0].runner === Pl && !Pl.auto;
    if (!won || tut || !R3) return finishRace();
    const race = curRace, kind = Zekken.kindOf(race), big = race.graded === 1 || race.overseas;
    const steps = [];
    if (big) steps.push('run');
    steps.push('photo');
    cer = { steps, i: -1, race, kind, lei: !!(race.graded || race.overseas), saved: ['s', 'X', 'v', 'phase', 'effort', 'whipT', 'latV'].map(k => Pl[k]) };
    $('race').classList.add('cer');
    nextCer();
  }
  function nextCer() {
    cer.i++;
    const step = cer.steps[cer.i], Pl = engine.player, e = engine, race = cer.race;
    if (!step) return endCer();
    cer.t = 0; cer.step = step; cer.flashed = false;
    const h = W.horses[curHid], f = race.field.find(x => x.hid === curHid) || {};
    const t = h ? W.trainers[h.trainer] : null, o = h ? W.owners[h.owner] : null;
    const res = e.results(), me = res[0];
    if (step === 'run') {
      Pl.s = e.D - 80; Pl.X = e.course.width - 2.6; Pl.v = 7.2; Pl.effort = 0.2; Pl.whipT = 0; Pl.latV = 0;
      $('cer-tag').textContent = 'ウイニングラン';
      $('cer-card').innerHTML = `<div class="k">${esc(race.name)} ${race.graded ? `G${'ⅠⅡⅢ'[race.graded - 1]}` : ''}</div><h2>${esc(h.name)}</h2><div class="d">${esc(P().name)}騎手、スタンドの歓声に応える</div>`;
      Sound.cheer(1.6);
    } else {
      Pl.s = e.D - 22; Pl.X = e.course.width - 3.2; Pl.v = 0; Pl.effort = 0.1; Pl.latV = 0;
      $('cer-tag').textContent = cer.lei ? '口取り式・優勝レイ' : '口取り';
      $('cer-card').innerHTML = `<div class="k">${esc(VENUES[race.venue].name)}${race.overseas ? '' : ' 第' + race.no + '競走'}　${esc(race.name)}${race.graded ? ` (G${'ⅠⅡⅢ'[race.graded - 1]})` : ''}</div><h2>優勝　${esc(h.name)}</h2>
        <div class="d">騎手 ${esc(P().name)}　調教師 ${esc(t ? t.name.replace('厩舎', '') : '')}　馬主 ${esc(o ? o.name : '')}　タイム ${RaceEngine.fmtTime(me.time)}${me.runner && res[1] ? `　着差 ${esc(res[1].margin)}` : ''}</div>`;
    }
    $('cer-card').style.display = 'none';
    R3.startCeremony(step, { lei: cer.lei, leiColors: LEI[cer.kind] });
    lastT = performance.now(); cancelAnimationFrame(rafId); rafId = requestAnimationFrame(cerLoop);
  }
  function cerLoop(now) {
    if (!cer) return;
    try {
      const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now; cer.t += dt;
      const Pl = engine.player;
      if (cer.step === 'run') { Pl.s = Math.min(engine.D - 4, Pl.s + Pl.v * dt); Pl.phase += dt * Pl.v / RaceEngine.STRIDE; if (cer.t > 1.2) $('cer-card').style.display = 'block'; }
      else {
        Pl.phase += dt * 0.3;
        if (cer.t > 1.4 && !cer.flashed) { cer.flashed = true; const fl = $('cer-flash'); fl.classList.remove('on'); void fl.offsetWidth; fl.classList.add('on'); Sound.shutter && Sound.shutter(); $('cer-card').style.display = 'block'; }
      }
      R3.render(engine, dt);
      Sound.update(0, 0, cer.step === 'run' ? 1 : 0.55, 0);
      if ((cer.step === 'run' && (cer.t > 9.5 || Pl.s >= engine.D - 4)) || (cer.step === 'photo' && cer.t > 7)) return nextCer();
    } catch (err) { console.error(err); return endCer(); }
    rafId = requestAnimationFrame(cerLoop);
  }
  function endCer() {
    if (!cer) return;
    cancelAnimationFrame(rafId);
    const Pl = engine.player;
    ['s', 'X', 'v', 'phase', 'effort', 'whipT', 'latV'].forEach((k, i) => { Pl[k] = cer.saved[i]; });
    cer = null; R3.endCeremony(); $('race').classList.remove('cer'); Sound.stopAll();
    finishRace();
  }
  $('cer-skip').addEventListener('pointerdown', (e) => { e.preventDefault(); if (cer) nextCer(); });
  let introStage = '', raceSeq = 0;
  // ファンファーレの種類：海外／GⅠ（東・西）／重賞／特別／一般
  const WEST = ['kyoto', 'hanshin', 'chukyo', 'kokura'];
  function fanfareKind(race) {
    if (race.overseas) return 'intl';
    if (race.graded === 1) return WEST.includes(race.venue) ? 'g1w' : 'g1e';
    if (race.graded) return 'jusho';
    return Zekken.kindOf(race) === 'special' ? 'special' : 'normal';
  }
  const FANFARE_LEN = { normal: 4.4, special: 6.4, jusho: 9.7, g1e: 14.6, g1w: 15.1, intl: 9.5 };
  function introOpts(race) {
    const big = race.graded === 1 || race.overseas;
    return { perHorse: big ? 1.25 : race.graded ? 0.85 : 0, loadMin: FANFARE_LEN[fanfareKind(race)] || 5, flyLen: big ? 6 : 4.6 };
  }
  let introHorse = -1;
  function introCard(stage, idx) {
    if (stage !== 'horse') introHorse = stage === 'horses' ? introHorse : -1;
    const race0 = curRace;
    if (stage === 'horses') return; // 1頭目の札は直後に出す
    if (stage === 'horse') {
      const e = engine, r = e.runners[idx], f = race0.field[idx] || {}, h = r.horse;
      const jn = r.isPlayer ? P().name : f.jid >= 0 ? W.jockeys[f.jid].name : (f.jname || r.cfg.jname || '');
      const card = $('intro-card');
      card.className = 'horse';
      card.innerHTML = `<div class="hz" style="background:${WAKU_COLORS[(f.waku || 1) - 1]};color:${[1, 5].includes(f.waku) ? '#111' : '#fff'}"><b>${r.num}</b><small>${f.waku || 1}枠</small></div>
        <div class="hb"><div class="k">${esc(sexAge(h))}・斤量${r.cfg.weight || ''}kg${r.isPlayer ? '　<span class="me">あなたの騎乗馬</span>' : ''}</div><h2>${esc(h.name)}</h2>
        <div class="d">騎手 ${esc(jn)}　${f.pop || '-'}番人気・単勝${f.odds || '-'}倍${h.nameMean ? `　<span class="mean">${esc(h.nameMean)}</span>` : ''}</div></div>`;
      card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
      return;
    }
    $('intro-card').className = '';
    const e = engine, race = curRace, Pl = e.player, card = $('intro-card');
    const f = race.field.find(x => x.hid === curHid) || {};
    const g = race.graded ? `G${'ⅠⅡⅢ'[race.graded - 1]}　` : race.overseas ? '海外GⅠ　' : '';
    let html;
    if (stage === 'fly' && (race.graded || race.overseas)) {
      // 重賞のタイトル：格の色の帯、競走名を大きく、競馬場の英字
      const kind = Zekken.kindOf(race), st = Zekken.STYLE[kind] || Zekken.STYLE.g1;
      $('intro-card').className = 'title';
      html = `<div class="tg" style="background:${kind === 'derby' ? 'linear-gradient(90deg,#c9a13b,#f2d77a)' : st.bg};color:${kind === 'derby' ? '#2a1e00' : '#fff'}">${race.overseas ? '海外 GⅠ' : `G${'ⅠⅡⅢ'[race.graded - 1]}`}</div>
        <h2>${esc(race.name)}</h2><div class="d">${esc((VENUES[race.venue].en || VENUES[race.venue].name) + (VENUES[race.venue].en ? ' RACECOURSE' : '競馬場'))}　${raceCond(race)}・${e.course.dir === 'L' ? '左' : '右'}回り・${e.runners.length}頭</div>`;
    } else if (stage === 'fly') html = `<div class="k">${esc(VENUES[race.venue].name)}競馬場${race.overseas ? '' : `　第${race.no}競走`}</div><h2>${g}${esc(race.name)}</h2><div class="d">${raceCond(race)}・${e.course.dir === 'L' ? '左' : '右'}回り・${e.runners.length}頭</div>`;
    else if (stage === 'load') html = `<div class="k">枠入り</div><h2>${waku(f.waku || 1)} ${Pl.num}番 ${esc(Pl.horse.name)}</h2><div class="d">${f.pop || '-'}番人気・単勝${f.odds || '-'}倍・騎手 ${esc(P().name)}</div>`;
    else html = `<div class="k">まもなく発走</div><h2>ゲートが開いたら「スタート」</h2>`;
    card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    card.innerHTML = html;
  }
  function endIntro() { if (R3) R3.endIntro(); $('race').classList.remove('intro'); introStage = ''; lastT = performance.now(); }
  $('intro-skip').addEventListener('pointerdown', (e) => { e.preventDefault(); endIntro(); });
  function updateHud(dt) {
    const e = engine, Pl = e.player;
    const rem = Math.max(0, e.D - Pl.s);
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.1;
      const t = e.open ? (Pl.finished ? Pl.finishTime : e.t - e.gateOpenAt) : 0;
      const pace = e.pace();
      // 左上：順位と残り距離だけ（細かい情報は一時停止の画面へ）
      const lapsAll = e.laps(), lastLap = lapsAll.length ? lapsAll[lapsAll.length - 1] : null;
      const info = `<div class="rn">${esc(e.cfg.name)}</div><div class="row1"><div class="pos">${Pl.rank || '-'}<small>/${e.runners.length}</small></div><div class="rem">残り<b>${Math.ceil(rem)}</b>m<br><span>${RaceEngine.sectionName(e.course, e.pAt(Pl.s))}</span></div></div>
        <div class="sub">${RaceEngine.fmtTime(t)}${pace ? `<i>ペース ${pace}</i>` : ''}${lastLap != null ? `<i>ラップ ${lastLap.toFixed(1)}</i>` : ''}</div>`;
      if ($('hud-info')._h !== info) { $('hud-info').innerHTML = info; $('hud-info')._h = info; }
      const cond = `<div><span>内ラチから</span><b>${Pl.X.toFixed(1)}m</b></div><div><span>${esc(e.cfg.weather || '晴')}・${esc(e.cfg.ground || '良')}</span><b>${esc(World.biasText(e.bias))}</b></div>`;
      if ($('hud-cond')._h !== cond) { $('hud-cond').innerHTML = cond; $('hud-cond')._h = cond; }
      // 時速とラップ（先頭の1ハロンごと）
      $('spd-v').textContent = (Pl.v * 3.6).toFixed(1);
      const lp = e.laps().slice(-4);
      $('laps').innerHTML = lp.length ? 'ラップ ' + lp.map((x, i) => i === lp.length - 1 ? `<b>${x.toFixed(1)}</b>` : x.toFixed(1)).join(' - ') : 'ラップ —';
      // 隊列
      const ord = e.runners.slice().sort((a, b) => b.s - a.s);
      const lead = ord[0].s, last = ord[ord.length - 1].s, span = Math.max(30, lead - last);
      const bar = $('hud-bar');
      if (bar.dataset.n !== String(e.runners.length) || bar.dataset.race !== String(raceSeq)) { bar.dataset.n = String(e.runners.length); bar.dataset.race = String(raceSeq); bar.innerHTML = e.runners.map(r => `<span class="d${r === Pl ? ' me' : ''}" style="background:${r === Pl ? (W.player.color || '#ffeb3b') : r.color}"></span>`).join('') + '<span class="lead">先頭▶</span>'; }
      const w = bar.clientWidth - 16;
      e.runners.forEach((r, i) => { bar.children[i].style.left = (8 + w - (lead - r.s) / span * w) + 'px'; });
      drawMap(); drawRadar();
      // 横の馬
      let l = false, rr = false;
      const sgn = e.course.dir === 'L' ? 1 : -1;
      for (const o of e.runners) { if (o === Pl) continue; const ds = o.s - Pl.s, dx = (o.X - Pl.X) * sgn; if (ds > -3.5 && ds < 2.5 && Math.abs(dx) < 2.4) { if (dx < 0) l = true; else rr = true; } }
      $('side-l').textContent = l ? '◀ 馬' : ''; $('side-r').textContent = rr ? '馬 ▶' : '';
      // ムチ：2完歩たつと輪が一周し、連続の数え直しになる
      const wf = Pl.lastWhipPhase != null ? clamp((Pl.phase - Pl.lastWhipPhase) / 2, 0, 1) : 1;
      $('c-whip').style.background = wf < 1 ? `conic-gradient(rgba(255,255,255,.92) ${wf * 360}deg, rgba(200,16,46,.35) 0)` : '';
      $('whip-n').textContent = `${Pl.lastWhipPhase != null && Pl.phase - Pl.lastWhipPhase < 2 ? Pl.whipRun : 0}/5`;
    }
    // コーチ：全力で持つ距離と、いまやるべきこと
    if (hudT === 0.1) {
      const sustain = estimateSustain(e, Pl);
      const ratio = clamp(sustain / Math.max(1, rem), 0, 1);
      $('coach-b').style.width = (ratio * 100) + '%';
      $('coach-b').style.background = ratio >= 1 ? '#66bb6a' : ratio > 0.75 ? '#ffca28' : '#90a4ae';
      $('coach-m').textContent = `全力で持つ距離 約${Math.round(sustain / 10) * 10}m ／ 残り${Math.ceil(rem)}m`;
      const tip = coachTip(e, Pl, rem, sustain);
      if ($('coach-t').textContent !== tip.t) $('coach-t').textContent = tip.t;
      $('coach').classList.toggle('go', !!tip.go); $('coach').classList.toggle('on', !!tip.t);
    }
    // ゲージ（毎フレーム）
    const st = clamp(Pl.st / 1.06, 0, 1);
    const g = $('g-st'); g.style.width = (st * 100) + '%'; g.style.background = st > 0.45 ? '#5ee39a' : st > 0.17 ? '#ffd166' : '#ff5c7a';
    const ok = 1 - Pl.kakari; const g2 = $('g-ok'); g2.style.width = (ok * 100) + '%'; g2.style.background = Pl.kakari > 0.6 ? '#ff5c7a' : '#6ec8ff';
    // 画面の真ん中に大きく出すのは節目だけ。それ以外の注意は左上の小さな札に短く出す
    const m = e.message && e.t < e.message.until ? e.message : null;
    const msgEl = $('hud-msg'), note = $('hud-note');
    const BIG = /^(スタート|好スタート|出遅れ|大きく出遅れ|ゲートに突進|ラスト200m|ゴール)/;
    if (m && BIG.test(m.text)) { if (msgEl.textContent !== m.text) msgEl.textContent = m.text; msgEl.style.color = m.color; } else if (msgEl.textContent) msgEl.textContent = '';
    if (m && !BIG.test(m.text)) { const s = m.text.replace(/[!！].*$/, ''); if (note.textContent !== s) note.textContent = s; note.classList.add('on'); } else note.classList.remove('on');
  }
  function estimateSustain(e, P) {
    // 今から全力（追う＋ムチ）で走ったときに、脚が残る距離の目安
    const vFull = P.vMax * (1.02 + (P.kick - 70) * 0.0006);
    const rate = P.drainBase * Math.pow(vFull / (e.vBase * 0.975), 6) * 1.04 * (1 + 0.6 * P.kakari);
    return Math.max(0, (P.st - 0.12) / rate * vFull);
  }
  const ORDER_RANGE = [[0, 0.12], [0.1, 0.4], [0.35, 0.7], [0.6, 1.01]];
  // 手綱の上に出す短い札。位置取りの細かい指示は出さず、知らないと困る場面だけ
  function coachTip(e, P, rem, sustain) {
    if (tut) { // チュートリアル中は少し丁寧に
      if (!e.open || !P.started || P.finished) return { t: '' };
      if (rem < sustain + 30 && P.drive < 0.5) return { t: '仕掛けどき ▲', go: true };
      return { t: '' };
    }
    if (!P.started || P.finished) return { t: '' };
    if (P.kakari > 0.6) return { t: 'かかっている' };
    if (P.blocked && rem < 600) return { t: '前が壁' };
    if (rem < sustain + 30 && P.drive < 0.5 && rem < 1000) return { t: '仕掛けどき ▲', go: true };
    return { t: '' };
  }
  // 周りの馬の位置（上が進行方向）。割って入れるすき間を見るためのもの
  function drawRadar() {
    const cv = $('radar'), x = cv.getContext('2d'), e = engine, Pl = e.player, w = cv.width, h = cv.height;
    x.clearRect(0, 0, w, h);
    x.fillStyle = 'rgba(12,30,20,.62)'; x.beginPath(); x.roundRect ? x.roundRect(0, 0, w, h, 14) : x.rect(0, 0, w, h); x.fill();
    const sgn = e.course.dir === 'L' ? 1 : -1, sx = 21, sy = 7.2, cx = w / 2, cy = h * 0.62;
    const X2 = (X) => cx + (X - Pl.X) * sgn * sx, S2 = (s) => cy - (s - Pl.s) * sy;
    // 内ラチと外ラチ
    x.strokeStyle = '#ffffff'; x.lineWidth = 3;
    for (const X of [-0.35, e.course.width + 0.35]) { const px = X2(X); if (px > -4 && px < w + 4) { x.beginPath(); x.moveTo(px, 0); x.lineTo(px, h); x.stroke(); } }
    x.font = 'bold 15px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const o of e.runners) {
      const px = X2(o.X), py = S2(o.s);
      if (px < -12 || px > w + 12 || py < -16 || py > h + 16) continue;
      const me = o === Pl;
      x.fillStyle = me ? '#ffd54f' : (o.cfg.silks && o.cfg.silks.cap) || '#fff';
      x.strokeStyle = me ? '#fff' : 'rgba(0,0,0,.6)'; x.lineWidth = me ? 3 : 1.5;
      x.beginPath(); x.ellipse(px, py, 8.5, 17, 0, 0, 7); x.fill(); x.stroke();
      const c = x.fillStyle; x.fillStyle = me || /^#(fff|fdd|f[0-9a-f]{5})/i.test(c) ? '#111' : '#fff';
      x.fillText(String(o.num), px, py + 1);
    }
  }
  function drawMap() {
    const cv = $('hud-map'), x = cv.getContext('2d'), c = engine.course;
    const w = cv.width, h = cv.height;
    x.clearRect(0, 0, w, h);
    x.fillStyle = 'rgba(8,12,18,.55)'; x.fillRect(0, 0, w, h);
    const s = c.dir === 'L' ? -1 : 1;
    // 楕円以外のコースは、実際の形の外枠に合わせて収める
    const bb = c.bbox || { minX: -c.H / 2 - c.R, maxX: c.H / 2 + c.R, minZ: Math.min(0, 2 * s * c.R), maxZ: Math.max(0, 2 * s * c.R) };
    const pad = 16, totalW = bb.maxX - bb.minX, totalH = bb.maxZ - bb.minZ, cx = (bb.minX + bb.maxX) / 2, cz = (bb.minZ + bb.maxZ) / 2;
    const sc = Math.min((w - pad * 2) / totalW, (h - pad * 2) / totalH);
    const pt = (p, X = 0) => { const a = RaceEngine.courseXY(c, p, X); return [w / 2 + (a.x - cx) * sc, h / 2 + (a.z - cz) * sc]; };
    x.strokeStyle = engine.surf === 'D' ? '#c8a27a' : '#8bc34a'; x.lineWidth = 7;
    x.beginPath(); for (let p = 0; p <= c.lap; p += c.lap / 80) { const [a, b] = pt(p, c.width / 2); p === 0 ? x.moveTo(a, b) : x.lineTo(a, b); } x.closePath(); x.stroke();
    const [gx, gy] = pt(c.H, c.width / 2); x.fillStyle = '#fff'; x.fillRect(gx - 1.5, gy - 9, 3, 18);
    engine.runners.forEach(r => { const [a, b] = pt(engine.pAt(Math.min(r.s, engine.D + 30)), r.X); x.fillStyle = r === engine.player ? '#ffeb3b' : 'rgba(255,255,255,.85)'; x.beginPath(); x.arc(a, b, r === engine.player ? 5 : 3, 0, 7); x.fill(); });
  }
  function finishRace() {
    goggleClear();
    const res = engine.results();
    const mode = engine.player.auto ? 'auto' : 'manual';
    curRace.laps = engine.laps();
    const me = res.find(x => x.runner === engine.player);
    curRace.my3F = engine.player3F ? me.time - engine.player3F : null;
    curRace.trace = engine.trace || [];
    const ev = World.applyResult(W, curRace, res, curHid, mode, engine.inquiry);
    if (!quick && ev) ev.order = World.judgeOrder(W, curRace, curHid, curRace.trace, ev.pos);
    if (!quick) pressAftermath(curRace, ev);
    if (!quick) logRide(curRace, curHid, ev, mode);
    showResult(curRace, curHid, ev);
  }

  // ---- 操作 ----
  // 左：◀▶（押している間だけ進路を変える）
  function setSteer(v) { if (engine) engine.input.steer = v; }
  // 右：手綱の加減（縦のスライダー。離してもその位置のまま）
  function setPower(v) {
    v = clamp(v, 0, 1);
    if (engine) engine.input.power = v;
    const pc = (v * 100).toFixed(1) + '%';
    $('thr-fill').style.clipPath = `inset(${(100 - v * 100).toFixed(1)}% 0 0 0)`; $('thr-knob').style.bottom = pc; $('thr-v').textContent = String(Math.round(v * 100));
    $('thr-knob').style.background = v >= 0.65 ? 'var(--red)' : v >= 0.38 ? 'var(--green)' : 'var(--blue)';
  }
  function holdBtn(el, on, off) {
    let id = null;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); id = e.pointerId; try { el.setPointerCapture(id); } catch (_) {} el.classList.add('act'); on(e); });
    const end = (e) => { if (e.pointerId === id) { id = null; el.classList.remove('act'); off(e); } };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => el.addEventListener(t, end));
    return () => id;
  }
  // 進路：つまみを左右へ動かした分だけ寄せる（少し動かせばゆっくり、大きく動かせば速く）。離すと真ん中へ戻る
  (function bindSteer() {
    const pad = $('steer'), knob = $('steer-knob'); let id = null, x0 = 0, y0 = 0;
    const set = (v) => { setSteer(v); knob.style.transform = `translateX(${v * 62}px)`; };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault(); id = e.pointerId; try { pad.setPointerCapture(id); } catch (_) {}
      pad.classList.add('act');
      // 触れた場所が端に近ければ、そのままその向きへ寄せ始める
      const r = pad.getBoundingClientRect(), rot = document.documentElement.classList.contains('rot');
      let u = rot ? (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width; if (rot && rotDir === 'ccw') u = 1 - u;
      const v0 = Math.abs(u - 0.5) > 0.2 ? clamp((u - 0.5) * 2.4, -1, 1) : 0;
      x0 = e.clientX; y0 = e.clientY; pad._v0 = v0; set(v0);
    });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId !== id) return; set(clamp((pad._v0 || 0) + uiDX(e, x0, y0) / 62, -1, 1)); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => pad.addEventListener(t, (e) => { if (e.pointerId === id) { id = null; pad.classList.remove('act'); set(0); } }));
  })();
  // 後方確認：押している間だけ振り返る
  holdBtn($('b-back'), () => { if (R3) R3.lookBack = true; }, () => { if (R3) R3.lookBack = false; });
  // ゲートが開いた後は、画面のどこを押してもスタートできる
  $('r3d').addEventListener('pointerdown', () => { if (engine && engine.open && engine.player && !engine.player.started && !R3.intro && !paused) engine.playerStart(); });
  (function bindThrottle() {
    const tr = $('thr-track'); let id = null;
    const at = (e) => {
      const r = tr.getBoundingClientRect();
      let v;
      if (!document.documentElement.classList.contains('rot')) v = 1 - (e.clientY - r.top) / r.height;
      else { v = (e.clientX - r.left) / r.width; if (rotDir === 'ccw') v = 1 - v; }
      // 端まで指を運ばなくても 0 と 100 に届くよう、少し余裕を持たせる
      setPower((v - 0.06) / 0.88);
    };
    tr.addEventListener('pointerdown', (e) => { e.preventDefault(); id = e.pointerId; try { tr.setPointerCapture(id); } catch (_) {} at(e); });
    tr.addEventListener('pointermove', (e) => { if (e.pointerId === id) at(e); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => tr.addEventListener(t, (e) => { if (e.pointerId === id) id = null; }));
  })();
  // ムチ：打つ側は自動（馬がヨレている向きを戻す側。ヨレがなければ外側）
  function autoWhip() {
    if (!engine) return;
    const P = engine.player, L = engine.course.dir === 'L';
    const outer = L ? 'R' : 'L', inner = L ? 'L' : 'R';
    const drift = P.latV || 0; // +なら外へ流れている
    engine.whip(drift < -0.15 ? inner : outer);
  }
  $('c-whip').addEventListener('pointerdown', (e) => { e.preventDefault(); autoWhip(); flash($('c-whip')); });
  const flash = (el) => { el.classList.add('act'); setTimeout(() => el.classList.remove('act'), 150); };
  $('startBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); if (engine) engine.playerStart(); });
  document.querySelectorAll('.ctl, #startBtn').forEach(el => el.addEventListener('contextmenu', e => e.preventDefault()));
  function updateCamBtn() { $('b-cam').textContent = '視点:' + CAMS.find(c => c[0] === camMode)[1]; }
  $('b-cam').onclick = () => { goggleClear(); const i = CAMS.findIndex(c => c[0] === camMode); camMode = CAMS[(i + 1) % CAMS.length][0]; try { localStorage.setItem('jl-cam', camMode); } catch (e) {} R3.setCamMode(camMode); updateCamBtn(); };
  $('b-snd').onclick = () => { const m = Sound.toggleMute(); $('b-snd').textContent = m ? '音OFF' : '音ON'; };
  $('pauseBtn').onclick = () => {
    paused = true;
    const e = engine, Pl = e.player, t = e.open ? e.t - e.gateOpenAt : 0, pace = e.pace(), lp = e.laps().slice(-5);
    modal(`<h2 style="margin-bottom:6px">一時停止</h2>
      <div class="card" style="margin:0 0 8px;padding:8px 12px"><div class="small" style="line-height:1.7"><b>${esc(e.cfg.name)}</b>　${RaceEngine.sectionName(e.course, e.pAt(Pl.s))}・タイム ${RaceEngine.fmtTime(t)}${pace ? `・ペース ${pace}` : ''}<br>内ラチから ${Pl.X.toFixed(1)}m・${e.cfg.weather}・${e.cfg.ground}・${World.biasText(e.bias)}${lp.length ? `<br>ラップ ${lp.map(x => x.toFixed(1)).join(' - ')}` : ''}</div></div>
      <div class="row" style="margin-bottom:8px;flex-wrap:wrap"><button class="btn small" id="p-cam">視点：${CAMS.find(c => c[0] === camMode)[1]}</button><button class="btn small" id="p-snd">音：${Sound.isMuted() ? 'OFF' : 'ON'}</button></div>
      <details class="acc"><summary>操作の説明</summary><div class="in small" style="line-height:1.75">
      <b>進路（左下）</b> つまみを左右へ動かした分だけ内・外へ寄せる。離すと真ん中へ戻る。その上の図は周りの馬の位置で、黄色が自分、上が前。その横の「後ろ」は押している間だけ振り返る。前に馬がいると壁になる。コーナーは外を回るほど距離をロスする。すぐ後ろ（半馬身ほど以内）に馬がいるのに、その馬の前へ寄せると斜行になり、審議の対象になる。1馬身ほど前に出てから寄せれば問題ない。軽ければ過怠金、何度も大きく妨げると騎乗停止や降着<br>
      <b>手綱の加減（右の縦スライダー）</b> 指で上下に動かして、馬を走らせる強さを自分で決める。下ほど強く抑え、真ん中が馬なり、上ほど強く追う。離してもその位置のまま続く。前半は下げて脚をためるが、前に馬がいないと気の強い馬はかかる（折合ゲージ）。馬の後ろに入れると落ち着く。上げるほど脚色（スタミナ）を多く使う<br>
      <b>ムチ（右端）</b> 強く追っている間の伸びを上乗せする。回数の上限はないが、2完歩あけずに続けて打てるのは5回まで。超えると制裁（過怠金）の対象になる。打つ側は自動で選ばれる<br>
      <b>仕掛けどき</b> 今から全力で追って脚が持つ距離が、残り距離に届くと、手綱の上に「仕掛けどき」の札が出る<br>
      <b>キーボード</b> ←→ 進路 / ↑↓ 手綱の加減 / Space スタート・全力 / W ムチ / C 視点</div></details>
      <div class="row" style="margin-top:12px;flex-wrap:wrap"><button class="btn primary" id="p-resume">再開</button><button class="btn" id="p-auto">ここからオート騎乗</button></div>`, () => {
      $('p-cam').onclick = () => { $('b-cam').click(); $('p-cam').textContent = '視点：' + CAMS.find(c => c[0] === camMode)[1]; };
      $('p-snd').onclick = () => { $('b-snd').click(); $('p-snd').textContent = '音：' + (Sound.isMuted() ? 'OFF' : 'ON'); };
      $('p-resume').onclick = () => { paused = false; closeModal(); lastT = performance.now(); };
      $('p-auto').onclick = () => { const Pl = engine.player; Pl.auto = true; if (Pl.reaction == null) Pl.reaction = Math.max(0, engine.t - engine.gateOpenAt) + 0.2; paused = false; closeModal(); lastT = performance.now(); };
    });
  };
  window.addEventListener('keydown', (e) => {
    if (!engine || !$('race').classList.contains('on') || paused) return;
    if (e.key === 'ArrowLeft') setSteer(-1); else if (e.key === 'ArrowRight') setSteer(1);
    else if (e.key === 'ArrowUp') setPower(engine.input.power + 0.1);
    else if (e.key === 'ArrowDown') setPower(engine.input.power - 0.1);
    else if (e.key === 'w' || e.key === 'W') autoWhip();
    else if (e.key === ' ') { if (!engine.player.started) engine.playerStart(); else setPower(1); }
    else if (e.key === 'q' || e.key === 'Q') engine.whip('L');
    else if (e.key === 'e' || e.key === 'E') engine.whip('R');
    else if (e.key === 'c' || e.key === 'C') $('b-cam').click();
    else if (e.key === 'Escape') $('pauseBtn').click();
    else return;
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { if (!engine) return; if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') setSteer(0); });

  // ---------- 結果 ----------
  // ---- レースの振り返り：位置取り・手綱と脚色・速さを1枚の図で ----
  function showReview(race, hid, ev) {
    const tr = race.trace, D = race.dist, n = race.field.length, laps = race.laps || [];
    const Wd = 720, L = 46, Rr = 12, pw = Wd - L - Rr;
    const X = (s) => L + pw * Math.min(1, s / D);
    const P1 = { y: 22, h: 92 }, P2 = { y: 136, h: 62 }, P3 = { y: 220, h: 62 }, Ht = 312;
    const od = ev && ev.order && ev.order.order && !ev.order.order.free ? ev.order.order : null;
    const yR = (r) => P1.y + (n <= 1 ? 0 : (r - 1) / (n - 1)) * P1.h;
    // 仕掛けた地点：後半で、そこから先ずっと追い続けた最初の地点
    let go = null; for (let i = tr.length - 1; i >= 0; i--) { if (tr[i].e >= 0.88) go = tr[i]; else break; }
    if (go && go.s < D * 0.3) go = tr.find(t => t.s >= D * 0.3 && t.e >= 0.88) || go;
    const whip = tr.find((t, i) => i && t.w > tr[i - 1].w);
    const blocked = tr.filter(t => t.b);
    const line = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const vs = tr.filter(t => t.s >= 200).map(t => t.v * 3.6), vmin = Math.max(48, Math.min(...vs, 58)), vmax = Math.max(...vs, 64);
    const lv = laps.slice(1).map(x => 200 / x * 3.6), lmin = Math.min(vmin, ...lv), lmax = Math.max(vmax, ...lv);
    const yV = (v) => P3.y + P3.h - (v - lmin) / Math.max(1, lmax - lmin) * P3.h;
    const ticks = []; for (let rem = Math.floor(D / 200) * 200; rem >= 0; rem -= 200) ticks.push(rem);
    const grid = ticks.map(rem => { const x = X(D - rem); return `<line x1="${x}" y1="${P1.y}" x2="${x}" y2="${P3.y + P3.h}" stroke="#e3e7f3" stroke-width="1"/><text x="${x}" y="${Ht - 6}" font-size="10" fill="#7a809c" text-anchor="middle">${rem ? '残' + rem : 'ゴール'}</text>`; }).join('');
    const effBars = tr.map((t, i) => { const x0 = X(t.s), x1 = X(i + 1 < tr.length ? tr[i + 1].s : D), c = t.e >= 0.88 ? '#ff4d7e' : t.e >= 0.6 ? '#ffb05b' : t.e >= 0.4 ? '#8fd3a6' : '#7a94ff'; return `<rect x="${x0.toFixed(1)}" y="${(P2.y + P2.h - t.e * P2.h).toFixed(1)}" width="${Math.max(1, x1 - x0 - 0.6).toFixed(1)}" height="${(t.e * P2.h).toFixed(1)}" fill="${c}" opacity=".75"/>`; }).join('');
    const mark = (t, label, col, dy) => t ? `<line x1="${X(t.s)}" y1="${P1.y - 4}" x2="${X(t.s)}" y2="${P3.y + P3.h}" stroke="${col}" stroke-width="1.5" stroke-dasharray="4 3"/><rect x="${X(t.s) - 34}" y="${P1.y - 18 + dy}" width="68" height="14" rx="7" fill="${col}"/><text x="${X(t.s)}" y="${P1.y - 8 + dy}" font-size="9.5" fill="#fff" text-anchor="middle" font-weight="700">${label} 残${Math.max(0, D - t.s)}m</text>` : '';
    const svg = `<svg viewBox="0 0 ${Wd} ${Ht}" style="width:100%;height:auto;display:block;background:#fff;border-radius:10px">
      ${grid}
      ${od ? `<rect x="${X(D * 0.35)}" y="${yR(od.lo) - 3}" width="${X(D * 0.6) - X(D * 0.35)}" height="${yR(od.hi) - yR(od.lo) + 6}" fill="#35c98b" opacity=".18"/><text x="${X(D * 0.475)}" y="${Math.min(P1.y + P1.h - 2, yR(od.hi) + 14)}" font-size="9.5" fill="#157a47" text-anchor="middle">指示の位置</text>` : ''}
      <text x="4" y="${P1.y + 4}" font-size="10" fill="#7a809c">1番手</text><text x="4" y="${P1.y + P1.h + 3}" font-size="10" fill="#7a809c">${n}番手</text>
      <text x="4" y="${P1.y + P1.h / 2 + 3}" font-size="10.5" fill="#272b45" font-weight="700">位置</text>
      <path d="${line(tr.map(t => [X(t.s), yR(t.r)]))}" fill="none" stroke="#5468d4" stroke-width="2.5" stroke-linejoin="round"/>
      ${tr.filter((t, i) => i % 2 === 0 || i === tr.length - 1).map(t => `<circle cx="${X(t.s)}" cy="${yR(t.r)}" r="2.6" fill="#5468d4"/>`).join('')}
      <circle cx="${X(D)}" cy="${yR(ev.pos)}" r="5" fill="#ff4d7e"/><text x="${X(D) - 8}" y="${yR(ev.pos) - 7}" font-size="11" fill="#ff4d7e" text-anchor="end" font-weight="800">${ev.pos}着</text>
      ${blocked.map(t => `<rect x="${X(t.s) - 2}" y="${yR(t.r) - 9}" width="4" height="5" fill="#e0201c"/>`).join('')}
      <text x="4" y="${P2.y + P2.h / 2 + 3}" font-size="10.5" fill="#272b45" font-weight="700">手綱</text>
      <text x="4" y="${P2.y + 6}" font-size="9" fill="#7a809c">追う</text><text x="4" y="${P2.y + P2.h}" font-size="9" fill="#7a809c">控える</text>
      ${effBars}
      <path d="${line(tr.map(t => [X(t.s), P2.y + P2.h - Math.min(1, t.st / 1.06) * P2.h]))}" fill="none" stroke="#157a47" stroke-width="2"/>
      ${tr.some(t => t.k > 0.25) ? `<path d="${line(tr.map(t => [X(t.s), P2.y + P2.h - t.k * P2.h]))}" fill="none" stroke="#9b4fd1" stroke-width="1.5" stroke-dasharray="3 2"/>` : ''}
      <text x="4" y="${P3.y + P3.h / 2 + 3}" font-size="10.5" fill="#272b45" font-weight="700">速さ</text>
      <text x="4" y="${P3.y + 6}" font-size="9" fill="#7a809c">${Math.round(lmax)}km</text><text x="4" y="${P3.y + P3.h}" font-size="9" fill="#7a809c">${Math.round(lmin)}km</text>
      ${laps.map((x, i) => { const y = yV(Math.max(lmin, 200 / x * 3.6)); return `<line x1="${X(i * 200)}" y1="${y}" x2="${X(Math.min(D, (i + 1) * 200))}" y2="${y}" stroke="#b9c0d6" stroke-width="3"/>`; }).join('')}
      <path d="${line(tr.map(t => [X(t.s), yV(Math.max(lmin, t.v * 3.6))]))}" fill="none" stroke="#ff8a5b" stroke-width="2.2"/>
      ${mark(go, '仕掛け', '#ff4d7e', 0)}${whip && (!go || Math.abs(whip.s - go.s) > D * 0.12) ? mark(whip, 'ムチ', '#e06d00', 0) : ''}
    </svg>`;
    const mid = tr.filter(t => t.s >= D * 0.35 && t.s <= D * 0.6), avg = mid.length ? (mid.reduce((a, t) => a + t.r, 0) / mid.length).toFixed(1) : '-';
    const stEnd = tr[tr.length - 1].st, maxK = Math.max(...tr.map(t => t.k));
    const notes = [];
    if (go) notes.push(`仕掛けは残り${Math.max(0, D - go.s)}m。${stEnd < 0.1 && ev.pos > 1 ? '最後は脚が上がった。もう少し待てたかもしれない。' : stEnd > 0.3 ? '脚を余してゴールした。もう少し早く動けた。' : '脚をほぼ使い切った。'}`); else notes.push('最後まで追い出さなかった。');
    if (maxK > 0.5) notes.push('道中でかかった（紫の点線）。前に馬を置くと落ち着く。');
    if (blocked.length >= 3) notes.push(`前が壁になった区間がある（赤い印 ${blocked.length}か所）。`);
    if (ev.order && ev.order.kept === false) notes.push(`指示は「${ev.order.order.short}」。${ev.order.text}。`);
    modal(`<div class="row" style="margin-bottom:4px"><b>${esc(race.name)}</b><span class="small muted">${race.surf === 'D' ? 'ダート' : '芝'}${D}m・${n}頭・${esc(W.horses[hid].name)}</span></div>${svg}
      <div class="small" style="display:flex;gap:10px;flex-wrap:wrap;margin:5px 0"><span><i style="display:inline-block;width:14px;height:3px;background:#5468d4;vertical-align:middle"></i> 位置</span><span><i style="display:inline-block;width:10px;height:8px;background:#ff4d7e;vertical-align:middle"></i> 追う <i style="display:inline-block;width:10px;height:8px;background:#7a94ff;vertical-align:middle"></i> 控える</span><span><i style="display:inline-block;width:14px;height:3px;background:#157a47;vertical-align:middle"></i> 脚色</span><span><i style="display:inline-block;width:14px;height:3px;background:#ff8a5b;vertical-align:middle"></i> 自分の速さ <i style="display:inline-block;width:14px;height:3px;background:#b9c0d6;vertical-align:middle"></i> 先頭のラップ</span></div>
      <div class="kv"><span>道中の平均位置</span><b>${avg}番手</b></div>${race.my3F ? `<div class="kv"><span>上がり3F</span><b>${race.my3F.toFixed(1)}秒</b></div>` : ''}
      ${notes.map(t => `<p class="small" style="margin:4px 0 0">・${esc(t)}</p>`).join('')}
      <div class="choices"><button class="btn primary" id="rv-ok">閉じる</button></div>`, () => { $('rv-ok').onclick = () => closeModal(); }, 'レースの振り返り');
  }

  // ---- レース後の着順掲示板 → 払戻金 ----
  const PO_COL = { win: '#c8102e', place: '#e06d00', waku: '#6a3fa0', quin: '#1f6fbf', wide: '#0f8a6a', exa: '#2c3e8f', trio: '#7a8a12', tri: '#9b1f6b' };
  function showBoard(race, hid, ev, done) {
    let ov = $('board-ov');
    if (!ov) { ov = document.createElement('div'); ov.id = 'board-ov'; $('app').appendChild(ov); } // 画面を回転して横向きにしているときも一緒に回るよう、#app の中に置く
    const F = race.field, res = race.result.slice().sort((a, b) => a.pos - b.pos);
    const num = (h) => F.findIndex(f => f.hid === h) + 1;
    const laps = race.laps || [];
    const sum = (k) => laps.length >= k ? laps.slice(-k).reduce((a, b) => a + b, 0).toFixed(1) : '-';
    const inq = !!(ev && ev.inquiry);
    const photo = res[1] && /ハナ|アタマ|同着/.test(res[1].margin || '');
    const rows = res.slice(0, 5).map((r, i) => `<div class="bd-row"><div class="bd-pos">${i + 1}</div><div class="bd-line"><div class="bd-num ${r.hid === hid ? 'me' : ''}">${num(r.hid)}</div><div class="bd-mg">${i ? esc(r.margin || '') : ''}</div><div class="bd-name">${esc(W.horses[r.hid].name)}${r.hid === hid ? '（あなた）' : ''}</div></div></div>`).join('');
    const pay = window.Payout ? Payout.compute(race) : [];
    const myNum = hid != null ? String(num(hid)) : null;
    const groups = []; pay.forEach(x => { const g = groups.find(g => g.t === x.t); if (g) g.rows.push(x); else groups.push({ t: x.t, rows: [x] }); });
    const ptab = groups.map(g => g.rows.map((x, i) => `<tr class="${myNum && x.combo.includes(myNum) && x.t !== 'waku' ? 'hit' : ''}">${i ? '' : `<td class="k" rowspan="${g.rows.length}" style="background:${PO_COL[g.t]}">${Payout.LABEL[g.t]}</td>`}<td class="c">${x.combo.join(g.t === 'exa' || g.t === 'tri' ? ' → ' : ' - ')}</td><td class="y">${x.pay.toLocaleString()}円</td><td class="p">${x.pop}番人気</td></tr>`).join('')).join('');
    const title = `${esc(VENUES[race.venue].name)}${race.overseas ? '' : ' ' + race.no + 'R'}`;
    ov.innerHTML = `<div class="pg on" id="bd-p1"><div class="bd">
        <div class="bd-hd"><div class="rn"><small>${title}</small>${esc(race.name)}${race.graded ? ` G${'ⅠⅡⅢ'[race.graded - 1]}` : ''}</div>
          <div class="bd-lamps"><span class="bd-lamp ${photo ? 'on blink' : ''}" id="bd-photo">写真</span><span class="bd-lamp ${inq ? 'on blink' : ''}" id="bd-inq">審議</span><span class="bd-lamp" id="bd-fix">確定</span></div></div>
        <div class="bd-rows">${rows}</div>
        <div class="bd-ft"><div><span>タイム</span><b>${RaceEngine.fmtTime(res[0].time)}</b></div><div><span>上がり 4F</span><b>${sum(4)}</b></div><div><span>3F</span><b>${sum(3)}</b></div></div>
      </div><div class="bd-btns"><button class="btn small" id="bd-skip">結果へ</button><button class="btn primary small" id="bd-next" disabled>払戻金を見る ▶</button></div></div>
      <div class="pg" id="bd-p2"><div class="po"><div class="po-hd"><b>払戻金</b><span class="small" style="opacity:.8">${title} ${esc(race.name)}</span><span class="kakutei">確定</span></div>
        <table>${ptab}</table><div class="note">払戻金は100円あたり。各馬のオッズと設定払戻率から計算したゲーム内の目安。${myNum ? '黄色の行はあなたの騎乗馬を含む組。' : ''}</div></div>
        <div class="bd-btns"><button class="btn primary small" id="bd-close">結果へ ▶</button></div></div>`;
    ov.classList.add('on');
    const close = () => { ov.classList.remove('on'); clearTimeout(t1); if (done) done(); };
    // 写真判定・審議があれば少し待ってから確定のランプがつく
    const wait = inq ? 2600 : photo ? 1800 : 900;
    const t1 = setTimeout(() => {
      $('bd-photo').classList.remove('on', 'blink'); $('bd-inq').classList.remove('blink');
      if (!inq) $('bd-inq').classList.remove('on');
      $('bd-fix').classList.add('on'); $('bd-next').disabled = false;
    }, wait);
    $('bd-next').onclick = () => { $('bd-p1').classList.remove('on'); $('bd-p2').classList.add('on'); };
    $('bd-skip').onclick = close; $('bd-close').onclick = close;
  }
  function showResult(race, hid, ev) {
    show('s-result');
    if (race.result && !race._bd && !tut) { race._bd = 1; showBoard(race, hid, ev); }
    gnav('res-nav');
    crumbs('res-crumbs', quick ? [['タイトル', () => { quick = false; W = null; show('s-title'); }], ['お試し騎乗の結果', null]] : [['今週', () => showWeek()], [`${VENUES[race.venue].name} 開催日`, null], [`${race.overseas ? '' : race.no + 'R '}${race.name}`, null], ['結果', null]]);
    let tb = `<table><tr><th>着</th><th>枠</th><th>馬名</th><th>騎手</th><th>タイム</th><th>着差</th><th>人気</th></tr>`;
    race.result.forEach(r => {
      const h = W.horses[r.hid]; const f = race.field.find(x => x.hid === r.hid);
      tb += `<tr class="${r.isP ? 'me' : ''}"><td><b>${r.pos}</b>${r.demoted ? ' <span class="badge warn">降着</span>' : ''}</td><td>${waku(f.waku)}</td><td>${esc(h.name)}${realTag(h)}</td><td>${esc(r.jname || '')}</td><td>${RaceEngine.fmtTime(r.time)}</td><td>${r.margin}</td><td>${r.pop}</td></tr>`;
    });
    const laps = race.laps || [];
    const lapHtml = laps.length ? `<div style="padding:8px 10px;border-top:1px solid var(--rule)"><div class="small muted">ラップ（先頭の馬の200mごとの通過から算出）</div><div class="tnum" style="font-size:12.5px;line-height:1.7">${laps.map(x => x.toFixed(1)).join(' - ')}</div>
      <div class="small muted">前半${laps.length >= 3 ? laps.slice(0, 3).reduce((a, b) => a + b, 0).toFixed(1) : '-'}　後半${laps.length >= 3 ? laps.slice(-3).reduce((a, b) => a + b, 0).toFixed(1) : '-'}${race.my3F ? `　あなたの上がり3F ${race.my3F.toFixed(1)}` : ''}</div></div>` : '';
    $('res-table').innerHTML = tb + '</table>' + lapHtml;
    const comment = ev.pos === 1 ? (race.graded === 1 || race.overseas ? '大舞台で見事な勝利!' : '勝利!') : ev.pos <= 3 ? '馬券圏内を確保。' : ev.pos <= ev.pop ? '人気以上の着順。' : '期待には届かなかった。';
    let inq = '';
    if (ev.inquiry) {
      const q = ev.inquiry;
      inq = `<div class="card" style="margin-top:8px;border-color:var(--red)"><div class="small" style="color:var(--red)">審議</div><b>${q.demoteTo ? `斜行で${q.demoteTo}着に降着` : q.foul ? '斜行・接触あり' : 'ムチの連続使用'}</b>${q.whip && q.foul ? '<div class="small">ムチの連続使用もあり</div>' : ''}<div class="small">${q.weeks ? `${q.weeks}週間の騎乗停止` : '過怠金'}</div></div>`;
    }
    $('res-side').innerHTML = `${inq}<div class="card" style="margin-top:8px;text-align:center"><div class="small muted">騎乗評価</div><div class="eval">${ev.grade}</div>
      <div style="margin-top:2px;font-family:var(--serif)"><b style="font-size:18px">${ev.pos}着</b>（${ev.pop}番人気）</div><div class="small muted">${comment}</div></div>
      <div class="card"><div class="kv"><span>評価</span><b>${ev.dRep >= 0 ? '+' : ''}${ev.dRep}</b></div><div class="kv"><span>人気</span><b>${ev.dPop >= 0 ? '+' : ''}${ev.dPop}</b></div><div class="kv"><span>収入</span><b>${ev.income}万円</b></div></div>
      ${ev.order && ev.order.order ? `<div class="card" style="border-left:4px solid ${ev.order.kept == null ? 'var(--rule)' : ev.order.kept ? 'var(--green)' : 'var(--red)'}"><div class="small muted">調教師の指示：${esc(ev.order.order.short)}</div><b>${ev.order.kept == null ? '任された' : ev.order.kept ? '守れた' : '守れなかった'}</b> <span class="small">${esc(ev.order.text)}${ev.order.avg ? `（道中の平均 ${ev.order.avg}番手）` : ''}${ev.order.dTrust ? `　信頼${ev.order.dTrust > 0 ? '+' : ''}${ev.order.dTrust}` : ''}</span></div>` : ''}
      ${race.trace && race.trace.length > 3 ? '<button class="btn" style="width:100%;margin-top:8px" id="b-review">レースを振り返る（位置取りの図）</button>' : ''}
      ${race.commentary && race.commentary.length ? '<button class="btn" style="width:100%;margin-top:8px" id="b-comm">実況の文字起こしを読む</button>' : ''}
      <button class="btn primary" style="width:100%;margin-top:8px;padding:11px" id="b-resnext">${quick ? 'タイトルへ' : '次へ'}</button>`;
    if ($('b-comm')) $('b-comm').onclick = () => modal(`<div class="scroll" style="max-height:62vh">${race.commentary.map(l => `<div style="display:flex;gap:10px;padding:3px 0;border-bottom:1px dotted var(--rule)"><span class="tnum muted small" style="flex:0 0 44px">${l.t == null ? '発走前' : RaceEngine.fmtTime(l.t)}</span><span style="font-family:var(--serif)">${esc(l.text)}</span></div>`).join('')}</div><div class="choices"><button class="btn primary" id="m-ok">閉じる</button></div>`, () => { $('m-ok').onclick = closeModal; }, '実況（文字起こし）');
    if ($('b-review')) $('b-review').onclick = () => showReview(race, hid, ev);
    $('b-resnext').onclick = () => {
      if (quick) { quick = false; W = null; refreshTitle(); show('s-title'); if (tutDone) { tutDone = false; modal(`<h2>チュートリアル完了</h2><p>基本の操作はこれで全部。あとは実戦で仕掛けどころを覚えていこう。操作の説明はレース中の「停止」からいつでも見られる。</p><div class="choices"><button class="btn primary" id="m-ok">OK</button></div>`, () => { $('m-ok').onclick = closeModal; }, 'チュートリアル'); } return; }
      W.dayIdx++; World.save(W); showDay();
    };
    const afterMilestone = () => { if (ev.interview && !quick) showInterview(ev.interview, hid, () => playScenes()); else if (!quick) playScenes(); };
    const afterTitles = () => { if (!quick && W.milestonePending) showMilestone(afterMilestone); else afterMilestone(); };
    if (!quick && W.titlePending && W.titlePending.length) showTitles(afterTitles); else afterTitles();
  }
  // 通算勝利の節目のセレモニー
  function showMilestone(done) {
    const m = W.milestonePending; W.milestonePending = null; World.save(W);
    Sound.cheer && Sound.cheer(1.1);
    modal(`<div class="mile"><div class="mile-k">JRA通算</div><div class="mile-n">${m.wins}<small>勝</small></div><div class="mile-l">達成</div></div>
      <div style="text-align:center;font-family:var(--serif);margin-top:8px"><b>${esc(P().name)}騎手</b></div>
      <p class="small muted" style="text-align:center;margin:4px 0">${esc(m.date)}　${esc(m.race)}　${esc(m.horse)}</p>
      <p class="small" style="text-align:center">検量室前で記念のボードと花束を受け取った。</p>
      <div class="choices"><button class="btn primary" id="m-ok">次へ</button></div>`, () => { $('m-ok').onclick = () => { closeModal(); done(); }; }, '記念セレモニー');
  }
  // 称号の獲得を祝う画面
  function showTitles(done) {
    const t = W.titlePending.shift();
    if (!t) { World.save(W); return done(); }
    Sound.cheer && Sound.cheer(1.2);
    modal(`<div style="text-align:center;padding:6px 0"><div class="small" style="letter-spacing:.3em;color:var(--gold)">TITLE</div><div style="font-size:44px;line-height:1.1">👑</div>
      <h2 style="font-family:var(--serif);font-size:28px;margin:4px 0">${esc(t.name)}</h2>${t.horse ? `<div style="font-family:var(--serif);font-size:16px">${esc(t.horse)}</div>` : ''}<p class="small muted" style="margin:6px 0 0">${esc(t.desc || '')}</p></div>
      <div class="choices"><button class="btn primary" id="m-ok">次へ</button></div>`, () => { $('m-ok').onclick = () => { closeModal(); showTitles(done); }; }, '称号獲得');
  }
  function showInterview(iv, hid, after) {
    const def = World.INTERVIEW[iv.kind];
    const h = W.horses[hid];
    modal(`<h2 style="margin:0 0 8px">「${esc(def.q)}」</h2>
      <div class="choices">${def.a.map((a, i) => `<button class="btn" data-a="${i}">${esc(a[0])}</button>`).join('')}</div>`, (el) => {
      el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { World.answerInterview(W, iv, +b.dataset.a, h ? h.trainer : null, h ? h.owner : null); Progress.addFans(W, 'women', 30); closeModal(); World.save(W); if (after) after(); });
    }, `勝利騎手インタビュー${iv.race ? '　' + iv.race : ''}`);
  }

  // ---------- 週の終わり ----------
  function showWeekEnd() {
    show('s-info');
    gnav('info-nav');
    const wins = W.weekLog.filter(l => l.pos === 1).length;
    const inc = W.weekLog.reduce((a, l) => a + (l.income || 0), 0);
    let t = `<div class="cols" style="padding-top:0"><div class="card" style="padding:0"><table><tr><th>R</th><th>レース</th><th>騎乗馬</th><th>着順</th><th>人気</th><th>評価</th><th></th></tr>`;
    W.weekLog.forEach(l => t += `<tr><td>${l.no}</td><td>${esc(l.name)}</td><td>${esc(l.horse)}</td><td><b>${l.pos}着</b></td><td>${l.pop}</td><td>${l.grade}</td><td class="muted small">${l.mode === 'auto' ? 'オート' : ''}</td></tr>`);
    if (!W.weekLog.length) t += `<tr><td colspan="7" class="muted">騎乗なし</td></tr>`;
    t += `</table></div><div><div class="card"><div class="sec"><h3>今週の成績</h3></div><div class="row wrap" style="gap:18px"><div><div class="small muted">騎乗</div><div class="big">${W.weekLog.length}</div></div><div><div class="small muted">勝利</div><div class="big">${wins}</div></div><div><div class="small muted">収入</div><div class="big">${Math.round(inc * 10) / 10}<small>万円</small></div></div></div></div>
      <button class="btn primary" style="width:100%;margin-top:8px;padding:11px" id="b-next">次の週へ</button></div></div>`;
    $('info-body').innerHTML = t;
    $('b-next').onclick = () => advanceWeek();
  }
  function advanceWeek() {
    const ye = World.endWeek(W);
    World.save(W);
    tab = 'home';
    if (ye) showYearEnd(ye); else showWeek();
  }
  function showYearEnd(ye) {
    if (ye.jra && !ye.ceremonyDone) { ye.ceremonyDone = true; show('s-info'); gnav('info-nav'); $('info-body').innerHTML = ''; return awardCeremony(ye, () => showYearEnd(ye)); }
    show('s-info');
    gnav('info-nav');
    const ys = ye.ys, g = ye.goal, v = ye.vote;
    $('info-body').innerHTML = `<div style="text-align:center;margin-bottom:6px"><div class="small muted" style="letter-spacing:.3em">SEASON REVIEW</div><h1 style="font-size:24px">${ye.year}年 シーズン総括</h1></div>
      <div class="cols" style="grid-template-columns:1fr 1fr 1fr;padding-top:0">
      <div class="card"><div class="sec"><h3>成績</h3></div>
        <div class="big">${ys.wins}<small>勝 / ${ys.rides}騎乗</small></div>
        <div class="kv"><span>勝率</span><b>${ys.rides ? (ys.wins / ys.rides * 100).toFixed(1) : '0.0'}%</b></div>
        <div class="kv"><span>リーディング</span><b>${ye.rank}位</b></div>
        <div class="kv"><span>重賞</span><b>${ys.g.length}勝</b></div>
        <div class="kv"><span>収入</span><b>${money(ys.income || 0)}</b></div>
        ${ye.awards.length ? `<div style="margin-top:6px">${ye.awards.map(a => `<span class="badge gold">JRA賞 ${esc(a)}</span>`).join(' ')}</div>` : ''}
        ${ye.jra ? `<div class="small" style="margin-top:6px">${ye.jra.map(a => `<div class="kv"><span>${esc(a.name)}</span><b class="small" style="${a.me ? 'color:var(--gold)' : ''}">${esc(a.winner || '該当者なし')}</b></div>`).join('')}</div>` : ''}</div>
      <div class="card"><div class="sec"><h3>シーズン目標</h3></div>${g ? `<div style="font-family:var(--serif);font-weight:700">${esc(g.name)}</div><div class="big">${g.cur}<small> / ${g.target}</small></div><div class="bar gold"><i style="width:${g.rate * 100}%"></i></div><div style="margin-top:6px">${g.ok ? `<span class="badge green">達成</span> <span class="small">${esc(g.reward)}</span>` : '<span class="badge warn">未達成</span> <span class="small">評価 -1</span>'}</div>` : '<p class="small muted">目標なし</p>'}</div>
      <div class="card" style="padding:0"><div class="sec" style="margin:8px 10px 4px"><h3>騎手人気投票</h3><span class="sub">あなたは${v ? v.rank : '-'}位</span></div><table>${v ? v.top.map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(r.name)}</td></tr>`).join('') : ''}</table></div>
      </div>
      <div style="text-align:center;margin-top:8px"><button class="btn primary" style="padding:11px 30px" id="b-ny">${ye.year + 1}年へ</button></div>`;
    $('b-ny').onclick = showWeek;
  }
  // JRA賞の授賞式：部門ごとに受賞者を読み上げる。続いて年度代表馬と顕彰馬の選定
  function awardCeremony(ye, done) {
    const pages = ye.jra.map(a => ({ k: `${ye.year}年度 JRA賞 騎手部門`, t: a.name, w: a.winner || '該当者なし', s: a.stat, me: a.me }));
    if (ye.hoy) pages.push({ k: `${ye.year}年度 JRA賞`, t: '年度代表馬', w: ye.hoy.name, s: `GⅠ ${ye.hoy.n}勝（${ye.hoy.races.join('・')}）`, me: ye.hoy.mine, horse: true });
    (ye.hof || []).forEach(h => pages.push({ k: '顕彰馬選定（殿堂入り）', t: h.ok ? '選定' : '選定ならず', w: h.name, s: `記者投票 得票率${(h.pct * 100).toFixed(1)}%（4分の3以上で選定）・GⅠ ${h.g1}勝`, me: h.ok, horse: true }));
    let i = 0;
    const show1 = () => {
      if (i >= pages.length) return done();
      const pg = pages[i];
      if (pg.me) Sound.cheer && Sound.cheer(1.0);
      modal(`<div class="award ${pg.me ? 'me' : ''}"><div class="aw-k">${esc(pg.k)}</div><div class="aw-t">${esc(pg.t)}</div><div class="aw-w">${esc(pg.w)}${pg.me && !pg.horse ? ' <span class="badge gold">あなた</span>' : pg.me ? ' <span class="badge gold">騎乗馬</span>' : ''}</div><div class="aw-s">${esc(pg.s)}</div></div>
        <div class="choices"><button class="btn primary" id="m-ok">${i < pages.length - 1 ? '次へ' : 'シーズン総括へ'}</button></div>`, () => { $('m-ok').onclick = () => { closeModal(); i++; show1(); }; }, `授賞式　${i + 1} / ${pages.length}`);
    };
    show1();
  }
  function showRetire() {
    show('s-info');
    gnav('info-nav');
    const p = P();
    $('info-body').innerHTML = `<div class="card" style="max-width:720px;margin:0 auto"><div class="sec"><h3>引退 — ${esc(p.name)}</h3><span class="sub">${esc(Progress.title(W))}</span></div>
      <div class="kv"><span>通算</span><b>${p.wins}勝 / ${p.rides}騎乗</b></div>
      <div class="kv"><span>重賞</span><b>${p.gWins.length}勝（GⅠ ${p.g1Wins.length}勝）</b></div>
      <div class="kv"><span>ファン</span><b>${p.fans.toLocaleString()}人</b></div>
      <div class="kv"><span>実績</span><b>${Object.keys(p.ach).length} / ${Progress.ACH.length}</b></div>
      ${p.g1Wins.map(g => `<div class="small">・${esc(g)}</div>`).join('')}
      <ul class="log" style="padding-left:16px">${W.log.map(l => `<li>${esc(l.text)}</li>`).join('')}</ul>
      <button class="btn primary" id="b-end">タイトルへ</button></div>`;
    $('b-end').onclick = () => { World.deleteSave(); W = null; refreshTitle(); show('s-title'); };
    if (W.story && !W.story.flags.ended) { W.story.flags.ended = true; if (window.Drama) Drama.retireScene(W); W.story.pending.push({ lines: Story.epilogue(W) }); playScenes(); }
  }

  // ---------- チュートリアル ----------
  let tut = null, tutDone = false;
  const TUT = [
    { text: 'ようこそ。まずは画面の見方から。<br>（このあいだレースは止まっている）', tap: true },
    { text: '<b>左上</b>：いまの順位（何番手か）と残り距離。<br><b>上の帯</b>は隊列で、右端が先頭、縁取りの丸が自分。右上はコースの地図。', tap: true, hl: ['hud-info', 'hud-bar', 'hud-map'] },
    { text: '左下の<b>脚色</b>＝残りのスタミナ、<b>折合</b>＝馬の落ち着き（下がると「かかって」スタミナを浪費）。', tap: true, hl: ['hud-gauges'] },
    { text: '右上の<b>Ⅱ</b>で一時停止。タイムやペース、視点・音の切り替え、操作の説明はそこにある。', tap: true, hl: ['pauseBtn'] },
    { text: 'ではスタート。ゲートが開いた瞬間に<b>「スタート」</b>を押す。早すぎても遅すぎても出負けする。', hl: ['startBtn'], start: true, until: () => engine.player.started },
    { text: '右の<b>手綱スライダー</b>を指で<b>下</b>へ動かし、下のほう（控）まで下げる。前半は脚（スタミナ）をためるのが基本。指を離してもその位置のまま続く。', hl: ['thr'], speed: 0.6, until: () => engine.input.power < 0.3, hold: 1.2 },
    { text: '前に馬がいないと、抑えた馬は<b>かかる</b>（折合ゲージが減る）。左下の<b>進路</b>のつまみを左右へ動かして、前の馬の<b>真後ろ</b>に入れよう。その上の小さな図が周りの馬の位置（黄色が自分、上が前）。', hl: ['steer', 'radar', 'hud-gauges'], speed: 0.7, until: () => engine.player.covered, hold: 2, timeout: 14 },
    { text: 'いい位置。全力で追って脚が持つところまで来ると、手綱の上に<b>「仕掛けどき」</b>の札が出る。それまで我慢。<br>（早送り中）', hl: ['thr'], speed: 3, until: () => engine.D - engine.player.s < 650 },
    { text: '仕掛けどき。<b>手綱スライダーを一番上</b>まで上げる。上げるほど強く追って加速する。途中で止めれば、その強さで走る。', hl: ['thr', 'coach'], speed: 0.6, until: () => engine.player.drive > 0.8 },
    { text: '追いながら右端の<b>「ムチ」</b>をタップ。もうひと伸びする。続けて打てるのは5回まで（2完歩あければ数え直し）。', hl: ['c-whip'], speed: 0.6, until: () => engine.player.whips >= 1 },
    { text: 'ゴールまで追い続けよう！ 前が壁になったら進路のつまみで空いている所を探す。', speed: 1, until: () => engine.player.finished },
  ];
  function startTutorial() {
    try { localStorage.setItem('jl-tut', '1'); } catch (e) {}
    W = World.newGame({ name: 'あなた', region: '美浦', color: '#fbc02d' });
    quick = true;
    const race = W.card[10];
    race.dist = 1600; race.surf = 'T'; race.ground = '良';
    World.estimateOdds(W, race);
    const pickF = race.field.slice().sort((a, b) => a.pop - b.pop)[1];
    W.booked = { [race.no]: pickF.hid };
    startRace(race, pickF.hid, { noIntro: true });
    engine.gateOpenAt = 1e9;
    tut = { i: -1, speed: 1, hold: false, t: 0, ok: 0 };
    tutStep(0);
  }
  function tutStep(i) {
    document.querySelectorAll('.hl').forEach(el => el.classList.remove('hl'));
    if (i >= TUT.length) { tut = null; tutDone = true; $('tut').style.display = 'none'; return; }
    const st = TUT[i];
    tut.i = i; tut.t = 0; tut.ok = 0; tut.speed = st.speed || 1; tut.hold = !!st.tap;
    $('tut').style.display = 'block';
    $('tut-text').innerHTML = st.text;
    $('tut-step').textContent = `${i + 1} / ${TUT.length}`;
    $('tut-next').style.display = st.tap ? '' : 'none';
    (st.hl || []).forEach(id => $(id) && $(id).classList.add('hl'));
    if (st.start) engine.gateOpenAt = engine.t + 2 + Math.random() * 1.5;
  }
  function tutTick(dt) {
    const st = TUT[tut.i];
    if (!st || st.tap) return;
    tut.t += dt;
    if (st.until()) tut.ok += dt; else tut.ok = 0;
    if (tut.ok >= (st.hold || 0.01) || (st.timeout && tut.t > st.timeout)) tutStep(tut.i + 1);
  }
  $('tut-next').onclick = () => { if (tut) tutStep(tut.i + 1); };
  $('tut-skip').onclick = () => { if (!tut) return; document.querySelectorAll('.hl').forEach(el => el.classList.remove('hl')); tut = null; $('tut').style.display = 'none'; if (engine.gateOpenAt > 1e8) engine.gateOpenAt = engine.t + 2; };

  // ---------- お試し騎乗 ----------
  function quickRace() {
    W = World.newGame({ name: 'あなた', region: Math.random() < 0.5 ? '美浦' : '栗東', color: '#fbc02d' });
    quick = true;
    const race = W.card[10];
    World.estimateOdds(W, race);
    const sorted = race.field.slice().sort((a, b) => a.pop - b.pop);
    const pickF = sorted[Math.min(sorted.length - 1, 2)];
    W.booked = { [race.no]: pickF.hid };
    showPaddock(race);
  }

  document.addEventListener('gesturestart', e => e.preventDefault());
  // iOS でページ自体がずれてスクロールすると、見た目とタッチ位置がずれるので止める（スクロールする枠の中は除く）
  document.addEventListener('touchmove', (e) => { if (!e.target.closest || !e.target.closest('.scroll, .ctrack, .tabs, .stats, .crumbs, .drawer, .modal')) e.preventDefault(); }, { passive: false });
  window.addEventListener('scroll', () => { if (window.scrollX || window.scrollY) window.scrollTo(0, 0); });
  window.__jl = { get W() { return W; }, get engine() { return engine; } };
})();
