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

   ── No toque ────────────────────────────────────────────────────────────────
   O centro da projeção não precisa ser um cursor — precisa ser um PONTO. Sem
   ponteiro que possa pairar, ele passeia sozinho pelo canvas (AMB_X/AMB_Y) e o
   dedo assume o volante quando encosta, inclusive durante a rolagem. É a mesma
   cena, com outro motorista.

   Duas coisas mudam junto, e sem elas ligar o campo no toque não adiantaria:
     · o ENVELOPE encolhe com o canvas (escalar()) — medido em px contra tela
       grande, o anel tem pico em 460 e cairia fora de um retrato de 390;
     · onda e matiz encurtam na mesma proporção, senão sobra meia oscilação
       dentro do anel menor.
   No ponteiro fino tudo isso vale 1 e as contas são as de sempre.

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
/* Passeio do centro quando NÃO há ponteiro que possa pairar (toque). Duas
   senoides de períodos incomensuráveis — a razão é 0.618, irracional —, então a
   volta nunca se fecha: um círculo puro leria como GIF em loop, que é
   exatamente o que não se quer de um campo que deve parecer vivo.
   Lento de propósito: ~57s por travessia. O campo acompanha a leitura, não
   disputa com ela. */
const AMB_X = 0.11;
const AMB_Y = 0.11 * 0.618;

/* Canvas não enxerga custom property, então a rampa aparece aqui em RGB cru —
   é a única duplicação de token do módulo. Os pontinhos acompanham --ink
   (#f4f5f7): no tema escuro eles são claros sobre o fundo, a inversão exata do
   quase-preto sobre branco que estava aqui. Os riscos do rodapé não mudam:
   caem sobre --panel, que segue escuro. */
const PALETTE: Record<Variant, string[]> = {
  specks: ["244,245,247"],                                // só a camada de pontinhos
  grid: ["244,245,247"],
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
      // Deriva para a direita: ~0.35 px/frame (≈21 px/s), com ±15% por
      // partícula para o campo não andar como um bloco rígido. O toro no tick()
      // reinsere quem sai pela direita — o fluxo é infinito de graça. A deriva
      // vertical mínima mantém o respiro que a grade já tinha.
      vx: 0.32 + (Math.sin(i * 5.3) * 0.5 + 0.5) * 0.1,
      vy: (Math.random() - 0.5) * 0.05,
      r: 1, c, a: 0.5 + Math.sin(i) * 0.3,
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

  /* Decidido AQUI, e não lá embaixo junto dos listeners, porque agora ele
     governa também a escala do envelope — que é lida no primeiro resize(),
     antes de qualquer listener existir. */
  const fine = cursorField && window.matchMedia("(pointer: fine)").matches;

  let w = 0, h = 0, dpr = 1;
  let ps: P[] = [];
  let raf = 0;
  let running = false;
  let t0 = 0;

  /* ── Escala do envelope ─────────────────────────────────────────────────────
     INNER/OUTER foram MEDIDOS em px contra tela grande: o anel tem pico em
     460px e some por volta de 780. Num retrato de 390px esse pico cai fora da
     tela — sobra só a borda de subida da onda, e o anel (que é o efeito) nunca
     chega a aparecer. Por isso não bastava ligar o campo no toque: ligado com
     as medidas de desktop, ele acende fora do quadro.

     No ponteiro FINO o fator vale 1 e todas as contas abaixo são idênticas às
     de antes, termo a termo — o desktop não muda nada. */
  let inner = INNER, outer = OUTER, span = SPAN, outer2 = OUTER2;
  let waveK = WAVE_K, hueK = HUE_K, gain = GAIN;
  const escalar = () => {
    // Piso em 0.4: abaixo disso o anel fica menor que o vão entre pontos da
    // malha e a onda deixa de ter partículas onde acontecer.
    const k = fine ? 1 : Math.max(0.4, Math.min(1, Math.min(w, h) / 900));
    inner = INNER * k; outer = OUTER * k; span = SPAN * k; outer2 = outer * outer;
    /* Onda e matiz correm POR PIXEL. Encolher o anel sem encurtar junto o
       comprimento de onda deixaria meia oscilação dentro dele — o anel viraria
       um arco de cor só, sem as bandas que correm pra fora. */
    waveK = WAVE_K / k; hueK = HUE_K / k;
    /* O rastro NÃO acompanha na mesma proporção: em k=0.43 ele cairia para 4px
       e sumiria contra os pontinhos. Meio termo — encolhe, mas continua a ser
       uma cápsula e não um ponto. */
    gain = GAIN * (0.55 + 0.45 * k);
  };

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
    escalar();   // depende de w/h — tem de vir depois da medida e antes do desenho
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
          if (d2 < outer2) {
            const d = Math.sqrt(d2);
            // Oscilação em profundidade: a pulsação da malha, correndo pra fora.
            const z = Math.sin(d * waveK - t * WAVE_W);
            // Envelope medido: zera nas duas bordas — é o que abre o buraco.
            const env = d < inner ? 0 : Math.sin(((d - inner) / span) * Math.PI);
            const amp = gain * env * z * p.len;
            const mag = amp < 0 ? -amp : amp;
            if (mag > 0.9) {
              // `%` em JS pode devolver negativo — o duplo mod garante [0, SPAN).
              const ph = (((d * hueK - t * HUE_W) % HUE_SPAN) + HUE_SPAN) % HUE_SPAN;
              const hue = HUE_0 - ph + 360;
              // Direção radial normalizada, girada pelo tremor da partícula.
              // O deslocamento é colinear com ela: é isso que aponta a cápsula
              // pro cursor e desenha o círculo em volta.
              const nx = dx / d, ny = dy / d;
              const ca = (nx * p.cj - ny * p.sj) * amp;
              const sa = (ny * p.cj + nx * p.sj) * amp;
              /* Alpha proporcional ao rastro, normalizado pelo PICO POSSÍVEL
                 (2·gain) e não pelo 18 cru que estava aqui. Os dois dão o mesmo
                 número no desktop, onde gain é 9; num rastro encolhido o 18
                 fixo achataria o campo inteiro para meia opacidade e o anel
                 chegaria lavado justo onde ele é a única coisa a ver. */
              const kk = mag / (2 * gain);
              const k = kk > 1 ? 1 : kk;
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

    if (cursorField) {
      let tx = 0, ty = 0, mira = false;
      if (hasCursor) {
        // Uma leitura de layout por frame, antes de qualquer escrita: o canvas
        // muda de lugar com o scroll, então o retângulo não pode ser cacheado.
        const r = canvas.getBoundingClientRect();
        tx = rawX - r.left; ty = rawY - r.top; mira = true;
      } else if (!fine) {
        /* Sem ponteiro capaz de pairar, o campo se dirige SOZINHO: o centro da
           projeção passeia pelo canvas e a onda acontece de qualquer jeito.
           Sem isto o telefone via só a poeira de pontinhos — a malha pulsante,
           que é o efeito inteiro desta seção, simplesmente não existia lá,
           porque `hasCursor` nunca virava true sem mouse.
           O dedo, quando encosta, assume o volante (ver os listeners de touch);
           ao soltar, o LERP devolve o centro a este passeio sem salto. */
        tx = w * (0.5 + 0.3 * Math.sin(t * AMB_X));
        ty = h * (0.5 + 0.24 * Math.sin(t * AMB_Y + 1.1));
        mira = true;
      }
      if (mira) {
        if (!curReady) { curX = tx; curY = ty; curReady = true; }   // sem voo inicial
        curX += (tx - curX) * LERP;                                 // o anel segue suave
        curY += (ty - curY) * LERP;
      }
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
  const solta: (() => void)[] = [];

  if (fine) {
    const onMove = (e: PointerEvent) => { rawX = e.clientX; rawY = e.clientY; hasCursor = true; };
    const onLeave = () => { hasCursor = false; curReady = false; };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave, { passive: true });
    solta.push(() => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    });
  } else if (cursorField) {
    /* Toque: o dedo dirige o campo enquanto está na tela.
       `touch*` e NÃO `pointer*`, e a diferença aqui não é estilo. No toque o
       navegador CANCELA a sequência de pointer assim que decide que o gesto é
       rolagem (pointercancel) — e é justamente durante a rolagem que se quer o
       anel acompanhando o polegar. Os eventos de toque continuam chegando.

       Passivos: nada aqui chama preventDefault, e declarar isso mantém a
       rolagem no thread do compositor. O campo segue o dedo SEM disputar o
       gesto: não há nada a prender, e é por isso que ligar o efeito no toque
       não repete o problema que fez desligá-lo. */
    const onToque = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      rawX = t.clientX; rawY = t.clientY; hasCursor = true;
    };
    // curReady FICA como está: zerá-lo devolveria o centro ao passeio com um
    // salto. Só `hasCursor` cai, e o LERP faz a passagem.
    const onSoltou = () => { hasCursor = false; };
    window.addEventListener("touchstart", onToque, { passive: true });
    window.addEventListener("touchmove", onToque, { passive: true });
    window.addEventListener("touchend", onSoltou, { passive: true });
    window.addEventListener("touchcancel", onSoltou, { passive: true });
    solta.push(() => {
      window.removeEventListener("touchstart", onToque);
      window.removeEventListener("touchmove", onToque);
      window.removeEventListener("touchend", onSoltou);
      window.removeEventListener("touchcancel", onSoltou);
    });
  }

  return () => {
    ro.disconnect(); io.disconnect();
    solta.forEach((f) => f());
    if (raf) cancelAnimationFrame(raf);
  };
}
