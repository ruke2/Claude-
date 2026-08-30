/* CSS/JS をインライン化して単一HTMLを dist/index.html に出力する */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g,
  (_, href) => '<style>\n' + read(href) + '\n</style>');
html = html.replace(/<script src="([^"]+)"><\/script>/g,
  (_, src) => '<script>\n' + read(src) + '\n</script>');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html);
console.log('dist/index.html  ' + (Buffer.byteLength(html) / 1024).toFixed(1) + ' KB');
