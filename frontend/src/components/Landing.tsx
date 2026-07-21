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
const CAPS: { t: string; d: string; icon: string; anim?: "boot" | "pbl" | "skin"; tag?: string }[] = [
  {
    icon: "fa-plug",
    anim: "boot",
    t: "Plugs into your LMS",
    d: "Sessions launch from the tools your learners already use — no new login, no separate portal. What happens in the room flows back to your platform on its own.",
  },
  {
    icon: "fa-people-group",
    anim: "pbl",
    t: "Built around PBL",
    /* O texto está PARTIDO em `d` + `tag` porque a cena usa os dois em tempos
       diferentes: o corpo fica parado ao lado enquanto a cena roda, e a última
       frase é a estocada — ela só cai depois que os grupos se formaram e a
       leitura saiu. Junto num parágrafo só, o remate chegaria antes da cena que
       o justifica. Nada foi reescrito: é a mesma frase, separada. */
    d: "The room is shaped by the method, not the other way around: a real problem, small working groups, and a read-back of the skills each person showed.",
    tag: "Not a webinar with breakout rooms bolted on.",
  },
  {
    icon: "fa-palette",
    anim: "skin",
    t: "Your brand, end to end",
    /* Partido como no card de PBL: o corpo fica ao lado enquanto a cena roda e
       o remate cai no fim, depois de a troca de marcas já ter provado a frase.
       Mesmo texto de antes, só separado. */
    d: "Logo, color, and product name are set per organization — configured through the same API.",
    tag: "The same room, dressed as yours. Participants only ever see your brand.",
  },
];

/* Os três passos são sobre CONEXÃO — como a plataforma fala com o produto e o
   quanto isso custa a quem integra. Cada afirmação sai de algo que existe no
   backend, e não de promessa:
   - a chave única é o `X-API-Key: bwl_live_...` de tenancy.py (o mesmo do curl
     mostrado logo acima nesta página);
   - `external_ref` é campo de RoomCreate, e `POST /rooms/bookings/sync` está
     documentado como "idempotent on external_ref" — daí o "pode repetir";
   - o `guest_token` devolvido na criação é o que faz o aluno entrar por link,
     sem conta deste lado.

   NADA de versão de LTI aqui, pela mesma razão registrada em CAPS: hoje o
   launch é LTI 1.1/SCORM via ScormCloud e o 1.3 nativo é roadmap — número de
   versão nesta página envelhece ou mente. O que está escrito vale nos dois
   mundos porque descreve a API, que é nossa. */
const STEPS = [
  {
    n: "01",
    t: "One key to connect",
    d: "An API key is the whole setup — nothing to install, no service to host. A single POST opens a room and hands back the link your learners will use.",
  },
  {
    n: "02",
    t: "Send your own IDs",
    d: "Every room can carry the reference your platform already uses for that lesson. The sync call is idempotent on it, so your LMS can retry as often as it likes and never open a duplicate.",
  },
  {
    n: "03",
    t: "Learners just click",
    d: "They come in from a link inside your platform — no account here, no second login — and everything the session records stays tied to the reference you sent.",
  },
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
          /* O gatilho é o PALCO, não o card. O card é bem mais alto que a arte
             (é ele que carrega o padding e o glow), então o topo dele cruza a
             linha de disparo com a arte ainda fora de tela — medido no
             celular: a tela do monitor acendia com 0% do palco visível, e
             quem rolava chegava com a animação encerrada. */
          scrollTrigger: { trigger: el.querySelector(".lp-boot-stage")!, start: "top 85%", once: true },
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
        /* 4) o nome se escreve na tela. clip-path, e NÃO scaleX como as barras
              abstratas de antes: escalar texto na horizontal estica os glifos e
              a palavra chega deformada. O recorte revela da esquerda para a
              direita sem tocar na forma da letra — e, por ser recorte, também
              não mexe no layout. */
        .from(".lp-boot-text", { clipPath: "inset(0 100% 0 0)", duration: 0.34 }, "-=0.02")
        .from(".lp-boot-caret", { autoAlpha: 0, duration: 0.1 }, "<");
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
            {/* O cursor fica FORA do elemento recortado: quem se escreve é o
                texto (por clip-path), e um cursor dentro do recorte só
                apareceria no fim, junto com a última letra. Do lado de fora ele
                pisca desde o começo, como num terminal esperando. */}
            <span className="lp-boot-say">
              <span className="lp-boot-text">Your LMS</span>
              <span className="lp-boot-caret" />
            </span>
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



/* ── Cena de PBL ("Built around PBL") ────────────────────────────────────────
   A seção prende na tela e a cena roda pelo scroll. O payload é a MIGRAÇÃO:
   a turma começa numa grade fria de webinar (todo mundo igual, de frente para
   o palco) e, conforme o scroll avança, se reagrupa AO REDOR do problema —
   que é o núcleo da cena e fica no centro dela. É a frase do card encenada:
   a sala tem a forma do método.

   O grupo é a AGLOMERAÇÃO, não um contorno: não há elipse nem anel desenhado
   em volta de ninguém. O que diz "isto é um grupo" é a proximidade.

   A posição de cada grupo é FRAÇÃO do palco (0..1), mas o lugar de cada pessoa
   DENTRO do grupo é PX. Os dois têm de ser assim: a fração deixa a composição
   acompanhar o tamanho do palco, e o px mantém a distância entre vizinhos —
   em fração, um palco estreito faria os avatares (que têm tamanho fixo) se
   sobreporem justamente onde o agrupamento precisa ser legível. */
const PBL_COLS = 4;
const PBL_TOTAL = 12;

/** Célula da grade inicial de webinar, row-major: uniforme e sem hierarquia,
    que é o ponto da imagem — ninguém em destaque, nem o facilitador. */
function pblGridAt(i: number, colunas: number) {
  const linhas = Math.ceil(PBL_TOTAL / colunas);
  // Célula CENTRADA na sua divisão: a grade fica uniforme para qualquer número
  // de colunas, sem constantes mágicas por breakpoint.
  return { x: ((i % colunas) + 0.5) / colunas, y: (Math.floor(i / colunas) + 0.5) / linhas };
}

/** Quantas colunas cabem no palco. Num retrato de ~360px as quatro colunas do
    desktop dariam 81px de passo para um chip de 92 — as colunas se sobrepunham
    antes mesmo de a migração começar, e a "grade de webinar" abria como um
    amontoado. Três colunas por quatro linhas cabem com folga e continuam
    lendo como grade. */
function pblColunas(largura: number) {
  return largura < 480 ? 3 : PBL_COLS;
}

/* Os três grupos, dispostos EM VOLTA do card do problema, que fica no centro do
   palco: dois LADEANDO o card, à meia-altura dele, e um embaixo. Ladear é o que
   faz a composição ler como "em volta do problema" — com os dois grupos de cima
   nos cantos superiores, como estavam, o card sobrava embaixo e a cena virava
   quatro coisas soltas em vez de um arranjo. O leve desnível entre os dois
   (0.40 / 0.44) tira a simetria de espelho, que lê como diagrama. */
const PBL_CLUSTERS = [{ cx: 0.15, cy: 0.43 }, { cx: 0.85, cy: 0.47 }, { cx: 0.5, cy: 0.75 }];

/* Lugar de cada membro dentro do seu grupo, em px a partir do centro dele.
   Propositalmente IRREGULAR (não um 2x2 exato): gente sentada em volta de um
   problema não se alinha em matriz, e a grade regular é justamente o estado
   ANTERIOR — repeti-la aqui apagaria a diferença que a cena existe para contar.

   Estes números acompanham o TAMANHO do avatar (--pbl-av): a distância entre
   vizinhos tem de ser maior que um diâmetro, senão eles se sobrepõem. Ao mexer
   no tamanho lá no CSS, mexer aqui junto. */
const PBL_OFFSETS: [number, number][][] = [
  [[-16, -57], [18, -19], [-18, 19], [16, 57]],
  [[-18, -57], [16, -19], [18, 19], [-16, 57]],
  [[-16, -38], [18, 0], [-14, 38]],
];

/* Quem vai para qual grupo, por índice de grade. EMBARALHADO de propósito: se
   cada grupo puxasse quatro vizinhos de grade, os avatares andariam poucos
   pixels e a cena leria como "assentou", não como "reagrupou". */
const PBL_MEMBERS = [[0, 5, 8, 11], [1, 4, 9, 2], [3, 7, 10]];

/* O facilitador é UM DOS DOZE — na grade ele é indistinguível dos outros, e é
   só quando os grupos se formam que ele ganha anel, crachá e o posto de ponte
   entre eles, encostado no problema. Por isso um dos grupos tem três e não
   quatro: ele saiu das fileiras, não apareceu do nada. */
const PBL_FAC_I = 6;
/* No bolso de cima: os dois grupos que ladeiam o card ficam abaixo e aos lados
   dele, e o card logo embaixo — o facilitador cai no vão que sobra entre os
   três, encostado no problema. É a posição de PONTE, e não a de "mais um
   avatar num canto". */
const PBL_FAC_AT = { x: 0.5, y: 0.25 };

/** Destino de cada avatar, indexado pela posição na GRADE — que também é a
    ordem do DOM, para o leitor de tela e para o stagger baterem com o desenho. */
const PBL_SEATS: { to: { x: number; y: number }; off: [number, number]; fac: boolean }[] = (() => {
  const out = new Array(PBL_COLS * 3);
  PBL_MEMBERS.forEach((ids, g) =>
    ids.forEach((id, k) => {
      out[id] = { to: { x: PBL_CLUSTERS[g].cx, y: PBL_CLUSTERS[g].cy }, off: PBL_OFFSETS[g][k], fac: false };
    }),
  );
  out[PBL_FAC_I] = { to: PBL_FAC_AT, off: [0, 0] as [number, number], fac: true };
  return out;
})();

/* Os figurantes da cena, e o caso que eles discutem.

   Sobre inventar: a regra desta landing é não inventar PROVA — depoimento,
   número, logo de cliente, qualquer coisa que afirme um fato sobre o negócio
   (ver a seção de prova, comentada de propósito mais abaixo). Nomes de
   figurante e um caso-exemplo num diagrama são outra categoria: são
   ILUSTRAÇÃO de como uma sessão se parece, não a alegação de que esta sessão
   aconteceu. Por isso os nomes são primeiro nome + inicial — leem como
   marcador de pessoa, não como identidade de alguém —, e o caso é genérico o
   bastante para ninguém reconhecer nele um cliente. Ao mexer aqui, manter a
   linha: concreto para dar realismo, nunca específico a ponto de virar prova. */
const PBL_NAMES = [
  "Ana L.", "Marcus T.", "Priya S.", "Diego F.",
  "Nour A.", "Ravi K.", "Clara M.", "Tomás B.",
  "Yuki M.", "Sara O.", "Ben C.", "Lena W.",
];
const PBL_PROBLEM = "A city clinic misses one in three follow-up visits. Find out why, and propose a fix its staff will actually use.";

/* A leitura que a IA devolve. Habilidade + o que a pessoa fez para mostrá-la —
   é o "read-back" do texto ao lado, não uma lista de features. Genéricas e
   ilustrativas de propósito: não há sessão real por trás destas linhas, e
   inventar dado de gente é a pior coisa a inventar aqui. */
const PBL_READ: [string, string][] = [
  ["questions", "reframed the problem before the group ran at it"],
  ["listens", "brought back the point that got talked over"],
  ["mediates", "held the disagreement open instead of settling it"],
  ["synthesizes", "pulled three threads into one answer"],
  ["leads", "moved the group when it stalled"],
];

/* Comprimento de scroll que a cena consome. É o KNOB PRINCIPAL de velocidade:
   maior = cena mais lenta, e é só este número. Vive aqui e desce para o CSS
   como custom property, então o mesmo valor governa a altura do painel (que é
   o que cria o scroll) e o range do ScrollTrigger — não há como os dois
   saírem de sincronia. */
const PBL_SCROLL = "480vh";

/* ── As três faixas de comportamento das cenas ───────────────────────────────
   AMPLO    — largura para o arranjo em duas colunas E altura para a cena caber
              em 100vh. O painel inteiro gruda e uma timeline só percorre tudo.
   ESTREITO — retrato: há altura, mas em coluna única a cena empilhada não cabe
              numa tela (medido: 1047–1152px de conteúdo contra 640–932 de
              viewport). Então quem gruda é só o PALCO, e o texto vem depois em
              fluxo, com gatilho próprio. Trava igual, sem comprimir conteúdo.
   CURTO    — janela baixa demais para segurar 100vh de cena com sentido
              (inclusive desktop redimensionado). Sem trava: cada bloco toca
              uma vez ao entrar em campo.

   ESTAS STRINGS TÊM DE CASAR com os @media de landing.css (procure por
   "faixas de comportamento" lá). JS e CSS decidindo coisas diferentes sobre a
   mesma tela já custou dois bugs nesta seção. */
const MQ_AMPLO =
  "(min-width: 768px) and (min-height: 700px) and (prefers-reduced-motion: no-preference)";
const MQ_ESTREITO =
  "(max-width: 767px) and (min-height: 700px) and (prefers-reduced-motion: no-preference)";
const MQ_CURTO = "(max-height: 699px) and (prefers-reduced-motion: no-preference)";

/* Fração de tela que o palco fica grudado no retrato — hoje só o FALLBACK de
   quem não conseguir ler a margem resolvida (ver gatilhoDaCena).

   Era um número espelhado no `margin-bottom` do .lp-pbl-stage, e espelhar era o
   problema: o CSS dizia `85vh` e esta constante multiplicava `window.innerHeight`.
   No iOS as duas grandezas não são a mesma coisa — o vh conta a área atrás da
   barra de endereço retrátil e o innerHeight não —, então a cena acabava antes
   ou depois de o palco soltar, e o desencontro AINDA mudava conforme a barra
   recolhia. Agora o CSS é a única fonte e o JS lê a margem já em px. */
const LOCK_RETRATO = 0.85;

/** Config do ScrollTrigger conforme a faixa.
    - AMPLO: o painel é o trigger; seu comprimento extra é o range.
    - ESTREITO: o PALCO é o trigger e o range é a margem que o segura.
    - CURTO: toca uma vez ao entrar, sem prender nada. */
function gatilhoDaCena(painel: HTMLElement, palco: HTMLElement, faixa: "amplo" | "estreito" | "curto") {
  if (faixa === "amplo") {
    return { trigger: painel, start: "top top", end: "bottom bottom", scrub: 0.8, invalidateOnRefresh: true };
  }
  if (faixa === "estreito") {
    return {
      trigger: palco,
      start: "top top",
      /* O range É a margem que segura o palco, lida do CSS já resolvida em px.
         Um número só, num lugar só: mexer no `margin-bottom` do .lp-pbl-stage
         move a animação junto, e não há como os dois saírem de sincronia — que
         é exatamente o que acontecia quando este valor era calculado aqui a
         partir de window.innerHeight (ver LOCK_RETRATO). Função, não constante:
         com invalidateOnRefresh o GSAP reavalia a cada refresh, então girar o
         aparelho remede sozinho. */
      end: () => "+=" + (parseFloat(getComputedStyle(palco).marginBottom) || window.innerHeight * LOCK_RETRATO),
      scrub: 0.8,
      invalidateOnRefresh: true,
    };
  }
  return { trigger: palco, start: "top 72%", once: true };
}

/** Gatilho de um bloco que NÃO gruda: a própria SUBIDA dele pela tela é o
    relógio. O range vai de "assomando na borda de baixo" até "assentado na
    parte de cima", e o `scrub` mapeia isso no progresso.

    Era `{ start: "top 78%", once: true }` — dispara e toca sozinho. Num bloco
    que gruda isso funciona, porque a tela fica parada nele; aqui não: o gatilho
    cai quando o bloco mal apareceu por baixo, a timeline corre em ~0,6s e
    quando o texto chega em posição de leitura já acabou tudo. O relatado foi
    "não tem as animações dos textos", e de fato não dava para ver nenhuma.

    Com scrub as linhas caem CONFORME se rola, que é o que o desktop faz — lá
    estas mesmas batidas vivem na timeline scrubbed da cena. */
function gatilhoDeEntrada(alvo: HTMLElement) {
  return { trigger: alvo, start: "top 88%", end: "top 26%", scrub: 0.8 };
}

/** Encadeia UM TWEEN POR ALVO, em vez de usar o `stagger` do GSAP.

    Não é preciosismo: num tween com stagger, o `immediateRender` do from/fromTo
    aplica o estado inicial SÓ ao alvo de deslocamento zero — os demais ficam no
    estado final até que a sub-animação deles comece. Numa timeline com scrub
    isso não é um detalhe, é a cena abrindo pelo fim: dos 12 avatares, só o
    índice 11 (o de offset 0, com `from: "end"`) recebia transform no progress 0;
    os outros onze já nasciam agrupados e a GRADE INICIAL — que é o payload da
    cena — nunca chegava a aparecer. O mesmo valia para as linhas da leitura,
    onde 4 das 5 aparecem antes da hora.

    Com um tween por alvo, cada um tem offset 0 e aplica o próprio estado
    inicial. `from` é função do índice para o valor poder ser recalculado no
    refresh (é o que mantém a migração correta ao redimensionar). */
function pblStagger(
  tl: gsap.core.Timeline,
  targets: HTMLElement[],
  from: (i: number) => gsap.TweenVars,
  to: gsap.TweenVars,
  at: number,
  step: number,
) {
  targets.forEach((t, i) => tl.fromTo(t, from(i), { ...to, immediateRender: true }, at + i * step));
}

/** Painel "Built around PBL": a cena presa na tela, tocada pelo scroll.

    O scroll-lock é o `position: sticky` do CSS, NÃO o `pin` do ScrollTrigger.
    Este painel é filho da sanfona (.lp-capstack), onde cada painel gruda no
    topo e o seguinte sobe cobrindo — e o pin quebraria justamente isso: ele
    envolve o alvo num pin-spacer (que entra como irmão e desalinha a geometria
    de cobertura) e troca o painel para `position: fixed` (que o tira do fluxo
    sticky, matando o ser-coberto). Então o painel só fica ALTO (--pbl-scroll) e
    um filho sticky de 100vh segura a cena; ao GSAP sobra o `scrub`, que é o que
    de fato se queria dele. Sem pin-spacer, sem conflito, e é o mesmo mecanismo
    que a sanfona inteira já usa.

    O repouso (CSS) é o estado FINAL — grupos formados, leitura visível,
    facilitador no lugar, remate à mostra —, como no BootDevice. Os `.from()`
    puxam para trás, para a grade e para o apagado, e animam de volta até esse
    repouso. É o que faz reduced-motion e mobile funcionarem SEM ramo especial:
    lá o timeline nem monta e a cena já nasce pronta. */
function PblPanel({ c }: { c: (typeof CAPS)[number] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    /* gsap.matchMedia cuida do ciclo: monta ao entrar na query, e reverte
       sozinho ao sair dela (redimensionar cruzando o breakpoint, ou o usuário
       ligando reduced-motion no sistema). Fora da query nada monta — e o
       repouso do CSS já é o estado final. */
    const mm = gsap.matchMedia();
    /* Três condições nomeadas: o GSAP entrega `conditions` e remonta a cena
       sozinho ao cruzar um limiar (girar o aparelho, redimensionar a janela).
       A COREOGRAFIA é a mesma nas três — muda quem toca o relógio e o que
       fica preso. */
    mm.add({ amplo: MQ_AMPLO, estreito: MQ_ESTREITO, curto: MQ_CURTO }, (ctx) => {
      const faixa: "amplo" | "estreito" | "curto" =
        ctx.conditions?.amplo ? "amplo" : ctx.conditions?.estreito ? "estreito" : "curto";
      const room = el.querySelector<HTMLElement>(".lp-pbl-room")!;
      // Medido na hora do tween, não fechado aqui: com invalidateOnRefresh o
      // GSAP reavalia estas funções a cada refresh, e o palco já mudou de
      // tamanho quando isso acontece.
      const w = () => room.clientWidth;
      const h = () => room.clientHeight;

      /* Centro do avatar na posição de REPOUSO — a que o CSS dá, seja o arranjo
         horizontal do desktop ou o vertical do mobile. É MEDIDO, e não deduzido
         de PBL_SEATS, porque as duas coisas divergem: o repouso do mobile vem
         de --gx-m/--gy-m (CSS) enquanto PBL_SEATS guarda as frações do desktop.
         Somar um delta de desktop a um repouso de mobile dava um espalhamento
         sem sentido — medido no celular: 11 colunas e 12 linhas distintas onde
         devia haver 4x3, e 3 avatares fora do palco. Medindo, o deslocamento é
         sempre "da célula da grade até onde você de fato está".

         offsetLeft/offsetTop ignoram transform, então a leitura vale igual em
         qualquer ponto da timeline — que é o que o invalidateOnRefresh pede. */
      const centroEmRepouso = (chip: HTMLElement) => ({
        x: chip.offsetLeft + chip.offsetWidth / 2,
        y: chip.offsetTop + chip.offsetHeight / 2,
      });

      /* A cena ABRE como cartão de título: só o título, em corpo de display,
         sobre o palco vazio. Centrar é do CSS (o intro é absoluto sobre o
         stick inteiro), não de medida em JS — foi o que permitiu apagar o
         introX/introY que existiam aqui: eles centravam a COLUNA de texto, que
         não abre mais a cena. */
      const stick = el.querySelector<HTMLElement>(".lp-pbl-stick")!;
      const stage = el.querySelector<HTMLElement>(".lp-pbl-stage")!;
      const txt = el.querySelector<HTMLElement>(".lp-cap-txt")!;
      const intro = el.querySelector<HTMLElement>(".lp-pbl-intro")!;

      const tl = gsap.timeline({
        scrollTrigger: gatilhoDaCena(el, stage, faixa),
        defaults: { ease: "none" },
      });
      /* Sem trava a timeline toca em tempo real, e as durações foram escritas
         para serem consumidas por scroll — cerca de 5 unidades, que a 1x
         viraria uma cena de 5 segundos. Acelerar em bloco preserva as
         proporções entre as batidas. */
      if (faixa === "curto") tl.timeScale(2.1);

      /* A cena NASCE centralizada e depois passa para a esquerda. É translação
         pura, não escala: para ocupar o centro bastaria mover o palco até o
         meio do stick, enquanto ampliá-lo exigiria ~2x de scale — e a essa
         altura os avatares (que são DOM, com borda de 1px e ícone) engordam
         junto, o que denuncia o truque. Traduzido, o palco continua do tamanho
         que terá no fim, e o deslize é o único movimento. */
      const stageDx = () => stick.clientWidth / 2 - (stage.offsetLeft + stage.offsetWidth / 2);
      /* offsetLeft/offsetWidth, e NÃO getBoundingClientRect: estes ignoram
         transform, então a conta dá o mesmo resultado seja qual for o ponto da
         timeline em que o refresh a mandar recalcular. Com rect seria preciso
         descontar o x já aplicado, e errar esse desconto (silenciosamente, num
         invalidate no meio da cena) jogaria o bloco para qualquer lugar. */
      /* O timeline é a fonte da verdade do timing: cada tween entra numa
         posição relativa e o scrub mapeia o scroll para o progress. Não há
         threshold manual em lugar nenhum.

         Quatro batidas: (1) o título grande sozinho, que se dissolve dando
         lugar à roda; (2) a cena, centralizada; (3) a cena passa para a
         esquerda; (4) o texto entra na direita e as habilidades surgem sob
         ele. */
      /* (1) O CARTÃO DE ABERTURA — em amplo e em estreito.
         Era só amplo, e o custo disso não era perder um enfeite: o palco só
         acende quando o gatilho dele cruza o topo, então no telefone o capítulo
         subia cobrindo o anterior com UMA TELA PRETA. O cartão é o que ocupa
         essa travessia, e sem ele havia um buraco (foi o relatado).

         O que impedia era geometria, não coreografia: o cartão é `inset: 0` do
         stick, e no retrato o stick empilha em ~2,5 telas — ele cobriria a
         coluna inteira, texto incluído. Resolvido no CSS (ancorado no topo, uma
         tela de altura, e STICKY como o palco, para os dois continuarem no
         mesmo quadro durante a trava), a mesma coreografia vale nas duas.

         Só o OFFSET muda, porque os dois relógios são diferentes: em amplo a
         timeline cobre a cena inteira e o cartão sai em 0.35; em estreito ela é
         só a trava do palco, que começa com os avatares — o cartão tem de
         dissolver logo na abertura dela.

         O título se dissolve e é POR DENTRO do fade dele que a roda aparece:
         os avatares entram ainda com o título em tela. Sem essa sobreposição
         haveria um vão de tela vazia entre o texto sumir e a sala surgir.
         A escala sobe de leve junto (1 → 1.06): dissolver crescendo lê como
         afastar-se, não como apagar. */
      if (faixa !== "curto") {
        tl.fromTo(intro,
          { autoAlpha: 1, scale: 1 },
          { autoAlpha: 0, scale: 1.06, duration: 0.7, ease: "sine.inOut", immediateRender: true },
          faixa === "amplo" ? 0.35 : 0);
      }

      /* (3) A cena passa para a esquerda, abrindo a direita para o texto.
         Esta segue só em amplo, e por motivo diferente: pressupõe duas colunas.
         Em coluna única o palco já ocupa a largura toda e o deslize seria um
         no-op de qualquer forma. */
      if (faixa === "amplo") {
        tl.fromTo(stage,
          { x: stageDx },
          { x: 0, duration: 0.95, ease: "sine.inOut", immediateRender: true }, 3.3);
      }

      const dots = gsap.utils.toArray<HTMLElement>(".lp-pbl-p", el);
      const linhas = gsap.utils.toArray<HTMLElement>(".lp-pbl-line", el);

      /* A coreografia vive em DUAS funções, e as posições continuam sendo as
         mesmas em qualquer faixa — o `base` só desloca o grupo para a origem
         da timeline que o hospeda. É o que permite montar tudo numa linha só
         (com trava) ou em duas independentes (sem trava) sem duplicar número
         nenhum. */

      /* Batidas do PALCO: a sala enche, migra e se organiza em volta do
         problema. A ordem de entrada é de FORA PARA DENTRO (linha de cima,
         linha de baixo, miolo por último), e não a de leitura: a linha central
         da grade cai atrás do cartão de abertura, que ainda dissolve aqui — na
         ordem natural um chip surgia colado na palavra "Built". */
      const beatsPalco = (t: gsap.core.Timeline, base: number) => {
        const ordemEntrada = [0, 1, 2, 3, 8, 9, 10, 11, 4, 5, 6, 7].map((i) => dots[i]);
        pblStagger(t, ordemEntrada, () => ({ autoAlpha: 0, scale: 0.7 }),
          { autoAlpha: 1, scale: 1, duration: 0.4, ease: "power2.out" }, base + 0.55, 0.045);
        /* Grade → grupos: o payload da cena. x/y (transform), nunca left/top —
           left/top forçam layout a cada quadro e a migração engasgaria. */
        pblStagger(t, dots,
          (i) => ({
            x: () => pblGridAt(i, pblColunas(w())).x * w() - centroEmRepouso(dots[i]).x,
            y: () => pblGridAt(i, pblColunas(w())).y * h() - centroEmRepouso(dots[i]).y,
          }),
          { x: 0, y: 0, duration: 0.95, ease: "power2.inOut" }, base + 1.5, 0.03);
        /* O problema materializa NO MEIO DA MIGRAÇÃO, não antes: a grade é
           uniforme e cobre o palco, então as duas células centrais caem sobre o
           card e ele nasceria por baixo de dois avatares. Aqui ele aparece no
           vão que a debandada abre, com os grupos ainda a caminho. */
        t.from(".lp-pbl-problem", { autoAlpha: 0, scale: 0.86, duration: 0.5, ease: "power2.out" }, base + 2.35)
          /* Facilitador: só DEPOIS dos grupos formados ele se distingue. Até
             aqui viajou junto com os outros — muda o papel, não a chegada. */
          .from(".lp-pbl-fac-ring", { autoAlpha: 0, scale: 0.3, duration: 0.5, ease: "power2.out" }, base + 2.9)
          .from(".lp-pbl-fac-badge", { autoAlpha: 0, y: 8, duration: 0.4 }, base + 3.05)
          .from(".lp-pbl-p-fac", { borderColor: "var(--line-2)", color: "var(--muted)", duration: 0.5 }, base + 2.9);
      };

      /* Batidas do TEXTO: a coluna entra, a leitura das habilidades cai linha a
         linha e o remate fecha. */
      const beatsTexto = (t: gsap.core.Timeline, base: number) => {
        t.fromTo(txt,
          { autoAlpha: 0 },
          { autoAlpha: 1, duration: 0.7, ease: "sine.inOut", immediateRender: true }, base + 3.9)
          .from(".lp-pbl-read-h", { autoAlpha: 0, y: 10, duration: 0.35 }, base + 4.25);
        pblStagger(t, linhas, () => ({ autoAlpha: 0, y: 12 }),
          { autoAlpha: 1, y: 0, duration: 0.4 }, base + 4.4, 0.11);
        t.from(".lp-pbl-tag", { autoAlpha: 0, y: 10, duration: 0.45 }, base + 5.25);
      };

      if (faixa === "amplo") {
        // Uma linha só: o scroll percorre a cena inteira como um filme.
        beatsPalco(tl, 0);
        beatsTexto(tl, 0);
      } else {
        /* Sem trava o painel EMPILHA e fica com ~1,4 tela de altura, então um
           gatilho único no topo dele dispara tudo — inclusive as batidas do
           texto, que estão lá embaixo e acabam de tocar fora da tela. Quem
           rola encontra o texto e as habilidades já parados, e a cena parece
           não ter animado (foi o relatado).

           Cada bloco ganha então o SEU gatilho, disparando quando ele mesmo
           entra em campo. É o "de um em um" ao longo da rolagem — mesma
           coreografia, só que o relógio de cada parte é a chegada dela. */
        beatsPalco(tl, -0.55);
        /* Um respiro no FIM da timeline do palco. Sem ele o facilitador — que
           é a última batida — só termina de se destacar no instante em que a
           trava solta, e a cena escapa por cima antes de dar para ver que ela
           ficou pronta.

           A causa é estrutural, não de ajuste: aqui as batidas do TEXTO moram
           noutra timeline (a coluna vem depois em fluxo, com gatilho próprio),
           então a do palco acaba em ~2.9 e o facilitador cai em 100% dela. No
           desktop a mesma batida cai em ~60%, porque lá a timeline continua com
           o texto. Este tween sem alvo só ocupa tempo — com scrub, ocupar tempo
           é ocupar rolagem —, e empurra o facilitador para ~78% do percurso.
           Sobra uma pausa com a cena montada antes de ela sair. */
        tl.to({}, { duration: 0.8 });
        const tlTexto = gsap.timeline({
          scrollTrigger: gatilhoDeEntrada(txt),
          defaults: { ease: "none" },
        });
        /* Sem timeScale: com scrub quem dita o ritmo é o range do gatilho, não
           o relógio. O 2.1 que estava aqui era para encurtar uma reprodução em
           tempo real, e agora não há nenhuma. */
        beatsTexto(tlTexto, -3.9);
      }

      /* Toda a cena é medida (centro do cartão de abertura, destino de cada
         avatar), e medida cedo é medida errada. Um ResizeObserver reage ao que
         de fato importa — "a caixa mudou de tamanho" — sem precisar advinhar
         POR QUE mudou.

         `document.fonts.ready` não resolve isto sozinho: a Figtree entra por
         @import DENTRO do landing.css, então no instante em que a promessa é
         criada a folha nem foi buscada e não há fonte pendente para esperar —
         ela resolve "pronto" ainda com a métrica de fallback, e nem um duplo
         rAF depois disso ajuda. Medido: 37px fora do centro por esse caminho,
         0px quando o refresh vem depois (um resize já corrigia).

         Observa os dois que governam a geometria: a coluna de texto (largura em
         `ch`, que muda com a fonte) e o palco (que muda com a viewport). */
      let ultimo = "";
      let raf = 0;
      const ro = new ResizeObserver((entradas) => {
        const agora = entradas.map((e) => Math.round(e.contentRect.width) + "x" + Math.round(e.contentRect.height)).join("|");
        if (agora === ultimo) return;   // sem mudança real: nada de refresh em laço
        ultimo = agora;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => ScrollTrigger.refresh());
      });
      ro.observe(txt);
      ro.observe(room);

      return () => { ro.disconnect(); cancelAnimationFrame(raf); };
    });

    // O remedir depois do layout assentar é do ResizeObserver, montado junto
    // com o timeline (e revertido junto) — ver dentro do matchMedia acima.
    return () => mm.revert();
  }, []);

  return (
    <div className="lp-capstack-panel lp-pbl-panel" ref={ref} style={{ ["--pbl-scroll" as string]: PBL_SCROLL }}>
      <div className="lp-pbl-stick">
        {/* Cartão de abertura: só o título, em corpo de display, sobreposto ao
            palco vazio. É elemento PRÓPRIO, e não o h3 da coluna crescido: o
            h3 tem de acabar pequeno na direita, e levar um mesmo nó de 5rem
            até 1.75rem pediria um tween de escala que borra a fonte no meio do
            caminho. Dois elementos, cada um no seu corpo, um esmaece e o outro
            entra — sem escala nenhuma no texto.

            aria-hidden porque é repetição visual: quem carrega o título para o
            leitor de tela é o h3 de verdade, logo abaixo. */}
        <div className="lp-pbl-intro" aria-hidden="true">
          {/* O título vai num filho ÚNICO, não solto no container. O container
              centra por grid, e grid trata cada nó de texto e cada span como
              item próprio: solto, "Built around" e "PBL" viravam dois itens em
              linhas separadas, centrados cada um na sua — o título abria
              rachado no meio da tela. Com um filho só, o span volta a ser
              inline dentro do parágrafo. */}
          <p className="lp-pbl-intro-t">
            {c.t.slice(0, c.t.lastIndexOf(" "))}{" "}
            {/* Destaque na última palavra do título — "PBL". Sai de c.t em vez
                de ser escrito à mão para não descolar se o título mudar. */}
            <span className="lp-pbl-intro-hl">{c.t.slice(c.t.lastIndexOf(" ") + 1)}</span>
          </p>
        </div>

        {/* A cena é diagrama: o sentido dela está no texto ao lado. Anunciar
            avatar por avatar no leitor de tela só produziria ruído. */}
        <div className="lp-pbl-stage" aria-hidden="true">
          <div className="lp-pbl-room">
            {/* O problema, no centro — é em volta dele que os grupos se formam. */}
            <div className="lp-pbl-problem">
              <p className="lp-pbl-problem-k">The problem</p>
              <p className="lp-pbl-problem-t">{PBL_PROBLEM}</p>
            </div>

            {/* Repouso = já agrupado. Quem devolve à grade é o .from().
                O miolo é SLOT: trocar o <i> por um <img> veste o avatar com a
                foto da pessoa sem tocar em posição, tamanho ou animação. */}
            {PBL_SEATS.map((s, i) => (
              /* A posição vai em CUSTOM PROPERTIES, não em left/top prontos: o
                 CSS monta o calc, e assim o mobile — onde três grupos ladeando
                 o card não cabem numa coluna de celular — pode reposicionar os
                 grupos por breakpoint sem duplicar estes números aqui. O JS
                 segue sendo a fonte do desktop, que é onde a cena roda. */
              <span
                key={i}
                className={`lp-pbl-p${s.fac ? " lp-pbl-p-fac" : ""}`}
                data-c={s.fac ? "f" : PBL_MEMBERS.findIndex((g) => g.includes(i))}
                style={{
                  ["--gx" as string]: `${s.to.x}`,
                  ["--gy" as string]: `${s.to.y}`,
                  ["--ox" as string]: `${s.off[0]}`,
                  ["--oy" as string]: `${s.off[1]}`,
                }}
              >
                {/* A pessoa é o NOME. O slot de foto continua existindo, mas
                    agora é opt-in: sem <img> não há círculo nenhum, e com um
                    <img> a regra de :has liga a miniatura ao lado do nome. */}
                <span className="lp-pbl-nome">{PBL_NAMES[i]}</span>
                {s.fac && <span className="lp-pbl-fac-ring" />}
                {s.fac && <span className="lp-pbl-fac-badge">facilitator</span>}
              </span>
            ))}
          </div>
        </div>

        <div className="lp-cap-txt" data-reveal>
          <h3>{c.t}</h3>
          <p className="lp-muted">{c.d}</p>

          <div className="lp-pbl-read">
            <p className="lp-pbl-read-h">Skills read-back</p>
            {PBL_READ.map(([skill, note]) => (
              <p className="lp-pbl-line" key={skill}>
                <span className="lp-pbl-skill">{skill}</span> {note}
              </p>
            ))}
          </div>

          <p className="lp-pbl-tag">{c.tag}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Cena de marca ("Your brand, end to end") ────────────────────────────────
   A tese da seção é que a ESTRUTURA da sala é constante e só a identidade
   muda. A cena prova isso do jeito mais direto possível: existe UMA sala no
   DOM, e a troca de marca não toca em layout nenhum — muda `--accent`, o
   glifo do logo e o nome. Se algum tile se mexesse durante o ciclo, a seção
   estaria mentindo, então não há nada de posicional na timeline.

   É a MESMA sala do capítulo anterior: os quatro participantes são os quatro
   primeiros nomes de PBL_NAMES. Lá ela se forma pelo método, aqui ela se veste
   de marca — e reusar os nomes é o que torna isso literal em vez de retórico. */
const SKIN_BRANDS: { name: string; color: string; glyph: string }[] = [
  { name: "Northwind Learning", color: "#4f8cff", glyph: "fa-graduation-cap" },
  { name: "Vitalis Health", color: "#2fbf8f", glyph: "fa-heart-pulse" },
  { name: "Arc Studio", color: "#f0883e", glyph: "fa-compass-drafting" },
];

/* Comprimento de scroll da cena — knob principal de velocidade, como no PBL.
   Desce ao CSS como custom property, então governa de uma vez a altura do
   painel (que cria o scroll) e o range do trigger. */
const SKIN_SCROLL = "300vh";

/* Os quatro da sala: os mesmos nomes do capítulo de PBL — é o que faz "a mesma
   sala" ser literal e não retórica —, agora com rosto. Retratos gerados por IA
   (procedência em public/people/FONTES.md): ninguém real está retratado, que é
   o que torna aceitável pôr rosto numa página comercial. */
const SKIN_SEATS = [
  { name: PBL_NAMES[0], photo: "/people/ana.webp" },
  { name: PBL_NAMES[1], photo: "/people/marcus.webp" },
  { name: PBL_NAMES[2], photo: "/people/priya.webp" },
  { name: PBL_NAMES[3], photo: "/people/diego.webp" },
];
/* Tempo de PARADA em cada marca e de TRAVESSIA entre duas, em unidades da
   timeline. A parada é o que deixa ler o nome e o hex; a travessia é onde a
   cor interpola. */
const SKIN_HOLD = 0.85;
const SKIN_CROSS = 1;
/* Meia-janela do mergulho de opacidade do nome/logo, em fração da travessia.
   Fora dela o texto está cheio; no meio exato ele zera — é aí que a troca
   acontece, invisível. Pequeno de propósito: um mergulho longo borraria a
   leitura, que é justamente o que não se quer em nome e logo. */
const SKIN_DIP = 0.16;

/** Interpola dois hex e devolve HEX. Não uso gsap.utils.interpolate aqui de
    propósito: ele devolve `rgb(...)`, e o painel de config precisa mostrar o
    hex ao vivo. Com uma função só, a cor aplicada na sala e o número escrito
    no campo são literalmente o mesmo valor — se divergissem, o "configured
    through the same API" viraria enfeite. */
function skinLerp(a: string, b: string, t: number) {
  const A = parseInt(a.slice(1), 16);
  const B = parseInt(b.slice(1), 16);
  const mix = (s: number) => {
    const ca = (A >> s) & 255;
    return Math.round(ca + (((B >> s) & 255) - ca) * t);
  };
  return "#" + ((1 << 24) | (mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).slice(1);
}

/** Painel "Your brand, end to end": a sala se veste de cada marca conforme o
    scroll, dirigida pelo painel de config à esquerda.

    Como no painel de PBL, o scroll-lock é o `position: sticky` do CSS e não o
    `pin` do ScrollTrigger — este painel também é filho da sanfona, onde o
    pin-spacer desalinharia a cobertura entre irmãos e o `position: fixed`
    tiraria o painel do fluxo sticky. Ao GSAP cabe o `scrub`.

    O repouso (CSS + DOM) é a PRIMEIRA marca já aplicada: sem JS — reduced
    motion, mobile, ou o chunk falhando — a sala aparece vestida e legível, em
    vez de crua. */
function SkinPanel({ c }: { c: (typeof CAPS)[number] }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const mm = gsap.matchMedia();
    // Mesmas faixas do painel de PBL — ver MQ_AMPLO / MQ_ESTREITO / MQ_CURTO.
    mm.add({ amplo: MQ_AMPLO, estreito: MQ_ESTREITO, curto: MQ_CURTO }, (ctx) => {
      const trava = !!(ctx.conditions?.amplo || ctx.conditions?.estreito);
      const cena = el.querySelector<HTMLElement>(".lp-skin-scene")!;
      const hex = el.querySelector<HTMLElement>("[data-skin-hex]")!;
      /* LISTAS, não querySelector: o glifo e o nome aparecem DUAS vezes cada —
         no painel de config e no header da sala —, e é justamente essa
         duplicação que encena "a config dirige a sala". Com querySelector só o
         primeiro trocava, e a sala ficava com o logo da marca anterior
         enquanto o config já mostrava a nova. */
      const glifos = gsap.utils.toArray<HTMLElement>("[data-skin-glyph]", el);
      const nomes = gsap.utils.toArray<HTMLElement>("[data-skin-name]", el);
      const n = SKIN_BRANDS.length;

      /* Função pura do progresso: recebe a posição no ciclo (0..n-1) e escreve
         o estado. Todo o re-skin passa por aqui, e ela não toca em nada de
         layout — só cor, texto e glifo. */
      const pintar = (p: number) => {
        const i = Math.min(n - 2, Math.max(0, Math.floor(p)));
        const t = Math.min(1, Math.max(0, p - i));
        const a = SKIN_BRANDS[i];
        const b = SKIN_BRANDS[i + 1];

        // A COR é contínua: interpola a cada quadro, sem degrau.
        const cor = skinLerp(a.color, b.color, t);
        cena.style.setProperty("--accent", cor);
        hex.textContent = cor.toUpperCase();

        /* NOME e LOGO não interpolam — texto meio-termo não existe e glifo em
           morph vira borrão. Eles mergulham até zero no meio da travessia,
           trocam de valor ali (invisíveis) e voltam. */
        const dip = Math.min(1, Math.abs(t - 0.5) / SKIN_DIP);
        const atual = t < 0.5 ? a : b;
        glifos.forEach((e) => {
          e.className = `fa-solid ${atual.glyph}`;
          e.style.opacity = String(dip);
        });
        nomes.forEach((e) => {
          e.textContent = atual.name;
          e.style.opacity = String(dip);
        });
      };

      const proxy = { p: 0 };
      const tl = gsap.timeline({
        /* Esta cena CABE numa tela mesmo empilhada (medido: 785px contra 844
           de viewport), então no retrato ela pode grudar inteira, como no
           desktop — não precisa do desmembramento do painel de PBL. Sem trava,
           o gatilho é a CENA, senão o ciclo de marcas tocaria com ela ainda
           fora de tela. */
        scrollTrigger: trava
          ? { trigger: el, start: "top top", end: "bottom bottom", scrub: 0.8, invalidateOnRefresh: true }
          : gatilhoDeEntrada(cena),
        defaults: { ease: "none" },
        onUpdate: () => pintar(proxy.p),
      });
      /* Sem trava o ciclo de marcas toca sozinho. Mais devagar que a cena de
         PBL (1.5 contra 2.1) porque aqui cada parada existe para DAR TEMPO DE
         LER o nome e o hex — acelerar demais transforma a prova da seção num
         piscar de cores. */
      if (!trava) tl.timeScale(1.5);

      /* O ciclo: segura a marca, atravessa para a próxima, segura de novo. As
         paradas são tweens sem alvo de valor (p já está lá) — existem só para
         ocupar tempo de timeline, que com scrub é ocupar scroll. */
      tl.to(proxy, { p: 0, duration: SKIN_HOLD });
      for (let i = 1; i < n; i++) {
        tl.to(proxy, { p: i, duration: SKIN_CROSS, ease: "power1.inOut" })
          .to(proxy, { p: i, duration: SKIN_HOLD });
      }

      pintar(0);

      /* Medida tardia, mesma razão do painel de PBL: `fonts.ready` não serve
         porque a Figtree entra por @import e resolve antes da folha ser
         buscada. O observador reage ao que importa — a caixa mudou. */
      let ultimo = "";
      let raf = 0;
      const ro = new ResizeObserver((es) => {
        const agora = es.map((e) => Math.round(e.contentRect.width)).join("|");
        if (agora === ultimo) return;
        ultimo = agora;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => ScrollTrigger.refresh());
      });
      ro.observe(cena);

      return () => {
        ro.disconnect();
        cancelAnimationFrame(raf);
        /* O revert do GSAP desfaz tweens, não as escritas manuais de
           textContent/className/style que o pintar() faz. Sem devolver a
           primeira marca aqui, sair da query (redimensionar para mobile,
           ligar reduced-motion) deixaria a sala congelada no meio de uma
           travessia, com nome de uma marca e cor de outra. */
        cena.style.removeProperty("--accent");
        glifos.forEach((e) => {
          e.className = `fa-solid ${SKIN_BRANDS[0].glyph}`;
          e.style.opacity = "";
        });
        hex.textContent = SKIN_BRANDS[0].color.toUpperCase();
        nomes.forEach((e) => {
          e.textContent = SKIN_BRANDS[0].name;
          e.style.opacity = "";
        });
      };
    });

    return () => mm.revert();
  }, []);

  const marca = SKIN_BRANDS[0];

  return (
    <div className="lp-capstack-panel lp-skin-panel" ref={ref} style={{ ["--skin-scroll" as string]: SKIN_SCROLL }}>
      <div className="lp-skin-stick">
        <div className="lp-cap-txt" data-reveal>
          <h3>{c.t}</h3>
          <p className="lp-muted">{c.d}</p>
        </div>

        {/* A cena é demonstração visual: o que ela diz está no resumo abaixo,
            em texto. Ler campo a campo de um mock de config no leitor de tela
            seria ruído, não informação. */}
        <div className="lp-skin-scene" aria-hidden="true">
          {/* Esquerda: a config que dirige o re-skin. */}
          <div className="lp-skin-cfg">
            <p className="lp-skin-cfg-h">
              <span className="lp-t-verb">PATCH</span> /v1/tenants/:id/branding
            </p>
            <div className="lp-skin-row">
              <span className="lp-skin-k">logo</span>
              <span className="lp-skin-v">
                {/* SLOT: trocar o <i> por <img>/<svg> veste o logo real da
                    marca sem tocar em posição, tamanho ou timeline. */}
                <span className="lp-skin-logo">
                  <i className={`fa-solid ${marca.glyph}`} data-skin-glyph />
                </span>
              </span>
            </div>
            <div className="lp-skin-row">
              <span className="lp-skin-k">brand_color</span>
              <span className="lp-skin-v">
                <span className="lp-skin-sw" />
                <span className="lp-skin-hex" data-skin-hex>{marca.color.toUpperCase()}</span>
              </span>
            </div>
            <div className="lp-skin-row">
              <span className="lp-skin-k">product_name</span>
              <span className="lp-skin-v lp-skin-str">"<span data-skin-name>{marca.name}</span>"</span>
            </div>
          </div>

          {/* Direita: a sala. Nada aqui muda de posição durante o ciclo. */}
          <div className="lp-skin-room">
            <div className="lp-skin-top">
              <span className="lp-skin-logo lp-skin-logo--room">
                <i className={`fa-solid ${marca.glyph}`} data-skin-glyph />
              </span>
              <span className="lp-skin-brandname" data-skin-name>{marca.name}</span>
              <span className="lp-skin-live"><span className="lp-skin-dot" />live</span>
            </div>

            <div className="lp-skin-grid">
              {SKIN_SEATS.map((s, i) => (
                <div className="lp-skin-tile" key={s.name} data-speaking={i === 0 || undefined}>
                  {/* alt vazio: a cena inteira é aria-hidden e o que ela
                      demonstra está no resumo em texto. Descrever quatro
                      rostos de figurante só encheria o leitor de tela. */}
                  <img src={s.photo} alt="" loading="lazy" decoding="async" />
                  <span className="lp-skin-tile-n">{s.name}</span>
                </div>
              ))}
            </div>

            <div className="lp-skin-bar">
              <span className="lp-skin-btn lp-skin-btn--on"><i className="fa-solid fa-microphone" /></span>
              <span className="lp-skin-btn"><i className="fa-solid fa-video" /></span>
              <span className="lp-skin-btn"><i className="fa-solid fa-arrow-up-from-bracket" /></span>
              <span className="lp-skin-btn lp-skin-btn--cta"><i className="fa-solid fa-hand" />Raise hand</span>
              {/* Vermelho de PERIGO, não da marca: sai de --accent-deep, que o
                  escopo da cena não sobrescreve. Se seguisse --accent, "sair"
                  mudaria de significado a cada marca. */}
              <span className="lp-skin-btn lp-skin-btn--leave"><i className="fa-solid fa-phone-slash" /></span>
            </div>
          </div>
        </div>

        {/* Legenda e remate andam juntos: são um bloco de fecho, não dois
            parágrafos soltos. Separados pelo gap do stick, eles se espalhavam
            e o conjunto tomava a altura toda. */}
        <div className="lp-skin-foot">
          <p className="lp-skin-note">
            Same layout, same controls, same participants — only the logo, the color, and the name change.
          </p>
          <p className="lp-pbl-tag">{c.tag}</p>
        </div>

        {/* O que a cena demonstra, para quem não a vê. */}
        <p className="lp-sr-only">
          The same room layout is shown re-skinned for {SKIN_BRANDS.map((b) => b.name).join(", ")} —
          example configurations. Only the logo, brand color, and product name change between them;
          the header, the participant grid, and the controls stay identical.
        </p>
      </div>
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
    recuo ao scroll com leve inércia (a suavidade pedida).

    Roda TAMBÉM no telefone desde que a sanfona voltou a empilhar lá (ver
    .lp-capstack-panel em landing.css). O que muda é a amplitude, e por medida:
    numa tela de 390px o 0.93/0.35 do desktop afunda a página cedo demais — o
    parágrafo que ainda está sendo lido já apagou antes de sair de vista, porque
    a mesma fração de scroll cobre proporcionalmente muito mais tela. Menos
    escala e menos fade entregam a mesma profundidade sem custar leitura.
    prefers-reduced-motion segue não montando nada. */
function CapStack({ items, children }: { items: (typeof CAPS)[number][]; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    /* matchMedia em vez do par de matchMedia() cru que estava aqui: com duas
       faixas o GSAP remonta sozinho ao cruzar o limiar (girar o aparelho,
       redimensionar), e reverte sozinho se o usuário ligar reduced-motion no
       sistema. É o mesmo ciclo que os painéis de cena já usam. */
    const mm = gsap.matchMedia();
    mm.add(
      {
        amplo: "(min-width: 1001px) and (prefers-reduced-motion: no-preference)",
        toque: "(max-width: 1000px) and (prefers-reduced-motion: no-preference)",
      },
      (ctx) => {
        const grande = !!ctx.conditions?.amplo;
        const panels = gsap.utils.toArray<HTMLElement>(".lp-capstack-panel", el);
        panels.forEach((panel, i) => {
          if (i === panels.length - 1) return; // o último não é coberto
          // O painel de baixo recua enquanto o de cima cobre. `.lp-cap` nos caps,
          // `.lp-panel-in` no painel extra (steps), `.lp-pbl-stick`/`.lp-skin-stick`
          // nos de cena — o alvo comum é o conteúdo, e nas cenas ele é o filho
          // sticky que segura o quadro.
          const alvo = panel.querySelector<HTMLElement>(".lp-cap, .lp-panel-in, .lp-pbl-stick, .lp-skin-stick");
          if (!alvo) return;
          /* Só recua painel que de fato GRUDA. No retrato o de PBL empilha em
             fluxo — a cena não cabe numa tela, então quem gruda é só o palco e
             o stick mede ~2,3 telas. Escalar um bloco desses encolheria o texto
             que a pessoa está lendo em vez de afundar uma página que já saiu.
             E um painel que não gruda também não é COBERTO: não há transição
             para polir.

             Perguntar ao computed style, e não medir altura: a posição é
             decidida pela cascata, que já está aplicada quando o efeito roda,
             enquanto uma medida de altura depende de layout e fonte terem
             assentado — e um `.lp-pbl-stick` medido antes do CSS aplicar daria
             "alto demais" e mataria o recuo TAMBÉM no desktop, em silêncio.
             É também a leitura exata: a exceção que solta esses painéis mora em
             landing.css (procure por "painel de cena que EMPILHA"), e esta
             linha lê a decisão de lá em vez de repeti-la em breakpoints. */
          if (getComputedStyle(panel).position !== "sticky") return;
          gsap.to(alvo, {
            scale: grande ? 0.93 : 0.97,
            opacity: grande ? 0.35 : 0.55,
            ease: "none",
            scrollTrigger: {
              trigger: panels[i + 1], // o painel que sobe cobrindo
              start: "top bottom",    // começa a entrar por baixo
              end: "top top",         // cobre por completo
              scrub: 1,
            },
          });
        });
      },
    );
    return () => mm.revert();
  }, []);
  return (
    <div className="lp-capstack" ref={ref}>
      {/* O painel de PBL traz o próprio corpo (cena presa na tela) em vez do
          CapContent, mas segue sendo um .lp-capstack-panel irmão — é o que
          mantém a alternância de brilho por nth-child e o ser-coberto. */}
      {items.map((c, i) => (
        c.anim === "pbl" ? <PblPanel c={c} key={c.t} />
          : c.anim === "skin" ? <SkinPanel c={c} key={c.t} />
          : (
            <div className="lp-capstack-panel" key={c.t}>
              <CapContent c={c} flip={i % 2 === 1} />
            </div>
          )
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
              {/* Mesmo campo de riscos do rodapé. Densidade abaixo do padrão:
                  aqui ele fica ATRÁS de texto corrido, e na densidade cheia os
                  riscos competem com a leitura em vez de dar profundidade. */}
              <Field variant="stars" density={0.55} className="lp-steps-field" />
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
