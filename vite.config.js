// Configuração Vite do Novo Sol.
// - base './' => o build funciona no GitHub Pages (subcaminho) e abre direto
//   do disco quando empacotado em arquivo único.
// - `npm run build:single` (--mode single) embute JS/CSS num único index.html
//   auto-contido — modo offline/file:// (uso no iPhone). SINGLEFILE=1 segue
//   aceito por compatibilidade, mas o --mode funciona em qualquer shell
//   (o prefixo VAR=1 quebrava no PowerShell/cmd).
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => {
  const single = mode === 'single' || process.env.SINGLEFILE === '1';
  return {
    base: './',
    plugins: single ? [viteSingleFile()] : [],
    build: {
      outDir: single ? 'dist-single' : 'dist',
      chunkSizeWarningLimit: 1500,
    },
  };
});
