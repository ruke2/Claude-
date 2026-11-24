"""当日の再計算(README 5.3)。
python3 scripts/score_day.py out/model_2026.json out/japancup_2026_tenkai.csv data/odds_1129_1510.csv \
    [--pace 1.2] [--fb 0] [--io 0] [--umaban data/umaban_1126.csv] [--out out/day.csv]
odds CSV: 馬名,単勝オッズ(取消・除外は空欄)  umaban CSV: 馬名,馬番
前後・内外の補正係数 kfb/kio は README 5.4 で検証して決めるまで 0。
"""
import argparse, os, sys, json
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import pandas as pd
from jc.model import day_score

ap = argparse.ArgumentParser()
ap.add_argument('model'); ap.add_argument('tenkai'); ap.add_argument('odds')
ap.add_argument('--pace', type=float); ap.add_argument('--fb', type=float, default=0.0); ap.add_argument('--io', type=float, default=0.0)
ap.add_argument('--kfb', type=float, default=0.0); ap.add_argument('--kio', type=float, default=0.0)
ap.add_argument('--umaban'); ap.add_argument('--out')
A = ap.parse_args()
coef = json.load(open(A.model, encoding='utf-8'))['day']
tab = pd.read_csv(A.tenkai, encoding='utf-8-sig')
od = pd.read_csv(A.odds, encoding='utf-8-sig')
miss = set(od['馬名']) - set(tab['馬名'])
if miss:
    raise SystemExit(f'展開表に無い馬: {miss}')
uma = None
if A.umaban:
    u = pd.read_csv(A.umaban, encoding='utf-8-sig')
    uma = dict(zip(u['馬名'], u['馬番']))
t = day_score(tab, coef, dict(zip(od['馬名'], pd.to_numeric(od['単勝オッズ'], errors='coerce'))),
              pace=A.pace, fb=A.fb, io=A.io, umaban=uma, kfb=A.kfb, kio=A.kio)
pace = coef['平均ペース'] if A.pace is None else A.pace
print(f'条件: ペース{pace:.2f} 前後{A.fb:+} 内外{A.io:+} 頭数{len(t)}')
cols = ['印', '馬名'] + (['馬番'] if uma else []) + ['人気', '単勝オッズ', '3着内スコア', '推定勝率%', '人気だけ3着内%', 'モデル/人気']
pd.set_option('display.width', 200)
print(t[cols].round(3).to_string(index=False))
print(f"検算(丸め前) 勝率合計 {t['推定勝率%'].sum():.6f} / 3着内合計 {t['3着内スコア'].sum():.6f}")
print(f"検算(表示値) 勝率合計 {t['推定勝率%'].round(3).sum():.3f} / 3着内合計 {t['3着内スコア'].round(3).sum():.3f}")
if A.out:
    t[cols].round(3).to_csv(A.out, index=False, encoding='utf-8-sig')
