"""学習データを芝2000〜2500m 重賞まで広げたときの比較(README 6.6)。候補と採用ルールは結果を見る前に固定した。

python3 scripts/compare_expand.py --out out/compare_expand.json

候補(λ=30、基本+当日バイアス固定。評価は JC の1年除外 2006〜2025年):
  A  JCのみ(現行)
  B  JC + G1(天皇賞秋・有馬記念・宝塚記念)重み0.3(6.5 の参考)
  J1 JC + G1 + 重賞、JC 以外の重み0.1
  J2 同 重み0.3
  J3 同 重み1.0
  K1 階層学習(JC+G1+重賞で学習した係数を出発点に JC だけで差を学習)λ_jc=30
  K2 同 λ_jc=100
採用ルール: 2006〜2025年の PL負対数尤度が最小のもの。ただし 2021〜2025年の PL が A より悪いものは除く。
"""
import argparse, json, os, sys
from multiprocessing import Pool
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
from jc.model import load_pool, loyo, summarize, FEATS, BIAS

P = os.path.join(HERE, '..', 'data') + '/'
D = load_pool(P + 'japancup_1990_2026_data.csv', P + 'japancup_bias_1990_2025.csv', P + 'g1_2006_2026_data.csv',
              P + 'g1_bias_2006_2026.csv', P + 'jockey_year.csv', graded_path=P + 'graded_2011_2026_data.csv',
              graded_ids=P + 'graded_race_ids.csv', jc_ids=P + 'race_ids.csv', g1_ids=P + 'g1_race_ids.csv')
JC = list(range(2006, 2026))
lab = D.loc[D['着順数値'].notna()].groupby('年')['レース種別'].first()
G1 = [int(k) for k, v in lab.items() if v in ('天皇賞秋', '有馬記念', '宝塚記念')]
GR = [int(k) for k, v in lab.items() if str(v).startswith('重賞')]
CANDS = {'A': ('w', 0.0, False), 'B': ('w', 0.3, False), 'J1': ('w', 0.1, True), 'J2': ('w', 0.3, True), 'J3': ('w', 1.0, True),
         'K1': ('h', 30, True), 'K2': ('h', 100, True)}


def run(name):
    kind, v, graded = CANDS[name]
    others = G1 + (GR if graded else [])
    if kind == 'w':
        pool = JC + (others if v > 0 else [])
        r = loyo(D, JC, FEATS + BIAS, 30.0, pool=pool, weights={k: v for k in others} if v > 0 else None)
    else:
        r = loyo(D, JC, FEATS + BIAS, 30.0, pool=JC + others, hier=(30.0, float(v)))
    out = {}
    for lb, ys in [('2006-2025', JC), ('2006-2020', JC[:15]), ('2021-2025', JC[15:])]:
        s = summarize(r[r['年'].isin(ys)])
        out[lb] = {k: s[k] for k in ['PL負対数尤度', 'PL負対数尤度_人気だけ', '3着内対数損失', '3着内対数損失_人気だけ', '印8頭の3着内',
                                    '◎の3着内(年)', '勝ち馬が印内(年)']}
    return name, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    A = ap.parse_args()
    print('レース数 JC', len(JC), 'G1', len(G1), '重賞', len(GR), '頭数', int(D['着順数値'].notna().sum()), flush=True)
    with Pool(4) as p:
        res = dict(p.map(run, list(CANDS)))
    ok = [n for n in res if res[n]['2021-2025']['PL負対数尤度'] <= res['A']['2021-2025']['PL負対数尤度'] + 1e-9]
    best = min(ok, key=lambda n: res[n]['2006-2025']['PL負対数尤度'])
    json.dump({'候補': {k: list(v) for k, v in CANDS.items()}, 'レース数': {'G1': len(G1), '重賞': len(GR)}, '結果': res, '採用': best},
              open(A.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for n in CANDS:
        r = res[n]
        print(n, CANDS[n], '|', r['2006-2025']['PL負対数尤度'], r['2006-2025']['3着内対数損失'], '|', r['2006-2020']['PL負対数尤度'], '|',
              r['2021-2025']['PL負対数尤度'], r['2021-2025']['3着内対数損失'], r['2021-2025']['印8頭の3着内'])
    print('人気だけ', res['A']['2006-2025']['PL負対数尤度_人気だけ'], res['A']['2006-2020']['PL負対数尤度_人気だけ'],
          res['A']['2021-2025']['PL負対数尤度_人気だけ'])
    print('採用', best)


if __name__ == '__main__':
    main()
