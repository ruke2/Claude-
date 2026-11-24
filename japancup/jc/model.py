"""ジャパンカップ予想モデルの本体。
構造は天皇賞・秋 第13版(README 5.1)と同じ:
- Plackett-Luce 型の順位モデル(上位3着の順序で学習)、s = Σ 標準化特徴量 × 係数
- 係数の向きを固定(SIGN)、log市場確率 以外は λ で縮める
- 勝率 = softmax(s)、3着内確率は Harville 式で厳密計算
係数は JC のデータで学習する。天皇賞・秋の係数は使わない。
"""
import json
import numpy as np
import pandas as pd
from scipy.optimize import minimize
from .features import build, pace_diff

BASE = ['前走着差', '前走G1', '近3走G1G2最小着差', 'G1勝利数', 'G1連対圏率', 'G1出走なし', '東京芝3着内率', '通算勝率',
        '3歳', '6歳以上', '牝馬', '前走人気', '近3走平均着順', '美浦所属', '前走海外', '前走東京', '上がり差', '初角率']
PACE = ['先行×ペース', '上がり×ペース']
MARKET = ['log市場確率']
NINKI = ['1番人気', '2番人気', '6-9番人気', '10番人気以下']
GATE = ['枠']
EXTRA = ['外国馬']
FEATS = BASE + PACE + MARKET + NINKI + GATE + EXTRA

# +: 大きいほど加点に固定、−: 減点に固定、記載なし: 自由
POS = {'前走G1', 'G1勝利数', 'G1連対圏率', '東京芝3着内率', '通算勝率', '前走東京', 'log市場確率'}
NEG = {'前走着差', '近3走G1G2最小着差', 'G1出走なし', '6歳以上', '前走人気', '近3走平均着順', '上がり差', '枠'}
# 前走海外は天皇賞・秋では減点固定だったが、JC は外国馬が海外帰りで出るため自由にする(要検証)


def load(path, dist_col='芝2200-2600成績', foreign_unknown=True):
    d = pd.read_csv(path, encoding='utf-8-sig')
    d = build(d, dist_col=dist_col, foreign_unknown=foreign_unknown)
    d['着順数値'] = pd.to_numeric(d['着順'].astype(str).str.extract(r'^(\d+)')[0], errors='coerce')
    d['本番ペース差'] = d['展開_本番ペース'].map(pace_diff) if '展開_本番ペース' in d else np.nan
    d['単勝オッズ'] = pd.to_numeric(d['単勝オッズ'], errors='coerce')
    return d.reset_index(drop=True)


def mean_pace(d, years):
    return float(d[d['年'].isin(years)].groupby('年')['本番ペース差'].first().mean())


def design(d, pm, pace=None):
    """特徴量行列。pace=None なら実際の本番ペース(欠損は pm)、数値ならその想定ペースを全馬に使う"""
    X = pd.DataFrame(index=d.index)
    for f in BASE:
        X[f] = pd.to_numeric(d['特徴_' + f], errors='coerce')
    pc = (d['本番ペース差'].fillna(pm) if pace is None else pd.Series(float(pace), index=d.index)) - pm
    X['先行×ペース'] = (0.5 - X['初角率']) * pc
    X['上がり×ペース'] = X['上がり差'] * pc
    q = 1 / d['単勝オッズ']
    q = q / q.groupby(d['年']).transform('sum')
    X['log市場確率'] = np.log(q)
    rk = q.groupby(d['年']).rank(ascending=False, method='first')
    X['1番人気'] = (rk == 1).astype(float)
    X['2番人気'] = (rk == 2).astype(float)
    X['6-9番人気'] = rk.between(6, 9).astype(float)
    X['10番人気以下'] = (rk >= 10).astype(float)
    n = d.groupby('年')['馬名'].transform('size')
    posn = (pd.to_numeric(d['馬番'], errors='coerce') - 1) / (n - 1)
    X['枠'] = ((n >= 16).astype(float) * (posn - 0.5)).fillna(0.0)
    X['外国馬'] = pd.to_numeric(d['外国馬'], errors='coerce').fillna(0.0)
    return X


def harville(s):
    """線形スコア s → (勝率, 3着内確率)。Harville 式の厳密計算"""
    s = np.asarray(s, float)
    e = np.exp(s - s.max())
    p = e / e.sum()
    n = len(p)
    one = 1 - p
    # 2着: P(j1着, i2着) = p_j p_i / (1 - p_j)
    P2 = np.outer(p, p) / one[:, None]
    np.fill_diagonal(P2, 0)
    p2 = P2.sum(axis=0)
    # 3着: P(j1, k2, i3) = p_j p_k/(1-p_j) p_i/(1-p_j-p_k)
    p3 = np.zeros(n)
    for j in range(n):
        for k in range(n):
            if k == j:
                continue
            rest = 1 - p[j] - p[k]
            if rest <= 0:
                continue
            w = p[j] * p[k] / one[j] / rest
            add = w * p
            add[j] = 0
            add[k] = 0
            p3 += add
    return p, p + p2 + p3


def _top3(g):
    o = g['着順数値'].values
    order = [i for i in np.argsort(np.where(np.isnan(o), 99, o), kind='stable') if not np.isnan(o[i])]
    return order[:3]


def fit(d, X, years, feats=FEATS, lam=30.0, fill=None):
    tr = d.index[d['年'].isin(years) & d['着順数値'].notna().groupby(d['年']).transform('any')]
    Xt = X.loc[tr, feats]
    fill = Xt.mean() if fill is None else fill
    mu = Xt.fillna(fill).mean()
    sd = Xt.fillna(fill).std().replace(0, 1).fillna(1)
    Z = ((X[feats].fillna(fill) - mu) / sd).values
    races = [(d.index[d['年'] == y].values, _top3(d[d['年'] == y])) for y in sorted(set(d.loc[tr, '年']))]
    pen = np.array([0.0 if f in MARKET else lam for f in feats])

    def nll(w):
        tot, grad = 0.0, np.zeros_like(w)
        for rows, top in races:
            Zr = Z[rows]
            s = Zr @ w
            alive = np.ones(len(rows), bool)
            for t in top:
                ss = s[alive]
                m = ss.max()
                e = np.exp(ss - m)
                p = e / e.sum()
                tot -= s[t] - (m + np.log(e.sum()))
                grad -= Zr[t] - p @ Zr[alive]
                alive[t] = False
        return tot + (pen * w * w).sum(), grad + 2 * pen * w

    bnd = [(0, None) if f in POS else (None, 0) if f in NEG else (None, None) for f in feats]
    w = minimize(nll, np.zeros(len(feats)), jac=True, method='L-BFGS-B', bounds=bnd).x
    return {'feats': list(feats), 'w': w.tolist(), 'mu': mu.tolist(), 'sd': sd.tolist(), 'fill': fill.tolist(), 'lam': lam}


def linear(model, X):
    f = model['feats']
    Z = (X[f].fillna(pd.Series(model['fill'], index=f)) - np.array(model['mu'])) / np.array(model['sd'])
    return Z.values @ np.array(model['w'])


def pl_nll(s, top):
    s = np.asarray(s, float)
    alive = np.ones(len(s), bool)
    tot = 0.0
    for t in top:
        ss = s[alive]
        m = ss.max()
        tot -= s[t] - (m + np.log(np.exp(ss - m).sum()))
        alive[t] = False
    return tot


def marks(p3):
    """3着内確率順に ◎○▲▲△△☆☆"""
    lab = ['◎', '○', '▲', '▲', '△', '△', '☆', '☆']
    order = np.argsort(-np.asarray(p3), kind='stable')
    out = np.array([''] * len(p3), dtype=object)
    for r, i in enumerate(order[:8]):
        out[i] = lab[r]
    return out


def loyo(d, years, feats=FEATS, lam=30.0):
    """1年除外検証。各年をその年以外で学習し、中立ペースで予測。人気だけの予想と比べる"""
    rows = []
    for y in years:
        tr = [t for t in years if t != y]
        pm = mean_pace(d, tr)
        Xtr = design(d, pm)
        m = fit(d, Xtr, tr, feats, lam)
        g = d[d['年'] == y]
        Xte = design(d, pm, pace=pm).loc[g.index]
        s = linear(m, Xte)
        so = Xte['log市場確率'].values
        pw, p3 = harville(s)
        _, p3o = harville(so)
        top = _top3(g)
        rows.append(pd.DataFrame({'年': y, '馬名': g['馬名'].values, '着順数値': g['着順数値'].values,
                                  '人気': g['人気'].values, '複勝払戻': g.get('複勝払戻', pd.Series(np.nan, index=g.index)).values,
                                  's': s, 'p勝': pw, 'p3': p3, 'p3人気だけ': p3o, '印': marks(p3),
                                  'PL': pl_nll(s, top), 'PL人気だけ': pl_nll(so, top)}))
    return pd.concat(rows, ignore_index=True)


def summarize(r):
    t3 = r['着順数値'] <= 3
    eps = 1e-9

    def ll(col):
        return float(-(np.log(r.loc[t3, col].clip(eps)).sum() + np.log((1 - r.loc[~t3, col]).clip(eps)).sum()) / len(r))
    by = r.groupby('年')
    mk = r['印'] != ''
    return {
        '年数': int(r['年'].nunique()),
        '3着内対数損失': round(ll('p3'), 4),
        '3着内対数損失_人気だけ': round(ll('p3人気だけ'), 4),
        'PL負対数尤度': round(float(by['PL'].first().sum()), 3),
        'PL負対数尤度_人気だけ': round(float(by['PL人気だけ'].first().sum()), 3),
        '印8頭の3着内': int((t3 & mk).sum()),
        '3着内の総数': int(t3.sum()),
        '勝ち馬が印内(年)': int(((r['着順数値'] == 1) & mk).sum()),
        '◎の3着内(年)': int(((r['印'] == '◎') & t3).sum()),
    }


def day_table(model, d, year, pm):
    """当日式(README 5.3)の部品: 馬ごとの 基礎値a・ペース感応度b と、市場・人気帯・枠の係数(生の単位)"""
    f = model['feats']
    w = pd.Series(model['w'], index=f) / pd.Series(model['sd'], index=f)
    g = d[d['年'] == year]
    X = design(d, pm, pace=pm).loc[g.index]
    X = X[f].fillna(pd.Series(model['fill'], index=f))
    other = [c for c in f if c not in MARKET + NINKI + GATE]
    a = (X[other] * w[other]).sum(axis=1)
    b = pd.Series(0.0, index=g.index)
    if '先行×ペース' in w:
        b += w['先行×ペース'] * (0.5 - X['初角率'])
    if '上がり×ペース' in w:
        b += w['上がり×ペース'] * X['上がり差']
    tab = pd.DataFrame({'馬名': g['馬名'].values, '脚質(過去5走初角率)': X['初角率'].values,
                        '上がり差(秒)': X['上がり差'].values, '基礎値a': a.values, 'ペース感応度b': b.values})
    coef = {'平均ペース': pm, 'c_log市場確率': float(w.get('log市場確率', 0.0)),
            **{k: float(w.get(k, 0.0)) for k in NINKI}, '枠': float(w.get('枠', 0.0))}
    return tab, coef


def day_score(tab, coef, odds, pace=None, fb=0.0, io=0.0, umaban=None, kfb=0.0, kio=0.0):
    """README 5.3 の式。odds: 馬名→単勝オッズ(取消は NaN)。umaban: 馬名→馬番"""
    assert -2 <= fb <= 2 and -2 <= io <= 2
    t = tab.copy()
    t['単勝オッズ'] = t['馬名'].map(odds).astype(float)
    t = t[t['単勝オッズ'].notna()].reset_index(drop=True)
    pace = coef['平均ペース'] if pace is None else pace
    q = (1 / t['単勝オッズ']) / (1 / t['単勝オッズ']).sum()
    rk = q.rank(ascending=False, method='first')
    n = len(t)
    s = t['基礎値a'] + t['ペース感応度b'] * (pace - coef['平均ペース']) + coef['c_log市場確率'] * np.log(q)
    s += coef['1番人気'] * (rk == 1) + coef['2番人気'] * (rk == 2) + coef['6-9番人気'] * rk.between(6, 9) + coef['10番人気以下'] * (rk >= 10)
    s += kfb * fb / 2 * (0.5 - t['脚質(過去5走初角率)']) / 0.5
    if umaban is not None:
        t['馬番'] = t['馬名'].map(umaban).astype(float)
        posn = (t['馬番'] - 1) / (n - 1)
        if n >= 16:
            s += coef['枠'] * (posn - 0.5)
        s += kio * io / 2 * (0.5 - posn) / 0.5
    pw, p3 = harville(s.values)
    _, p3o = harville(np.log(q.values))
    t['人気'] = rk.astype(int)
    t['推定勝率%'] = pw * 100
    t['3着内スコア'] = p3 * 100
    t['人気だけ3着内%'] = p3o * 100
    t['モデル/人気'] = p3 / p3o
    t['印'] = marks(p3)
    assert abs(t['推定勝率%'].sum() - 100) < 1e-6 and abs(t['3着内スコア'].sum() - 300) < 1e-6
    return t.sort_values('3着内スコア', ascending=False).reset_index(drop=True)


def save_model(model, coef, path):
    json.dump({'model': model, 'day': coef}, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
