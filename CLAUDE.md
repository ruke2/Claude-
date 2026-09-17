# 作業メモ

## 公開先

| URL | 中身 | 更新のされ方 |
| --- | --- | --- |
| https://ruke2.github.io/Claude-/dist/skyline.html | 単一HTML（ビルド成果物） | `node build.mjs` を実行してから push |
| https://ruke2.github.io/Claude-/ | `index.html` + `src/`（ES Modules） | push すればそのまま反映 |
| https://claude.ai/artifact/LBZmeyJ3xHNwsZ3v8K8LSj | 単一HTML（Artifact） | `dist/artifact.html` を publish |

GitHub Pages の設定は「Deploy from a branch」／ブランチ `claude/developer-game-v1-l75etn` ／ `/ (root)`。
プッシュの1〜2分後に自動デプロイされる。

## プッシュ前に必ずやること

```bash
node build.mjs     # src/ styles/ index.html → dist/skyline.html と dist/artifact.html
```

**これを忘れると `dist/skyline.html` が古いままになり、公開ページに変更が反映されない。**
`src/` や `styles/main.css`、`index.html` を触ったら必ず実行する。

## 構成

- `index.html` + `src/**` — 開発用のソース（ES Modules、HTTP経由でのみ動く）
- `styles/main.css` — UI スタイル（白基調）
- `build.mjs` — esbuild で1ファイルに束ねる
- `dist/skyline.html` — サーバー不要で開ける単一HTML
- `dist/artifact.html` — Artifact 公開用（外側のタグなし）

## ゲームの基本設計

- 内部の金額単位は**百万円**。表示は `src/core/format.js` の `money()` で億円・兆円に変換する
- 1ターン = 1週。13週で四半期決算。カレンダーは `src/core/time.js`
- 乱数はシード付き（`src/core/rng.js`）。`g.rngState` を毎ターン更新する
- セーブは `src/core/save.js`（localStorage、4スロット）。`pendingReport` など一時データは保存しない

## 動作確認

ローカルで開くときは HTTP を使う（ES Modules は `file://` で動かない）。

```bash
python3 -m http.server 8000   # → http://localhost:8000/index.html
```

単一ファイル版は `file://` で直接開いて確認できる。
