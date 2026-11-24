"""JC + G1(天皇賞秋・有馬記念・宝塚記念)の混合学習の比較(README 6.5)。

python3 scripts/optimize_pool.py --out out/pool.json [--g1-bias data/g1_bias_2006_2026.csv] [--holdout-from 2021]

基準: JC の1年除外 PL負対数尤度(評価は JC だけ)。学習には JC 2006〜2025年と G1 2006〜2026年を使い、
G1 のレースには重み w を掛ける(w=0 は JC だけ)。予測年の JC と同じ年の有馬記念(JC より後)は学習から外す。
比較: w ∈ {0, 0.3, 0.5, 1} × 騎手ブロック有無 × 馬体重ブロック有無 × λ ∈ {10, 30, 100}。基本+当日バイアスは常に入れる。
"""
import argparse, json, os, sys
from multiprocessing import Pool
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
from jc.model import load_pool, loyo, summarize, FEATS, BIAS, JOCKEY, WEIGHT

D = None
DATA = os.path.join(HERE, '..', 'data')


def keys(w):
    jc = [y for y in range(2006, 2026)]
    g1 = sorted(D.loc[(D['レース種別'] != 'JC') & D['着順数値'].notna(), '年'].unique()) if w > 0 else []
    return jc + [int(k) for k in g1], {int(k): w for k in g1}


def score(args):
    feats, lam, w, years = args
    pool, wt = keys(w)
    r = loyo(D, years, list(feats), lam, pool=pool, weights=wt)
    return summarize(r)


def main():
    global D
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--g1-bias')
    ap.add_argument('--holdout-from', type=int)
    A = ap.parse_args()
    D = load_pool(f'{DATA}/japancup_1990_2026_data.csv', f'{DATA}/japancup_bias_1990_2025.csv',
                  f'{DATA}/g1_2006_2026_data.csv', A.g1_bias, f'{DATA}/jockey_year.csv')
    sel = list(range(2006, (A.holdout_from or 2026)))
    grid = [(w, jk, wt, lam) for w in (0.0, 0.3, 0.5, 1.0) for jk in (False, True) for wt in (False, True) for lam in (10, 30, 100)]
    feats = lambda jk, wt: tuple(FEATS + BIAS + (JOCKEY if jk else []) + (WEIGHT if wt else []))
    with Pool(4) as p:
        res = p.map(score, [(feats(jk, wt), lam, w, sel) for w, jk, wt, lam in grid])
        tab = [{'G1重み': g[0], '騎手': g[1], '馬体重': g[2], 'λ': g[3], 'PL': r['PL負対数尤度'], 'PL人気だけ': r['PL負対数尤度_人気だけ'],
                '3着内LL': r['3着内対数損失'], '印8頭の3着内': r['印8頭の3着内']} for g, r in zip(grid, res)]
        i = min(range(len(grid)), key=lambda k: res[k]['PL負対数尤度'])
        out = {'選択に使った評価年': [sel[0], sel[-1]], 'best': tab[i], 'table': sorted(tab, key=lambda r: r['PL'])}
        if A.holdout_from:
            ho = list(range(A.holdout_from, 2026))
            w, jk, wt, lam = grid[i]
            cmp = {'選択された設定': (feats(jk, wt), lam, w, ho), '前回採用(JCのみ・基本+当日バイアス・λ30)': (feats(False, False), 30, 0.0, ho)}
            r2 = p.map(score, list(cmp.values()))
            out['holdout'] = {k: v for k, v in zip(cmp, r2)}
    json.dump(out, open(A.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in out.items() if k != 'table'}, ensure_ascii=False, indent=1))
    for r in out['table'][:12]:
        print(r)


if __name__ == '__main__':
    main()
