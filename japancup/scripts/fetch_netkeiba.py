"""netkeiba から学習データを取得する(scripts/fetch_netkeiba.js の Python 版。作業環境から直接取得する)。

python3 scripts/fetch_netkeiba.py --races data/race_ids.csv --out data/japancup_1990_2026_data.csv \
    [--entries 202605050812 --entries-year 2026 --entries-date 2026-11-29] [--dist 2200-2600] [--cache data/raw]

--races: 列 年,race_id(netkeiba のレースID。日付別レース一覧 https://db.netkeiba.com/race/list/YYYYMMDD/ で確認したもの)
--entries: 出走予定馬を出馬表 https://race.netkeiba.com/race/shutuba.html?race_id=... から加える(着順などは空欄)
取得したページは --cache に保存し、2回目以降はそれを使う。リクエストの間隔は1秒。

列の定義(tests/tennosho_ref.csv と同じ形式):
- 通算・G1成績・東京芝成績・距離帯成績: 出走/勝/3着内。対象レースより前の出走(取消・除外・中止を除く)。海外・地方を含む
- 前走・前々走・3走前: 直近3件の記録(取消・除外・中止を含む)のうち有効な走。間隔日数も取消・除外を含む直近の記録から数える
- 海外の走の 前走_着差・上り・4角 は空欄(netkeiba は年により値の有無がばらつくため)
- 展開_* は通過順のある国内の平地の走を新しい順に5走(海外・障害は除く)。ペースは20秒未満を含む値、上りは20〜42秒の範囲外を欠損扱い
- 本番ペースはラップの最初と最後の3本の合計(古いレースはページのカッコ内の値が誤っているため)
- 展開_*: 通過順のある過去5走の 初角率=(最初のコーナー順位−1)/(頭数−1)の平均、4角率=最後のコーナーで同様、
  逃げ率=最初のコーナー1番手の割合、上がり差=上り−そのレースの後半3F、経験ペース差=前半3F−後半3F の平均
- 父・父父・母父・展開_逃げ候補数・展開_先行馬数 は取得しない(空欄。特徴量には使っていない)
"""
import argparse, hashlib, os, re, sys, time
from datetime import date
import requests
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
S = requests.Session()
S.headers['User-Agent'] = 'Mozilla/5.0'
CACHE = os.path.join(HERE, '..', 'data', 'raw')


def get(url):
    p = os.path.join(CACHE, hashlib.md5(url.encode()).hexdigest() + '.html')
    if os.path.exists(p):
        b = open(p, 'rb').read()
    else:
        r = None
        for i in range(4):
            try:
                r = S.get(url, timeout=40)
                if r.status_code == 200:
                    break
            except requests.RequestException:
                r = None
            time.sleep(3 * (i + 1))
        if r is None or r.status_code != 200:
            raise RuntimeError(f'取得失敗 {url} {getattr(r, "status_code", None)}')
        b = r.content
        os.makedirs(CACHE, exist_ok=True)
        open(p, 'wb').write(b)
        time.sleep(1.0)
    enc = 'euc-jp' if 'euc-jp' in b[:3000].decode('ascii', 'ignore').lower() else 'utf-8'
    return BeautifulSoup(b.decode(enc, 'replace'), 'lxml')


def txt(x):
    return re.sub(r'\s+', ' ', x.get_text(' ', strip=True)).strip() if x is not None else ''


def table_rows(table):
    trs = table.find_all('tr')
    head = [re.sub(r'\s+', '', th.get_text('', strip=True)) for th in trs[0].find_all(['th', 'td'])]
    out = []
    for tr in trs[1:]:
        tds = tr.find_all('td')
        if not tds:
            continue
        o = {'_tr': tr}
        for h, c in zip(head, tds):
            o.setdefault(h, c)
        out.append(o)
    return out


def grade(name):
    m = re.search(r'\((G1|G2|G3|GI|GII|GIII|Jpn1|Jpn2|Jpn3|JpnI|JpnII|JpnIII|L|OP)\)', name)
    if m:
        g = m.group(1)
        return {'GI': 'G1', 'GII': 'G2', 'GIII': 'G3'}.get(g, g if g in ('G1', 'G2', 'G3', 'L', 'OP') else '他')
    m = re.search(r'(\d)勝クラス', name)
    return m.group(1) + '勝' if m else '他'


def jid(cell):
    a = cell.find('a', href=re.compile(r'/jockey/')) if cell is not None else None
    m = re.search(r'/jockey/(?:result/recent/)?(\w+)', a['href']) if a else None
    return m[1] if m else ''


def num(s):
    m = re.search(r'-?\d+(\.\d+)?', str(s))
    return float(m.group()) if m else None


def race_result(race_id):
    s = get(f'https://db.netkeiba.com/race/{race_id}/')
    intro = txt(s.select_one('.data_intro'))
    m = re.search(r'(\d{4})年(\d{1,2})月(\d{1,2})日', intro)
    day = date(int(m[1]), int(m[2]), int(m[3]))
    baba = (re.search(r'芝\s*:\s*(良|稍重|稍|重|不良)', intro) or [None, ''])[1]
    baba = {'稍重': '稍'}.get(baba, baba)
    # 本番ペース: ラップの最初の3本と最後の3本の合計(古いレースはページのカッコ内の値が誤っているため、ラップから計算する)
    pace = ''
    cells = s.select('td.race_lap_cell')
    if cells:
        laps = [float(x) for x in re.findall(r'\d+\.\d', txt(cells[0]))]
        if len(laps) >= 6:
            pace = f'{sum(laps[:3]):.1f}-{sum(laps[-3:]):.1f}'
    fuku = {}
    for tr in s.select('table.pay_table_01 tr'):
        th = tr.find('th')
        if th and '複勝' in txt(th):
            tds = tr.find_all('td')
            ns = tds[0].get_text('\n', strip=True).split('\n')
            ps = tds[1].get_text('\n', strip=True).split('\n')
            for n, p in zip(ns, ps):
                fuku[n.strip()] = p.replace(',', '').strip()
    rows = []
    for r in table_rows(s.select_one('table.race_table_01')):
        a = r['馬名'].find('a', href=re.compile(r'/horse/'))
        trainer = txt(r.get('調教師'))
        area = re.search(r'\[(東|西|地|外)\]', trainer)
        w = re.match(r'(\d+)\(([+-]?\d+)\)', txt(r.get('馬体重')))
        tsuka = txt(r.get('通過'))
        rows.append({'horse_id': re.search(r'horse/(\w+)', a['href'])[1], '着順': txt(r['着順']), '枠': txt(r['枠番']),
                     '馬番': txt(r['馬番']), '馬名': txt(r['馬名']), '性齢': txt(r['性齢']), '斤量': txt(r['斤量']),
                     '騎手': txt(r['騎手']), '騎手ID': jid(r['騎手']), '所属': area[1] if area else '', '単勝オッズ': txt(r.get('単勝')),
                     '人気': txt(r.get('人気')), '馬体重': w[1] if w else '', '増減': w[2] if w else '',
                     '4角位置': tsuka.split('-')[-1] if tsuka else '', '上り3F': txt(r.get('上り')), '着差': txt(r.get('着差')),
                     '通過': tsuka, '複勝払戻': fuku.get(txt(r['馬番']), '0')})
    return day, baba, pace, rows


def shutuba(race_id):
    s = get(f'https://race.netkeiba.com/race/shutuba.html?race_id={race_id}')
    rows = []
    for tr in s.select('tr.HorseList'):
        a = tr.select_one('span.HorseName a') or tr.select_one('a[href*="/horse/"]')
        g = lambda c: txt(tr.select_one(c))
        area = g('td.Trainer span') or g('td.Trainer')
        aff = '東' if '美浦' in area else '西' if '栗東' in area else '外' if '海外' in area else '地' if '地方' in area else ''
        rows.append({'horse_id': re.search(r'horse/(\w+)', a['href'])[1], '着順': '', '枠': g('td[class^="Waku"]'),
                     '馬番': g('td[class^="Umaban"]'), '馬名': txt(a), '性齢': g('td.Barei'),
                     '斤量': txt(tr.find_all('td')[5]), '騎手': g('td.Jockey'), '騎手ID': jid(tr.select_one('td.Jockey')), '所属': aff, '単勝オッズ': '', '人気': '',
                     '馬体重': '', '増減': '', '4角位置': '', '上り3F': '', '着差': '', '通過': '', '複勝払戻': ''})
    return rows


HCACHE = {}


def history(hid):
    if hid not in HCACHE:
        s = get(f'https://db.netkeiba.com/horse/result/{hid}/')
        t = s.select_one('table.db_h_race_results')
        out = []
        for r in table_rows(t) if t else []:
            d = re.match(r'(\d{4})/(\d{2})/(\d{2})', txt(r['日付']))
            if not d:
                continue
            out.append({'日付': date(int(d[1]), int(d[2]), int(d[3])), '開催': txt(r['開催']), 'レース': txt(r['レース名']),
                        '頭数': txt(r['頭数']), '人気': txt(r['人気']), '着順': re.sub(r'^(\d+)\((降|再)\)$', r'\1', txt(r['着順'])), '距離': txt(r['距離']),
                        '馬場': txt(r['馬場']), '着差': txt(r['着差']), '通過': txt(r['通過']), 'ペース': txt(r['ペース']),
                        '上り': txt(r['上り']), '騎手': txt(r['騎手']), '騎手ID': jid(r['騎手'])})
        HCACHE[hid] = out
    return HCACHE[hid]


PREV = ['前走', '前々走', '3走前']
PK = ['レース', '格', '場', '距離', '馬場', '頭数', '人気', '着順', '着差', '上り', '4角']


def header(dist_col):
    H = ['年', '馬場', '着順', '枠', '馬番', '馬名', '性', '齢', '斤量', '騎手', '所属', '外国馬', '単勝オッズ', '人気', '複勝払戻',
         '馬体重', '増減', '4角位置', '上り3F', '着差', '父', '父父', '母父', '間隔日数', '通算', 'G1成績', '東京芝成績', dist_col]
    H += [f'{p}_{k}' for p in PREV for k in PK]
    H += ['取消除外で飛ばした数']
    H += [f'{c}_{k}' for c in ['通算', 'G1成績', '東京芝成績', dist_col] for k in ['出走', '勝', '3着内']]
    H += ['展開_初角率', '展開_4角率', '展開_上がり差', '展開_逃げ率', '展開_経験ペース差', '展開_使用走数', '展開_本番初角率',
          '展開_本番4角率', '展開_本番ペース', '展開_逃げ候補数', '展開_先行馬数', 'horse_id']
    # JC 用の追加列(係数の最適化の候補。README 5.2)
    H += ['前走_騎手', '前走_4角率', '前走_後半3F', 'G1中長距離成績', '東京G1成績', '海外G1成績', '前走から同騎手', '騎手ID']
    return H


def place(kaisai):
    return re.sub(r'\d', '', kaisai)


def abroad(kaisai):
    sys.path.insert(0, os.path.join(HERE, '..'))
    from jc.features import JRA, ABROAD_EXCLUDE
    p = place(kaisai)
    return p not in JRA and p not in ABROAD_EXCLUDE and '(地)' not in p


def build_row(y, day, baba, pace, e, n_field, lo, hi, dist_col):
    h_all = [r for r in history(e['horse_id']) if r['日付'] < day]
    invalid = lambda r: re.search(r'取|除|中', r['着順']) or not re.match(r'\d+$', r['着順'])
    h = [r for r in h_all if not invalid(r)]
    # 前走〜3走前: 直近3件の記録(取消・除外・中止を含む)のうち有効な走。飛ばした数を記録する(tests/tennosho_ref.csv と同じ扱い)
    last3 = h_all[:3]
    prev = [r for r in last3 if not invalid(r)]
    skipped = len(last3) - len(prev)
    turf = [r for r in h if r['距離'].startswith('芝')]
    dist = lambda r: int(num(r['距離']) or 0)
    g1 = [r for r in h if grade(r['レース']) == 'G1']
    tokyo = [r for r in turf if place(r['開催']) == '東京']
    band = [r for r in turf if lo <= dist(r) <= hi]
    rec = lambda a: (len(a), sum(r['着順'] == '1' for r in a), sum(r['着順'] in ('1', '2', '3') for r in a))
    p5 = [r for r in h if r['通過'] and not abroad(r['開催']) and not r['距離'].startswith('障')][:5]  # 通過順のある国内の走を新しい順に5走
    pos = lambda r: [int(x) for x in r['通過'].split('-') if x.isdigit()]
    rate = lambda v, n: (v - 1) / (n - 1) if n > 1 else 0.0
    avg = lambda a: sum(a) / len(a) if a else ''
    def pp(r):  # 前半3F・後半3F。古いレースの誤った値(13.0-13.0)や地方の 0.0-36.2 など、20秒未満を含むものは欠損扱い
        v = [float(x) for x in re.findall(r'[\d.]+', r['ペース'])][:2] if re.match(r'[\d.]+-[\d.]+', r['ペース']) else []
        return v if len(v) == 2 and min(v) >= 20 else []

    def up(r):  # 上り3F。20〜42秒の範囲外(1990年前後の4F表記とみられる値、障害の値)は欠損扱い
        v = num(r['上り'])
        return v if v is not None and 20 <= v <= 42 else None
    ten = {'初角率': avg([rate(pos(r)[0], int(r['頭数'])) for r in p5 if pos(r)]),
           '4角率': avg([rate(pos(r)[-1], int(r['頭数'])) for r in p5 if pos(r)]),
           '逃げ率': avg([1.0 if pos(r) and pos(r)[0] == 1 else 0.0 for r in p5]),
           '上がり差': avg([up(r) - pp(r)[1] for r in p5 if pp(r) and up(r) is not None]),
           '経験ペース差': avg([pp(r)[0] - pp(r)[1] for r in p5 if pp(r)])}
    fx = lambda v: '' if v == '' else f'{v:.3f}'
    mp = [int(x) for x in e['通過'].split('-') if x.isdigit()] if e['通過'] else []
    sex, age = e['性齢'][:1], re.sub(r'\D', '', e['性齢'])
    days = (day - h_all[0]['日付']).days if h_all else ''  # 取消・除外のレースからの日数
    R = [rec(h), rec(g1), rec(tokyo), rec(band)]
    line = [y, baba, e['着順'], e['枠'], e['馬番'], e['馬名'], sex, age, e['斤量'], e['騎手'], e['所属'], int(e['所属'] == '外'),
            e['単勝オッズ'], e['人気'], e['複勝払戻'], e['馬体重'], e['増減'], e['4角位置'], e['上り3F'], e['着差'], '', '', '',
            days] + ['/'.join(map(str, x)) for x in R]
    for i in range(3):
        r = prev[i] if i < len(prev) else None
        if r is None:
            line += [''] * len(PK)
            continue
        ps = pos(r)
        ab = abroad(r['開催'])  # 海外の走は 着差・上り・4角 を空欄にそろえる(features.margin が着順から補う)
        line += [r['レース'], grade(r['レース']), place(r['開催']), r['距離'], r['馬場'], r['頭数'], r['人気'], r['着順'],
                 '' if ab else r['着差'], '' if ab else r['上り'], '' if ab or not ps else ps[-1]]
    line += [skipped] + [v for x in R for v in x]
    line += [fx(ten['初角率']), fx(ten['4角率']), fx(ten['上がり差']), fx(ten['逃げ率']), fx(ten['経験ペース差']), len(p5),
             fx(rate(mp[0], n_field)) if mp else '', fx(rate(mp[-1], n_field)) if mp else '', pace, '', '', e['horse_id']]
    r0 = prev[0] if prev else None
    g1mid = [r for r in g1 if r['距離'].startswith('芝') and lo <= dist(r) <= hi]
    g1tokyo = [r for r in g1 if place(r['開催']) == '東京']
    g1abroad = [r for r in g1 if abroad(r['開催'])]
    p0 = pos(r0) if r0 else []
    line += [r0['騎手'] if r0 else '',
             fx(rate(p0[-1], int(r0['頭数']))) if r0 and p0 and not abroad(r0['開催']) and r0['頭数'].isdigit() else '',
             (pp(r0)[1] if r0 and pp(r0) and not abroad(r0['開催']) else ''),
             '/'.join(map(str, rec(g1mid))), '/'.join(map(str, rec(g1tokyo))), '/'.join(map(str, rec(g1abroad))),
             (int(r0['騎手ID'] == e['騎手ID']) if r0 and r0['騎手ID'] and e['騎手ID'] else ''),  # 騎手IDで比較(未定は空欄)
             e.get('騎手ID', '')]
    return line


def main():
    global CACHE
    ap = argparse.ArgumentParser()
    ap.add_argument('--races', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--dist', default='2200-2600')
    ap.add_argument('--entries')
    ap.add_argument('--entries-year', type=int)
    ap.add_argument('--entries-date')
    ap.add_argument('--cache', default=CACHE)
    A = ap.parse_args()
    CACHE = A.cache
    lo, hi = map(int, A.dist.split('-'))
    dist_col = f'芝{lo}-{hi}成績'
    import csv
    races = list(csv.DictReader(open(A.races, encoding='utf-8-sig')))
    out = [header(dist_col)]
    err = []
    for i, rc in enumerate(races):
        day, baba, pace, rows = race_result(rc['race_id'])
        rows = [r for r in rows if re.match(r'\d+', r['着順'])]  # 取消・除外を除く(中止は着順が数字でないので除かれる→下で戻す)
        print(f'[{i + 1}/{len(races)}] {rc["年"]} {rc["race_id"]} {day} {len(rows)}頭', file=sys.stderr, flush=True)
        for e in rows:
            try:
                out.append(build_row(int(rc['年']), day, baba, pace, e, len(rows), lo, hi, dist_col))
            except Exception as ex:
                err.append(f'{rc["年"]} {e["馬名"]} {ex!r}')
    if A.entries:
        y, (yy, mm, dd) = A.entries_year, map(int, A.entries_date.split('-'))
        rows = shutuba(A.entries)
        for e in rows:
            try:
                out.append(build_row(y, date(yy, mm, dd), '', '', e, len(rows), lo, hi, dist_col))
            except Exception as ex:
                err.append(f'{y} {e["馬名"]} {ex!r}')
    with open(A.out, 'w', encoding='utf-8-sig', newline='') as f:
        csv.writer(f).writerows(out)
    print(f'完了 {len(out) - 1}行 エラー {len(err)}', err, file=sys.stderr)


if __name__ == '__main__':
    main()
