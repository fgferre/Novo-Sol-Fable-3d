# Coerência temporal: frames consecutivos (6s de intervalo) devem mudar
# de forma PERCEPTÍVEL (rotação/convecção/vida das regiões) mas SUAVE
# (sem pop de estrutura, sem flicker global).
# Uso: python3 tools/motion-check.py <dir-com-t0..t3.png>
import sys
from PIL import Image

d = sys.argv[1]
imgs = [Image.open(f"{d}/t{i}.png").convert("L") for i in range(4)]
W, H = imgs[0].size
# recorte central (disco) e subamostragem
box = (W//5, H//5, 4*W//5, 4*H//5)
crops = [im.crop(box).resize((160, 120)) for im in imgs]

fails = 0
for i in range(3):
    a, b = crops[i].load(), crops[i+1].load()
    tot = n = 0
    for y in range(120):
        for x in range(160):
            tot += abs(a[x, y] - b[x, y]); n += 1
    md = tot / n
    # calibração: parado ~0; rotação+evolução ~2..20; pop/flash > 30
    ok = 0.8 <= md <= 30.0
    print(('PASS' if ok else 'FAIL'), f'movimento t{i}->t{i+1}: mean|dL| 0.8..30 ->', f'{md:.1f}')
    if not ok: fails += 1
sys.exit(2 if fails else 0)
