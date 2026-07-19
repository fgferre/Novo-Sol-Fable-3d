// ui/postcard.js — composição do postal "guardar esta vista" (PR-12).
// Recebe o dataURL capturado NO MESMO FRAME pelo hook ctx.capturePostcard
// (main.js) — nunca preserveDrawingBuffer — e compõe num canvas 2D offscreen:
// a imagem inteira + uma faixa inferior discreta com a marca do museu e a
// URL do site em fonte pequena. Módulo puro de composição: quem decide
// share/download é o painel.

// Mesma paleta do chrome do museu (edu.js/panel.js): fundo quase-preto
// azulado, linha separadora âmbar, texto quente.
var BAND_BG = 'rgba(7,9,15,0.88)';
var BAND_LINE = '#ffaa5a';
var BAND_TEXT = '#ffd9a8';
var BAND_URL = 'rgba(233,228,218,0.60)';

export var POSTCARD_FILE = 'sol-postal.png';
export var POSTCARD_URL = 'fgferre.github.io/Novo-Sol-Fable-3d';

// composePostcard(sourceDataURL, brand, done): decodifica a captura, desenha
// a faixa e devolve o canvas composto via done(canvas) — done(null) em erro.
// A faixa escala com a altura da imagem (mín. 30px para legibilidade em
// capturas pequenas) e nunca cobre mais que ~10% do quadro.
export function composePostcard(sourceDataURL, brand, done){
  var img = new Image();
  img.onload = function(){
    try {
      var w = img.naturalWidth, h = img.naturalHeight;
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var g = canvas.getContext('2d');
      g.drawImage(img, 0, 0);
      var band = Math.max(30, Math.round(h * 0.10));
      var line = Math.max(1, Math.round(band * 0.05));
      g.fillStyle = BAND_BG;
      g.fillRect(0, h - band, w, band);
      g.fillStyle = BAND_LINE;
      g.fillRect(0, h - band, w, line);
      var pad = Math.round(band * 0.42);
      var brandPx = Math.max(11, Math.round(band * 0.34));
      var urlPx = Math.max(8, Math.round(brandPx * 0.68));
      g.textBaseline = 'middle';
      g.fillStyle = BAND_TEXT;
      g.font = '600 ' + brandPx + 'px system-ui, -apple-system, sans-serif';
      g.fillText(brand, pad, h - band * 0.62);
      g.fillStyle = BAND_URL;
      g.font = urlPx + 'px system-ui, -apple-system, sans-serif';
      g.fillText(POSTCARD_URL, pad, h - band * 0.24);
      done(canvas);
    } catch (e){ done(null); }
  };
  img.onerror = function(){ done(null); };
  img.src = sourceDataURL;
}
