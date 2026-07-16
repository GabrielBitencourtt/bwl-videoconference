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

/* Uma partícula tem duas posições somadas na hora de desenhar:
     x,y      — a deriva base, contínua e com wrap no toro
     ox,oy    — o deslocamento causado pelo cursor, com mola de volta a zero
   Separar as duas é o que permite o cursor puxar sem matar a deriva: se o
   amortecimento agisse sobre a velocidade base, o campo congelaria depois do
   primeiro gesto. */
type P = {
  x: number; y: number; vx: number; vy: number;
  ox: number; oy: number; ovx: number; ovy: number;
  r: number; c: string; a: number;
};

const REDUCE = "(prefers-reduced-motion: reduce)";

/* Física da atração.
   O deslocamento de equilíbrio é ~PULL/SPRING: é essa razão, não o PULL
   sozinho, que decide se o aglomerado aparece. Com SPRING 0.008 o equilíbrio
   ficava em ~34px — invisível dentro de um raio de 200px. Em 0.0018 passa a
   ~150px, que é o que faz as partículas realmente se reunirem.
   DAMP 0.88 mantém a velocidade saturada em ~PULL/(1-DAMP), sem explodir. */
const R = 260;          // raio de influência
const R2 = R * R;
const PULL = 0.8;       // atração radial
const SWIRL = 0.55;     // componente tangencial: orbita em vez de colapsar
const INNER = 62;       // solta perto do centro → junta AO REDOR, não em cima
const SPRING = 0.0018;  // volta pra deriva quando o cursor vai embora
const DAMP = 0.88;
const LERP = 0.14;      // suavização do cursor: o aglomerado segue, não teleporta

/* Paletas em rgb() para o canvas — o CSS não alcança pixels de canvas, então
   estes valores espelham os tokens de landing.css e devem mudar junto. */
const PALETTE: Record<Variant, string[]> = {
  specks: ["225,29,42", "255,107,120", "160,160,170", "120,140,220", "230,180,190"],
  grid: ["18,19,23"],
  stars: ["90,140,255", "150,190,255", "255,255,255"],
};

const ZERO = { ox: 0, oy: 0, ovx: 0, ovy: 0 };

function make(v: Variant, w: number, h: number, i: number, n: number): P {
  const pal = PALETTE[v];
  const c = pal[i % pal.length];
  if (v === "grid") {
    // Malha regular com jitter — lê como textura, não como caos.
    const cols = Math.ceil(Math.sqrt(n * (w / h)));
    const rows = Math.ceil(n / cols);
    const gx = (i % cols) / cols, gy = Math.floor(i / cols) / rows;
    return {
      ...ZERO,
      x: gx * w + (Math.sin(i * 12.9) * 0.5 + 0.5) * (w / cols),
      y: gy * h + (Math.sin(i * 78.2) * 0.5 + 0.5) * (h / rows),
      vx: 0, vy: 0, r: 1, c, a: 0.5 + Math.sin(i) * 0.3,
    };
  }
  if (v === "stars") {
    return {
      ...ZERO,
      x: Math.random() * w, y: Math.random() * h,
      vx: 0.4 + Math.random() * 2.2, vy: 0,
      r: 0.6 + Math.random() * 1.2, c, a: 0.35 + Math.random() * 0.65,
    };
  }
  return {
    ...ZERO,
    x: Math.random() * w, y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.14, vy: (Math.random() - 0.5) * 0.14,
    r: 0.8 + Math.random() * 1.6, c, a: 0.14 + Math.random() * 0.3,
  };
}

export function initParticles(
  canvas: HTMLCanvasElement,
  variant: Variant,
  density = 1,
  attract = false,
): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  let w = 0, h = 0, dpr = 1;
  let ps: P[] = [];
  let raf = 0;
  let running = false;

  // Cursor: cru vindo do ponteiro, suave usado pela física. O listener não faz
  // conta nenhuma — só guarda dois números; a decisão toda sai no rAF.
  let rawX = 0, rawY = 0, hasCursor = false;
  let curX = 0, curY = 0, curReady = false;

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
      const x = p.x + p.ox, y = p.y + p.oy;
      ctx.globalAlpha = p.a;
      if (variant === "stars") {
        // Risco, não ponto: o rastro é o que dá a sensação de velocidade.
        ctx.strokeStyle = `rgb(${p.c})`;
        ctx.lineWidth = p.r;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + p.vx * 6, y);
        ctx.stroke();
      } else {
        ctx.fillStyle = `rgb(${p.c})`;
        ctx.beginPath();
        ctx.arc(x, y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };

  const tick = () => {
    // Uma leitura de layout por frame, antes de qualquer escrita: o canvas muda
    // de lugar com o scroll, então o retângulo não pode ser cacheado no init.
    let live = false;
    if (attract && hasCursor) {
      const r = canvas.getBoundingClientRect();
      const tx = rawX - r.left, ty = rawY - r.top;
      if (!curReady) { curX = tx; curY = ty; curReady = true; }   // sem voo inicial
      curX += (tx - curX) * LERP;                                  // o segue suave
      curY += (ty - curY) * LERP;
      live = true;
    } else {
      curReady = false;
    }

    for (const p of ps) {
      p.x += p.vx; p.y += p.vy;
      // Toro: sai de um lado, entra do outro — sem repovoar array.
      if (p.x > w + 8) p.x = -8; else if (p.x < -8) p.x = w + 8;
      if (p.y > h + 8) p.y = -8; else if (p.y < -8) p.y = h + 8;

      if (!attract) continue;

      if (live) {
        const dx = curX - (p.x + p.ox), dy = curY - (p.y + p.oy);
        const d2 = dx * dx + dy * dy;
        if (d2 < R2) {
          // sqrt só dentro do raio — fora dele o teste quadrado já resolveu
          const d = Math.sqrt(d2) || 0.001;
          const nx = dx / d, ny = dy / d;
          let f = 1 - d / R;
          if (d < INNER) f *= d / INNER;   // solta no centro: junta ao redor
          p.ovx += nx * f * PULL - ny * f * SWIRL;
          p.ovy += ny * f * PULL + nx * f * SWIRL;
        }
      }

      // Mola de volta à deriva + amortecimento: quando o cursor sai, o campo
      // se recompõe sozinho em vez de ficar deformado.
      p.ovx = (p.ovx - p.ox * SPRING) * DAMP;
      p.ovy = (p.ovy - p.oy * SPRING) * DAMP;
      p.ox += p.ovx;
      p.oy += p.ovy;
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
    // Um quadro parado e ponto final: sem rAF, sem cursor, sem observer.
    return () => ro.disconnect();
  }
  io.observe(canvas);

  // O canvas é pointer-events:none e fica atrás do texto, então o ponteiro é
  // ouvido na janela e convertido — assim a atração continua valendo com o
  // cursor sobre a headline ou os botões.
  const onMove = (e: PointerEvent) => { rawX = e.clientX; rawY = e.clientY; hasCursor = true; };
  const onLeave = () => { hasCursor = false; };
  if (attract) {
    // Só ponteiro fino: em touch não há hover, e prender o dedo pra "juntar as
    // bolinhas" só atrapalharia o scroll.
    const fine = window.matchMedia("(pointer: fine)");
    if (fine.matches) {
      window.addEventListener("pointermove", onMove, { passive: true });
      document.addEventListener("pointerleave", onLeave, { passive: true });
    }
  }

  return () => {
    ro.disconnect(); io.disconnect();
    window.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerleave", onLeave);
    if (raf) cancelAnimationFrame(raf);
  };
}
