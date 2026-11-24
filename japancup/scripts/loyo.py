"""1年除外検証。使い方:
python3 scripts/loyo.py data/japancup_1990_2026_data.csv --from 1990 --to 2025 [--lam 30] [--drop 外国馬,枠] [--out out/loyo.csv] [--foreign-zero]
係数・式を変えるときは、変更前後をこのスクリプトで比べてから採用する(CLAUDE.md)。
"""
import argparse, os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from jc.model import JC_CAND, ERA, BIAS, load, loyo, summarize, FEATS

ap = argparse.ArgumentParser()
ap.add_argument('data'); ap.add_argument('--from', dest='y0', type=int, default=2006); ap.add_argument('--to', dest='y1', type=int, default=2025)
ap.add_argument('--bias', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'japancup_bias_1990_2025.csv'));
ap.add_argument('--blocks', default='当日バイアス', help='FEATS に足すブロック(カンマ区切り): JC追加,時代×市場,当日バイアス。空文字で基本のみ');
ap.add_argument('--lam', type=float, default=30.0); ap.add_argument('--drop', default=''); ap.add_argument('--dist', default='芝2200-2600成績')
ap.add_argument('--out')
ap.add_argument('--foreign-zero', action='store_true', help='戦績の無い外国馬を欠損にせず 0 のまま使う(比較用)')
A = ap.parse_args()
d = load(A.data, A.dist, foreign_unknown=not A.foreign_zero, bias=A.bias or None)
years = [y for y in sorted(d['年'].unique()) if A.y0 <= y <= A.y1 and d.loc[d['年'] == y, '着順数値'].notna().any()]
BL = {'JC追加': JC_CAND, '時代×市場': ERA, '当日バイアス': BIAS}
FE = FEATS + [f for b in filter(None, A.blocks.split(',')) for f in BL[b]]
feats = [f for f in FE if f not in set(filter(None, A.drop.split(',')))]
r = loyo(d, years, feats, A.lam)
print(json.dumps(summarize(r), ensure_ascii=False, indent=1))
if A.out:
    r.to_csv(A.out, index=False, encoding='utf-8-sig')
