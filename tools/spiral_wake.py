"""Hero image for the site (assets/spiral-wake.svg): run `python tools/spiral_wake.py 0.25 24 3.8 0.25`
and copy /tmp/spiral/spiral.svg to assets/spiral-wake.svg.

Spiral density wake of a body on a circular equatorial orbit around a Kerr black hole,
drawn as perturbed 'record grooves' (rings) in SVG.
Wake locus (linear theory, thin disc): dphi_w/dr = -sgn(r - rp) (Omega - Omega_p) / c_s * sqrt(g_rr),
with Omega = 1/(r^1.5 + a) (prograde Kerr), c_s = h r Omega and g_rr = r^2/Delta.
Amplitudes are schematic."""
import numpy as np, sys
from scipy.integrate import cumulative_trapezoid
a, rp, h = 0.7, 12.0, float(sys.argv[1]) if len(sys.argv) > 1 else 0.07
risco = 3.393
Om = lambda r: 1 / (r ** 1.5 + a)
Delta = lambda r: r * r - 2 * r + a * a
rr = np.linspace(risco, 46, 6000)
f = (Om(rr) - Om(rp)) / (h * rr * Om(rr)) * rr / np.sqrt(Delta(rr))
ip = np.argmin(abs(rr - rp))
I = cumulative_trapezoid(f, rr, initial=0); I -= I[ip]
phiw = -np.sign(rr - rp) * I          # wake azimuth vs r (perturber at phi = 0)
def wake_phi(r): return np.interp(r, rr, phiw)
def amp(r):
    x = abs(r - rp) / (h * rp)
    return np.where(x < 1, 0.4 + 0.6 * x, 1.0) * (1 + x) ** -0.35 * np.exp(-((r - risco) / 0.6) ** -2 * 0)  # rises over the near zone then decays
nring = int(sys.argv[2]) if len(sys.argv) > 2 else 44
AMP = float(sys.argv[3]) if len(sys.argv) > 3 else 2.2
R0, R1 = risco + 0.6, 45.0
rings = np.linspace(R0 ** 0.62, R1 ** 0.62, nring) ** (1 / 0.62)
SZ = 1000; C = SZ / 2; Rmax = 470
scale = lambda r: 70 + (Rmax - 70) * (r ** 0.62 - R0 ** 0.62) / (R1 ** 0.62 - R0 ** 0.62)
phi = np.linspace(0, 2 * np.pi, 1441)
paths = []
crests = []
CREST = float(sys.argv[4]) if len(sys.argv) > 4 else 0.35
for r in rings:
    pw = wake_phi(r)
    d = (phi - pw + np.pi) % (2 * np.pi) - np.pi
    sig = 0.10 + 0.5 * h * (1 + abs(r - rp) / rp) ** 0.5
    bump = amp(r) * np.exp(-0.5 * (d / sig) ** 2)
    spacing = (Rmax - 70) / nring
    R = scale(r) + AMP * spacing * bump
    # disc rotates counter-clockwise on screen: x = cos, y = -sin
    x, y = C + R * np.cos(phi), C - R * np.sin(phi)
    paths.append('M' + ' L'.join(f'{u:.0f},{v:.0f}' for u, v in zip(x[::3], y[::3])) + 'Z')
    # the crest of the wake on this ring, drawn heavier so the arms read as spirals
    on = bump > CREST
    segs = []
    i = 0
    while i < len(phi):
        if on[i]:
            j = i
            while j + 1 < len(phi) and on[j + 1]: j += 1
            if j - i > 3:
                segs.append('M' + ' L'.join(f'{u:.1f},{v:.1f}' for u, v in zip(x[i:j + 1:2], y[i:j + 1:2])))
            i = j + 1
        else:
            i += 1
    crests.append(segs)
rplus = 1 + np.sqrt(1 - a * a)
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SZ} {SZ}" role="img" aria-label="Spiral density wake raised in a thin disc by a body orbiting a spinning black hole, drawn as record grooves">']
for p, cs in zip(reversed(paths), reversed(crests)):   # outer first, so each inner ring's bump occludes the ring beyond it
    svg.append(f'<path d="{p}" fill="#5e1120" stroke="#f1e4d6" stroke-width="1.6" stroke-linejoin="round"/>')
    for c in cs:
        svg.append(f'<path d="{c}" fill="none" stroke="#f1e4d6" stroke-width="5.2" stroke-linecap="round" stroke-linejoin="round"/>')
svg.append(f'<circle cx="{C}" cy="{C}" r="44" fill="#120c0e"/>')
svg.append(f'<circle cx="{C}" cy="{C}" r="52" fill="none" stroke="#f1e4d6" stroke-width="1" stroke-dasharray="2 4" opacity=".7"/>')
px, py = C + scale(rp) , C
svg.append(f'<circle cx="{px:.1f}" cy="{py:.1f}" r="11" fill="#5e1120" stroke="#f1e4d6" stroke-width="2.4"/>')
svg.append('</svg>')
__import__('os').makedirs('/tmp/spiral', exist_ok=True); open(f'/tmp/spiral/spiral.svg', 'w').write('\n'.join(svg))
print('wake phi at r=4,8,20,40:', [round(float(wake_phi(r)), 2) for r in (4, 8, 20, 40)])
