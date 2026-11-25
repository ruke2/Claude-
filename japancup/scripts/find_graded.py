"""芝2000〜2500m の重賞(G1〜G3)の race_id を日付別レース一覧から集める(README 6.6)。

python3 scripts/find_graded.py --from 2011-01-01 --to 2026-11-23 --out data/graded_race_ids.csv [--cache data/raw]

対象日: 土・日・月(祝日開催)と、年始(1/1〜1/8)・年末(12/20〜12/31)の全日。
一覧ページ https://db.netkeiba.com/race/list/YYYYMMDD/ のレース名に (GI)/(GII)/(GIII) を含み、コースが 芝2000〜2500m のもの。
障害・2歳限定(レース名に 2歳 を含むもの、ホープフルS)は除く。
"""
import argparse, csv, os, re, sys
from datetime import date, timedelta
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch_netkeiba as F

ap = argparse.ArgumentParser()
ap.add_argument('--from', dest='a', required=True); ap.add_argument('--to', dest='b', required=True)
ap.add_argument('--out', required=True); ap.add_argument('--cache', default=F.CACHE)
A = ap.parse_args()
F.CACHE = A.cache
day, end = date.fromisoformat(A.a), date.fromisoformat(A.b)
rows = [['race_id', '開催日', 'レース名', 'コース', 'グレード', '出典URL']]
seen = set()
while day <= end:
    if day.weekday() in (5, 6, 0) or (day.month == 1 and day.day <= 8) or (day.month == 12 and day.day >= 20):
        u = f'https://db.netkeiba.com/race/list/{day:%Y%m%d}/'
        try:
            s = F.get(u)
        except RuntimeError as e:
            print('失敗', u, e, file=sys.stderr); day += timedelta(1); continue
        for a in s.select('a[href*="/race/"]'):
            m = re.search(r'/race/(\d{12})/', a.get('href', ''))
            t = a.get('title', '')
            if not m or m[1] in seen:
                continue
            g = re.search(r'\((GI|GII|GIII)\)$', t)
            if not g or '2歳' in t or 'ホープフル' in t:
                continue
            seen.add(m[1])
            txt = F.txt(a.find_parent(['dd', 'li', 'dl']) or a.parent)
            c = re.search(r'(芝|ダ|障)\s*(\d{4})m', txt[txt.find(t):] if t in txt else txt)
            if not c or c[1] != '芝' or not 2000 <= int(c[2]) <= 2500:
                continue
            rows.append([m[1], str(day), t, f'{c[1]}{c[2]}', {'GI': 'G1', 'GII': 'G2', 'GIII': 'G3'}[g[1]], u])
        if day.day == 1 or (day.weekday() == 0 and day.day <= 7):
            print(day, len(rows) - 1, file=sys.stderr, flush=True)
    day += timedelta(1)
csv.writer(open(A.out, 'w', encoding='utf-8-sig', newline='')).writerows(rows)
print('完了', len(rows) - 1, file=sys.stderr)
