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
                   # あわせて dist/manifest.webmanifest, dist/sw.js, dist/icons/ も配る
```

**これを忘れると `dist/skyline.html` が古いままになり、公開ページに変更が反映されない。**
`src/` や `styles/main.css`、`index.html` を触ったら必ず実行する。

アイコンを描き直したときだけ `node scripts/make-icons.mjs` を先に実行する。

## 構成

- `index.html` + `src/**` — 開発用のソース（ES Modules、HTTP経由でのみ動く）
- `styles/main.css` — UI スタイル（白基調）
- `build.mjs` — esbuild で1ファイルに束ねる
- `dist/skyline.html` — サーバー不要で開ける単一HTML
- `dist/artifact.html` — Artifact 公開用（外側のタグなし）
- `manifest.webmanifest` / `sw.js` / `assets/icons/` — ホーム画面に追加して遊ぶための一式
- `scripts/make-icons.mjs` — アイコンPNGの生成（zlibだけで書き出す）

## ゲームの基本設計

- 内部の金額単位は**百万円**。表示は `src/core/format.js` の `money()` で億円・兆円に変換する
- 1ターン = 1週。13週で四半期決算。カレンダーは `src/core/time.js`
- 乱数はシード付き（`src/core/rng.js`）。`g.rngState` を毎ターン更新する
- セーブは `src/core/save.js`（localStorage、4スロット＋オートセーブの退避1つ）。
  `pendingReport` など一時データは保存しない

## セーブを壊さないための決めごと

**`src/core/save.js` の `PREFIX` と `META` は絶対に変えない。**
変えるとユーザーのセーブが二度と見つからなくなる。

- ゲームの状態に項目を足すのは自由。読み込み時に `migrate()` が
  新しいゲームをひな型にして、足りない項目を補う（既存の値には触らない）
- 区画（`g.cells`）は同じ位置どうしで突き合わせる。1つのひな型でまとめて埋めると
  道路や海に敷地面積が付いてしまう
- **地図を広げるときは、`MAP_ROWS` の左上 24×24 を絶対に動かさないこと。**
  右側と下側に足していく。区画数が変わると `remapCells()` がIDで突き合わせて、
  地形と地区が一致する区画だけ古いものを引き継ぐ。左上を動かすと引き継げなくなる
- ID（`uid()`）は読み込み時に `syncUid()` で振り直す。これを外すと、
  続きから始めたときに新しい案件が既存の案件と同じIDになる
- 保存する形を変えたときは `SAVE_VERSION` を上げ、`migrate()` に処理を足す

## 地区を追加するとき

地区の定義は `src/data/city.js` の `DISTRICTS` に集約している。
1地区あたり次をすべて埋めること。1つ抜けると新規ゲームの生成で落ちる。

- `lotSize` … 区画面積の基準（坪）
- `height` … 既存の建物の階数レンジ
- `usePool` … 既存の建物の用途の出方
- `rentLogi` … 物流賃料。**省略するとオフィス賃料の6割が代用され、都心ほど物流が有利になる**
- `fit` に `rental` を含めること

数値を決めたら、事業収支を必ず確認する。
地区ごとに「本命の用途」が1つ決まり、不適な用途がはっきり赤字になっているのが狙い。

```bash
node scripts/check-districts.mjs   # 全地区×全用途の事業利益率を一覧する
```

## 描画の性能

- 地面（道路・公園・水面・区画の下地）は毎フレーム1000枚以上のタイルになるので、
  `groundLayer()` で1枚のオフスクリーンに焼いて貼っている
- 焼き直しの判定は `groundSig()`（建物の有無・更地・着工中、所有者表示のときは所有者）。
  地面の見た目に関わる状態を増やしたら、この指紋にも足すこと
- `drawOrder()` は回転ごとにキャッシュする。セーブを読み込むと区画が入れ替わるので
  `invalidate()` で捨てている
- 縮小時（zoom < 0.40）は建物の影を省く

## スマートフォン対応

- CSS の分岐は `styles/main.css` 末尾の `@media(max-width:820px)`。
  レイアウト寸法は `--topH`（ヘッダー高）と `--botH`（画面下部の高さ）の2変数で決まる
- 狭い画面では、左の縦タブが画面下のタブバーに、パネルが全画面のシートになる
- 画面が狭いかどうかの判定は `src/main.js` の `IS_SMALL`。CSS の 820px と合わせること
- 指の操作は `bindInput()` 内。1本指＝カメラ移動、2本指＝ピンチで段階ズーム。
  `#city` には `touch-action:none` が必要（外すとブラウザ側のスクロールに取られる）
- 入力欄の文字サイズは16px。これを下回ると iOS がフォーカス時に勝手にズームする
- `manifest.webmanifest` と `sw.js` により、ホーム画面に追加すると全画面で起動し、
  一度読み込めば電波がなくても遊べる

## 動作確認

ローカルで開くときは HTTP を使う（ES Modules は `file://` で動かない）。

```bash
python3 -m http.server 8000   # → http://localhost:8000/index.html
```

単一ファイル版は `file://` で直接開いて確認できる。
