/* ── Campo de partículas em canvas ────────────────────────────────────────────
   A referência (antigravity.google) roda 4 canvas e nenhuma biblioteca de
   animação — nem GSAP, nem Three, nem Lenis. Isto aqui segue a mesma escolha:
   canvas + rAF na mão.

   Três variantes, todas do mesmo motor:
     specks  — poeira colorida pálida à deriva (hero)
     grid    — malha de pontos com respiro (faixa divisória)
     stars   — riscos azuis em fundo preto, sensação de velocidade (footer)

   O rAF só existe enquanto o canvas está em tela, e prefers-reduced-motion
   pinta um quadro estático e vai embora.
   ───────────────────────────────────────────────────────────────────────────── */

export type Variant = "specks" | "grid" | "stars";

type P = { x: number; y: number; vx: number; vy: number; r: number; c: string; a: number };

const REDUCE = "(prefers-reduced-motion: reduce)";

/* Paletas em rgb() para o canvas — o CSS não alcança pixels de canvas, então
   estes valores espelham os tokens de landing.css e devem mudar junto. */
const PALETTE: Record<Variant, string[]> = {
  specks: ["225,29,42", "255,107,120", "160,160,170", "120,140,220", "230,180,190"],
  grid: ["18,19,23"],
  stars: ["90,140,255", "150,190,255", "255,255,255"],
};

function make(v: Variant, w: number, h: number, i: number, n: number): P {
  const pal = PALETTE[v];
  const c = pal[i % pal.length];
  if (v === "grid") {
    // Malha regular com jitter — lê como textura, não como caos.
    const cols = Math.ceil(Math.sqrt(n * (w / h)));
    const rows = Math.ceil(n / cols);
    const gx = (i % cols) / cols, gy = Math.floor(i / cols) / rows;
    return {
      x: gx * w + (Math.sin(i * 12.9) * 0.5 + 0.5) * (w / cols),
      y: gy * h + (Math.sin(i * 78.2) * 0.5 + 0.5) * (h / rows),
      vx: 0, vy: 0, r: 1, c, a: 0.5 + Math.sin(i) * 0.3,
    };
  }
  if (v === "stars") {
    return {
      x: Math.random() * w, y: Math.random() * h,
      vx: 0.4 + Math.random() * 2.2, vy: 0,
      r: 0.6 + Math.random() * 1.2, c, a: 0.35 + Math.random() * 0.65,
    };
  }
  return {
    x: Math.random() * w, y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.14, vy: (Math.random() - 0.5) * 0.14,
    r: 0.8 + Math.random() * 1.6, c, a: 0.14 + Math.random() * 0.3,
  };
}

export function initParticles(canvas: HTMLCanvasElement, variant: Variant, density = 1): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  let w = 0, h = 0, dpr = 1;
  let ps: P[] = [];
  let raf = 0;
  let running = false;

  const resize = () => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2); // teto em 2: além disso é só custo
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round((variant === "grid" ? (w * h) / 2600 : (w * h) / 5200) * density);
    ps = Array.from({ length: Math.max(12, Math.min(n, 900)) }, (_, i) => make(variant, w, h, i, n));
    draw();
  };

  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    for (const p of ps) {
      ctx.globalAlpha = p.a;
      if (variant === "stars") {
        // Risco, não ponto: o rastro é o que dá a sensação de velocidade.
        ctx.strokeStyle = `rgb(${p.c})`;
        ctx.lineWidth = p.r;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 6, p.y);
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgb(${p.c})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };

  const tick = () => {
    for (const p of ps) {
      p.x += p.vx; p.y += p.vy;
      // Toro: sai de um lado, entra do outro — sem repovoar array.
      if (p.x > w + 8) p.x = -8; else if (p.x < -8) p.x = w + 8;
      if (p.y > h + 8) p.y = -8; else if (p.y < -8) p.y = h + 8;
    }
    draw();
    raf = requestAnimationFrame(tick);
  };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // Fora da tela não anima: 4 canvas girando ao mesmo tempo é desperdício puro.
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !running) { running = true; raf = requestAnimationFrame(tick); }
    else if (!e.isIntersecting && running) { running = false; cancelAnimationFrame(raf); raf = 0; }
  }, { threshold: 0 });

  resize();

  if (window.matchMedia(REDUCE).matches) {
    // Um quadro parado e ponto final: sem rAF, sem observer de viewport.
    return () => ro.disconnect();
  }
  io.observe(canvas);

  return () => {
    ro.disconnect(); io.disconnect();
    if (raf) cancelAnimationFrame(raf);
  };
}
