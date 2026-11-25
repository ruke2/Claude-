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
# JC 用の追加候補(README 5.2)。時代×市場 は log市場確率 ×(年−2015)/10、バイアス2項は当日の前残り度・内外度(README 5.4)
JC_CAND = ['乗替', 'G1中長距離3着内率', '東京G1_3着内率', '海外G1_3着内率', '前走脚余し', '間隔日数log', '前走天皇賞秋']
ERA = ['時代×市場']
BIAS = ['バイアス前後', 'バイアス内外']
# 外れ方の分析(README 6.4)から作った候補
ROTE = ['前走G2好走', '前走天皇賞秋敗退']
REL = ['初角順位率']
ALL_CAND = FEATS + JC_CAND + ERA + BIAS + ROTE + REL
JOCKEY = ['騎手前年複勝率', '騎手重賞勝率']
WEIGHT = ['馬体重増減大']
BLOCKS = {'JC追加': JC_CAND, '時代×市場': ERA, '当日バイアス': BIAS, 'ローテ': ROTE, '相対位置': REL, '騎手': JOCKEY, '馬体重': WEIGHT}
ALL_CAND = ALL_CAND + JOCKEY + WEIGHT
G1_CODE = {1: '天皇賞秋', 2: '有馬記念', 3: '宝塚記念'}


def add_jockey(d, path):
    """騎手の前年(暦年−1)の複勝率(騎乗100回以上)と、前2年の重賞勝率(重賞騎乗20回以上)。data/jockey_year.csv から"""
    j = pd.read_csv(path, encoding='utf-8-sig', dtype={'騎手ID': str})
    j = j.groupby(['騎手ID', '年度'], as_index=False).sum()
    jid = d['騎手ID'].astype(str).str.replace(r'\.0$', '', regex=True).str.zfill(5)
    j['騎手ID'] = j['騎手ID'].str.zfill(5)
    cy = d['暦年'] if '暦年' in d else d['年']
    key1 = pd.DataFrame({'騎手ID': jid, '年度': cy - 1})
    a = key1.merge(j, on=['騎手ID', '年度'], how='left')
    d['騎手前年複勝率'] = np.where(a['騎乗'] >= 100, a['3着内'] / a['騎乗'], np.nan)
    b = key1.merge(j.assign(年度=j['年度'] + 1), on=['騎手ID', '年度'], how='left')  # 前々年
    gs = a['重賞出走'].fillna(0) + b['重賞出走'].fillna(0)
    gw = a['重賞勝'].fillna(0) + b['重賞勝'].fillna(0)
    d['騎手重賞勝率'] = np.where(gs >= 20, gw / gs.where(gs > 0, 1), np.nan)
    return d


def cal_year(k):
    """レース識別子 → 暦年(JC は暦年、G1 は 暦年×10+種別、重賞は race_id 12桁)"""
    k = int(k)
    return k // 10 ** 8 if k >= 10 ** 11 else k // 10 if k >= 10000 else k


def load_pool(jc_path, jc_bias, g1_path=None, g1_bias=None, jockey=None, dist_col='芝2200-2600成績',
              graded_path=None, graded_ids=None, jc_ids=None, g1_ids=None):
    """JC と G1(天皇賞秋・有馬記念・宝塚記念)、芝2000〜2500m 重賞をまとめて読む(README 6.5・6.6)。
    年 列はレースの識別子: JC は暦年、G1 は 暦年×10+種別(1 天皇賞秋、2 有馬記念、3 宝塚記念)、重賞は race_id。
    本番ペース差 は種別(重賞は距離)ごとの平均(2006〜2025年)との差に JC の平均を足して、距離の違いをならす。
    開催日 列(jc_ids・g1_ids・graded_ids から)は、JC より後のレースを学習から外すのに使う"""
    a = load(jc_path, dist_col, bias=jc_bias)
    a['レース種別'], a['暦年'] = 'JC', a['年']
    if jc_ids:
        ji = pd.read_csv(jc_ids, encoding='utf-8-sig')
        a['開催日'] = a['年'].map(dict(zip(ji['年'], ji['開催日'])))
        a.loc[a['年'] == 2026, '開催日'] = '2026-11-29'
    parts = [a]
    known = set()
    if g1_path:
        b = load(g1_path, dist_col)
        if g1_bias:
            bb = pd.read_csv(g1_bias, encoding='utf-8-sig').rename(columns={'レースキー': '年'})[['年', '前残り度', '内外度']]
            b = b.merge(bb, on='年', how='left')
        b['レース種別'] = (b['年'] % 10).map(G1_CODE)
        b['暦年'] = b['年'] // 10
        if g1_ids:
            gi = pd.read_csv(g1_ids, encoding='utf-8-sig')
            b['開催日'] = b['年'].map(dict(zip(gi['レースキー'], gi['開催日'])))
            known |= set(gi['race_id'].astype(str))
        parts.append(b)
    if jc_ids:
        known |= set(pd.read_csv(jc_ids, encoding='utf-8-sig')['race_id'].astype(str))
    if graded_path:
        c = load(graded_path, dist_col)
        gi = pd.read_csv(graded_ids, encoding='utf-8-sig', dtype={'race_id': str})
        c = c[~c['年'].astype(str).isin(known)]  # JC・G1 と重なるレースは除く
        mx = c.groupby('年')['齢'].transform('max')
        c = c[mx > 2]  # 2歳限定戦は除く
        c['開催日'] = c['年'].astype(str).map(dict(zip(gi['race_id'], gi['開催日'])))
        c['レース種別'] = '重賞' + c['年'].astype(str).map(dict(zip(gi['race_id'], gi['コース'])))
        c['暦年'] = c['年'] // 10 ** 8
        parts.append(c)
    d = pd.concat(parts, ignore_index=True)
    base = d[(d['暦年'] >= 2006) & (d['暦年'] <= 2025)].groupby(['レース種別', '年'])['本番ペース差'].first()
    tm = base.groupby(level=0).mean()
    d['本番ペース差'] = d['本番ペース差'] - d['レース種別'].map(tm) + tm.get('JC', 0.0)
    d['馬体重増減大'] = (pd.to_numeric(d['増減'], errors='coerce').abs() >= 10).astype(float).where(d['増減'].notna())
    if jockey and '騎手ID' in d:
        d = add_jockey(d, jockey)
    return d

# +: 大きいほど加点に固定、−: 減点に固定、記載なし: 自由
POS = {'前走G1', 'G1勝利数', 'G1連対圏率', '東京芝3着内率', '通算勝率', '前走東京', 'log市場確率'}
NEG = {'前走着差', '近3走G1G2最小着差', 'G1出走なし', '6歳以上', '前走人気', '近3走平均着順', '上がり差', '枠'}
# 前走海外は天皇賞・秋では減点固定だったが、JC は外国馬が海外帰りで出るため自由にする(要検証)


def load(path, dist_col='芝2200-2600成績', foreign_unknown=True, bias=None):
    d = pd.read_csv(path, encoding='utf-8-sig')
    d = build(d, dist_col=dist_col, foreign_unknown=foreign_unknown)
    if bias is not None:  # 年ごとの 前残り度・内外度(data/japancup_bias_1990_2025.csv)
        b = pd.read_csv(bias, encoding='utf-8-sig')[['年', '前残り度', '内外度']]
        d = d.drop(columns=[c for c in ['前残り度', '内外度'] if c in d]).merge(b, on='年', how='left')
    d['着順数値'] = pd.to_numeric(d['着順'].astype(str).str.extract(r'^(\d+)')[0], errors='coerce')
    d['本番ペース差'] = d['展開_本番ペース'].map(pace_diff) if '展開_本番ペース' in d else np.nan
    d['単勝オッズ'] = pd.to_numeric(d['単勝オッズ'], errors='coerce')
    return d.reset_index(drop=True)


def mean_pace(d, years):
    return float(d[d['年'].isin(years)].groupby('年')['本番ペース差'].first().mean())


PACE_X = ['逃げ候補数', '最前初角率']


def pace_table(d):
    """年ごとのペース予想の説明変数(出走馬の構成だけから作る。README 5.5)
    逃げ候補数 = 過去5走の逃げ率が0.4以上の頭数、最前初角率 = 出走馬の過去5走初角率の最小値"""
    fr = pd.to_numeric(d['展開_初角率'], errors='coerce')
    ng = pd.to_numeric(d['展開_逃げ率'], errors='coerce')
    t = pd.DataFrame({'年': d['年'], '逃げ': (ng >= 0.4).astype(float), '初角': fr})
    out = t.groupby('年').agg(逃げ候補数=('逃げ', 'sum'), 最前初角率=('初角', 'min'))
    out['本番ペース差'] = d.groupby('年')['本番ペース差'].first()
    return out


def fit_pace(d, years, ridge=1.0):
    t = pace_table(d).loc[lambda x: x.index.isin(years)].dropna()
    X = t[PACE_X].values
    mu, sd = X.mean(0), X.std(0)
    Z = (X - mu) / sd
    yv = t['本番ペース差'].values
    b = np.linalg.solve(Z.T @ Z + ridge * np.eye(Z.shape[1]), Z.T @ (yv - yv.mean()))
    return {'mu': mu.tolist(), 'sd': sd.tolist(), 'b': b.tolist(), 'a': float(yv.mean())}


def predict_pace(d, year, pc):
    t = pace_table(d).loc[year, PACE_X].values.astype(float)
    return float(pc['a'] + ((t - np.array(pc['mu'])) / np.array(pc['sd'])) @ np.array(pc['b']))


def design(d, pm, pace=None):
    """特徴量行列。pace=None なら実際の本番ペース(欠損は pm)、数値ならその想定ペースを全馬に使う"""
    X = pd.DataFrame(index=d.index)
    for f in BASE + JC_CAND:
        if '特徴_' + f in d:
            X[f] = pd.to_numeric(d['特徴_' + f], errors='coerce')
    pc_ = pd.to_numeric(d['前走_着順'], errors='coerce')
    X['前走G2好走'] = ((d['前走_格'] == 'G2') & (pc_ <= 3)).astype(float)
    X['前走天皇賞秋敗退'] = (d['前走_レース'].astype(str).str.contains('天皇賞(秋)', regex=False) & (pc_ > 3)).astype(float)
    nn = d.groupby('年')['馬名'].transform('size')
    X['初角順位率'] = X['初角率'].groupby(d['年']).rank(method='average') / nn
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
    X['時代×市場'] = X['log市場確率'] * (pd.to_numeric(d['暦年'] if '暦年' in d else d['年']) - 2015) / 10
    for c in JOCKEY + WEIGHT:
        if c in d:
            X[c] = pd.to_numeric(d[c], errors='coerce')
    fb = pd.to_numeric(d['前残り度'], errors='coerce').fillna(0.0) if '前残り度' in d else 0.0
    io = pd.to_numeric(d['内外度'], errors='coerce').fillna(0.0) if '内外度' in d else 0.0
    # 当日式(README 5.3)と同じ形。初角率は過去5走の値(欠損は 0.5 = 補正なし)
    X['バイアス前後'] = fb / 2 * (0.5 - X['初角率'].fillna(0.5)) / 0.5
    X['バイアス内外'] = io / 2 * (0.5 - posn.fillna(0.5)) / 0.5
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


def fit(d, X, years, feats=FEATS, lam=30.0, fill=None, signs=True, weights=None, prior=None, stats=None):
    """prior: 縮める先の係数(標準化の単位、None なら 0)。stats: (fill, mu, sd) を外から与える(階層学習で prior と単位をそろえる)"""
    tr = d.index[d['年'].isin(years) & d['着順数値'].notna().groupby(d['年']).transform('any')]
    Xt = X.loc[tr, feats]
    if stats is not None:
        fill, mu, sd = (pd.Series(v, index=feats) for v in stats)
    else:
        fill = Xt.mean() if fill is None else fill
        mu = Xt.fillna(fill).mean()
        sd = Xt.fillna(fill).std().replace(0, 1).fillna(1)
    w0 = np.zeros(len(feats)) if prior is None else np.asarray(prior, float)
    Z = ((X[feats].fillna(fill) - mu) / sd).values
    races = [(d.index[d['年'] == y].values, _top3(d[d['年'] == y]), 1.0 if weights is None else weights.get(y, 1.0))
             for y in sorted(set(d.loc[tr, '年']))]
    pen = np.array([0.0 if f in MARKET else lam for f in feats])

    def nll(w):
        tot, grad = 0.0, np.zeros_like(w)
        for rows, top, rw in races:
            Zr = Z[rows]
            s = Zr @ w
            alive = np.ones(len(rows), bool)
            for t in top:
                ss = s[alive]
                m = ss.max()
                e = np.exp(ss - m)
                p = e / e.sum()
                tot -= rw * (s[t] - (m + np.log(e.sum())))
                grad -= rw * (Zr[t] - p @ Zr[alive])
                alive[t] = False
        return tot + (pen * (w - w0) ** 2).sum(), grad + 2 * pen * (w - w0)

    bnd = [(0, None) if signs and f in POS else (None, 0) if signs and f in NEG else (None, None) for f in feats]
    w = minimize(nll, np.clip(w0, [b[0] if b[0] is not None else -np.inf for b in bnd],
                              [b[1] if b[1] is not None else np.inf for b in bnd]), jac=True, method='L-BFGS-B', bounds=bnd).x
    return {'feats': list(feats), 'w': w.tolist(), 'mu': mu.tolist(), 'sd': sd.tolist(), 'fill': fill.tolist(), 'lam': lam,
            'signs': signs, 'years': [int(y) for y in years]}


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


def fit_hier(d, X, jc_years, pool, feats, lam_pool, lam_jc, signs=True):
    """階層学習(README 6.5): G1 を含む全レースで学習した係数 m0 を出発点に、JC だけで m0 からのずれを λ_jc で縮めて学習"""
    m0 = fit(d, X, pool, feats, lam_pool, signs=signs)
    st = (m0['fill'], m0['mu'], m0['sd'])
    m = fit(d, X, jc_years, feats, lam_jc, signs=signs, prior=m0['w'], stats=st)
    m['prior'] = m0['w']
    m['lam_pool'] = lam_pool
    return m


def loyo(d, years, feats=FEATS, lam=30.0, train_from=None, signs=True, pace_mode='neutral', pool=None, weights=None,
         hier=None, recency=None):
    """hier=(λ_pool, λ_jc) で階層学習。pool は全レース、JC は pool のうち years に含まれる種類(暦年<10000)。
    予測年の JC と、同じ年で JC より後に行われたレースは学習から外す"""
    """1年除外検証。各年をその年以外で学習し、中立ペースで予測。人気だけの予想と比べる。
    train_from を指定すると、学習には train_from〜max(years) の年(評価年を除く)を使い、評価は years だけで行う"""
    rows = []
    if pool is None:
        pool = years if train_from is None else [t for t in sorted(d.loc[d['着順数値'].notna(), '年'].unique())
                                                  if train_from <= t <= max(years)]
    Xtr = None
    for y in years:
        # 予測年の JC と、その年の JC より後の有馬記念は学習から外す
        if '開催日' in d and d['開催日'].notna().any():
            jd = d.loc[d['年'] == y, '開催日'].iloc[0]
            late = set(d.loc[(d['開催日'] > jd) & (d['開催日'].str[:4] == jd[:4]), '年'])
        else:
            late = {y * 10 + 2}
        tr = [t for t in pool if t != y and t not in late]
        pm = mean_pace(d, tr)
        Xtr = design(d, pm)
        if hier:
            m = fit_hier(d, Xtr, [t for t in tr if t < 10000], tr, feats, hier[0], hier[1], signs=signs)
        else:
            wy = weights
            if recency:  # 予測年から離れたレースほど軽く: exp(−|暦年差|/τ)
                cy = cal_year
                wy = {k: (1.0 if weights is None else weights.get(k, 1.0)) * float(np.exp(-abs(cy(k) - y) / recency)) for k in tr}
            m = fit(d, Xtr, tr, feats, lam, signs=signs, weights=wy)
        g = d[d['年'] == y]
        pp_ = predict_pace(d, y, fit_pace(d, tr)) if pace_mode == 'predicted' else pm
        Xte = design(d, pm, pace=pp_).loc[g.index]
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
    other = [c for c in f if c not in MARKET + NINKI + GATE + ERA + BIAS]
    a = (X[other] * w[other]).sum(axis=1)
    b = pd.Series(0.0, index=g.index)
    if '先行×ペース' in w:
        b += w['先行×ペース'] * (0.5 - X['初角率'])
    if '上がり×ペース' in w:
        b += w['上がり×ペース'] * X['上がり差']
    raw = design(d, pm, pace=pm).loc[g.index]
    tab = pd.DataFrame({'馬名': g['馬名'].values, '脚質(過去5走初角率)': X['初角率'].values,
                        '上がり差(秒)': X['上がり差'].values, '基礎値a': a.values, 'ペース感応度b': b.values,
                        '初角率(バイアス用)': raw['初角率'].fillna(0.5).values})
    # 時代×市場 は対象年の値で市場係数 c に含める。バイアス2項の係数は kfb・kio として当日式に渡す
    c = float(w.get('log市場確率', 0.0)) + float(w.get('時代×市場', 0.0)) * (year - 2015) / 10
    coef = {'平均ペース': pm, 'c_log市場確率': c,
            **{k: float(w.get(k, 0.0)) for k in NINKI}, '枠': float(w.get('枠', 0.0)),
            'kfb': float(w.get('バイアス前後', 0.0)), 'kio': float(w.get('バイアス内外', 0.0))}
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
    kcol = '初角率(バイアス用)' if '初角率(バイアス用)' in t else '脚質(過去5走初角率)'
    s += kfb * fb / 2 * (0.5 - t[kcol]) / 0.5
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
