import "../styles/landing.css";

const FEATURES = [
  { icon: "🎥", title: "Vídeo em HD", desc: "Salas WebRTC de baixa latência com servidor próprio em São Paulo — sem limites de terceiros." },
  { icon: "🧩", title: "Embed em qualquer LMS", desc: "Incorpore via iframe ou LTI 1.3. Sua chave de API nunca chega ao navegador." },
  { icon: "🎬", title: "Gravação em nuvem", desc: "Grave reuniões automaticamente e armazene com segurança no seu próprio storage." },
  { icon: "🖊️", title: "Quadro branco", desc: "Lousa colaborativa em tempo real com formas, conectores e múltiplos pincéis." },
  { icon: "🚪", title: "Saguão (lobby)", desc: "Controle quem entra na sala, com tela de espera personalizável por marca." },
  { icon: "🎨", title: "White-label", desc: "Sua marca, suas cores e seu logo em toda a experiência do usuário final." },
];

const PLANS = [
  { name: "Trial", price: "Grátis", period: "14 dias", feats: ["Até 2 salas simultâneas", "Até 25 participantes", "Quadro branco", "Suporte por e-mail"], cta: "Começar trial", highlight: false },
  { name: "Pro", price: "Sob consulta", period: "por licença", feats: ["Salas ilimitadas", "Gravação em nuvem", "White-label completo", "Embed LTI 1.3", "Suporte prioritário"], cta: "Falar com vendas", highlight: true },
  { name: "Enterprise", price: "Sob consulta", period: "self-host", feats: ["Infra dedicada", "SLA garantido", "SSO / SAML", "Onboarding assistido", "Gerente de conta"], cta: "Falar com vendas", highlight: false },
];

export default function Landing() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-brand"><span className="lp-logo">V</span> VideoConf<span className="lp-brand-accent">BWL</span></div>
        <nav className="lp-links">
          <a href="#recursos">Recursos</a>
          <a href="#planos">Planos</a>
          <a href="/documentation">Documentação</a>
          <a className="lp-btn-ghost" href="/portal">Entrar</a>
          <a className="lp-btn" href="/portal">Criar conta</a>
        </nav>
      </header>

      <section className="lp-hero">
        <div className="lp-hero-inner">
          <span className="lp-eyebrow">Webconferência plug-and-play</span>
          <h1>Videoconferência sob a <span className="lp-grad">sua marca</span>, dentro do seu LMS.</h1>
          <p className="lp-lead">
            Salas de vídeo HD, gravação, quadro branco e saguão — prontos para incorporar em qualquer
            plataforma de ensino via iframe ou LTI 1.3. Multi-cliente, white-label e com servidor próprio.
          </p>
          <div className="lp-hero-cta">
            <a className="lp-btn lp-btn-lg" href="/portal">Criar conta grátis</a>
            <a className="lp-btn-ghost lp-btn-lg" href="#planos">Ver planos</a>
          </div>
          <div className="lp-trust">Sem cartão de crédito · Trial de 14 dias · Infra em São Paulo</div>
        </div>
        <div className="lp-hero-art" aria-hidden="true">
          <div className="lp-mock">
            <div className="lp-mock-bar"><i></i><i></i><i></i></div>
            <div className="lp-mock-grid">
              <div className="lp-tile lp-tile-1"><span>👩‍🏫</span></div>
              <div className="lp-tile lp-tile-2"><span>🧑‍🎓</span></div>
              <div className="lp-tile lp-tile-3"><span>👨‍🎓</span></div>
              <div className="lp-tile lp-tile-4"><span>👩‍🎓</span></div>
            </div>
            <div className="lp-mock-dock"><i></i><i></i><i className="lp-rec"></i><i></i></div>
          </div>
        </div>
      </section>

      <section className="lp-section" id="recursos">
        <h2 className="lp-h2">Tudo que você precisa para vender aulas ao vivo</h2>
        <p className="lp-sub">Uma stack completa de videoconferência, pronta para a sua operação.</p>
        <div className="lp-features">
          {FEATURES.map((f) => (
            <div className="lp-feat" key={f.title}>
              <div className="lp-feat-ic">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section lp-planos" id="planos">
        <h2 className="lp-h2">Planos para cada estágio</h2>
        <p className="lp-sub">Comece grátis e evolua conforme seus clientes crescem.</p>
        <div className="lp-plans">
          {PLANS.map((p) => (
            <div className={"lp-plan" + (p.highlight ? " lp-plan-hi" : "")} key={p.name}>
              {p.highlight && <div className="lp-plan-tag">Mais popular</div>}
              <h3>{p.name}</h3>
              <div className="lp-price">{p.price}</div>
              <div className="lp-period">{p.period}</div>
              <ul>{p.feats.map((x) => <li key={x}>{x}</li>)}</ul>
              <a className={p.highlight ? "lp-btn lp-btn-block" : "lp-btn-ghost lp-btn-block"} href="/portal">{p.cta}</a>
            </div>
          ))}
        </div>
      </section>

      <section className="lp-cta-band">
        <h2>Pronto para incorporar videoconferência no seu produto?</h2>
        <p>Crie sua conta e tenha uma sala funcionando em minutos.</p>
        <a className="lp-btn lp-btn-lg" href="/portal">Criar conta grátis</a>
      </section>

      <footer className="lp-footer">
        <div className="lp-brand"><span className="lp-logo">V</span> VideoConf<span className="lp-brand-accent">BWL</span></div>
        <div className="lp-foot-links">
          <a href="/documentation">Documentação</a>
          <a href="/portal">Portal do cliente</a>
          <a href="/app">App de demonstração</a>
        </div>
        <div className="lp-foot-copy">© 2026 BWL · Webconferência multi-cliente</div>
      </footer>
    </div>
  );
}
