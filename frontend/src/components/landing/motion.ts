/* ── Módulo de motion da landing ──────────────────────────────────────────────
   Ponto único de animação. As seções declaram intenção por atributo e não
   animam nada por conta própria.

     [data-reveal]        entra uma vez ao aparecer (.is-in). Stagger por --i.
     [data-reveal="now"]  entra na montagem, sem esperar scroll (hero).
     [data-type]          máquina de escrever ao entrar em tela.
     [data-nav-sentinel]  ao sair da viewport, marca .is-scrolled na raiz.

   Nada roda no evento scroll. prefers-reduced-motion aplica o estado final e
   retorna antes de instalar qualquer observer.
   ───────────────────────────────────────────────────────────────────────────── */

type Cleanup = () => void;
const REDUCE = "(prefers-reduced-motion: reduce)";

function initReveal(root: HTMLElement): Cleanup {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-in");
        io.unobserve(e.target); // dispara uma única vez
      }
    },
    { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
  );

  let raf = 0;
  const now: HTMLElement[] = [];
  root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
    // O hero não pode depender de scroll: com rootMargin -10% o CTA nasce abaixo
    // da linha do observer e ficaria em opacity 0 na primeira tela.
    if (el.dataset.reveal === "now") now.push(el);
    else io.observe(el);
  });
  if (now.length) raf = requestAnimationFrame(() => now.forEach((el) => el.classList.add("is-in")));

  return () => { io.disconnect(); if (raf) cancelAnimationFrame(raf); };
}

/** Máquina de escrever: o texto se escreve ao entrar em tela. */
function initTypewriter(root: HTMLElement): Cleanup {
  const timers: number[] = [];
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        io.unobserve(el);

        const full = el.dataset.typeText || el.textContent || "";
        const speed = +(el.dataset.typeSpeed || 18);
        el.textContent = "";
        el.classList.add("is-typing");

        let i = 0;
        const step = () => {
          // Escreve em blocos por frame: 1 char/timer a 18ms engasga em texto longo.
          i = Math.min(full.length, i + 2);
          el.textContent = full.slice(0, i);
          if (i < full.length) timers.push(window.setTimeout(step, speed));
          else el.classList.remove("is-typing");
        };
        timers.push(window.setTimeout(step, 220));
      }
    },
    { threshold: 0.4 },
  );

  root.querySelectorAll<HTMLElement>("[data-type]").forEach((el) => {
    // Guarda o texto e esvazia já, senão ele pisca inteiro antes de começar.
    // A altura é reservada pela camada-fantasma no DOM, não por cálculo aqui.
    el.dataset.typeText = el.textContent || "";
    el.textContent = "";
    io.observe(el);
  });

  return () => { io.disconnect(); timers.forEach(clearTimeout); };
}

function initNav(root: HTMLElement): Cleanup {
  const sentinel = root.querySelector<HTMLElement>("[data-nav-sentinel]");
  const cleanups: Cleanup[] = [];

  if (sentinel) {
    // Sentinela no topo em vez de listener para o estado "descolou do topo".
    const io = new IntersectionObserver(
      ([e]) => root.classList.toggle("is-scrolled", !e.isIntersecting),
      { threshold: 0 },
    );
    io.observe(sentinel);
    cleanups.push(() => io.disconnect());
  }

  // A referência esconde o nav ao descer e traz de volta ao subir (medido:
  // position fixed + translateY(-72px) descendo, 0 subindo). Direção de scroll
  // não tem observer nativo, então aqui é listener passivo — mas o único
  // trabalho no evento é guardar um número; a decisão sai no rAF.
  let last = window.scrollY;
  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const y = window.scrollY;
      const dy = y - last;
      if (Math.abs(dy) > 4) {                        // histerese: ignora tremor
        root.classList.toggle("is-nav-hidden", dy > 0 && y > 200);
        last = y;
      }
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  cleanups.push(() => {
    window.removeEventListener("scroll", onScroll);
    if (raf) cancelAnimationFrame(raf);
  });

  return () => cleanups.forEach((c) => c());
}

export function initLandingMotion(root: HTMLElement): Cleanup {
  if (window.matchMedia(REDUCE).matches) {
    root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => el.classList.add("is-in"));
    // Sem digitação: o texto já nasce completo no DOM.
    return initNav(root);
  }
  const cleanups = [initReveal(root), initTypewriter(root), initNav(root)];
  return () => cleanups.forEach((c) => c());
}
