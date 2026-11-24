"""騎手の年度別成績を netkeiba から取る(騎手の力量の特徴量用。README 6.5)。

python3 scripts/fetch_jockey.py data/japancup_1990_2026_data.csv data/g1_2006_2026_data.csv --out data/jockey_year.csv [--cache data/raw]

出典: https://db.netkeiba.com/jockey/result/{騎手ID}/ の年度別成績表(JRA)。
表は見出しが2段のため、セルの位置で読む:
年度, 順位, 1着, 2着, 3着, 着外, 重賞(出走, 勝利), 特別(出走, 勝利), 平場(出走, 勝利), 芝(出走, 勝利), ダート(出走, 勝利), 勝率, 連対率, 複勝率, ...
"""
import argparse, csv, os, re, sys
import pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch_netkeiba as F


def n(x):
    x = F.txt(x).replace(',', '')
    return int(x) if x.isdigit() else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('data', nargs='+')
    ap.add_argument('--out', required=True)
    ap.add_argument('--cache', default=F.CACHE)
    A = ap.parse_args()
    F.CACHE = A.cache
    ids = set()
    for p in A.data:
        d = pd.read_csv(p, encoding='utf-8-sig', dtype={'騎手ID': str})
        ids |= set(d['騎手ID'].dropna().astype(str))
    ids = sorted(i for i in ids if i and i != 'nan')
    rows = []
    for k, jid in enumerate(ids):
        try:
            s = F.get(f'https://db.netkeiba.com/jockey/result/{jid}/')
        except RuntimeError as e:
            print('失敗', jid, e, file=sys.stderr)
            continue
        t = s.select_one('table.nk_tb_common')
        if t is None:
            continue
        for tr in t.find_all('tr'):
            td = tr.find_all('td')
            if len(td) < 16 or not re.fullmatch(r'\d{4}', F.txt(td[0])):
                continue
            w, s2, s3, out = n(td[2]), n(td[3]), n(td[4]), n(td[5])
            rows.append([jid, int(F.txt(td[0])), w + s2 + s3 + out, w, w + s2 + s3, n(td[6]), n(td[7])])
        if k % 20 == 0:
            print(k, len(ids), file=sys.stderr, flush=True)
    with open(A.out, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f)
        w.writerow(['騎手ID', '年度', '騎乗', '1着', '3着内', '重賞出走', '重賞勝'])
        w.writerows(rows)
    print('騎手', len(ids), '行', len(rows), file=sys.stderr)


if __name__ == '__main__':
    main()
