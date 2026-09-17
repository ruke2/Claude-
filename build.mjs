// ============================================================
//  単一HTMLファイルを作るビルドスクリプト
//    node build.mjs  →  dist/skyline.html
//  生成物はブラウザで直接開ける（サーバー不要・オフライン可）
// ============================================================
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

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
