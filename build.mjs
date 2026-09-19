// ============================================================
//  単一HTMLファイルを作るビルドスクリプト
//    node build.mjs  →  dist/skyline.html
//  生成物はブラウザで直接開ける（サーバー不要・オフライン可）
// ============================================================
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'fs';

mkdirSync('dist', { recursive: true });

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
});
const js = result.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>');
const css = readFileSync('styles/main.css', 'utf8');
const html = readFileSync('index.html', 'utf8');

const body = html.match(/<body>([\s\S]*?)<\/body>/)[1]
  .replace(/<script[^>]*src="[^"]*"[^>]*><\/script>\s*/g, '');

const out = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>摩天楼の設計図</title>
<meta name="description" content="湊都市を舞台にした不動産デベロッパー経営シミュレーション。">
<meta name="theme-color" content="#17457f">
<meta name="color-scheme" content="light">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icons/icon-192.png" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="icons/icon-180.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="摩天楼の設計図">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Oswald:wght@400;600&display=swap" rel="stylesheet">
<style>
${css}
</style>
</head>
<body>
${body}
<script>
${js}
</script>
</body>
</html>
`;
writeFileSync('dist/skyline.html', out);
console.log(`dist/skyline.html  ${(out.length / 1024).toFixed(0)}KB`);

// Artifact 用：外側のタグは公開時に付与されるので中身だけを書き出す
const inner = `<title>摩天楼の設計図</title>
<style>
${css}
</style>
${body}
<script>
${js}
</script>
`;
writeFileSync('dist/artifact.html', inner);
console.log(`dist/artifact.html ${(inner.length / 1024).toFixed(0)}KB`);

// ------------------------------------------------------------
//  ホーム画面に追加して遊ぶための一式を dist/ に配る
//    dist/skyline.html から見た相対パスに書き換える
// ------------------------------------------------------------
mkdirSync('dist/icons', { recursive: true });
for (const f of readdirSync('assets/icons')) copyFileSync(`assets/icons/${f}`, `dist/icons/${f}`);

const mf = readFileSync('manifest.webmanifest', 'utf8')
  .replace('"start_url": "./"', '"start_url": "./skyline.html"')
  .replaceAll('"./assets/icons/', '"./icons/');
writeFileSync('dist/manifest.webmanifest', mf);
copyFileSync('sw.js', 'dist/sw.js');
console.log('dist/manifest.webmanifest, dist/sw.js, dist/icons/ を更新した');
