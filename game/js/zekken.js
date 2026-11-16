// ===== ゼッケン（馬番ゼッケン） =====
// 中央競馬のゼッケンは競走の格で生地の色が違う（Wikipedia「ゼッケン (競馬)」による）
//  GⅠ：紫紺地に白文字（桜花賞・皐月賞・優駿牝馬・菊花賞は黄文字） / 東京優駿（日本ダービー）：白地に黒文字、縁に金色の刺繍
//  GⅡ：赤褐色地に白文字 / GⅢ・格付けなしの重賞：深緑地に白文字 / その他の特別競走：黒地に白文字 / 一般競走：白地に黒文字
//  形は縦510mm・横695mmの台形。馬番号・馬名・競走番号・競走名などが付く。国際競走では片側が英文の馬名
(function () {
  const STYLE = {
    g1: { bg: '#2c2452', fg: '#ffffff', edge: '#1d1838' },
    classic: { bg: '#2c2452', fg: '#f2c318', edge: '#1d1838' },
    derby: { bg: '#f6f5f0', fg: '#141414', edge: '#c9a13b', gold: true },
    g2: { bg: '#7b2f22', fg: '#ffffff', edge: '#5a2117' },
    g3: { bg: '#164a2f', fg: '#ffffff', edge: '#0e3420' },
    special: { bg: '#18181a', fg: '#ffffff', edge: '#000000' },
    normal: { bg: '#f6f5f0', fg: '#141414', edge: '#cfc9bc' },
  };
  const CLASSICS = /桜花賞|皐月賞|優駿牝馬|オークス|菊花賞/;
  // レースからゼッケンの種類を決める
  function kindOf(race) {
    if (!race) return 'normal';
    if (race.graded === 1 || race.overseas) return /東京優駿|日本ダービー|^ダービー/.test(race.name) ? 'derby' : CLASSICS.test(race.name) ? 'classic' : 'g1';
    if (race.graded === 2) return 'g2';
    if (race.graded === 3 || /重賞/.test(race.label || '')) return 'g3';
    if (race.name && race.label && race.name !== race.label) return 'special';
    return 'normal';
  }
  // カタカナ馬名をローマ字に（国際競走の英文馬名）
  const KANA = { ア: 'A', イ: 'I', ウ: 'U', エ: 'E', オ: 'O', カ: 'KA', キ: 'KI', ク: 'KU', ケ: 'KE', コ: 'KO', サ: 'SA', シ: 'SHI', ス: 'SU', セ: 'SE', ソ: 'SO', タ: 'TA', チ: 'CHI', ツ: 'TSU', テ: 'TE', ト: 'TO', ナ: 'NA', ニ: 'NI', ヌ: 'NU', ネ: 'NE', ノ: 'NO', ハ: 'HA', ヒ: 'HI', フ: 'FU', ヘ: 'HE', ホ: 'HO', マ: 'MA', ミ: 'MI', ム: 'MU', メ: 'ME', モ: 'MO', ヤ: 'YA', ユ: 'YU', ヨ: 'YO', ラ: 'RA', リ: 'RI', ル: 'RU', レ: 'RE', ロ: 'RO', ワ: 'WA', ヲ: 'WO', ン: 'N', ガ: 'GA', ギ: 'GI', グ: 'GU', ゲ: 'GE', ゴ: 'GO', ザ: 'ZA', ジ: 'JI', ズ: 'ZU', ゼ: 'ZE', ゾ: 'ZO', ダ: 'DA', ヂ: 'JI', ヅ: 'ZU', デ: 'DE', ド: 'DO', バ: 'BA', ビ: 'BI', ブ: 'BU', ベ: 'BE', ボ: 'BO', パ: 'PA', ピ: 'PI', プ: 'PU', ペ: 'PE', ポ: 'PO', ヴ: 'V' };
  const SMALL = { ャ: 'YA', ュ: 'YU', ョ: 'YO', ァ: 'A', ィ: 'I', ゥ: 'U', ェ: 'E', ォ: 'O' };
  function romaji(s) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i], n = s[i + 1];
      if (c === 'ッ') { const nx = KANA[n]; if (nx) out += nx[0] === 'C' ? 'T' : nx[0]; continue; }
      if (c === 'ー') continue;
      const PAIR = { 'デュ': 'DU', 'ティ': 'TI', 'ディ': 'DI', 'トゥ': 'TU', 'ドゥ': 'DU', 'ウィ': 'WI', 'ウェ': 'WE', 'ウォ': 'WO', 'ファ': 'FA', 'フィ': 'FI', 'フェ': 'FE', 'フォ': 'FO', 'シェ': 'SHE', 'ジェ': 'JE', 'チェ': 'CHE' };
      if (n && PAIR[c + n]) { out += PAIR[c + n]; i++; continue; }
      let r = KANA[c];
      if (r == null) { out += SMALL[c] || c; continue; }
      if (n && SMALL[n]) {
        const sm = SMALL[n];
        if (/^[YAIUEO]/.test(sm) && 'ャュョ'.includes(n)) r = (/^(SHI|CHI|JI)$/.test(r) ? r.slice(0, -1) : r.slice(0, -1) + 'Y') + sm.slice(1);
        else r = (r === 'V' ? 'V' : r === 'FU' ? 'F' : r.length > 1 ? r.slice(0, -1) : r) + sm;
        i++;
      }
      out += r;
    }
    return out;
  }
  const cache = {};
  // side: 'L'（馬の左側）| 'R'（右側）。左右で書く内容が違う
  function texture(o, side) {
    const key = JSON.stringify(o) + side;
    if (cache[key]) return cache[key];
    const st = STYLE[o.kind] || STYLE.normal;
    const W = 512, H = 380, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.clearRect(0, 0, W, H);
    // 台形（上辺=背中側が広く、下辺がやや狭い）。下の角は丸める
    const shape = (ins) => { const t = 4 + ins, b = H - 6 - ins, l0 = 4 + ins, l1 = 34 + ins, r0 = W - 4 - ins, r1 = W - 34 - ins, rad = 34; x.beginPath(); x.moveTo(l0, t); x.lineTo(r0, t); x.lineTo(r1 + 4, b - rad); x.quadraticCurveTo(r1, b, r1 - rad, b); x.lineTo(l1 + rad, b); x.quadraticCurveTo(l1, b, l1 - 4, b - rad); x.closePath(); };
    shape(0); x.fillStyle = st.bg; x.fill();
    // 不織布の質感
    x.save(); shape(0); x.clip();
    for (let i = 0; i < 1600; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.025})`; x.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 3, 2 + Math.random() * 3); }
    // 鞍の当たる上側は少し影
    const sg = x.createLinearGradient(0, 0, 0, 70); sg.addColorStop(0, 'rgba(0,0,0,.18)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = sg; x.fillRect(0, 0, W, 70);
    x.restore();
    // 縁取り（ダービーは金色の刺繍）
    x.lineWidth = st.gold ? 12 : 8; x.strokeStyle = st.edge; shape(st.gold ? 9 : 6); x.stroke();
    if (st.gold) { x.setLineDash([5, 4]); x.lineWidth = 3; x.strokeStyle = '#f2d77a'; shape(9); x.stroke(); x.setLineDash([]); }
    x.fillStyle = st.fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    const fit = (txt, size, maxW, font) => { let s = size; do { x.font = `${font || 'bold'} ${s}px "Noto Sans JP", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif`; s -= 2; } while (x.measureText(txt).width > maxW && s > 14); };
    const graded = /^(g1|classic|derby|g2|g3)$/.test(o.kind);
    // 体に巻いたとき、上の3割は鞍の下に入り、前寄りの真ん中には騎手の脚（長靴）がかかる。
    // そこで馬番は後ろ寄り（馬の尻の側）に大きく、文字は脚より下の帯に横いっぱいに置く。右側の布は前が画像の右、左側の布は前が画像の左
    const front = side === 'R' ? 1 : -1;
    const nx = W / 2 - front * 118;
    fit(String(o.num), 140, 180, '900'); x.fillText(String(o.num), nx, 196);
    let main, sub;
    if (graded) { // 重賞：片側に競走名、反対側に馬名（国際競走は片側を英文の馬名に）
      main = side === 'L' ? (o.intl ? romaji(o.horse || '') : (o.race || '')) : (o.horse || '');
      sub = side === 'L' && !o.intl ? `${o.venue || ''}${o.no ? ' ' + o.no + 'R' : ''}` : (o.race || '');
    } else { // 特別：競走名 / 一般：競馬場名。競走番号を添える
      main = o.kind === 'special' ? (o.race || '') : (o.venue || '');
      sub = o.no ? `第${o.no}競走` : '';
    }
    fit(main, 54, W - 130); x.fillText(main, W / 2, 292);
    fit(sub, 26, W - 180, '600'); x.globalAlpha = 0.82; x.fillText(sub, W / 2, 340); x.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
    return (cache[key] = t);
  }
  window.Zekken = { kindOf, texture, romaji, STYLE };
})();
