/* ── Campo de partículas em canvas ────────────────────────────────────────────
   A referência (antigravity.google) roda o campo do hero em WebGL2 e não usa
   nenhuma biblioteca de animação. Aqui é canvas 2D + rAF na mão — mesma ideia,
   técnica mais simples.

   Três variantes:
     specks  — o campo do hero, dirigido pelo cursor (ver abaixo)
     grid    — malha de pontos com respiro (faixa divisória)
     stars   — riscos azuis em fundo preto, sensação de velocidade (footer)

   ── Como o campo do hero funciona ────────────────────────────────────────────
   É uma MALHA 3D pulsando, projetada em perspectiva — não um efeito 2D.

   Os pontos formam um reticulado no plano. Cada um oscila em PROFUNDIDADE com
   uma onda que sai do cursor:  z = sin(d·K − t·W), com a amplitude decaindo com
   a distância. Sob projeção em perspectiva centrada no cursor, um ponto que se
   move em z desliza na tela ao longo da reta que o liga ao centro:

       desloc = (ponto − centro) · z/(f+z)        →  ∝ d · z

   A cápsula é o rastro desse deslizamento. Disso tudo cai de graça:
     · a orientação radial  → o deslocamento é colinear com (ponto − centro);
                              é por isso que as cápsulas apontam pro cursor
     · o vazio no meio      → em d = 0 o deslocamento é 0. Não é caso especial
     · o anel               → d·exp(−d/DECAY) tem pico em d = DECAY
     · as ondas             → a própria oscilação em z, correndo pra fora
     · a troca de cor       → o matiz corre na mesma fase da onda
     · seguir o cursor      → o centro da projeção É o cursor, sem inércia

   Modelar isso como física de atração (mola puxando partículas) produz um nó
   apertado no centro — exatamente o oposto do buraco que o 3D gera sozinho.

   Duas camadas: os pontos da malha, discretos e sempre visíveis, e as cápsulas
   coloridas, que só existem onde a onda tem amplitude.

   O rAF só existe enquanto o canvas está em tela, e prefers-reduced-motion
   pinta um quadro estático e vai embora.
   ───────────────────────────────────────────────────────────────────────────── */

export type Variant = "specks" | "grid" | "stars";

type P = {
  x: number; y: number; vx: number; vy: number;
  // Tremor próprio somado ao ângulo radial (ver JITTER), guardado já como
  // cosseno/seno: assim o desenho gira o vetor radial com duas multiplicações,
  // sem atan2 nem cos/sin por partícula por frame.
  cj: number; sj: number;
  len: number;   // comprimento base
  th: number;    // espessura
  r: number; c: string; a: number;   // usados por grid/stars
};

const REDUCE = "(prefers-reduced-motion: reduce)";

/* ── Malha 3D pulsante ──────────────────────────────────────────────────────
   Envelope da onda medido na referência (densidade de tinta por raio, cursor
   parado): ~0 até 160px, pico entre 400 e 560, some por volta de 720.
   Daí INNER/OUTER e o sin() entre eles — pico em 460.
   Um envelope d·exp(−d/DECAY) não serve: decai devagar demais (ainda tinha 1/3
   da amplitude a 700px) e nunca zera no centro, então não abre o buraco. */
const INNER = 140;
const OUTER = 780;
const SPAN = OUTER - INNER;
const OUTER2 = OUTER * OUTER;
const GAIN = 9;         // comprimento do rastro no pico, em px
const WAVE_K = 0.030;   // frequência espacial (comprimento ~209px)
const WAVE_W = 2.0;     // velocidade da onda no tempo
/* Tremor sobre a direção radial. Medindo a referência (eixo do blob vs direção
   radial, média de cos(2·δ)) dá ≈ 0.69: radial, mas não alinhado. Como
   cos(2δ) ≈ sin(2J)/(2J), isso corresponde a J ≈ 0.72 rad. Alinhamento perfeito
   daria +1.0 e viraria um leque mecânico. */
const JITTER = 0.72;    // rad (~41°)
/* Matiz: bandas correndo pra fora junto com a onda.
   hue = 50 − mod(fase, 180) fica preso, por construção, em (−130, 50], isto é
   azul → roxo → magenta → vermelho → laranja → amarelo. O verde (90–160) é
   inalcançável — e a referência de fato nunca mostra verde. Foi por isso que a
   deriva temporal solta na rampa não serviu: ela empurrava a faixa inteira e
   caía no verde.
   HUE_K 0.36 faz a faixa cobrir ~500px, uma volta completa ao longo do anel. */
const HUE_0 = 50;
const HUE_SPAN = 180;
const HUE_K = 0.36;     // quanto o matiz corre por pixel
const HUE_W = 22;       // e por segundo — é o que troca a cor sozinho
const LERP = 0.14;      // suavização do cursor: o anel segue, não teleporta

const PALETTE: Record<Variant, string[]> = {
  specks: ["18,19,23"],                                   // só a camada de pontinhos
  grid: ["18,19,23"],
  stars: ["90,140,255", "150,190,255", "255,255,255"],
};

function make(v: Variant, w: number, h: number, i: number, n: number): P {
  const pal = PALETTE[v];
  const c = pal[i % pal.length];
  const base = { cj: 1, sj: 0, len: 0, th: 0 };

  if (v === "grid") {
    const cols = Math.ceil(Math.sqrt(n * (w / h)));
    const rows = Math.ceil(n / cols);
    const gx = (i % cols) / cols, gy = Math.floor(i / cols) / rows;
    return {
      ...base,
      x: gx * w + (Math.sin(i * 12.9) * 0.5 + 0.5) * (w / cols),
      y: gy * h + (Math.sin(i * 78.2) * 0.5 + 0.5) * (h / rows),
      vx: 0, vy: 0, r: 1, c, a: 0.5 + Math.sin(i) * 0.3,
    };
  }
  if (v === "stars") {
    return {
      ...base,
      x: Math.random() * w, y: Math.random() * h,
      vx: 0.4 + Math.random() * 2.2, vy: 0,
      r: 0.6 + Math.random() * 1.2, c, a: 0.35 + Math.random() * 0.65,
    };
  }
  // Malha: reticulado com jitter. Regular demais vira papel quadriculado; o
  // jitter quebra o alinhamento sem desmanchar a estrutura.
  const cols = Math.ceil(Math.sqrt(n * (w / h))) || 1;
  const rows = Math.ceil(n / cols) || 1;
  const cw = w / cols, ch = h / rows;
  const j = (Math.random() * 2 - 1) * JITTER;
  return {
    x: (i % cols) * cw + cw * (0.2 + Math.random() * 0.6),
    y: Math.floor(i / cols) * ch + ch * (0.2 + Math.random() * 0.6),
    // Deriva bem lenta: a malha respira, não viaja.
    vx: (Math.random() - 0.5) * 0.05, vy: (Math.random() - 0.5) * 0.05,
    cj: Math.cos(j), sj: Math.sin(j),
    len: 0.7 + Math.random() * 0.6,    // fator sobre o rastro calculado
    th: 1.7 + Math.random() * 1.1,
    r: 0.7, c, a: 0.1 + Math.random() * 0.06,
  };
}

export function initParticles(
  canvas: HTMLCanvasElement,
  variant: Variant,
  density = 1,
  cursorField = false,
): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  let w = 0, h = 0, dpr = 1;
  let ps: P[] = [];
  let raf = 0;
  let running = false;
  let t0 = 0;

  // Cursor: cru vindo do ponteiro, suave usado pelo campo. O listener não faz
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
    ctx.lineCap = "round";                            // é o que faz o risco virar cápsula
    // specks: densidade calibrada contra a referência (tinta colorida por raio).
    const per = variant === "grid" ? 2600 : variant === "specks" ? 3800 : 5200;
    const n = Math.round(((w * h) / per) * density);
    ps = Array.from({ length: Math.max(12, Math.min(n, 1400)) }, (_, i) => make(variant, w, h, i, n));
    draw(0);
  };

  const draw = (t: number) => {
    ctx.clearRect(0, 0, w, h);

    if (variant === "specks") {
      const live = cursorField && curReady;
      for (const p of ps) {
        // Camada 1: o pontinho discreto que existe no fundo inteiro.
        let drawn = false;

        if (live) {
          const dx = p.x - curX, dy = p.y - curY;
          const d2 = dx * dx + dy * dy;
          if (d2 < OUTER2) {
            const d = Math.sqrt(d2);
            // Oscilação em profundidade: a pulsação da malha, correndo pra fora.
            const z = Math.sin(d * WAVE_K - t * WAVE_W);
            // Envelope medido: zera nas duas bordas — é o que abre o buraco.
            const env = d < INNER ? 0 : Math.sin(((d - INNER) / SPAN) * Math.PI);
            const amp = GAIN * env * z * p.len;
            const mag = amp < 0 ? -amp : amp;
            if (mag > 0.9) {
              // `%` em JS pode devolver negativo — o duplo mod garante [0, SPAN).
              const ph = (((d * HUE_K - t * HUE_W) % HUE_SPAN) + HUE_SPAN) % HUE_SPAN;
              const hue = HUE_0 - ph + 360;
              // Direção radial normalizada, girada pelo tremor da partícula.
              // O deslocamento é colinear com ela: é isso que aponta a cápsula
              // pro cursor e desenha o círculo em volta.
              const nx = dx / d, ny = dy / d;
              const ca = (nx * p.cj - ny * p.sj) * amp;
              const sa = (ny * p.cj + nx * p.sj) * amp;
              const k = mag / 18 > 1 ? 1 : mag / 18;
              ctx.globalAlpha = 0.25 + 0.75 * k;
              ctx.strokeStyle = `hsl(${hue} 85% 58%)`;
              ctx.lineWidth = p.th;
              ctx.beginPath();
              // Do ponto em repouso até onde a profundidade o levou.
              ctx.moveTo(p.x, p.y);
              ctx.lineTo(p.x + ca, p.y + sa);
              ctx.stroke();
              drawn = true;
            }
          }
        }

        if (!drawn) {
          ctx.globalAlpha = p.a;
          ctx.fillStyle = `rgb(${p.c})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      return;
    }

    for (const p of ps) {
      ctx.globalAlpha = p.a;
      if (variant === "stars") {
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

  const tick = (now: number) => {
    if (!t0) t0 = now;
    const t = (now - t0) / 1000;

    // Uma leitura de layout por frame, antes de qualquer escrita: o canvas muda
    // de lugar com o scroll, então o retângulo não pode ser cacheado no init.
    if (cursorField && hasCursor) {
      const r = canvas.getBoundingClientRect();
      const tx = rawX - r.left, ty = rawY - r.top;
      if (!curReady) { curX = tx; curY = ty; curReady = true; }   // sem voo inicial
      curX += (tx - curX) * LERP;                                  // o anel segue suave
      curY += (ty - curY) * LERP;
    }

    for (const p of ps) {
      p.x += p.vx; p.y += p.vy;
      // Toro: sai de um lado, entra do outro — sem repovoar array.
      if (p.x > w + 8) p.x = -8; else if (p.x < -8) p.x = w + 8;
      if (p.y > h + 8) p.y = -8; else if (p.y < -8) p.y = h + 8;
    }
    draw(t);
    raf = requestAnimationFrame(tick);
  };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  // Fora da tela não anima: 4 canvas girando ao mesmo tempo é desperdício puro.
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !running) { running = true; raf = requestAnimationFrame(tick); }
    else if (!e.isIntersecting && running) { running = false; cancelAnimationFrame(raf); raf = 0; t0 = 0; }
  }, { threshold: 0 });

  resize();

  if (window.matchMedia(REDUCE).matches) {
    // Um quadro parado e ponto final: sem rAF, sem cursor, sem observer.
    return () => ro.disconnect();
  }
  io.observe(canvas);

  // O canvas é pointer-events:none e fica atrás do texto, então o ponteiro é
  // ouvido na janela e convertido — assim o campo continua valendo com o cursor
  // sobre a headline ou os botões.
  const onMove = (e: PointerEvent) => { rawX = e.clientX; rawY = e.clientY; hasCursor = true; };
  const onLeave = () => { hasCursor = false; curReady = false; };
  const fine = cursorField && window.matchMedia("(pointer: fine)").matches;
  if (fine) {
    // Só ponteiro fino: em touch não há hover, e prender o dedo pra acender o
    // anel só atrapalharia o scroll.
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave, { passive: true });
  }

  return () => {
    ro.disconnect(); io.disconnect();
    window.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerleave", onLeave);
    if (raf) cancelAnimationFrame(raf);
  };
}
