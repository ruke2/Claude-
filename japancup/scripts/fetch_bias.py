"""JC 当日のトラックバイアス(前残り度・内外度)を netkeiba から集計する。

python3 scripts/fetch_bias.py --races data/race_ids.csv --out data/japancup_bias_1990_2025.csv [--cache data/raw]

対象: JC と同じ開催(race_id の先頭10桁が同じ)で、JC より前に行われた芝の平地レース(2021年以降は 1R〜11R、
それ以前は JC が 10R・11R のためそれより前)。各レースの1〜3着馬(同着を含む、着順が数字の馬)について
  4角率 =(最後のコーナー順位−1)/(頭数−1)、馬番率 =(馬番−1)/(頭数−1)
を求め、その日の平均を 当日4角率・当日馬番率 とする。
前残り度・内外度は、学習年(--base-from〜--base-to)の平均と標準偏差で標準化し、−2〜+2 に切った値:
  前残り度 = −(当日4角率 − 平均)/標準偏差(+ほど前有利)
  内外度   = −(当日馬番率 − 平均)/標準偏差(+ほど内有利)
本番(JC)の1〜3着馬の 4角率・馬番率 も参考に出す(バイアスの計算には使わない)。
当日の値は scripts/day_bias.py で同じ定義・同じ平均と標準偏差を使って計算する。
"""
import argparse, csv, os, re, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch_netkeiba as F


def race_top3(race_id):
    """(芝の平地か, 頭数, [(4角率, 馬番率), ...] 1〜3着)"""
    s = F.get(f'https://db.netkeiba.com/race/{race_id}/')
    intro = F.txt(s.select_one('.data_intro'))
    head = intro.split('/')[0]
    turf = bool(re.search(r'芝', head)) and '障' not in head
    rows = F.table_rows(s.select_one('table.race_table_01'))
    fin = [r for r in rows if re.match(r'\d+', F.txt(r['着順']))]
    n = len(fin)
    out = []
    for r in fin:
        if int(re.match(r'\d+', F.txt(r['着順']))[0]) > 3:
            continue
        ps = [int(x) for x in F.txt(r.get('通過')).split('-') if x.isdigit()]
        if not ps or n < 2:
            continue
        out.append(((ps[-1] - 1) / (n - 1), (int(F.txt(r['馬番'])) - 1) / (n - 1)))
    return turf, n, out


def day_races(date_str, jc_id):
    """同じ開催で JC より前のレースID"""
    s = F.get(f'https://db.netkeiba.com/race/list/{date_str.replace("-", "")}/')
    ids = sorted(set(re.findall(r'/race/(\d{12})/', str(s))))
    return [i for i in ids if i[:10] == jc_id[:10] and int(i[10:]) < int(jc_id[10:])]


def standardize(rows, y0, y1):
    base = [r for r in rows if y0 <= r['年'] <= y1 and r['当日4角率'] != '']
    m4, s4 = np.mean([r['当日4角率'] for r in base]), np.std([r['当日4角率'] for r in base], ddof=1)
    mu, su = np.mean([r['当日馬番率'] for r in base]), np.std([r['当日馬番率'] for r in base], ddof=1)
    return m4, s4, mu, su


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--races', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--cache', default=F.CACHE)
    ap.add_argument('--base-from', type=int, default=1990)
    ap.add_argument('--base-to', type=int, default=2025)
    A = ap.parse_args()
    F.CACHE = A.cache
    rows = []
    for rc in csv.DictReader(open(A.races, encoding='utf-8-sig')):
        y, jc = int(rc['年']), rc['race_id']
        pts, nr = [], 0
        for i in day_races(rc['開催日'], jc):
            turf, n, top = race_top3(i)
            if turf and top:
                nr += 1
                pts += top
        _, _, jtop = race_top3(jc)
        rows.append({'年': y, '当日4角率': float(np.mean([p[0] for p in pts])) if pts else '',
                     '当日馬番率': float(np.mean([p[1] for p in pts])) if pts else '', '対象馬': len(pts), '芝レース数': nr,
                     '本番3着内の4角率': float(np.mean([p[0] for p in jtop])), '本番3着内の馬番率': float(np.mean([p[1] for p in jtop]))})
        print(y, nr, len(pts), file=sys.stderr, flush=True)
    m4, s4, mu, su = standardize(rows, A.base_from, A.base_to)
    with open(A.out, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['年', '前残り度', '内外度', '対象馬', '芝レース数', '本番3着内の4角率', '本番3着内の馬番率', '当日4角率', '当日馬番率'])
        for r in rows:
            fb = '' if r['当日4角率'] == '' else float(np.clip(-(r['当日4角率'] - m4) / s4, -2, 2))
            io = '' if r['当日馬番率'] == '' else float(np.clip(-(r['当日馬番率'] - mu) / su, -2, 2))
            f3 = lambda v: '' if v == '' else f'{v:.3f}'
            w.writerow([r['年'], f3(fb), f3(io), r['対象馬'], r['芝レース数'], f3(r['本番3着内の4角率']), f3(r['本番3着内の馬番率']),
                        f3(r['当日4角率']), f3(r['当日馬番率'])])
    print(f'標準化の基準({A.base_from}〜{A.base_to}): 当日4角率 平均 {m4:.4f} 標準偏差 {s4:.4f} / 当日馬番率 平均 {mu:.4f} 標準偏差 {su:.4f}',
          file=sys.stderr)


if __name__ == '__main__':
    main()
