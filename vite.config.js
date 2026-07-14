// Configuração Vite do Novo Sol.
// - base './' => o build funciona no GitHub Pages (subcaminho) e abre direto
//   do disco quando empacotado em arquivo único.
// - `npm run build:single` (SINGLEFILE=1) embute JS/CSS num único index.html
//   auto-contido — modo offline/file:// (uso no iPhone).
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  const single = process.env.SINGLEFILE === '1';
  return {
    base: './',
    plugins: single ? [viteSingleFile()] : [],
    build: {
      outDir: single ? 'dist-single' : 'dist',
      chunkSizeWarningLimit: 1500,
    },
  };
});
