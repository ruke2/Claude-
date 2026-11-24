"""学習データの広げ方の最終比較(README 6.5)。候補と採用ルールは結果を見る前に固定した。

python3 scripts/compare_final.py --out out/compare_final.json

候補(λ=30、基本+当日バイアス固定): A JCのみ / B G1重み0.3 / C G1重み1 / D JCのみ+近年重視τ5 / E JCのみ+τ10 /
F G1重み0.3+τ5 / G G1重み0.3+τ10 / H G1重み1+τ5 / I G1重み1+τ10
評価: JC の1年除外(2006〜2025年)。各年の予測はその年以外で学習するので、2006〜2020年と2021〜2025年は同じ結果の部分集合。
採用ルール: 2006〜2025年の PL負対数尤度が最小のもの。ただし 2021〜2025年の PL が A より悪いものは除く。
"""
import argparse, json, os, sys
from multiprocessing import Pool
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
from jc.model import load_pool, loyo, summarize, FEATS, BIAS

DATA = os.path.join(HERE, '..', 'data')
D = load_pool(f'{DATA}/japancup_1990_2026_data.csv', f'{DATA}/japancup_bias_1990_2025.csv',
              f'{DATA}/g1_2006_2026_data.csv', f'{DATA}/g1_bias_2006_2026.csv', f'{DATA}/jockey_year.csv')
JC = list(range(2006, 2026))
G1 = [int(k) for k in sorted(D.loc[(D['レース種別'] != 'JC') & D['着順数値'].notna(), '年'].unique())]
CANDS = {'A': (0.0, None), 'B': (0.3, None), 'C': (1.0, None), 'D': (0.0, 5), 'E': (0.0, 10),
         'F': (0.3, 5), 'G': (0.3, 10), 'H': (1.0, 5), 'I': (1.0, 10)}


def run(name):
    w, tau = CANDS[name]
    pool = JC + (G1 if w > 0 else [])
    r = loyo(D, JC, FEATS + BIAS, 30.0, pool=pool, weights={k: w for k in G1} if w > 0 else None, recency=tau)
    out = {}
    for lab, ys in [('2006-2025', JC), ('2006-2020', JC[:15]), ('2021-2025', JC[15:])]:
        s = summarize(r[r['年'].isin(ys)])
        out[lab] = {k: s[k] for k in ['PL負対数尤度', 'PL負対数尤度_人気だけ', '3着内対数損失', '3着内対数損失_人気だけ', '印8頭の3着内', '◎の3着内(年)', '勝ち馬が印内(年)']}
    return name, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    A = ap.parse_args()
    with Pool(4) as p:
        res = dict(p.map(run, list(CANDS)))
    ok = [n for n in res if res[n]['2021-2025']['PL負対数尤度'] <= res['A']['2021-2025']['PL負対数尤度'] + 1e-9]
    best = min(ok, key=lambda n: res[n]['2006-2025']['PL負対数尤度'])
    json.dump({'候補': {k: {'G1重み': v[0], 'τ': v[1]} for k, v in CANDS.items()}, '結果': res, '採用': best},
              open(A.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('候補 G1重み τ | 2006-2025 PL / LL | 2006-2020 PL | 2021-2025 PL / LL / 印')
    for n, (w, tau) in CANDS.items():
        r = res[n]
        print(n, w, tau, '|', r['2006-2025']['PL負対数尤度'], r['2006-2025']['3着内対数損失'], '|', r['2006-2020']['PL負対数尤度'], '|',
              r['2021-2025']['PL負対数尤度'], r['2021-2025']['3着内対数損失'], r['2021-2025']['印8頭の3着内'])
    print('人気だけ', res['A']['2006-2025']['PL負対数尤度_人気だけ'], res['A']['2006-2020']['PL負対数尤度_人気だけ'], res['A']['2021-2025']['PL負対数尤度_人気だけ'])
    print('採用', best)


if __name__ == '__main__':
    main()
