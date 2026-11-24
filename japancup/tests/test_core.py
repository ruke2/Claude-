"""python3 -m pytest -q tests  または  python3 tests/test_core.py
tennosho_ref.csv は天皇賞・秋プロジェクトの学習データ(2006〜2026)。列の形式が同じなので、パイプラインの検査に使う。
"""
import itertools, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
import numpy as np, pandas as pd
from jc.features import build
from jc import model as M

REF = os.path.join(HERE, 'tennosho_ref.csv')


def test_features_match_reference():
    d = pd.read_csv(REF, encoding='utf-8-sig')
    b = build(d, dist_col='芝1800-2200成績', overwrite=True)
    bad = {}
    for f in ['前走着差', '前走G1', '近3走G1G2最小着差', 'G1勝利数', 'G1連対圏率', 'G1出走なし', '東京芝3着内率', '通算勝率',
              '3歳', '6歳以上', '牝馬', '前走人気', '近3走平均着順', '美浦所属', '前走東京', '上がり差', '初角率']:
        a, r = b['特徴_' + f].astype(float), d['特徴_' + f].astype(float)
        ok = np.isclose(a.fillna(-999), r.fillna(-999), atol=1e-3)
        if not ok.all():
            bad[f] = int((~ok).sum())
    assert not bad, bad


def test_harville_bruteforce():
    rng = np.random.default_rng(0)
    s = rng.normal(size=6)
    pw, p3 = M.harville(s)
    p = np.exp(s) / np.exp(s).sum()
    bf = np.zeros(6)
    for i, j, k in itertools.permutations(range(6), 3):
        pr = p[i] * p[j] / (1 - p[i]) * p[k] / (1 - p[i] - p[j])
        bf[[i, j, k]] += pr
    assert np.allclose(p3, bf) and abs(pw.sum() - 1) < 1e-12 and abs(p3.sum() - 3) < 1e-9


def test_day_formula_matches_model():
    d = M.load(REF, dist_col='芝1800-2200成績')
    years = list(range(2006, 2026))
    pm = M.mean_pace(d, years)
    assert abs(pm - 0.98) < 0.01  # 天皇賞・秋 README の平均 0.98
    m = M.fit(d, M.design(d, pm), years)
    y = 2025
    tab, coef = M.day_table(m, d, y, pm)
    g = d[d['年'] == y]
    t = M.day_score(tab, coef, dict(zip(g['馬名'], g['単勝オッズ'])), umaban=dict(zip(g['馬名'], g['馬番'])))
    s = M.linear(m, M.design(d, pm, pace=pm).loc[g.index])
    _, p3 = M.harville(s)
    ref = dict(zip(g['馬名'], p3 * 100))
    assert np.allclose(t['3着内スコア'], t['馬名'].map(ref), atol=1e-6)


def test_day_formula_with_bias_matches_model():
    """JC データ・当日バイアス込みで、当日式(day_score)とモデル本体のスコアが一致する"""
    data = os.path.join(HERE, '..', 'data', 'japancup_1990_2026_data.csv')
    bias = os.path.join(HERE, '..', 'data', 'japancup_bias_1990_2025.csv')
    if not os.path.exists(bias) or pd.read_csv(data, encoding='utf-8-sig').empty:
        return
    d = M.load(data, bias=bias)
    years = list(range(2006, 2025))
    pm = M.mean_pace(d, years)
    m = M.fit(d, M.design(d, pm), years, M.FEATS + M.BIAS)
    y = 2025
    g = d[d['年'] == y]
    tab, coef = M.day_table(m, d, y, pm)
    fb, io = float(g['前残り度'].iloc[0]), float(g['内外度'].iloc[0])
    t = M.day_score(tab, coef, dict(zip(g['馬名'], g['単勝オッズ'])), fb=fb, io=io,
                    umaban=dict(zip(g['馬名'], g['馬番'])), kfb=coef['kfb'], kio=coef['kio'])
    s = M.linear(m, M.design(d, pm, pace=pm).loc[g.index])
    _, p3 = M.harville(s)
    assert np.allclose(t['3着内スコア'], t['馬名'].map(dict(zip(g['馬名'], p3 * 100))), atol=1e-6)


if __name__ == '__main__':
    for k, f in list(globals().items()):
        if k.startswith('test_'):
            f(); print('ok', k)
