# Verificação NUMÉRICA por elemento, com critérios derivados das refs.
# Uso: python3 analyze.py <dir-capturas> <ref-01.jpeg>
import sys, math
from PIL import Image

d = sys.argv[1]
ref01 = sys.argv[2]

def lum(px):
    return 0.299*px[0] + 0.587*px[1] + 0.114*px[2]

results = []

# ---------- A. LIMBO (ref-02: escurecimento suave) ----------
im = Image.open(d + '/element-limb.png').convert('RGB')
W, H = im.size
cx, cy = W//2, H//2
Lc = lum(im.getpixel((cx, cy)))
# acha o raio do disco: varre para a direita até cair abaixo de 25% do centro
R = None
for x in range(cx, W-1):
    if lum(im.getpixel((x, cy))) < Lc*0.25:
        R = x - cx
        break
assert R, 'disco nao encontrado'
def Lr(f):  # média de 8 direções no raio fracionário f
    tot = 0
    for k in range(8):
        a = k*math.pi/4
        x = int(cx + f*R*math.cos(a)); y = int(cy + f*R*math.sin(a))
        tot += lum(im.getpixel((x, y)))
    return tot/8
ratio = Lr(0.92)/Lr(0.30)
results.append(('A limbo: L(0.92R)/L(0.30R) em [0.45,0.90]', 0.45 <= ratio <= 0.90, f'{ratio:.2f}'))

# ---------- D. ESPÍCULAS (ref-05: franja tufada, altura variável) ----------
fringes = []
for k in range(64):
    a = k*2*math.pi/64
    # borda do disco: onde L cai abaixo de 50% do interior próximo (0.85R);
    # extensão externa: último raio com L > 9 (franja de espículas)
    Lin = lum(im.getpixel((int(cx+0.85*R*math.cos(a)), int(cy+0.85*R*math.sin(a)))))
    rdisk = redge = R
    for rr in range(int(R*0.90), int(R*1.15)):
        x = int(cx + rr*math.cos(a)); y = int(cy + rr*math.sin(a))
        if not (0 <= x < W and 0 <= y < H):
            break
        L = lum(im.getpixel((x, y)))
        if L > 0.5*Lin:
            rdisk = rr
        if L > 9:
            redge = rr
    fringes.append(max(redge - rdisk, 0))
mean_f = sum(fringes)/len(fringes)
max_f = max(fringes)
tufted = max_f / (mean_f + 1e-6)
results.append(('D espículas: franja média 2..14px', 2 <= mean_f <= 14, f'{mean_f:.1f}px'))
results.append(('D espículas: tufos (max/média) > 1.7', tufted > 1.7, f'{tufted:.2f}'))

# ---------- B. MANCHA+PLAGE (ref-03: umbra escura compacta EM plage clara) ----------
ims = Image.open(d + '/element-spot.png').convert('RGB')
Ws, Hs = ims.size
csx, csy = Ws//2, Hs//2
# umbra: mínimo numa janela central; quiet: mediana global do disco (amostra)
win = 130
umbra = min(lum(ims.getpixel((csx+dx, csy+dy))) for dx in range(-win, win, 6) for dy in range(-win, win, 6))
import statistics
sample = [lum(ims.getpixel((x, y))) for x in range(40, Ws-40, 24) for y in range(40, Hs-40, 24)]
quiet = statistics.median(sample)
plage = max(lum(ims.getpixel((csx+dx, csy+dy))) for dx in range(-260, 260, 8) for dy in range(-260, 260, 8))
results.append(('B umbra escura: L_umbra/L_quiet < 0.45', umbra/quiet < 0.45, f'{umbra/quiet:.2f}'))
results.append(('B plage clara: L_plage/L_quiet > 1.10', plage/quiet > 1.10, f'{plage/quiet:.2f}'))

# ---------- F. FIBRILAS (ref-01: anisotropia/coerência da textura) ----------
def coherence(img, x0, y0, size):
    # tensor de estrutura médio num crop (sem numpy)
    g = img.convert('L')
    px = g.load()
    Jxx = Jyy = Jxy = 0.0
    n = 0
    for y in range(y0+1, y0+size-1, 2):
        for x in range(x0+1, x0+size-1, 2):
            gx = (px[x+1, y] - px[x-1, y]) * 0.5
            gy = (px[x, y+1] - px[x, y-1]) * 0.5
            Jxx += gx*gx; Jyy += gy*gy; Jxy += gx*gy
            n += 1
    Jxx/=n; Jyy/=n; Jxy/=n
    tr = Jxx+Jyy
    det = Jxx*Jyy - Jxy*Jxy
    disc = max(tr*tr/4 - det, 0)**0.5
    l1, l2 = tr/2+disc, tr/2-disc
    return (l1-l2)/(l1+l2+1e-9)

# coerência LOCAL média (janelas 48px): fibrilas reais têm direção local forte
def mean_local_coherence(img, x0, y0, wtotal, win=48):
    vals = []
    for yy in range(y0, y0+wtotal-win, win):
        for xx in range(x0, x0+wtotal-win, win):
            vals.append(coherence(img, xx, yy, win))
    return sum(vals)/len(vals)

imf = Image.open(d + '/element-fibril.png').convert('RGB')
imr = Image.open(ref01).convert('RGB')
c_ours = mean_local_coherence(imf, imf.size[0]//2-240, imf.size[1]//2-240, 480)
c_ref  = mean_local_coherence(imr, imr.size[0]//2-240, imr.size[1]//2-240, 480)
results.append(('F fibrilas: coerência local >= 55% da ref-01', c_ours >= 0.55*c_ref, f'nossa {c_ours:.3f} vs ref {c_ref:.3f}'))

# ---------- G. DISCIPLINA TONAL (empírico: refs 02/03 têm sol calmo
# suave — spread (P90-P10)/mediana ~0.10-0.16 no disco em enquadramento
# cheio; um "pelo" muito contrastado de longe é irreal) ----------
def center_grid(img, half=300, step=3):
    Wc, Hc = img.size
    x0, y0 = Wc//2-half, Hc//2-half
    return [[lum(img.getpixel((x0+ix*step, y0+iy*step)))
             for ix in range(2*half//step)] for iy in range(2*half//step)]

Lg = center_grid(im)
flatL = sorted(v for row in Lg for v in row)
nL = len(flatL)
medL = flatL[nL//2]
# exclui umbra/penumbra (<0.6·med): manchas são legitimamente escuras; o
# gate mede a disciplina tonal do SOL CALMO, e a fração de mancha no crop
# varia com a cena (deixava a métrica oscilar 0.35-0.38 sem regressão real)
quietL = [v for v in flatL if v >= 0.6*medL]
nQ = len(quietL)
medQ = quietL[nQ//2]
spread = (quietL[int(0.90*nQ)] - quietL[int(0.10*nQ)]) / max(medQ, 1e-6)
results.append(('G tom do sol calmo (sem umbra): spread em [0.08,0.36]',
                0.08 <= spread <= 0.36, f'{spread:.3f}'))

# ---------- H. FILAMENTOS (empírico: refs 02/03 mostram canais escuros
# ALONGADOS serpenteando no disco — exige componente conexo escuro com
# span grande e baixo preenchimento de bbox; manchas são compactas) ----------
from collections import deque
gw = gh = len(Lg)
# H recalibrado (envelope GONG 2012-2026, calibração dos filamentos):
# canais reais são FINOS (0.005-0.012R ~ 2-4px neste enquadramento) — o
# grid de passo 3 quebrava a conectividade e a área mínima de 300
# células só era atingível pelo emaranhado antigo. Grid 1px só para
# este gate; espessura ~3px + span baixo + fill baixo = canal alongado.
# LOOP-9 iter1: span 60px (0.163R) sub-reportava — sentava no P90 dos
# canais (R=369px no enquadramento element-limb), ACIMA do núcleo GONG
# 0.08-0.15R (~30-55px), e só contava os blobs quadrados gordos
# (fill~0.44). Census de 4 reloads: 12 canais finos reais (largura
# 0.031R, fill 0.35) vivem na faixa [40,60)px e passavam despercebidos.
# Span>=40px (~0.11R) + área>=100 = núcleo GONG; contagem 1→~5/face.
LgF = center_grid(im, 300, 1)
gwF = ghF = len(LgF)
flatF = sorted(v for row in LgF for v in row)
medF = flatF[len(flatF)//2]
thrF = 0.84*medF
# LOOP-9 iter3: máscara de DISCO INTERNO (0.9R). O crop de 600px tem os 4
# CANTOS fora do disco (R~369px; canto a 424px) e o anel de escurecimento
# de limbo (~0.9-1.0R) cai abaixo de 0.84*med — ambos eram contados como
# "canal", inflando a cobertura (census 2.14% -> 0.90% no disco) e criando
# um FALSO "complexo de loops" (17-27% de densidade local era limbo+cantos;
# o interior real fica ~9%, sem trança — 10/10 reloads). Consistente com o
# gate I, que já mascara o disco. Não afeta o passe (>=1), mas honesta a contagem.
diskR2 = (0.9*R)**2
maskF = [[LgF[iy][ix] < thrF and ((ix-gwF//2)**2 + (iy-ghF//2)**2) < diskR2
          for ix in range(gwF)] for iy in range(ghF)]
seenF = [[False]*gwF for _ in range(ghF)]
filaments = 0
for iy in range(ghF):
    for ix in range(gwF):
        if maskF[iy][ix] and not seenF[iy][ix]:
            q = deque([(ix, iy)]); seenF[iy][ix] = True
            area = 0; mnx = mxx = ix; mny = mxy = iy
            while q:
                cx, cy = q.popleft(); area += 1
                mnx = min(mnx, cx); mxx = max(mxx, cx)
                mny = min(mny, cy); mxy = max(mxy, cy)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx+dx, cy+dy
                    if 0 <= nx < gwF and 0 <= ny < ghF and maskF[ny][nx] and not seenF[ny][nx]:
                        seenF[ny][nx] = True; q.append((nx, ny))
            bw, bh = mxx-mnx+1, mxy-mny+1
            if max(bw, bh) >= 40 and area >= 100 and area/(bw*bh) <= 0.45:
                filaments += 1
results.append(('H filamentos: >=1 canal escuro alongado no disco',
                filaments >= 1, f'{filaments} canais'))

# ---------- I. TAMANHO DE MANCHA (empírico ref-07 GONG: umbras reais têm
# 3.5-60 Mm — na nossa captura, componente escuro COMPACTO (mancha) deve
# ter span <= 16 células (~0.12 R com penumbra). Restrito ao interior do
# disco: os cantos do crop caem no céu e não podem contaminar ----------
def insideDisk(ix, iy):
    return (ix-gw//2)**2 + (iy-gh//2)**2 < (gw*0.475)**2

sI = sorted(Lg[iy][ix] for iy in range(gh) for ix in range(gw) if insideDisk(ix, iy))
medI = sI[len(sI)//2]
maskI = [[insideDisk(ix, iy) and Lg[iy][ix] < 0.55*medI for ix in range(gw)] for iy in range(gh)]
seenI = [[False]*gw for _ in range(gh)]
worstSpan = 0
for iy in range(gh):
    for ix in range(gw):
        if maskI[iy][ix] and not seenI[iy][ix]:
            q = deque([(ix, iy)]); seenI[iy][ix] = True
            area = 0; mnx = mxx = ix; mny = mxy = iy
            while q:
                cx, cy = q.popleft(); area += 1
                mnx = min(mnx, cx); mxx = max(mxx, cx)
                mny = min(mny, cy); mxy = max(mxy, cy)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx+dx, cy+dy
                    if 0 <= nx < gw and 0 <= ny < gh and maskI[ny][nx] and not seenI[ny][nx]:
                        seenI[ny][nx] = True; q.append((nx, ny))
            bw, bh = mxx-mnx+1, mxy-mny+1
            if area >= 8 and area/(bw*bh) > 0.42:   # compacto = mancha
                worstSpan = max(worstSpan, max(bw, bh))
results.append(('I manchas: span compacto <= 16 células (~0.12 R)',
                worstSpan <= 16, f'maior span {worstSpan}'))

fails = 0
for name, ok, detail in results:
    print(('PASS' if ok else 'FAIL'), name, '->', detail)
    if not ok: fails += 1
sys.exit(2 if fails else 0)
