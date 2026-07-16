import { useEffect, useRef } from "react";
import { initLandingMotion } from "./landing/motion";
import { initParticles, type Variant } from "./landing/particles";
import "../styles/landing.css";

/* ── Conteúdo ────────────────────────────────────────────────────────────────
   REVISAR: os cards de mídia estão vazios por decisão — o repositório não tem
   nenhuma imagem e nada aqui é inventado. Cada card já reserva o espaço final
   (aspect-ratio fixo), então preencher depois não mexe no layout nem gera CLS. */

const ICONS = [
  "fa-microphone", "fa-video", "fa-users", "fa-comments", "fa-hand",
  "fa-chalkboard", "fa-lightbulb", "fa-brain", "fa-chart-simple", "fa-user-group",
  "fa-clock", "fa-circle-check", "fa-headphones", "fa-share-nodes",
];
/* O arco é um círculo completo girando, então precisa de chips suficientes para
   preencher a circunferência inteira — senão eles ficam a ~500px um do outro e
   quase todos caem fora da tela. Com raio 1300px a circunferência é ~8170px;
   a ~117px de espaçamento dá 70 chips, dos quais ~14 ficam visíveis por vez. */
const ARC_COUNT = 70;
const CHIPS = Array.from({ length: ARC_COUNT }, (_, i) => ICONS[i % ICONS.length]);

const CAPS = [
  {
    t: "A sala",
    d: "Um grupo, papéis definidos e um problema real na mesa. O facilitador abre a sessão, divide em grupos e acompanha cada um sem sair do lugar.",
  },
  {
    t: "A IA observa",
    d: "Durante a sessão, a IA acompanha o que acontece na conversa: quem puxa o grupo, quem escuta, quem trava, quem media o conflito.",
  },
  {
    t: "O retorno",
    d: "No fim, cada pessoa recebe a leitura das próprias habilidades — e o grupo recebe a leitura do que fez junto.",
  },
  {
    t: "Para RH e escola",
    d: "Turmas, trilhas e a evolução de cada pessoa ao longo do tempo, sessão após sessão, num painel só.",
  },
];

const STEPS = [
  { n: "01", t: "Monte a sala", d: "Escolha o problema, defina os grupos e abra a sessão. Leva menos de um minuto." },
  { n: "02", t: "O grupo resolve", d: "As pessoas discutem, discordam e chegam a uma resposta. A IA acompanha em silêncio." },
  { n: "03", t: "Cada um recebe sua leitura", d: "O relatório sai por pessoa e por grupo, com o que apareceu na sessão." },
];

const FAQ = [
  {
    q: "A sessão é gravada?",
    a: "A gravação é opcional e definida por sala, na criação. Quando está ligada, todo mundo vê o indicador de gravação durante a sessão inteira.",
  },
  {
    q: "Quem tem acesso ao que a IA observa?",
    a: "A pessoa vê a própria leitura. O facilitador vê a do grupo. O que é individual não circula para os colegas.",
  },
  {
    q: "Os dados da sessão saem da nossa organização?",
    a: "Não. Cada organização é um tenant isolado, e as salas, gravações e relatórios ficam dentro dela.",
  },
  {
    q: "Precisa instalar alguma coisa?",
    a: "Não. A sala roda no navegador. Também dá para embutir no seu LMS por iframe, sem o participante sair da plataforma.",
  },
  {
    q: "Dá para usar com a nossa marca?",
    a: "Sim. Logo, cor e nome do produto são configuráveis por organização, e o participante só vê a sua marca.",
  },
  {
    q: "Quantas pessoas cabem numa sala?",
    a: "Depende do plano. Os grupos de trabalho são pequenos por desenho — a sessão de PBL vive da conversa, não da plateia.",
  },
];

const PLANS = [
  { n: "Trial", p: "Grátis", per: "14 dias", f: ["Até 2 salas simultâneas", "Até 25 participantes", "Quadro branco", "Suporte por e-mail"], hi: false },
  { n: "Pro", p: "Sob consulta", per: "por licença", f: ["Salas ilimitadas", "Gravação em nuvem", "White-label completo", "Embed LTI 1.3", "Suporte prioritário"], hi: true },
  { n: "Enterprise", p: "Sob consulta", per: "self-host", f: ["Infra dedicada", "SLA garantido", "SSO / SAML", "Onboarding assistido", "Gerente de conta"], hi: false },
];

const MISSION =
  "O Video Rooms Kit é a sala de sessões da OpenPBL: um grupo, um problema real e uma IA que devolve a leitura das habilidades que apareceram ali.";

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
    <div className="lp" ref={root}>
      <span data-nav-sentinel aria-hidden="true" className="lp-sentinel" />

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <header className="lp-nav">
        <a className="lp-logo" href="/">
          <span className="lp-logo-mark" aria-hidden="true" />
          <span className="lp-logo-strong">OpenPBL</span> <span className="lp-logo-soft">Video Rooms</span>
        </a>
        <nav className="lp-navlinks" aria-label="Navegação principal">
          <a href="#produto">Produto</a>
          <a href="#como-funciona">Como funciona</a>
          <a href="#planos">Planos</a>
          <a href="#faq">FAQ</a>
        </nav>
        <a className="lp-pill-dark" href="/portal">
          Criar conta <i className="fa-solid fa-arrow-right" aria-hidden="true" />
        </a>
      </header>

      <main>
        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <section className="lp-hero" aria-labelledby="hero-h">
          <Field variant="specks" cursorField className="lp-hero-field" />
          <div className="lp-hero-in">
            <p className="lp-lockup" data-reveal="now">
              <span className="lp-logo-mark" aria-hidden="true" />
              <span className="lp-logo-strong">OpenPBL</span> <span className="lp-logo-soft">Video Rooms</span>
            </p>
            <h1 id="hero-h" data-reveal="now" style={{ ["--i" as string]: 1 }}>
              A sala onde a soft skill realmente acontece
            </h1>
            <div className="lp-hero-cta" data-reveal="now" style={{ ["--i" as string]: 2 }}>
              <a className="lp-pill-dark lp-pill-lg" href="/portal">
                <i className="fa-solid fa-video" aria-hidden="true" /> Criar uma sala
              </a>
              <a className="lp-pill-ghost lp-pill-lg" href="#como-funciona">Ver como funciona</a>
            </div>
          </div>
        </section>

        {/* ── Arco de chips ─────────────────────────────────────────────── */}
        <section className="lp-arc-sec" aria-hidden="true">
          <div className="lp-arc">
            {CHIPS.map((c, i) => (
              <span className="lp-arc-slot" style={{ ["--a" as string]: `${(360 / ARC_COUNT) * i}deg` }} key={i}>
                <span className="lp-chip"><i className={`fa-solid ${c}`} /></span>
              </span>
            ))}
          </div>
        </section>

        {/* ── Missão (máquina de escrever) ──────────────────────────────── */}
        <section className="lp-mission" id="missao">
          {/* A camada-fantasma carrega o texto completo invisível e reserva a
              altura exata; a viva digita por cima. Sem ela o parágrafo cresce
              enquanto digita e empurra a página inteira (CLS). */}
          <p className="lp-mission-t">
            <span className="lp-type-ghost" aria-hidden="true">{MISSION}</span>
            <span className="lp-type-live" data-type data-type-speed="16">{MISSION}</span>
          </p>
        </section>

        {/* ── Capítulos + cards escuros ─────────────────────────────────── */}
        <section className="lp-caps" id="produto">
          <div className="lp-caps-head">
            <h2 data-reveal>Feito para quem forma gente,<br />não para quem faz reunião</h2>
            <p className="lp-muted" data-reveal style={{ ["--i" as string]: 1 }}>
              Videoconferência aqui é meio, não fim. A sala existe para o grupo resolver um problema
              junto — e para você enxergar o que aconteceu ali.
            </p>
          </div>

          {CAPS.map((c, i) => (
            /* data-flip explícito em vez de :nth-child — o .lp-caps-head também
               conta como filho e invertia a alternância já no primeiro capítulo. */
            <div className="lp-cap" data-flip={i % 2 === 1 || undefined} key={c.t}>
              <div className="lp-cap-txt" data-reveal>
                <h3>{c.t}</h3>
                <p className="lp-muted">{c.d}</p>
              </div>
              {/* REVISAR: card de mídia vazio — sem imagem real no repositório.
                  O aspect-ratio já reserva o espaço final (CLS ≈ 0). */}
              <div className="lp-card" data-reveal style={{ ["--i" as string]: 1 }} data-fill={i % 2 === 0 ? "glow" : "flat"} />
            </div>
          ))}
        </section>

        {/* ── Faixa de partículas ───────────────────────────────────────── */}
        <section className="lp-band" aria-hidden="true">
          <Field variant="grid" className="lp-band-field" />
        </section>

        {/* ── Como funciona ─────────────────────────────────────────────── */}
        <section className="lp-steps" id="como-funciona">
          <h2 data-reveal>Como funciona</h2>
          <div className="lp-steps-grid">
            {STEPS.map((s, i) => (
              <div className="lp-step" data-reveal style={{ ["--i" as string]: i }} key={s.n}>
                <span className="lp-step-n">{s.n}</span>
                <h3>{s.t}</h3>
                <p className="lp-muted">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Prova ─────────────────────────────────────────────────────────
            REVISAR: seção comentada de propósito. Não há depoimento nem número
            real, e inventar prova social é a pior coisa a inventar aqui.
            Reabrir quando houver dado verdadeiro.
        <section className="lp-proof" id="prova" />
        */}

        {/* ── Planos ────────────────────────────────────────────────────── */}
        <section className="lp-plans-sec" id="planos">
          <h2 data-reveal>Planos</h2>
          <p className="lp-muted lp-center" data-reveal style={{ ["--i" as string]: 1 }}>
            Comece pelo trial e evolua conforme suas turmas crescem.
          </p>
          <div className="lp-plans">
            {PLANS.map((p, i) => (
              <div className="lp-plan" data-hi={p.hi || undefined} data-reveal style={{ ["--i" as string]: i }} key={p.n}>
                {p.hi && <span className="lp-plan-tag">Mais escolhido</span>}
                <h3>{p.n}</h3>
                <div className="lp-plan-p">{p.p}</div>
                <div className="lp-plan-per">{p.per}</div>
                <ul>
                  {p.f.map((f) => (
                    <li key={f}><i className="fa-solid fa-check" aria-hidden="true" /> {f}</li>
                  ))}
                </ul>
                <a className={p.hi ? "lp-pill-dark lp-pill-block" : "lp-pill-ghost lp-pill-block"} href="/portal">
                  {p.n === "Trial" ? "Começar trial" : "Falar com vendas"}
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────────────── */}
        <section className="lp-faq" id="faq">
          <h2 data-reveal>Perguntas frequentes</h2>
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
          <h2 data-reveal>Abra sua primeira sala hoje</h2>
          <a className="lp-pill-dark lp-pill-lg" data-reveal style={{ ["--i" as string]: 1 }} href="/portal">
            Criar uma sala <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </a>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="lp-foot">
        <div className="lp-foot-card">
          <Field variant="stars" className="lp-foot-field" />
        </div>
        <div className="lp-foot-grid">
          <p className="lp-foot-claim">A sala onde a soft skill acontece</p>
          <div className="lp-foot-col">
            <a href="/portal">Portal do cliente</a>
            <a href="/documentation">Documentação</a>
            <a href="#planos">Planos</a>
            <a href="#faq">FAQ</a>
          </div>
          <div className="lp-foot-col">
            <a href="#produto">Produto</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#missao">O que é</a>
          </div>
        </div>
        {/* Wordmark gigante — a assinatura do rodapé da referência. */}
        <p className="lp-wordmark" aria-hidden="true">OpenPBL</p>
        <div className="lp-foot-legal">
          <span>© 2026 OpenPBL</span>
          <span className="lp-foot-legal-links">
            <a href="/documentation">Privacidade</a>
            <a href="/documentation">Termos</a>
          </span>
        </div>
      </footer>
    </div>
  );
}
