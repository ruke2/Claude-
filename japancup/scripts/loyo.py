"""1年除外検証。使い方:
python3 scripts/loyo.py data/japancup_1990_2026_data.csv --from 1990 --to 2025 [--lam 30] [--drop 外国馬,枠] [--out out/loyo.csv] [--foreign-zero]
係数・式を変えるときは、変更前後をこのスクリプトで比べてから採用する(CLAUDE.md)。
"""
import argparse, os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from jc.model import load, loyo, summarize, FEATS

ap = argparse.ArgumentParser()
ap.add_argument('data'); ap.add_argument('--from', dest='y0', type=int, default=2006); ap.add_argument('--to', dest='y1', type=int, default=2025)
ap.add_argument('--lam', type=float, default=30.0); ap.add_argument('--drop', default=''); ap.add_argument('--dist', default='芝2200-2600成績')
ap.add_argument('--out')
ap.add_argument('--foreign-zero', action='store_true', help='戦績の無い外国馬を欠損にせず 0 のまま使う(比較用)')
A = ap.parse_args()
d = load(A.data, A.dist, foreign_unknown=not A.foreign_zero)
years = [y for y in sorted(d['年'].unique()) if A.y0 <= y <= A.y1 and d.loc[d['年'] == y, '着順数値'].notna().any()]
feats = [f for f in FEATS if f not in set(filter(None, A.drop.split(',')))]
r = loyo(d, years, feats, A.lam)
print(json.dumps(summarize(r), ensure_ascii=False, indent=1))
if A.out:
    r.to_csv(A.out, index=False, encoding='utf-8-sig')
