import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { initLandingMotion } from "./landing/motion";
import { initParticles, type Variant } from "./landing/particles";
import "../styles/landing.css";

gsap.registerPlugin(ScrollTrigger);

/* ── Conteúdo ────────────────────────────────────────────────────────────────
   REVISAR: os cards de mídia estão vazios por decisão — o repositório não tem
   nenhuma imagem e nada aqui é inventado. Cada card já reserva o espaço final
   (aspect-ratio fixo), então preencher depois não mexe no layout nem gera CLS. */

/* REVISAR: a faixa de marcas está FORA DO AR, esperando autorização de uso de
   marca dos clientes. Usar logo de cliente sinaliza endosso e normalmente
   depende de cláusula de publicidade no contrato — e o John Deere é rigoroso no
   assunto: o guideline deles provavelmente conflita com o cinza da faixa, já que
   alterar a cor da marca costuma ser proibido.

   Flag em vez de comentar o bloco: o JSX abaixo tem comentários dentro, e
   comentário JSX não aninha — comentar tudo obrigaria a mutilar os de dentro, e
   quem reabrisse herdaria comentários quebrados. Assim o código segue tipado e
   reabrir é trocar para `true`. Se só parte das marcas for liberada, tirar as
   demais de BRANDS e deixar a flag ligada. */
const BRANDS_ON = false;

/* Marcas que já usam o produto — lista fornecida pelo cliente. NÃO acrescentar
   nome aqui sem dado real: prova social inventada é a pior coisa a inventar
   nesta página, e é por isso que a seção .lp-proof segue vazia.

   `logo` null cai no wordmark tipográfico (o nome em texto) — é o fallback de
   quem não tem arquivo. Procedência de cada logo: public/brands/FONTES.md.

   `mono` marca a logo que JÁ vem em preto-e-branco e cujo desenho interno é
   feito desse contraste. O filtro padrão da faixa achata a cor e destruiria
   esse desenho — no John Deere o cervo é preto sobre o campo branco do emblema,
   e achatar funde os dois num borrão. Ver .lp-brand-logo em landing.css. */
const BRANDS: { name: string; logo: string | null; mono?: true }[] = [
  { name: "John Deere", logo: "/brands/john-deere.svg", mono: true },
  { name: "Grupo Asas", logo: "/brands/grupo-asas.webp" },
  { name: "Yduqs", logo: "/brands/yduqs.svg" },
  { name: "Idomed", logo: "/brands/idomed.svg" },
  { name: "OpenPBL", logo: "/brands/openpbl.png" },
];
/* A faixa tem de ser MAIS LARGA que a viewport, senão abre um buraco entre o
   fim de uma cópia e o começo da outra. As 5 marcas dão ~1100px; 3 voltas
   cobrem 1440 com folga e ainda seguram um monitor de 2560. */
const BRAND_LOOPS = 3;
const BRAND_STRIP = Array.from({ length: BRAND_LOOPS }, () => BRANDS).flat();

/* `code` troca a imagem do card por um bloco de código. Para a API isso ganha de
   print em tudo: é texto de verdade (nítido em qualquer tela, selecionável,
   copiável), pesa zero, acompanha o tema sozinho — e, o que importa, é
   VERIFICÁVEL: quem lê cola no terminal e funciona.

   Por isso mesmo o que está aqui NÃO pode ser exemplo plausível: é a request
   real, conferida contra o backend. O que os testes ensinaram, e que um exemplo
   inventado teria errado:
     · o prefixo é /api/rooms, não /rooms;
     · a chave sozinha dá 401 — `X-User-Id` também é obrigatório, porque a sala
       precisa de dono (auth.py exige, tenancy.py só resolve o tenant);
     · `max_participants` no corpo é IGNORADO — o valor sai do limite da
       licença, então mostrá-lo aqui anunciaria um parâmetro que não faz nada.
   Ao mexer na API, reconferir isto: snippet que não roda é pior que nenhum. */
/* Seção própria, entre a missão e os capítulos — não é um capítulo. */
const API_CAP = {
  t: "Opened from your stack",
  d: "Your system opens the room, not a person clicking around a panel. One authenticated POST returns the room and a guest link you hand to whoever should be in it.",
  code: {
    req: `curl -X POST https://video.pbltools.ai/api/rooms \\
  -H "X-API-Key: bwl_live_..." \\
  -H "X-User-Id: facilitator_42" \\
  -H "Content-Type: application/json" \\
  -d '{ "title": "Assertive Communication",
        "lobby_enabled": true }'`,
    res: `{
  "room_id": "room_8ESAqg6kC5c",
  "status": "active",
  "guest_token": "s3WjbAUp9osbfFJ1rgvfLQ"
}`,
  },
};

/* Os três destaques. NÃO repetem a seção de API acima: aquela mostra a conexão
   programática (o curl real), estes três cobrem o que ela não cobre.
   - LMS: redação genérica DE PROPÓSITO. Hoje o launch é LTI 1.1/SCORM via
     ScormCloud (externo) e LTI 1.3 nativo é roadmap noutra aplicação — então
     nada de número de versão aqui, que envelheceria ou mentiria. "Plugs into
     your LMS" é verdadeiro nos dois mundos.
   - PBL e white-label são recursos reais (branding por tenant: normalize_branding
     no backend, applyBranding no front; FAQ já afirma o mesmo). */
const CAPS: { t: string; d: string; icon: string; anim?: "boot" | "network" }[] = [
  {
    icon: "fa-plug",
    anim: "boot",
    t: "Plugs into your LMS",
    d: "Sessions launch from the tools your learners already use — no new login, no separate portal. What happens in the room flows back to your platform on its own.",
  },
  {
    icon: "fa-people-group",
    anim: "network",
    t: "Built around PBL",
    d: "The room is shaped by the method, not the other way around: a real problem, small working groups, and a read-back of the skills each person showed. Not a webinar with breakout rooms bolted on.",
  },
  {
    icon: "fa-palette",
    t: "Your brand, end to end",
    d: "Logo, color, and product name are set per organization. Participants only ever see your brand — the same room, dressed as yours, configured through the same API.",
  },
];

const STEPS = [
  { n: "01", t: "Set up the room", d: "Pick the problem, define the groups, and open the session. It takes under a minute." },
  { n: "02", t: "The group solves it", d: "People discuss, disagree, and land on an answer. The AI follows along quietly." },
  { n: "03", t: "Everyone gets their read", d: "The report comes out per person and per group, with what actually showed up in the session." },
];

const FAQ = [
  {
    q: "Is the session recorded?",
    a: "Recording is optional and set per room, at creation. When it's on, everyone sees the recording indicator for the entire session.",
  },
  {
    q: "Who can see what the AI observes?",
    a: "Each person sees their own read. The facilitator sees the group's. What's individual never circulates to peers.",
  },
  {
    q: "Does session data leave our organization?",
    a: "No. Each organization is an isolated tenant, and its rooms, recordings, and reports stay inside it.",
  },
  {
    q: "Is there anything to install?",
    a: "No. The room runs in the browser. You can also embed it in your LMS through an iframe, without the participant ever leaving your platform.",
  },
  {
    q: "Can we run it under our own brand?",
    a: "Yes. Logo, color, and product name are configurable per organization, and the participant only ever sees your brand.",
  },
  {
    q: "How many people fit in a room?",
    a: "It depends on the plan. Working groups are small by design — a PBL session runs on conversation, not on an audience.",
  },
];

const PLANS = [
  { n: "Trial", p: "Free", per: "14 days", f: ["Up to 2 concurrent rooms", "Up to 25 participants", "Whiteboard", "Email support"], hi: false },
  { n: "Pro", p: "Custom", per: "per seat", f: ["Unlimited rooms", "Cloud recording", "Full white-label", "LTI 1.3 embed", "Priority support"], hi: true },
  { n: "Enterprise", p: "Custom", per: "self-hosted", f: ["Dedicated infrastructure", "Guaranteed SLA", "SSO / SAML", "Assisted onboarding", "Account manager"], hi: false },
];

const MISSION =
  "Video Rooms Kit is the session room by PBLTools: a group, a real problem, and an AI that reads back the skills that showed up in it.";

/* ── Realce de sintaxe do card de código ─────────────────────────────────────
   Léxico mínimo, sem biblioteca: são dois trechos na página inteira, e
   Prism/Shiki pesariam mais que toda a landing para isso. As regras rodam em
   ordem — a primeira que casar no início do resto vence — e a cor sai de token
   CSS, então o realce acompanha o tema como o resto da página.

   Não há regra para string de aspas SIMPLES de propósito: o corpo do -d é um
   JSON dentro de '...', e uma regra dessas engoliria o payload inteiro num
   token só, apagando as chaves e os valores lá dentro. Sem ela, as aspas soltas
   ficam neutras e o JSON de dentro é realçado normalmente. */
const RULES: [RegExp, string][] = [
  [/^"[^"]*"(?=\s*:)/, "key"],                    // string seguida de `:` = chave JSON
  [/^"(?:[^"\\]|\\.)*"/, "str"],
  [/^\b(?:POST|GET|PUT|PATCH|DELETE)\b/, "verb"],
  [/^\bcurl\b/, "cmd"],
  [/^--?[A-Za-z][\w-]*/, "flag"],
  [/^https?:\/\/[^\s\\'"]+/, "url"],
  [/^\b(?:true|false|null)\b/, "lit"],
];

function highlight(src: string) {
  const out: React.ReactNode[] = [];
  let buf = "";
  const flush = () => { if (buf) { out.push(buf); buf = ""; } };
  for (let i = 0; i < src.length; ) {
    const rest = src.slice(i);
    const hit = RULES.find(([re]) => re.test(rest));
    if (hit) {
      const m = hit[0].exec(rest)!;
      flush();
      out.push(<span className={`lp-t-${hit[1]}`} key={i}>{m[0]}</span>);
      i += m[0].length;
    } else {
      buf += src[i];
      i += 1;
    }
  }
  flush();
  return out;
}

/** Card de código: a request se digita ao entrar em tela, a resposta chega
    depois.

    Quem digita é só a REQUEST — resposta de servidor não é digitada, ela chega.
    Digitar as duas contaria uma mentira sobre o que a coisa faz.

    Aqui, e não no initTypewriter do motion.ts, porque aquele fatia textContent
    e apagaria o realce: o card viraria texto cinza enquanto digita. Este refaz
    o realce a cada quadro sobre o prefixo — highlight() é função pura, então
    sai de graça o comportamento de editor de verdade: a string só ganha cor
    quando a aspa de fechar chega. */
function CodeCard({ code }: { code: { req: string; res: string } }) {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(code.req.length);
      setDone(true);
      return;
    }
    let t = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.unobserve(el);                       // digita uma vez só
        let i = 0;
        const step = () => {
          // 2 chars por passo: 1 a cada 16ms engasga em texto longo.
          i = Math.min(code.req.length, i + 2);
          setN(i);
          t = i < code.req.length
            ? window.setTimeout(step, 16)
            : window.setTimeout(() => setDone(true), 420);   // a pausa do round-trip
        };
        t = window.setTimeout(step, 300);
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => { io.disconnect(); clearTimeout(t); };
  }, [code.req]);

  const typing = n < code.req.length;
  return (
    <div className="lp-card" data-fill="code" data-reveal style={{ ["--i" as string]: 1 }} ref={ref}>
      <div className="lp-code">
        {/* pre, não div: é código, e a quebra de linha é significativa. */}
        <pre className="lp-code-req">
          {/* Fantasma: carrega o texto completo invisível e reserva a altura
              exata. Sem ele o bloco cresce linha a linha e o card, que
              centraliza o conteúdo, treme a cada quebra. Mesmo arranjo da
              missão. aria-hidden porque a camada viva já carrega o texto. */}
          <span className="lp-type-ghost" aria-hidden="true">{code.req}</span>
          <span className="lp-type-live" data-typing={typing || undefined}>
            {highlight(code.req.slice(0, n))}
          </span>
        </pre>
        <pre className="lp-code-res" data-in={done || undefined}>{highlight(code.res)}</pre>
      </div>
    </div>
  );
}

/** Card de LMS: o desktop liga ao ser plugado — cabo entra, tela acende, texto
    se escreve. A arte é CSS (landing.css); a orquestração é GSAP. O briefing
    autoriza GSAP "com justificativa", e a justificativa é esta: encadear
    cabo→tela→texto com timing sincronizado, que em keyframes CSS vira um
    emaranhado frágil de animation-delay. Só carrega no chunk lazy da landing.

    O repouso (CSS) já é "ligado": sob prefers-reduced-motion o efeito nem
    monta e o monitor aparece pronto. Fora isso, gsap.from() parte do estado
    apagado e anima até esse repouso; o ScrollTrigger dispara ao entrar em tela,
    uma vez. ctx.revert() no cleanup mata o trigger e restaura o repouso. */
function BootDevice() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      const tl = gsap
        .timeline({
          scrollTrigger: { trigger: el, start: "top 82%", once: true },
          defaults: { ease: "power3.out" },
        })
        // 1) conector + cabo entram JUNTOS na tomada (o cabo acompanha o
        //    conector; a ponta longe do cabo some sob o gabinete). O conector
        //    parte à direita, com os furos à mostra, e desliza cobrindo-os.
        .from([".lp-boot-plug", ".lp-boot-cord"], { x: 14, duration: 0.42 })
        // 2) o feixe SAI da tomada e segue o cabo até o gabinete: acende no topo
        //    do cabo, DESCE pela vertical e corre para a ESQUERDA pela base até
        //    o desktop. As pernas seguem o cotovelo down-then-left do cabo.
        .set(".lp-boot-pulse", { autoAlpha: 1 }, ">-0.02")
        .to(".lp-boot-pulse", { y: 45, duration: 0.24, ease: "none" })
        .to(".lp-boot-pulse", { x: -30, duration: 0.32, ease: "none" })
        .to(".lp-boot-pulse", { autoAlpha: 0, duration: 0.12 })
        // 3) o gabinete acende (LED) e a tela liga, quase juntos
        .from(".lp-boot-led", { autoAlpha: 0.25, duration: 0.12 }, "<")
        .from(".lp-boot-glow", { autoAlpha: 0, duration: 0.3 }, "-=0.02")
        // 4) o texto se escreve
        .from(".lp-boot-line", { scaleX: 0, transformOrigin: "left", duration: 0.24, stagger: 0.15 }, "-=0.02");
      // Um pouco mais lento no conjunto — timeScale retarda tudo em bloco, sem
      // reequilibrar cada duração. 0.72 ≈ 40% mais devagar.
      tl.timeScale(0.72);
    }, el);
    return () => ctx.revert();
  }, []);
  return (
    <div className="lp-boot" ref={ref} aria-hidden="true">
      <div className="lp-boot-stage">
        <div className="lp-boot-outlet" />
        <div className="lp-boot-plug" />
        <div className="lp-boot-cord" />
        <div className="lp-boot-pulse" />
        <div className="lp-boot-tower">
          <span className="lp-boot-led" />
          <span className="lp-boot-bay" />
          <span className="lp-boot-bay" />
        </div>
        <div className="lp-monitor">
          <div className="lp-monitor-screen">
            <span className="lp-boot-glow" />
            <span className="lp-boot-line" />
            <span className="lp-boot-line" />
            <span className="lp-boot-line" />
          </div>
          <div className="lp-monitor-neck" />
          <div className="lp-monitor-base" />
        </div>
        <div className="lp-boot-keyboard" />
        <div className="lp-boot-mouse" />
      </div>
    </div>
  );
}

/** Card de PBL: 5 bonecos sentados em roda de fogueira, o fogo (CSS) tremulando
    sempre. Ao rolar, um deles se levanta e um balão de fala surge na altura da
    cabeça — `scrub` liga o levantar ao scroll ("ao ir abaixando a tela"). A
    arte é CSS (não SVG); estado de repouso (reduced-motion) = todos sentados,
    sem balão. */
/* Rede do card de PBL: um problema no centro (hub), participantes em volta. As
   arestas 0→n são os "raios" (todos engajam o problema); as demais formam o anel
   de diálogo (peer a peer). Habilidade que cada nó revela ao lado — a leitura da
   IA. Genéricas e ilustrativas (um diagrama, não dado real de ninguém). */
const NET_NODES: { x: number; y: number; hub?: boolean; skill?: string }[] = [
  { x: 110, y: 82, hub: true },
  { x: 110, y: 22, skill: "leads" },
  { x: 172, y: 54, skill: "questions" },
  { x: 150, y: 132, skill: "mediates" },
  { x: 68, y: 132, skill: "listens" },
  { x: 48, y: 54, skill: "synthesizes" },
];
const NET_EDGES: [number, number][] = [
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], // raios até o problema
  [1, 2], [2, 3], [3, 4], [4, 5], [5, 1], // anel de diálogo
];

/** Card de PBL: rede de participantes em torno de um problema central. Ao rolar,
    os nós surgem, os raios se ligam ao problema, o anel de diálogo se acende e
    as etiquetas de habilidade aparecem — a leitura que a IA devolve. `scrub`
    liga tudo ao scroll. A geometria de cada aresta (comprimento/ângulo) sai de
    CÁLCULO a partir das posições, não de CSS à mão. Repouso (reduced-motion) =
    rede inteira conectada, com as habilidades visíveis. */
function ProblemNet() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap
        .timeline({ scrollTrigger: { trigger: el, start: "top 82%", end: "top 32%", scrub: 1 } })
        .from(".lp-net-node", { scale: 0, stagger: 0.05, duration: 0.4 }, 0)
        .from(".lp-net-spoke", { scaleX: 0, stagger: 0.04, duration: 0.4 }, 0.1)
        .from(".lp-net-link", { scaleX: 0, autoAlpha: 0, stagger: 0.05, duration: 0.4 }, 0.36)
        .from(".lp-net-skill", { autoAlpha: 0, y: 4, stagger: 0.06, duration: 0.4 }, 0.62);
    }, el);
    return () => ctx.revert();
  }, []);
  return (
    <div className="lp-net" ref={ref} aria-hidden="true">
      {NET_EDGES.map(([a, b], i) => {
        const A = NET_NODES[a], B = NET_NODES[b];
        const dx = B.x - A.x, dy = B.y - A.y;
        const len = Math.hypot(dx, dy);
        const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
        return (
          <span
            key={i}
            className={`lp-net-edge ${a === 0 ? "lp-net-spoke" : "lp-net-link"}`}
            style={{ left: A.x, top: A.y, width: len, transform: `rotate(${ang}deg)` }}
          />
        );
      })}
      {NET_NODES.map((n, i) => (
        <span key={i} className={`lp-net-node ${n.hub ? "lp-net-node--hub" : ""}`} style={{ left: n.x, top: n.y }}>
          {n.skill && <span className="lp-net-skill">{n.skill}</span>}
        </span>
      ))}
    </div>
  );
}

/** Conteúdo de um capítulo: texto + card (selo animado, boot ou ícone). Extraído
    para servir tanto o acordeão quanto os caps normais. `flip` alterna o lado e
    escolhe o preenchimento do card (glow/flat), como o índice fazia. */
function CapContent({ c, flip }: { c: (typeof CAPS)[number]; flip: boolean }) {
  return (
    <div className="lp-cap" data-flip={flip || undefined}>
      <div className="lp-cap-txt" data-reveal>
        <h3>{c.t}</h3>
        <p className="lp-muted">{c.d}</p>
      </div>
      <div className="lp-card" data-reveal style={{ ["--i" as string]: 1 }} data-fill={flip ? "flat" : "glow"}>
        {c.anim === "boot" ? <BootDevice />
          : c.anim === "network" ? <ProblemNet />
          : <i className={`fa-solid ${c.icon} lp-card-icon`} aria-hidden="true" />}
      </div>
    </div>
  );
}

/** Pilha sanfona: cada capítulo é um painel `position: sticky` que gruda no
    topo, e o seguinte — opaco e full-bleed — sobe por cima cobrindo o anterior.
    O empilhar/cobrir é 100% CSS (ver .lp-capstack em landing.css).

    O GSAP entra só no POLIMENTO da transição: enquanto o próximo painel cobre,
    o conteúdo do de baixo RECUA (encolhe e esmaece), dando profundidade — a
    página coberta some para o fundo em vez de ser cortada seca. `scrub` liga o
    recuo ao scroll com leve inércia (a suavidade pedida). Mobile e
    prefers-reduced-motion não montam o GSAP: o empilhamento simples basta. */
function CapStack({ items, children }: { items: (typeof CAPS)[number][]; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const desktop = window.matchMedia("(min-width: 1001px)").matches;
    if (reduce || !desktop) return;
    const ctx = gsap.context(() => {
      const panels = gsap.utils.toArray<HTMLElement>(".lp-capstack-panel");
      panels.forEach((panel, i) => {
        if (i === panels.length - 1) return; // o último não é coberto
        // O painel de baixo recua enquanto o de cima cobre. `.lp-cap` nos caps,
        // `.lp-panel-in` no painel extra (steps) — o alvo comum é o conteúdo.
        gsap.to(panel.querySelector(".lp-cap, .lp-panel-in"), {
          scale: 0.93,
          opacity: 0.35,
          ease: "none",
          scrollTrigger: {
            trigger: panels[i + 1], // o painel que sobe cobrindo
            start: "top bottom",    // começa a entrar por baixo
            end: "top top",         // cobre por completo
            scrub: 1,
          },
        });
      });
    }, el);
    return () => ctx.revert();
  }, []);
  return (
    <div className="lp-capstack" ref={ref}>
      {items.map((c, i) => (
        <div className="lp-capstack-panel" key={c.t}>
          <CapContent c={c} flip={i % 2 === 1} />
        </div>
      ))}
      {children}
    </div>
  );
}

/** Uma marca da faixa: logo quando há arquivo, o nome em texto quando não há.
    alt="" de propósito — a faixa inteira é aria-hidden e os nomes chegam ao
    leitor de tela pela lista .lp-sr-only, sem a repetição do laço. */
function BrandItem({ b }: { b: (typeof BRANDS)[number] }) {
  return (
    <li className="lp-brand">
      {b.logo
        /* Sem loading="lazy": a faixa anda por transform, e o que está fora da
           viewport nasce sem carregar e POPA ao entrar deslizando. São 5
           arquivos únicos (~100 KB) repetidos 30 vezes — o cache resolve, e a
           faixa fica logo abaixo do hero de qualquer forma. */
        ? <img className="lp-brand-logo" data-mono={b.mono} src={b.logo} alt="" />
        : b.name}
    </li>
  );
}

/** Canvas de partículas — o motor vive em landing/particles.ts. */
function Field({
  variant, density, cursorField, className,
}: { variant: Variant; density?: number; cursorField?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(
    () => (ref.current ? initParticles(ref.current, variant, density, cursorField) : undefined),
    [variant, density, cursorField],
  );
  return <canvas className={className} ref={ref} aria-hidden="true" />;
}

export default function Landing() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => (root.current ? initLandingMotion(root.current) : undefined), []);

  return (
    /* lang aqui, e não no index.html: o documento é pt-br e serve /portal e
       /r/:id em português. Só esta subárvore é inglês — é o que faz o leitor de
       tela trocar de voz na landing sem mentir sobre o resto do produto. */
    <div className="lp" ref={root} lang="en">
      <span data-nav-sentinel aria-hidden="true" className="lp-sentinel" />

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="lp-nav">
        <a className="lp-logo" href="/">
          <span className="lp-logo-mark" aria-hidden="true" />
          <span className="lp-logo-strong">PBLTools</span> <span className="lp-logo-soft">Video Rooms</span>
        </a>
        <nav className="lp-navlinks" aria-label="Main navigation">
          <a href="#product">Product</a>
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <a className="lp-pill-solid" href="/portal">
          Get started <i className="fa-solid fa-arrow-right" aria-hidden="true" />
        </a>
      </header>

      <main>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="lp-hero" aria-labelledby="hero-h">
          <Field variant="specks" cursorField className="lp-hero-field" />
          <div className="lp-hero-in">
            <p className="lp-lockup" data-reveal="now">
              <span className="lp-logo-mark" aria-hidden="true" />
              <span className="lp-logo-strong">PBLTools</span> <span className="lp-logo-soft">Video Rooms</span>
            </p>
            <h1 id="hero-h" data-reveal="now" style={{ ["--i" as string]: 1 }}>
              The room where soft skills actually happen
            </h1>
            <div className="lp-hero-cta" data-reveal="now" style={{ ["--i" as string]: 2 }}>
              <a className="lp-pill-solid lp-pill-lg" href="/portal">
                <i className="fa-solid fa-video" aria-hidden="true" /> Create a room
              </a>
              <a className="lp-pill-ghost lp-pill-lg" href="#how-it-works">See how it works</a>
            </div>
          </div>
        </section>

        {/* ── Marcas ────────────────────────────────────────────────────── */}
        {BRANDS_ON && (
          <section className="lp-brands" aria-labelledby="brands-h">
            <h2 id="brands-h" className="lp-brands-h">Already running sessions on Video Rooms</h2>
            {/* A faixa inteira é aria-hidden e a lista real vai em .lp-sr-only:
                a repetição existe para o laço não ter costura, e sem isso o leitor
                de tela anunciaria "John Deere" seis vezes. */}
            <div className="lp-marquee" aria-hidden="true">
              <ul className="lp-marquee-track">
                {BRAND_STRIP.map((b, i) => <BrandItem b={b} key={i} />)}
              </ul>
              {/* Cópia idêntica: é ela que ocupa o lugar da primeira no laço. */}
              <ul className="lp-marquee-track">
                {BRAND_STRIP.map((b, i) => <BrandItem b={b} key={i} />)}
              </ul>
            </div>
            <ul className="lp-sr-only">
              {BRANDS.map((b) => <li key={b.name}>{b.name}</li>)}
            </ul>
          </section>
        )}

        {/* ── Missão (máquina de escrever) ──────────────────────────────── */}
        <section className="lp-mission" id="mission">
          {/* A camada-fantasma carrega o texto completo invisível e reserva a
              altura exata; a viva digita por cima. Sem ela o parágrafo cresce
              enquanto digita e empurra a página inteira (CLS). */}
          <p className="lp-mission-t">
            <span className="lp-type-ghost" aria-hidden="true">{MISSION}</span>
            <span className="lp-type-live" data-type data-type-speed="16">{MISSION}</span>
          </p>
        </section>

        {/* ── API ───────────────────────────────────────────────────────── */}
        <section className="lp-api" aria-labelledby="api-h">
          <div className="lp-cap">
            <div className="lp-cap-txt" data-reveal>
              {/* h2, não h3: é seção própria, e um h3 aqui viria ANTES do h2 de
                  "Built to develop people" — anunciaria um nível que ainda não
                  abriu. O corpo é o do h3 via .lp-api-h, senão dois h2 em corpo
                  grande se atropelam. Mesmo arranjo da faixa de marcas. */}
              <h2 id="api-h" className="lp-api-h">{API_CAP.t}</h2>
              <p className="lp-muted">{API_CAP.d}</p>
            </div>
            <CodeCard code={API_CAP.code} />
          </div>
        </section>

        {/* ── Capítulos + cards de mídia ────────────────────────────────── */}
        <section className="lp-caps" id="product">
          <div className="lp-caps-head">
            {/* Era a seção .lp-band solta lá embaixo; virou o fundo daqui para
                marcar a divisão entre a API e os capítulos. Absoluto, então não
                entra na grade de duas colunas do bloco. */}
            <Field variant="grid" className="lp-caps-head-field" />
            {/* O <br /> separa as duas orações da antítese, então cada uma
                precisa caber numa linha: a coluna leva ~22 caracteres neste
                corpo. Copy mais longa quebra sozinha e o <br /> vira ruído. */}
            <h2 data-reveal>Built to develop people,<br />not to run meetings</h2>
            <p className="lp-muted" data-reveal style={{ ["--i" as string]: 1 }}>
              People learn the way they always have: by hitting a real problem with others and
              having to work it out. That's PBL nothing here teaches a skill, the session just
              puts the group somewhere the skill has to show up.
            </p>
          </div>

          {/* Os capítulos e o "How it works" empilham em sanfona: cada um gruda
              no topo e o próximo sobe cobrindo. O steps é o último painel da
              pilha; depois dele o site segue normal (planos). */}
          <CapStack items={CAPS}>
            <section className="lp-capstack-panel lp-steps-panel" id="how-it-works" aria-labelledby="steps-h">
              <div className="lp-panel-in">
                <h2 id="steps-h" data-reveal>How it works</h2>
                <div className="lp-steps-grid">
                  {STEPS.map((s, i) => (
                    <div className="lp-step" data-reveal style={{ ["--i" as string]: i }} key={s.n}>
                      <span className="lp-step-n">{s.n}</span>
                      <h3>{s.t}</h3>
                      <p className="lp-muted">{s.d}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </CapStack>
        </section>

        {/* ── Prova ─────────────────────────────────────────────────────────
            REVISAR: seção comentada de propósito. Não há depoimento nem número
            real, e inventar prova social é a pior coisa a inventar aqui.
            Reabrir quando houver dado verdadeiro.
        <section className="lp-proof" id="proof" />
        */}

        {/* ── Planos ────────────────────────────────────────────────────── */}
        <section className="lp-plans-sec" id="pricing">
          <h2 data-reveal>Pricing</h2>
          <p className="lp-muted lp-center" data-reveal style={{ ["--i" as string]: 1 }}>
            Start with the trial and scale as your cohorts grow.
          </p>
          <div className="lp-plans">
            {PLANS.map((p, i) => (
              <div className="lp-plan" data-hi={p.hi || undefined} data-reveal style={{ ["--i" as string]: i }} key={p.n}>
                {p.hi && <span className="lp-plan-tag">Most popular</span>}
                <h3>{p.n}</h3>
                <div className="lp-plan-p">{p.p}</div>
                <div className="lp-plan-per">{p.per}</div>
                <ul>
                  {p.f.map((f) => (
                    <li key={f}><i className="fa-solid fa-check" aria-hidden="true" /> {f}</li>
                  ))}
                </ul>
                <a className={p.hi ? "lp-pill-solid lp-pill-block" : "lp-pill-ghost lp-pill-block"} href="/portal">
                  {p.n === "Trial" ? "Start trial" : "Talk to sales"}
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────────────── */}
        <section className="lp-faq" id="faq">
          <h2 data-reveal>Frequently asked questions</h2>
          <div className="lp-faq-list">
            {FAQ.map((f, i) => (
              <details className="lp-q" data-reveal style={{ ["--i" as string]: i }} key={f.q}>
                <summary>
                  {f.q}
                  <i className="fa-solid fa-plus" aria-hidden="true" />
                </summary>
                {/* Altura por grid-template-rows 0fr→1fr, não max-height chutado. */}
                <div className="lp-q-body"><p className="lp-muted">{f.a}</p></div>
              </details>
            ))}
          </div>
        </section>

        {/* ── CTA final ─────────────────────────────────────────────────── */}
        <section className="lp-final">
          <Field variant="specks" density={0.7} cursorField className="lp-final-field" />
          <h2 data-reveal>Open your first room today</h2>
          <a className="lp-pill-solid lp-pill-lg" data-reveal style={{ ["--i" as string]: 1 }} href="/portal">
            Create a room <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </a>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="lp-foot">
        <div className="lp-foot-card">
          <Field variant="stars" className="lp-foot-field" />
        </div>
        <div className="lp-foot-grid">
          <p className="lp-foot-claim">The room where soft skills happen</p>
          <div className="lp-foot-col">
            <a href="/portal">Client portal</a>
            <a href="/documentation">Documentation</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="lp-foot-col">
            <a href="#product">Product</a>
            <a href="#how-it-works">How it works</a>
            <a href="#mission">What it is</a>
          </div>
        </div>
        {/* Wordmark gigante — a assinatura do rodapé da referência. */}
        <p className="lp-wordmark" aria-hidden="true">PBLTools</p>
        <div className="lp-foot-legal">
          <span>© 2026 PBLTools</span>
          <span className="lp-foot-legal-links">
            <a href="/documentation">Privacy</a>
            <a href="/documentation">Terms</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
