"""期待値による買い方の検証(README 9章)。手順と採用ルールは結果を見る前に固定した。

python3 scripts/backtest_bet.py --out out/backtest.csv

予測: 前向き検証。暦年 Y のレースを、Y より前の全レース(JC 2006〜・G1 2006〜・芝2000〜2500m 重賞 2011〜)で学習したモデルで予測。
      モデルは 基本+当日バイアス、λ=30(当日バイアスは JC・G1 のみ、重賞は 0)。対象は 2011〜2026年で結果のあるレース。
買い方(1点100円の均一買い):
  単勝: 推定勝率 × 確定単勝オッズ ≥ θ。θ ∈ {1.0, 1.1, 1.2, 1.3, 1.5}、オッズ上限 ∈ {なし, 30倍}
  複勝: モデル3着内確率 / 人気だけ3着内確率 ≥ r。r ∈ {1.1, 1.2, 1.3, 1.5}
採用ルール: 開発期間 2011〜2020年で回収率が最大(買い目100点以上)のものを馬券種ごとに選び、
            検証期間 2021〜2026年の回収率を一度だけ出す。95%信頼区間はレース単位のブートストラップ(2000回)。
注意: 確定オッズを使うため、発走前に買う実際のオッズとはずれる。複勝の払戻はデータの 複勝払戻(3着内馬のみ)。
"""
import argparse, os, sys
import numpy as np
import pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
from jc.model import load_pool, design, fit, linear, harville, mean_pace, FEATS, BIAS

P = os.path.join(HERE, '..', 'data') + '/'


def predictions():
    D = load_pool(P + 'japancup_1990_2026_data.csv', P + 'japancup_bias_1990_2025.csv', P + 'g1_2006_2026_data.csv',
                  P + 'g1_bias_2006_2026.csv', P + 'jockey_year.csv', graded_path=P + 'graded_2011_2026_data.csv',
                  graded_ids=P + 'graded_race_ids.csv', jc_ids=P + 'race_ids.csv', g1_ids=P + 'g1_race_ids.csv')
    D = D[(D['暦年'] >= 2006)]
    lab = D[D['着順数値'].notna() & D['単勝オッズ'].notna()]
    keys = lab.groupby('年')['暦年'].first()
    feats = FEATS + BIAS
    rows = []
    for Y in range(2011, 2027):
        tr = [int(k) for k, y in keys.items() if y < Y]
        te = [int(k) for k, y in keys.items() if y == Y]
        if not te:
            continue
        pm = mean_pace(D, tr)
        m = fit(D, design(D, pm), tr, feats, 30.0)
        Xn = design(D, pm, pace=pm)
        for k in te:
            g = D[D['年'] == k]
            if g['単勝オッズ'].isna().any() or len(g) < 5:
                continue
            s = linear(m, Xn.loc[g.index])
            pw, p3 = harville(s)
            q = (1 / g['単勝オッズ']).values
            q = q / q.sum()
            _, p3m = harville(np.log(q))
            rows.append(pd.DataFrame({'暦年': Y, 'レース': k, 'レース種別': g['レース種別'].values, '馬名': g['馬名'].values,
                                      '着順': g['着順数値'].values, '単勝オッズ': g['単勝オッズ'].values,
                                      '複勝払戻': pd.to_numeric(g['複勝払戻'], errors='coerce').fillna(0).values,
                                      'p勝': pw, 'p3': p3, 'p3人気': p3m, '市場勝率': q}))
        print(Y, len(te), file=sys.stderr, flush=True)
    return pd.concat(rows, ignore_index=True)


def evaluate(r, mask, kind):
    b = r[mask]
    pay = np.where(b['着順'] == 1, b['単勝オッズ'] * 100, 0.0) if kind == '単勝' else b['複勝払戻'].values
    return len(b), float(pay.sum()), b['レース'].values, pay


def roi_ci(r, mask, kind, rng, n=2000):
    nb, tot, races, pay = evaluate(r, mask, kind)
    if nb == 0:
        return 0, np.nan, (np.nan, np.nan), 0
    df = pd.DataFrame({'レース': races, '払戻': pay, '点': 1}).groupby('レース').sum()
    allr = r['レース'].unique()
    df = df.reindex(allr, fill_value=0)
    v = df.values
    bs = []
    for _ in range(n):
        idx = rng.integers(0, len(v), len(v))
        s = v[idx].sum(0)
        bs.append(s[0] / (100 * s[1]) if s[1] > 0 else np.nan)
    hits = int((pay > 0).sum())
    return nb, tot / (100 * nb), tuple(np.nanpercentile(bs, [2.5, 97.5])), hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    A = ap.parse_args()
    r = predictions()
    r.to_csv(A.out, index=False, encoding='utf-8-sig')
    rng = np.random.default_rng(0)
    dev, test = r[r['暦年'] <= 2020], r[r['暦年'] >= 2021]
    print('レース数 開発', dev['レース'].nunique(), '検証', test['レース'].nunique())
    rules = {}
    for th in (1.0, 1.1, 1.2, 1.3, 1.5):
        for cap in (None, 30):
            rules[f'単勝 EV≥{th}' + (f' オッズ≤{cap}' if cap else '')] = ('単勝', lambda x, th=th, cap=cap: (x['p勝'] * x['単勝オッズ'] >= th) & (x['単勝オッズ'] <= (cap or 1e9)))
    for rr in (1.1, 1.2, 1.3, 1.5):
        rules[f'複勝 モデル/人気≥{rr}'] = ('複勝', lambda x, rr=rr: x['p3'] / x['p3人気'] >= rr)
    base = {'単勝 全頭(参考)': ('単勝', lambda x: x['p勝'] >= 0), '複勝 全頭(参考)': ('複勝', lambda x: x['p3'] >= 0),
            '単勝 モデル1位(参考)': ('単勝', lambda x: x.groupby('レース')['p勝'].rank(ascending=False, method='first') == 1),
            '複勝 モデル1位(参考)': ('複勝', lambda x: x.groupby('レース')['p3'].rank(ascending=False, method='first') == 1)}
    print('\n== 開発期間 2011〜2020年')
    res = {}
    for name, (kind, f) in {**base, **rules}.items():
        nb, roi, ci, hits = roi_ci(dev, f(dev), kind, rng)
        res[name] = (kind, nb, roi)
        print(f'{name:28s} 点数 {nb:5d} 的中 {hits:4d} 回収率 {roi:.3f} 95%CI {ci[0]:.3f}〜{ci[1]:.3f}')
    print('\n== 採用(開発期間で回収率最大、100点以上)→ 検証期間 2021〜2026年')
    for kind in ('単勝', '複勝'):
        cand = [n for n, v in res.items() if v[0] == kind and n in rules and v[1] >= 100]
        best = max(cand, key=lambda n: res[n][2])
        f = rules[best][1]
        nb, roi, ci, hits = roi_ci(test, f(test), kind, rng)
        nb0, roi0, ci0, h0 = roi_ci(test, base[f'{kind} 全頭(参考)'][1](test), kind, rng)
        print(f'{kind}: {best}(開発 回収率 {res[best][2]:.3f}、{res[best][1]}点)')
        print(f'   検証 点数 {nb} 的中 {hits} 回収率 {roi:.3f} 95%CI {ci[0]:.3f}〜{ci[1]:.3f} / 参考 全頭買い {roi0:.3f}')


if __name__ == '__main__':
    main()
