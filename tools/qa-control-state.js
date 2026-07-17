// QA estrutural do contrato único de controles. Valida schema/store/DOM,
// persistência, prioridade URL, diretor, gates, reset e HUD sem comparar pixels.
const path = require('path');
const { chromium } = require('playwright');

const htmlFile = process.argv[2] || 'dist-single/index.html';
const base = 'file://' + path.resolve(htmlFile);
let fails = 0;
function check(name, ok, detail){
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '  (' + detail + ')' : ''));
}

(async () => {
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(420000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  async function open(extra){
    const q = 'det=1&seed=17&hold=2&tier=high&scale=1' + (extra ? '&' + extra : '');
    await page.goto(base + '?' + q);
    await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 4);
  }

  await open('');
  await page.evaluate(() => localStorage.clear());

  const sweep = await page.evaluate(() => {
    const all = window.__solInfo.controls();
    const result = [];
    Object.keys(all).forEach((key) => {
      const seed = all[key];
      const values = [seed.min, seed.default, seed.max];
      const samples = values.map((value) => {
        window.__solInfo.setControl(key, value);
        const info = window.__solInfo.controls(key);
        const input = document.querySelector('#control-' + key);
        return { requested:value, info, dom:input ? +input.value : null };
      });
      window.__solInfo.setControl(key, seed.default);
      result.push({ key, samples });
    });
    return result;
  });
  const sweepBad = [];
  sweep.forEach(({ key, samples }) => {
    samples.forEach((s) => {
      if (Math.abs(s.info.nominal - s.requested) > 1e-8 ||
          Math.abs(s.info.applied - s.requested) > 1e-8 ||
          (s.dom !== null && Math.abs(s.dom - s.requested) > 1e-8))
        sweepBad.push(key + '@' + s.requested);
    });
    const a = JSON.stringify(samples[0].info.metrics);
    const b = JSON.stringify(samples[2].info.metrics);
    if (a === b && !samples[2].info.reason) sweepBad.push(key + ':metric-flat');
  });
  check('mínimo/default/máximo atualizam store, consumidor e DOM', sweepBad.length === 0,
    sweepBad.slice(0, 8).join(', '));

  const deadZones = await page.evaluate(() => {
    const all = window.__solInfo.controls();
    const flat = [];
    Object.keys(all).forEach((key) => {
      const d = all[key]; let previous = null;
      const count = Math.round((d.max - d.min) / d.step);
      for (let i = 0; i <= count; i++) {
        const value = i === count ? d.max : d.min + i*d.step;
        window.__solInfo.setControl(key, value);
        const info = window.__solInfo.controls(key);
        const metric = JSON.stringify(info.metrics);
        if (previous !== null && metric === previous && !info.reason) flat.push(key + '@' + value.toFixed(4));
        previous = metric;
      }
      window.__solInfo.setControl(key, d.default);
    });
    return flat;
  });
  check('sweep por step não contém faixa plana silenciosa', deadZones.length === 0,
    deadZones.slice(0, 8).join(', '));

  const persisted = await page.evaluate(() => {
    const all = window.__solInfo.controls();
    const expected = {};
    Object.keys(all).forEach((key) => {
      const d = all[key];
      const v = d.min + (d.max - d.min) * 0.37;
      expected[key] = window.__solInfo.setControl(key, v);
    });
    return expected;
  });
  await page.reload();
  await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 4);
  const restored = await page.evaluate(() => window.__solInfo.controls());
  const persistBad = Object.keys(persisted).filter((k) =>
    Math.abs(restored[k].nominal - persisted[k]) > 1e-8 || restored[k].source !== 'storage');
  check('persistência e reload reconstroem todos os controles', persistBad.length === 0,
    persistBad.slice(0, 8).join(', '));

  await open('speed=999&fprom=-9&bloom=nao-numero');
  const priority = await page.evaluate(() => ({
    speed:window.__solInfo.controls('speed'),
    fprom:window.__solInfo.controls('fprom'),
    bloom:window.__solInfo.controls('bloom'),
  }));
  check('URL vence storage e valores são clampados',
    priority.speed.nominal === 3 && priority.speed.source === 'url' &&
    priority.fprom.nominal === 0 && priority.fprom.source === 'url');
  check('URL inválida recua para storage', priority.bloom.source === 'storage');
  await page.evaluate(() => localStorage.clear());

  await open('');
  const buttonDirector = await page.evaluate(() => {
    window.__solInfo.directorStart();
    return { director:window.__solInfo.directorInfo(), dof:window.__solInfo.controls('dof'),
      cme:window.__solInfo.controls('cme') };
  });
  await open('director=1');
  const urlDirector = await page.evaluate(() => ({
    director:window.__solInfo.directorInfo(), dof:window.__solInfo.controls('dof'),
    cme:window.__solInfo.controls('cme') }));
  check('diretor por URL e botão usa a mesma inicialização',
    buttonDirector.director.active && urlDirector.director.active &&
    buttonDirector.dof.applied === urlDirector.dof.applied &&
    buttonDirector.cme.applied === urlDirector.cme.applied &&
    buttonDirector.dof.nominal === urlDirector.dof.nominal &&
    buttonDirector.dof.reason === 'director-override' && urlDirector.dof.reason === 'director-override');
  const edited = await page.evaluate(() => {
    window.__solInfo.directorSkip(65);
    window.__solInfo.setControl('lapse', 0.2);
    return { director:window.__solInfo.directorInfo(), lapse:window.__solInfo.controls('lapse') };
  });
  check('editar encerra diretor antes de aplicar valor nominal',
    !edited.director.active && edited.lapse.nominal === 0.2 && edited.lapse.applied === 0.2);

  await open('burst=1&dof=1&cme=1');
  const transient = await page.evaluate(() => ({ burst:window.__solInfo.controls('burst'),
    dof:window.__solInfo.controls('dof'), cme:window.__solInfo.controls('cme') }));
  check('gates transitórios expõem códigos sem bloquear o nominal',
    transient.burst.reason === 'waiting-flare' && transient.burst.nominal === 1 &&
    transient.dof.reason === 'fit-framing' && transient.dof.nominal === 1 &&
    transient.cme.reason === 'waiting-flare' && transient.cme.nominal === 1);

  await open('cme=1&cvol=1');
  const killed = await page.evaluate(() => ({
    cme:window.__solInfo.setAutoTuneKill('cme', true),
    cvol:window.__solInfo.setAutoTuneKill('cvol', true),
  }));
  check('kill-switch preserva nominal e expõe motivo estável',
    killed.cme.nominal === 1 && killed.cme.effective === 0 && killed.cme.reason === 'autotune-disabled' &&
    killed.cvol.nominal === 1 && killed.cvol.effective === 0 && killed.cvol.reason === 'autotune-disabled');
  await open('tier=low&cme=1&cvol=1');
  await page.click('#knobBtn');
  const low = await page.evaluate(() => ({
    cme:window.__solInfo.controls('cme'), cvol:window.__solInfo.controls('cvol'),
    cmeDisabled:document.querySelector('#control-cme').disabled,
    cvolDisabled:document.querySelector('#control-cvol').disabled,
  }));
  check('tier low desabilita CME/CVOL sem apagar o nominal',
    low.cme.nominal === 1 && low.cvol.nominal === 1 &&
    low.cme.reason === 'tier-unavailable' && low.cvol.reason === 'tier-unavailable' &&
    low.cmeDisabled && low.cvolDisabled);

  await open('');
  await page.click('#knobBtn');
  await page.getByRole('switch', { name:'HUD de FPS' }).click();
  const hudSwitch = await page.evaluate(() => ({
    aria:document.querySelector('[aria-label="HUD de FPS"]').getAttribute('aria-checked'),
    visible:Array.from(document.body.children).some((el) => el.style && el.style.pointerEvents === 'none' && el.style.display === 'block' && /ui-monospace/.test(el.style.font)),
  }));
  check('switch do HUD sincroniza estado acessível e visibilidade', hudSwitch.aria === 'true' && hudSwitch.visible);
  await page.click('#knobBtn');
  await page.mouse.move(420, 300); await page.mouse.down();
  await page.waitForTimeout(1100); await page.mouse.up();
  const hudLong = await page.evaluate(() => document.querySelector('[aria-label="HUD de FPS"]').getAttribute('aria-checked'));
  check('long-press real percorre o mesmo estado do HUD', hudLong === 'false');

  await open('director=1&hud=1&speed=2&profile=1');
  await page.evaluate(() => { window.__solInfo.setControl('grain', 3); localStorage.setItem('solTier','ultra'); });
  await page.click('#knobBtn');
  page.once('dialog', (d) => d.accept());
  await Promise.all([
    page.waitForNavigation({ waitUntil:'load' }),
    page.click('#knobReset'),
  ]);
  await page.waitForFunction(() => window.__solInfo && window.__solInfo.frame > 4);
  const reset = await page.evaluate(() => ({
    q:Object.fromEntries(new URL(location.href).searchParams.entries()),
    knobs:localStorage.getItem('solKnobs'), tier:localStorage.getItem('solTier'),
    director:window.__solInfo.directorInfo(),
  }));
  check('reset confirmado restaura sessão e preserva diagnóstico',
    !reset.q.director && !reset.q.hud && !reset.q.speed && !reset.q.tier && !reset.q.scale &&
    reset.q.det === '1' && reset.q.seed === '17' && reset.q.hold === '2' && reset.q.profile === '1' &&
    reset.knobs === null && reset.tier === null && !reset.director.active);

  check('console sem erros', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  if (fails){ console.log('QA ESTADO: ' + fails + ' FALHA(S)'); process.exitCode = 1; }
  else console.log('QA ESTADO: tudo verde');
})().catch((e) => { console.error(e); process.exitCode = 2; });
