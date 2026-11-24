"""生の列(netkeiba から取得した 通算・G1成績・前走_* など)から 特徴_* 列を作る。
定義は天皇賞・秋の学習データ(tests/tennosho_ref.csv)の 特徴_* 列と一致することを tests/test_features.py で確認している。
距離適性の列は JC 用に 芝2200-2600成績 を使う(天皇賞・秋は 芝1800-2200成績)。
"""
import re
import numpy as np
import pandas as pd

ABROAD_EXCLUDE = ['門別', '帯広', '旭川', '岩見沢', '北見', '盛岡', '水沢', '上山', '三条', '足利', '宇都宮', '高崎', '浦和', '船橋', '大井',
                  '川崎', '金沢', '笠松', '名古屋', '園田', '姫路', '福山', '益田', '高知', '佐賀', '荒尾', '中津', '紀三井寺']
JRA = ['札幌', '函館', '福島', '新潟', '東京', '中山', '中京', '京都', '阪神', '小倉']
PREV = ['前走', '前々走', '3走前']


def split_record(s):
    """'18/5/10' → (出走, 勝, 3着内)"""
    m = re.match(r'^\s*(\d+)/(\d+)/(\d+)\s*$', str(s))
    return tuple(float(x) for x in m.groups()) if m else (np.nan, np.nan, np.nan)


def pace_diff(s):
    """'35.4-35.6' → 前半3F − 後半3F = −0.2(正ほどスロー)"""
    m = re.match(r'^\s*([\d.]+)\s*-\s*([\d.]+)\s*$', str(s))
    return float(m.group(1)) - float(m.group(2)) if m else np.nan


def add_record_columns(d, dist_col):
    for c in ['通算', 'G1成績', '東京芝成績', dist_col]:
        if c in d and f'{c}_出走' not in d:
            r = d[c].map(split_record)
            d[f'{c}_出走'], d[f'{c}_勝'], d[f'{c}_3着内'] = zip(*r) if len(r) else ([], [], [])
    return d


def margin(d, p):
    """着差。海外などで着差が無い走は着順から補う(1着 −0.1、2着以下 0.15×(着順−1))。上限3.0"""
    g = pd.to_numeric(d[f'{p}_着差'], errors='coerce')
    r = pd.to_numeric(d[f'{p}_着順'], errors='coerce')
    g = g.fillna(pd.Series(np.where(r == 1, -0.1, 0.15 * (r - 1)), index=d.index))
    return g.clip(upper=3.0)


def build(d, dist_col='芝2200-2600成績', overwrite=False):
    d = add_record_columns(d.copy(), dist_col)
    f = {}
    rate = lambda a, b: np.where(d[b] > 0, d[a] / d[b].where(d[b] > 0, 1), 0.0)
    f['前走着差'] = margin(d, '前走')
    f['前走G1'] = (d['前走_格'] == 'G1').astype(float)
    gaps = []
    for p in PREV:
        g = margin(d, p)
        gaps.append(g.where(d[f'{p}_格'].isin(['G1', 'G2'])))
    f['近3走G1G2最小着差'] = pd.concat(gaps, axis=1).min(axis=1).fillna(3.0).clip(-1.0, 3.0)  # G1・G2なしは3.0
    f['G1勝利数'] = d['G1成績_勝'].clip(upper=5)
    f['G1連対圏率'] = rate('G1成績_3着内', 'G1成績_出走')
    f['G1出走なし'] = (d['G1成績_出走'] == 0).astype(float)
    f['東京芝3着内率'] = rate('東京芝成績_3着内', '東京芝成績_出走')
    f['通算勝率'] = rate('通算_勝', '通算_出走')
    f['3歳'] = (d['齢'] == 3).astype(float)
    f['6歳以上'] = (d['齢'] >= 6).astype(float)
    f['牝馬'] = (d['性'] == '牝').astype(float)
    f['前走人気'] = pd.to_numeric(d['前走_人気'], errors='coerce')
    f['近3走平均着順'] = pd.concat([pd.to_numeric(d[f'{p}_着順'], errors='coerce') for p in PREV], axis=1).fillna(18).clip(upper=18).mean(axis=1)  # 欠損は18、上限18
    f['美浦所属'] = (d['所属'] == '東').astype(float)
    place = d['前走_場'].astype(str)
    f['前走海外'] = (~place.isin(JRA) & ~place.isin(ABROAD_EXCLUDE) & ~place.str.contains('(地)', regex=False)
                    & d['前走_場'].notna()).astype(float)
    f['前走東京'] = (place == '東京').astype(float)
    f['上がり差'] = d['展開_上がり差']
    f['初角率'] = d['展開_初角率']
    for k, v in f.items():
        col = '特徴_' + k
        if overwrite or col not in d or d[col].isna().all():
            d[col] = v
    if '外国馬' not in d:
        d['外国馬'] = 0.0
    return d
