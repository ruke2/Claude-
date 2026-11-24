"""学習して、対象年の 展開表(基礎値a・ペース感応度b)・係数・中立スコアを出す。
python3 scripts/train.py data/japancup_1990_2026_data.csv --year 2026 --from 1990 --to 2025 --outdir out
出力: out/model_YEAR.json(係数・当日式の係数)、out/japancup_YEAR_tenkai.csv、out/japancup_YEAR_scores.csv
中立スコアは データの 単勝オッズ 列(予想オッズなど)と平均ペースで計算する。オッズが空なら スコアは出さない。
"""
import argparse, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import numpy as np, pandas as pd
from jc.model import load, design, fit, day_table, day_score, save_model, mean_pace, FEATS

ap = argparse.ArgumentParser()
ap.add_argument('data'); ap.add_argument('--year', type=int, default=2026)
ap.add_argument('--from', dest='y0', type=int, default=1990); ap.add_argument('--to', dest='y1', type=int, default=2025)
ap.add_argument('--lam', type=float, default=30.0); ap.add_argument('--dist', default='芝2200-2600成績'); ap.add_argument('--outdir', default='out')
A = ap.parse_args()
os.makedirs(A.outdir, exist_ok=True)
d = load(A.data, A.dist)
years = [y for y in sorted(d['年'].unique()) if A.y0 <= y <= A.y1 and d.loc[d['年'] == y, '着順数値'].notna().any()]
pm = mean_pace(d, years)
m = fit(d, design(d, pm), years, FEATS, A.lam)
tab, coef = day_table(m, d, A.year, pm)
paces = [('ハイ(前後半差-1.0秒)', -1.0), ('やや速い(0.0秒)', 0.0), (f'平均({pm:.2f}秒)', pm), ('ややスロー(2.0秒)', 2.0), ('スロー(3.0秒)', 3.0), ('超スロー(4.0秒)', 4.0)]
g = d[d['年'] == A.year]
odds = dict(zip(g['馬名'], g['単勝オッズ']))
if g['単勝オッズ'].notna().all():
    for nm, p in paces:
        t = day_score(tab, coef, odds, pace=p)
        tab[nm] = tab['馬名'].map(dict(zip(t['馬名'], t['3着内スコア'].round(3))))
    t = day_score(tab, coef, odds)
    t.round(3).to_csv(f'{A.outdir}/japancup_{A.year}_scores.csv', index=False, encoding='utf-8-sig')
    print(t[['印', '馬名', '人気', '単勝オッズ', '3着内スコア', '推定勝率%', '人気だけ3着内%']].round(3).to_string(index=False))
    print(f"検算 勝率合計 {t['推定勝率%'].sum():.6f} / 3着内合計 {t['3着内スコア'].sum():.6f}")
else:
    print('対象年の単勝オッズが空のため、スコアは出さない(展開表と係数だけ出力)')
tab.to_csv(f'{A.outdir}/japancup_{A.year}_tenkai.csv', index=False, encoding='utf-8-sig')
save_model(m, coef, f'{A.outdir}/model_{A.year}.json')
print('学習年', years[0], '-', years[-1], f'({len(years)}年) 平均ペース {pm:.3f}')
print('係数(生の単位)', {k: round(float(v), 4) for k, v in zip(m['feats'], np.array(m['w']) / np.array(m['sd'])) if abs(v) > 1e-6})
