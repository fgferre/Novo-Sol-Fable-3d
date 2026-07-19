// ui/help.js — PR-14 · ajuda "?" ao lado de cada controle do painel.
//
// UM tooltip compartilhado (#helpTip, role=tooltip) reposicionado por linha
// (padrão do edu label — nunca um elemento por controle), posicionado acima
// ou abaixo da linha conforme o espaço visível no scroll do drawer e
// clampado ao viewport. Interações:
//   desktop  → mouseenter abre, mouseleave fecha (com tolerância para o
//              ponteiro entrar no tooltip — WCAG 1.4.13: hoverable);
//   teclado  → focus abre, blur/Esc fecha (o Esc do tooltip vence o Esc do
//              painel via listener em captura, o drawer fica aberto);
//   touch    → press-and-hold ~450 ms abre (pedido literal do dono);
//              cancela se o dedo mover >8 px ou soltar antes; soltar fora
//              do "?" fecha; toque simples no "?" TAMBÉM abre — decisão
//              documentada: o long-press é o pedido, o tap é o bônus barato
//              de acessibilidade; tocar fora fecha.
// Scroll do painel fecha. aria-describedby aponta ao tooltip aberto.
// Completude como código: button() emite console.warn('[help] sem ajuda:')
// para qualquer key sem entrada PT+EN — tools/qa-panel-help.js cobra zero.

import { HELP } from './strings.js';

export function createPanelHelp(panel, opts){
  var tip = document.createElement('div');
  tip.id = 'helpTip'; tip.setAttribute('role','tooltip'); tip.hidden = true;
  var what = document.createElement('div'); what.className = 'helpWhat';
  var visual = document.createElement('div'); visual.className = 'helpVisual';
  var visualHead = document.createElement('span'); visualHead.className = 'helpVisualHead';
  var visualBody = document.createElement('span'); visualBody.className = 'helpVisualBody';
  visual.appendChild(visualHead); visual.appendChild(visualBody);
  var edu = document.createElement('div'); edu.className = 'helpEdu'; edu.hidden = true;
  tip.appendChild(what); tip.appendChild(visual); tip.appendChild(edu);
  panel.appendChild(tip);

  var openBtn = null, closeTimer = 0, press = null, openedAt = 0;

  function entryFor(key){
    var lang = opts.lang();
    return (HELP[lang] && HELP[lang][key]) || HELP.pt[key] || null;
  }
  function renderTip(key){
    var e = entryFor(key); if (!e) return false;
    what.textContent = e.what;
    visualHead.textContent = opts.visualHead();
    visualBody.textContent = e.visual;
    edu.hidden = !e.edu;
    edu.textContent = e.edu ? '☉ ' + e.edu : '';
    return true;
  }
  // O tooltip é filho ABSOLUTO do drawer (que rola): top é em coordenadas de
  // conteúdo. Acima da linha quando há espaço visível; senão abaixo; sempre
  // clampado para o retângulo final caber inteiro na janela.
  function positionTip(btn){
    var row = btn.closest('.row,.switch,.choice,.sec,.helpRow') || btn;
    var panelRect = panel.getBoundingClientRect();
    var rowRect = row.getBoundingClientRect();
    var tipH = tip.offsetHeight;
    var contentTop = rowRect.top - panelRect.top + panel.scrollTop;
    var top = (rowRect.top - panelRect.top >= tipH + 18)
      ? contentTop - tipH - 8
      : contentTop + rowRect.height + 8;
    var viewTop = top - panel.scrollTop + panelRect.top;
    if (viewTop < 8) top += 8 - viewTop;
    var overflow = (top - panel.scrollTop + panelRect.top + tipH) - (window.innerHeight - 8);
    if (overflow > 0) top -= overflow;
    tip.style.top = Math.round(top) + 'px';
  }
  function open(btn){
    clearTimeout(closeTimer); closeTimer = 0;
    if (openBtn === btn && !tip.hidden) return;
    if (!renderTip(btn.dataset.helpKey)) return;
    if (openBtn && openBtn !== btn) openBtn.removeAttribute('aria-describedby');
    openBtn = btn; openedAt = performance.now();
    tip.hidden = false;
    positionTip(btn);
    btn.setAttribute('aria-describedby', tip.id);
    tip.classList.remove('on');
    requestAnimationFrame(function(){ if (!tip.hidden) tip.classList.add('on'); });
  }
  function close(){
    clearTimeout(closeTimer); closeTimer = 0;
    if (openBtn) openBtn.removeAttribute('aria-describedby');
    openBtn = null;
    tip.classList.remove('on');
    tip.hidden = true;
  }
  function scheduleClose(){
    clearTimeout(closeTimer);
    closeTimer = setTimeout(close, 140);
  }

  // WCAG 1.4.13: conteúdo em hover precisa ser "hoverable" — entrar no
  // tooltip cancela o fechamento agendado pelo mouseleave do "?".
  tip.addEventListener('mouseenter', function(){ clearTimeout(closeTimer); closeTimer = 0; });
  tip.addEventListener('mouseleave', scheduleClose);

  // Esc fecha SÓ o tooltip: captura no window vence o handler de Esc do
  // painel (bubble), então o drawer permanece aberto.
  window.addEventListener('keydown', function(ev){
    if (ev.key === 'Escape' && openBtn){ ev.stopPropagation(); ev.preventDefault(); close(); }
  }, true);

  // Toque/clique fora fecha (desktop e touch).
  document.addEventListener('pointerdown', function(ev){
    if (!openBtn) return;
    if (tip.contains(ev.target) || openBtn.contains(ev.target)) return;
    close();
  }, true);

  // Scroll do painel fecha — com carência de 250 ms após abrir: focar ou
  // pairar num "?" fora da dobra faz o navegador rolar o drawer sozinho, e
  // esse scroll de cortesia não deve matar o tooltip recém-aberto (ele é
  // ancorado ao conteúdo, então rola colado na linha).
  panel.addEventListener('scroll', function(){
    if (openBtn && performance.now() - openedAt > 250) close();
  }, { passive:true });

  window.addEventListener('pointermove', function(ev){
    if (!press || press.canceled) return;
    var dx = ev.clientX - press.x, dy = ev.clientY - press.y;
    if (dx*dx + dy*dy > 64){ clearTimeout(press.timer); press.canceled = true; }
  }, true);
  // Toque tem pointer capture implícito no alvo do pointerdown, então o
  // target do pointerup é sempre o "?" — o teste "soltou fora?" usa as
  // coordenadas contra o retângulo do botão, não o target.
  window.addEventListener('pointerup', function(ev){
    if (!press) return;
    var p = press; press = null; clearTimeout(p.timer);
    var r = p.btn.getBoundingClientRect();
    var inside = ev.clientX >= r.left && ev.clientX <= r.right &&
                 ev.clientY >= r.top && ev.clientY <= r.bottom;
    if (!p.canceled && inside) open(p.btn);          // tap curto = bônus
    else if (openBtn === p.btn && !inside) close();  // soltar fora fecha
  }, true);
  window.addEventListener('pointercancel', function(){
    if (press){ clearTimeout(press.timer); press = null; }
  }, true);

  function button(key, labelFn){
    if (!HELP.pt[key] || !HELP.en[key]) console.warn('[help] sem ajuda: ' + key);
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'helpBtn'; btn.dataset.helpKey = key;
    opts.register(function(){
      btn.setAttribute('aria-label', opts.aria().replace('{label}', labelFn()));
    });
    btn.addEventListener('mouseenter', function(){ open(btn); });
    btn.addEventListener('mouseleave', scheduleClose);
    btn.addEventListener('focus', function(){ open(btn); });
    btn.addEventListener('blur', function(){ if (openBtn === btn) close(); });
    btn.addEventListener('click', function(ev){ ev.preventDefault(); open(btn); });
    btn.addEventListener('contextmenu', function(ev){ ev.preventDefault(); });
    btn.addEventListener('pointerdown', function(ev){
      if (ev.pointerType !== 'touch') return;
      if (press) clearTimeout(press.timer);
      press = { btn:btn, x:ev.clientX, y:ev.clientY, canceled:false,
        timer: setTimeout(function(){ open(btn); }, 450) };
    });
    return btn;
  }

  function applyLanguage(){
    if (openBtn){ renderTip(openBtn.dataset.helpKey); positionTip(openBtn); }
  }

  return { button:button, applyLanguage:applyLanguage, close:close };
}
