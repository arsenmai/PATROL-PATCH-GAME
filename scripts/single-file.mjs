// Inlines the Vite build into one self-contained HTML file (dist-single/index.html).
// Handy for sharing the game as a single attachment. Run after `npm run build`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

let html = readFileSync('dist/index.html', 'utf8');
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/, (_, file) => {
  return `<style>${readFileSync(`dist/${file}`, 'utf8')}</style>`;
});
html = html.replace(/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/, (_, file) => {
  const js = readFileSync(`dist/${file}`, 'utf8').replace(/<\/script/g, '<\\/script');
  return `<script type="module">${js}</script>`;
});
mkdirSync('dist-single', { recursive: true });
writeFileSync('dist-single/index.html', html);
console.log(`dist-single/index.html  ${(html.length / 1024).toFixed(0)} kB`);
