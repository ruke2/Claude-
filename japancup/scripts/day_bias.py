"""JC 当日の 前残り度・内外度 を、JC より前に終わった芝の平地レースから計算する(定義は scripts/fetch_bias.py と同じ)。

python3 scripts/day_bias.py --date 2026-11-29 --jc 202605050812 [--upto 11] [--bias data/japancup_bias_1990_2025.csv]

- レース結果は race.netkeiba.com の結果ページ(当日の速報)から取る。結果が出ていないレースは飛ばす
- 標準化の平均・標準偏差は data/japancup_bias_1990_2025.csv の 当日4角率・当日馬番率(1990〜2025年)から計算する
- 出力の 前残り度・内外度 を score_day.py の --fb・--io に渡す
"""
import argparse, os, re, sys
import numpy as np
import pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch_netkeiba as F


def top3(race_id, cache):
    url = f'https://race.netkeiba.com/race/result.html?race_id={race_id}'
    if not cache:  # 当日は毎回取り直す
        p = os.path.join(F.CACHE, __import__('hashlib').md5(url.encode()).hexdigest() + '.html')
        if os.path.exists(p):
            os.remove(p)
    s = F.get(url)
    info = F.txt(s.select_one('.RaceData01'))
    t = s.select_one('table#All_Result_Table')
    if t is None:
        return None, None, []
    turf = bool(re.search(r'/\s*芝', info)) and '障' not in info
    rows = [r for r in F.table_rows(t) if re.match(r'\d+', F.txt(r['着順']))]
    n = len(rows)
    out = []
    for r in rows:
        if int(re.match(r'\d+', F.txt(r['着順']))[0]) > 3:
            continue
        ps = [int(x) for x in F.txt(r.get('コーナー通過順')).split('-') if x.isdigit()]
        if ps and n >= 2:
            out.append(((ps[-1] - 1) / (n - 1), (int(F.txt(r['馬番'])) - 1) / (n - 1)))
    return turf, n, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--date', required=True)
    ap.add_argument('--jc', required=True)
    ap.add_argument('--upto', type=int, help='このレース番号まで使う(既定: JC の1つ前)')
    ap.add_argument('--bias', default=os.path.join(HERE, '..', 'data', 'japancup_bias_1990_2025.csv'))
    ap.add_argument('--cache', default=F.CACHE)
    ap.add_argument('--use-cache', action='store_true', help='過去日の検証用。保存済みのページを使う')
    A = ap.parse_args()
    F.CACHE = A.cache
    upto = A.upto or int(A.jc[10:]) - 1
    pts, used = [], []
    for k in range(1, upto + 1):
        rid = A.jc[:10] + f'{k:02d}'
        turf, n, top = top3(rid, A.use_cache)
        if turf and top:
            pts += top
            used.append(f'{k}R')
    b = pd.read_csv(A.bias, encoding='utf-8-sig')
    m4, s4 = b['当日4角率'].mean(), b['当日4角率'].std(ddof=1)
    mu, su = b['当日馬番率'].mean(), b['当日馬番率'].std(ddof=1)
    if not pts:
        raise SystemExit('結果の出た芝レースが無い')
    a4, au = float(np.mean([p[0] for p in pts])), float(np.mean([p[1] for p in pts]))
    fb = float(np.clip(-(a4 - m4) / s4, -2, 2))
    io = float(np.clip(-(au - mu) / su, -2, 2))
    print(f'使った芝レース: {",".join(used)}(1〜3着 {len(pts)}頭)')
    print(f'当日4角率 {a4:.3f}(基準 {m4:.4f}±{s4:.4f}) → 前残り度 {fb:+.3f}')
    print(f'当日馬番率 {au:.3f}(基準 {mu:.4f}±{su:.4f}) → 内外度 {io:+.3f}')
    print(f'--fb {fb:.3f} --io {io:.3f}')


if __name__ == '__main__':
    main()
