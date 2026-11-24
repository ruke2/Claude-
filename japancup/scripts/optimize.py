"""JC の過去レースで 学習開始年・λ・符号制約・特徴量の組み合わせ を最適化する(README 6.3)。

python3 scripts/optimize.py data/japancup_1990_2026_data.csv --bias data/japancup_bias_1990_2025.csv \
    --eval-from 2006 --eval-to 2025 --out out/opt.json [--holdout-from 2021]

基準: 評価年の1年除外検証の PL負対数尤度(上位3着の順位の当てはまり。小さいほど良い)。
--mode block(既定): ブロック単位の総当たり。--mode greedy: 特徴量を1つずつ(過学習したため不採用、README 6.3)。
greedy の手順: (1) 全候補で 学習開始年 × λ × 符号制約 を比較 → (2) 後退選択 → (3) 前進選択 → (4) λ を再選択。
--holdout-from を付けると、その年以降を選択に使わず、選んだ設定でその年以降を予測した成績も出す(選択の楽観度の確認)。
"""
import argparse, json, os, sys
from multiprocessing import Pool
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from jc.model import load, loyo, summarize, ALL_CAND, MARKET

D = None


def score(args):
    feats, lam, train_from, signs, years = args[:5]
    pace_mode = args[5] if len(args) > 5 else 'neutral'
    r = loyo(D, years, list(feats), lam, train_from=train_from, signs=signs, pace_mode=pace_mode)
    s = summarize(r)
    return s['PL負対数尤度'], s


def run(pool, cfgs):
    return pool.map(score, cfgs)


def select(pool, years, cands, log):
    # (1) 設定の比較
    grid = [(tf, lam, sg) for tf in (1990, 2000, 2006) for lam in (10, 30, 100) for sg in (True, False)]
    res = run(pool, [(tuple(cands), lam, tf, sg, years) for tf, lam, sg in grid])
    best = min(range(len(grid)), key=lambda i: res[i][0])
    tf, lam, sg = grid[best]
    log.append({'step': 'grid', 'table': [{'学習開始': g[0], 'λ': g[1], '符号固定': g[2], 'PL': r[0], '3着内LL': r[1]['3着内対数損失']}
                                          for g, r in zip(grid, res)], 'best': grid[best]})
    print('grid best', grid[best], res[best][0], file=sys.stderr, flush=True)
    feats, cur = list(cands), res[best][0]
    # (2) 後退選択
    while True:
        drop = [f for f in feats if f not in MARKET]
        rs = run(pool, [(tuple(x for x in feats if x != f), lam, tf, sg, years) for f in drop])
        i = min(range(len(drop)), key=lambda k: rs[k][0])
        if rs[i][0] < cur - 1e-6:
            cur = rs[i][0]
            feats.remove(drop[i])
            log.append({'step': 'drop', 'feat': drop[i], 'PL': cur})
            print('drop', drop[i], round(cur, 3), file=sys.stderr, flush=True)
        else:
            break
    # (3) 前進選択
    while True:
        add = [f for f in cands if f not in feats]
        if not add:
            break
        rs = run(pool, [(tuple(feats + [f]), lam, tf, sg, years) for f in add])
        i = min(range(len(add)), key=lambda k: rs[k][0])
        if rs[i][0] < cur - 1e-6:
            cur = rs[i][0]
            feats.append(add[i])
            log.append({'step': 'add', 'feat': add[i], 'PL': cur})
            print('add', add[i], round(cur, 3), file=sys.stderr, flush=True)
        else:
            break
    # (4) λ の再選択
    lams = (3, 10, 20, 30, 50, 100, 300)
    rs = run(pool, [(tuple(feats), l, tf, sg, years) for l in lams])
    j = min(range(len(lams)), key=lambda k: rs[k][0])
    lam = lams[j]
    log.append({'step': 'lambda', 'table': {str(l): r[0] for l, r in zip(lams, rs)}, 'best': lam})
    return {'feats': feats, 'lam': lam, 'train_from': tf, 'signs': sg, 'summary': rs[j][1]}


def select_blocks(pool, years, log, use_bias):
    """ブロック単位の選択(特徴量を1つずつ選ぶと過学習したため。README 6.3)。
    基本(FEATS、秋天由来)は常に入れ、JC追加候補・当日バイアス・時代×市場 の有無と 学習開始年・λ・符号制約 を総当たり"""
    from jc.model import FEATS, JC_CAND, ERA, BIAS
    blocks = {'JC追加': JC_CAND, '時代×市場': ERA}
    if use_bias:
        blocks['当日バイアス'] = BIAS
    names = list(blocks)
    combos = [[n for i, n in enumerate(names) if m >> i & 1] for m in range(2 ** len(names))]
    grid = [(tuple(c), tf, lam, sg) for c in combos for tf in (1990, 2000, 2006) for lam in (10, 30, 100) for sg in (True, False)]
    cfgs = [(tuple(FEATS + [f for n in c for f in blocks[n]]), lam, tf, sg, years) for c, tf, lam, sg in grid]
    res = run(pool, cfgs)
    tab = [{'ブロック': list(g[0]), '学習開始': g[1], 'λ': g[2], '符号固定': g[3], 'PL': r[0], '3着内LL': r[1]['3着内対数損失']}
           for g, r in zip(grid, res)]
    log.append({'step': 'blocks', 'table': tab})
    i = min(range(len(grid)), key=lambda k: res[k][0])
    c, tf, lam, sg = grid[i]
    return {'feats': list(cfgs[i][0]), 'blocks': list(c), 'lam': lam, 'train_from': tf, 'signs': sg, 'summary': res[i][1]}


def select_blocks2(pool, years, log):
    """外れ方の分析(README 6.4)後の比較: 5ブロックの有無 × λ × ペース(中立/予想)。学習開始 2006・符号固定"""
    from jc.model import FEATS, BLOCKS
    names = list(BLOCKS)
    combos = [[n for i, n in enumerate(names) if m >> i & 1] for m in range(2 ** len(names))]
    grid = [(tuple(c), lam, pm) for c in combos for lam in (10, 30, 100) for pm in ('neutral', 'predicted')]
    cfgs = [(tuple(FEATS + [f for n in c for f in BLOCKS[n]]), lam, 2006, True, years, pm) for c, lam, pm in grid]
    res = run(pool, cfgs)
    tab = [{'ブロック': list(g[0]), 'λ': g[1], 'ペース': g[2], 'PL': r[0], '3着内LL': r[1]['3着内対数損失']} for g, r in zip(grid, res)]
    log.append({'step': 'blocks2', 'table': tab})
    i = min(range(len(grid)), key=lambda k: res[k][0])
    c, lam, pm = grid[i]
    return {'feats': list(cfgs[i][0]), 'blocks': list(c), 'lam': lam, 'train_from': 2006, 'signs': True, 'pace_mode': pm,
            'summary': res[i][1]}


def main():
    global D
    ap = argparse.ArgumentParser()
    ap.add_argument('data'); ap.add_argument('--bias'); ap.add_argument('--out', required=True)
    ap.add_argument('--eval-from', type=int, default=2006); ap.add_argument('--eval-to', type=int, default=2025)
    ap.add_argument('--holdout-from', type=int)
    ap.add_argument('--mode', choices=['greedy', 'block', 'block2'], default='block')
    A = ap.parse_args()
    D = load(A.data, bias=A.bias)
    cands = [f for f in ALL_CAND if A.bias or f not in ('バイアス前後', 'バイアス内外')]
    sel_to = A.holdout_from - 1 if A.holdout_from else A.eval_to
    years = list(range(A.eval_from, sel_to + 1))
    log = []
    with Pool(4) as pool:
        best = (select(pool, years, cands, log) if A.mode == 'greedy' else select_blocks(pool, years, log, bool(A.bias))
                if A.mode == 'block' else select_blocks2(pool, years, log))
        out = {'選択に使った評価年': [years[0], years[-1]], 'best': best, 'log': log}
        if A.holdout_from:
            # 選んだ設定で、選択に使っていない年を1年除外の形で予測(学習は train_from〜eval_to のうち予測年以外)
            ho = list(range(A.holdout_from, A.eval_to + 1))
            r = loyo(D, ho, best['feats'], best['lam'], train_from=best['train_from'], signs=best['signs'],
                     pace_mode=best.get('pace_mode', 'neutral'))
            from jc.model import FEATS, BIAS
            r0 = loyo(D, ho, FEATS, 30.0, train_from=2006, signs=True)
            r1 = loyo(D, ho, FEATS + BIAS, 30.0, train_from=2006, signs=True)
            out['holdout'] = {'年': [ho[0], ho[-1]], '最適化後': summarize(r), '初期設定(秋天と同じ)': summarize(r0),
                              '前回採用(基本+当日バイアス)': summarize(r1)}
    json.dump(out, open(A.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in out.items() if k != 'log'}, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
