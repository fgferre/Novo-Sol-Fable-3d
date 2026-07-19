// qa:clean — mata processos headless órfãos das suítes Playwright
// (best-effort, silencioso). Um run interrompido de SwiftShader pode deixar
// headless_shell comendo CPU; no Windows isso já congelou a máquina do dono
// (hazard documentado). Só derruba: headless_shell e chrome cujo executável
// vive no cache do Playwright (~/.cache/ms-playwright | %LOCALAPPDATA%\ms-playwright)
// — NUNCA o Chrome de uso pessoal.
const { execSync } = require('child_process');
function run(cmd) { try { execSync(cmd, { stdio: 'ignore' }); } catch (e) { /* best-effort */ } }

if (process.platform === 'win32') {
  run('powershell -NoProfile -Command "' +
    "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'headless_shell.exe' -or " +
    "(($_.Name -like 'chrome*') -and ($_.ExecutablePath -like '*ms-playwright*')) } | " +
    'ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"');
} else {
  run('pkill -f headless_shell');
  run("pkill -f 'ms-playwright.*chrom'");
}
console.log('qa:clean ok');
