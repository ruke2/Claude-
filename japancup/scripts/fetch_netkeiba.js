// ジャパンカップ 学習データ取得スクリプト(netkeiba)
// 実行場所: Chrome で https://db.netkeiba.com/ の任意のページを開き、F12 → Console に全文を貼って Enter
// 進み具合: Console で JCPROG。完了後 copy(JCOUT) → data/japancup_1990_2026_data.csv として保存(そのまま学習に使える列構成)
//
// 注意: この環境から netkeiba に接続できないため、このスクリプトは未実行・未検証。
//       初回は RACE_IDS を1年分だけにして、出力の列と値を目で確認してから全年を回す。
//
// RACE_IDS: 各年のジャパンカップの netkeiba レースID(https://db.netkeiba.com/race/XXXXXXXXXXXX/ の数字)。
//           netkeiba でレース名検索して貼る。ID は推測で埋めない。
const RACE_IDS = { /* 2025: '2025........', 2024: '2024........', ... */ };
// 2026年の出走馬(任意): 出馬表 https://race.netkeiba.com/race/shutuba.html?race_id=... の horse_id
const ENTRIES_2026 = [ /* [馬名, horse_id, 枠, 馬番, 騎手, 斤量, 性齢, 所属(東/西/地/外)] */ ];
const DATE_2026 = '2026/11/29';
const DIST_LO = 2200, DIST_HI = 2600;   // 距離適性の範囲(芝2200-2600成績)

window.JCOUT = null; window.JCPROG = {stage: 'races', done: 0, total: Object.keys(RACE_IDS).length, err: []};
(async () => {
  const sl = ms => new Promise(s => setTimeout(s, ms));
  const dec = async u => new TextDecoder('euc-jp').decode(await (await fetch(u)).arrayBuffer());
  const DP = t => new DOMParser().parseFromString(t, 'text/html');
  const clean = s => String(s ?? '').replace(/[,\n\r]/g, ' ').trim();
  const rows = (table) => {               // 見出し名で列を引く
    const trs = [...table.querySelectorAll('tr')];
    const head = [...trs[0].children].map(x => x.innerText.trim().replace(/\s+/g, ''));
    return trs.slice(1).map(tr => {
      const c = [...tr.children]; const o = {_tr: tr};
      head.forEach((h, i) => o[h] = c[i] ? c[i].innerText.trim().replace(/\s+/g, ' ') : '');
      return o;
    });
  };
  const runners = [];
  for (const [y, id] of Object.entries(RACE_IDS)) {
    try {
      const d = DP(await dec('https://db.netkeiba.com/race/' + id + '/'));
      const intro = d.querySelector('.data_intro').innerText;
      const m = intro.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
      const date = `${m[1]}/${m[2].padStart(2, '0')}/${m[3].padStart(2, '0')}`;
      const baba = (intro.match(/芝\s*:\s*(良|稍重|重|不良)/) || [])[1] || '';
      // ラップ(前半3F・後半3F)
      let pace = '';
      const lapTxt = [...d.querySelectorAll('table')].map(t => t.innerText).find(t => /ペース/.test(t)) || '';
      const pm = lapTxt.match(/ペース\s*([\d.]+)-([\d.]+)/) || lapTxt.match(/([\d.]{4})-([\d.]{4})/);
      if (pm) pace = `${pm[1]}-${pm[2]}`;
      // 複勝払戻
      const fuku = {};
      d.querySelectorAll('table.pay_table_01 tr').forEach(tr => {
        if (/複勝/.test(tr.innerText)) {
          const nums = tr.children[1].innerText.trim().split(/\s+/), pays = tr.children[2].innerText.trim().split(/\s+/);
          nums.forEach((n, i) => fuku[n] = (pays[i] || '').replace(/,/g, ''));
        }
      });
      const R = rows(d.querySelector('table.race_table_01'));
      R.forEach(r => {
        const a = r._tr.querySelector('a[href*="/horse/"]');
        const tr = r._tr.querySelector('a[href*="/trainer/"]');
        const area = (r['調教師'] || '').match(/\[(東|西|地|外)\]/);
        runners.push({y, date, baba, pace, id: a.getAttribute('href').match(/horse\/(\w+)/)[1],
          着順: r['着順'], 枠: r['枠番'], 馬番: r['馬番'], 馬名: r['馬名'], 性齢: r['性齢'], 斤量: r['斤量'], 騎手: r['騎手'],
          所属: area ? area[1] : '', 単勝オッズ: r['単勝'], 人気: r['人気'], 馬体重: r['馬体重'], 通過: r['通過'], 上り: r['上り'],
          着差: r['着差'], 複勝払戻: fuku[r['馬番']] || '0'});
      });
    } catch (e) { JCPROG.err.push('race ' + y + ' ' + e); }
    JCPROG.done++; await sl(600);
  }
  ENTRIES_2026.forEach(e => runners.push({y: '2026', date: DATE_2026, baba: '', pace: '', id: e[1], 着順: '', 枠: e[2], 馬番: e[3], 馬名: e[0],
    性齢: e[6], 斤量: e[5], 騎手: e[4], 所属: e[7], 単勝オッズ: '', 人気: '', 馬体重: '', 通過: '', 上り: '', 着差: '', 複勝払戻: ''}));

  JCPROG.stage = 'horses'; JCPROG.done = 0; JCPROG.total = runners.length;
  const cache = {};
  const H = ['年','馬場','着順','枠','馬番','馬名','性','齢','斤量','騎手','所属','外国馬','単勝オッズ','人気','複勝払戻','4角位置','上り3F','着差','間隔日数',
    '通算','G1成績','東京芝成績','芝2200-2600成績'];
  for (const p of ['前走','前々走','3走前']) for (const k of ['レース','格','場','距離','馬場','頭数','人気','着順','着差','上り','4角']) H.push(p + '_' + k);
  H.push('展開_初角率','展開_4角率','展開_上がり差','展開_逃げ率','展開_経験ペース差','展開_使用走数','展開_本番ペース','past5_raw');
  const out = [H.join(',')];
  const grade = s => (s.match(/\((G1|G2|G3|GI|GII|GIII|Jpn1|Jpn2|Jpn3|L|OP)\)/) || [, ''])[1]
      .replace('GIII', 'G3').replace('GII', 'G2').replace('GI', 'G1').replace(/Jpn(\d)/, '他') || (/(\d)勝クラス/.test(s) ? s.match(/(\d)勝クラス/)[1] + '勝' : '他');
  const rec = a => `${a.length}/${a.filter(r => r.着順 === '1').length}/${a.filter(r => ['1','2','3'].includes(r.着順)).length}`;
  for (const e of runners) {
    try {
      if (!cache[e.id]) {
        const j = await (await fetch('https://db.netkeiba.com/horse/ajax_horse_results.html?input=UTF-8&output=json&id=' + e.id)).json();
        const t = DP('<table>' + j.data.replace(/^[\s\S]*?<table[^>]*>/, '')).querySelector('table');
        cache[e.id] = rows(t).map(r => ({日付: r['日付'], 開催: r['開催'], レース: r['レース名'], 頭数: r['頭数'], 人気: r['人気'], 着順: r['着順'],
          距離: r['距離'], 馬場: r['馬場'], 着差: r['着差'], 通過: r['通過'], ペース: r['ペース'], 上り: r['上り']}));
        await sl(400);
      }
      const h = cache[e.id].filter(r => r.日付 && r.日付 < e.date && !/取|除|中/.test(r.着順));
      const turf = h.filter(r => /^芝/.test(r.距離));
      const dist = r => +((r.距離.match(/\d+/) || [0])[0]);
      const place = r => (r.開催.match(/[^\d]+/) || [''])[0];
      const g1 = h.filter(r => grade(r.レース) === 'G1');
      const tokyo = turf.filter(r => place(r) === '東京');
      const band = turf.filter(r => dist(r) >= DIST_LO && dist(r) <= DIST_HI);
      const prev = h.slice(0, 3);
      const days = h[0] ? Math.round((new Date(e.date) - new Date(h[0].日付)) / 864e5) : '';
      // 展開(過去5走): 初角率=(最初のコーナー順位−1)/(頭数−1)、4角率=最後のコーナーで同様、逃げ率=最初のコーナー1番手の割合、
      // 上がり差=その馬の上り−そのレースのペース後半3F、経験ペース差=前半3F−後半3F の平均(ペース列が 35.0-34.5 の形のとき)
      const p5 = h.slice(0, 5).filter(r => r.通過);
      const pos = r => r.通過.split('-').map(Number);
      const rate = (v, n) => n > 1 ? (v - 1) / (n - 1) : 0;
      const avg = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : '';
      const pp = r => (r.ペース.match(/([\d.]+)-([\d.]+)/) || []).slice(1).map(Number);
      const ten = {
        初角率: avg(p5.map(r => rate(pos(r)[0], +r.頭数))), '4角率': avg(p5.map(r => rate(pos(r).slice(-1)[0], +r.頭数))),
        逃げ率: avg(p5.map(r => pos(r)[0] === 1 ? 1 : 0)),
        上がり差: avg(p5.filter(r => pp(r).length && r.上り).map(r => +r.上り - pp(r)[1])),
        経験ペース差: avg(p5.filter(r => pp(r).length).map(r => pp(r)[0] - pp(r)[1])), 使用走数: p5.length};
      const fx = v => v === '' ? '' : (+v).toFixed(3);
      const [sex, age] = [e.性齢.slice(0, 1), e.性齢.slice(1)];
      const lastPos = e.通過 ? e.通過.split('-').slice(-1)[0] : '';
      const line = [e.y, e.baba, e.着順, e.枠, e.馬番, e.馬名, sex, age, e.斤量, e.騎手, e.所属, e.所属 === '外' ? 1 : 0, e.単勝オッズ, e.人気, e.複勝払戻,
        lastPos, e.上り, e.着差, days, rec(h), rec(g1), rec(tokyo), rec(band)];
      for (let i = 0; i < 3; i++) {
        const r = prev[i] || {};
        line.push(r.レース || '', r.レース ? grade(r.レース) : '', r.開催 ? place(r) : '', r.距離 || '', r.馬場 || '', r.頭数 || '', r.人気 || '', r.着順 || '',
          r.着差 || '', r.上り || '', r.通過 ? r.通過.split('-').slice(-1)[0] : '');
      }
      line.push(fx(ten.初角率), fx(ten['4角率']), fx(ten.上がり差), fx(ten.逃げ率), fx(ten.経験ペース差), ten.使用走数, e.pace,
        p5.map(r => [r.日付, r.通過, r.頭数, r.ペース, r.上り].join('|')).join(';'));
      out.push(line.map(clean).join(','));
    } catch (err) { JCPROG.err.push(e.y + ' ' + e.馬名 + ' ' + err); }
    JCPROG.done++;
  }
  window.JCOUT = out.join('\n') + '\n';
  console.log('完了', JCPROG.done, '頭 / エラー', JCPROG.err.length, JCPROG.err);
})();
