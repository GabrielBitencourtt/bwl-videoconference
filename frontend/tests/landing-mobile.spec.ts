/* Grades de proteção do mobile da landing.
 *
 * Cada asserção aqui existe porque a coisa JÁ ESTEVE quebrada — não são
 * invariantes inventadas. O que este arquivo protege, em ordem de quanto doeu:
 *
 *   · o `.lp` tem `overflow-x: clip`, então estouro lateral NÃO vira barra de
 *     rolagem: some em silêncio. Sem um teste, a única forma de descobrir é
 *     alguém abrir num aparelho. Já aconteceu (o CTA da nav sumindo em 360).
 *   · a sanfona depende de quem gruda e quem não gruda, e a regra vive espalhada
 *     por quatro media queries. Um `position` errado não quebra nada
 *     visualmente óbvio: só prende conteúdo fora da tela, lá embaixo.
 *   · a cena de marca cabia por poucos pixels em 360x800.
 *   · as regras de toque moram em `(hover: none)`. O teste do desktop existe
 *     para provar que elas NÃO vazam para lá.
 */
import { test, expect, devices } from "@playwright/test";

const RETRATOS = [
  { nome: "360x800", width: 360, height: 800 },
  { nome: "390x844", width: 390, height: 844 },
  { nome: "412x915", width: 412, height: 915 },
];

/** Espera o layout assentar: fontes carregadas (a Figtree entra por @import
    dentro do CSS, e a métrica de fallback muda a altura de tudo) e um respiro
    para o ScrollTrigger fazer o refresh dele. */
async function assentar(page: import("@playwright/test").Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
}

/** Leva a cena de PBL até o REPOUSO — grupos formados, facilitador destacado.
    Sem isto os avatares estão na grade inicial de webinar, que é o estado
    `from()` da timeline, e qualquer asserção sobre a composição mede o lugar
    errado. O destino sai da margem que segura o palco (a mesma que o JS lê
    para montar o range), com 88% para parar dentro da trava e não depois dela. */
async function cenaEmRepouso(page: import("@playwright/test").Page) {
  const alvo = await page.evaluate(() => {
    const palco = document.querySelector(".lp-pbl-stage")!;
    const topo = palco.getBoundingClientRect().top + window.scrollY;
    const margem = parseFloat(getComputedStyle(palco).marginBottom) || 0;
    return topo + (margem ? margem * 0.88 : window.innerHeight * 1.6);
  });
  await page.evaluate((y) => window.scrollTo(0, y), alvo);
  // A cena é scrubbed pelo scroll, mas o scrub tem inércia (0.8) e sem trava
  // ela toca em tempo real — os dois casos precisam do mesmo respiro.
  await page.waitForTimeout(2200);
}

for (const vp of RETRATOS) {
  test.describe(`retrato ${vp.nome}`, () => {
    test.use({
      viewport: { width: vp.width, height: vp.height },
      isMobile: true,
      hasTouch: true,
      userAgent: devices["iPhone 13"].userAgent,
    });

    test("não há estouro lateral", async ({ page }) => {
      await assentar(page);
      const { scrollW, clientW } = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      expect(scrollW).toBe(clientW);
    });

    test("a sanfona gruda, e o painel de cena que empilha não", async ({ page }) => {
      await assentar(page);
      const paineis = await page.evaluate(() =>
        [...document.querySelectorAll(".lp-capstack-panel")].map((p) => ({
          pbl: p.classList.contains("lp-pbl-panel"),
          pos: getComputedStyle(p).position,
        })),
      );
      expect(paineis.length).toBeGreaterThan(2);
      for (const p of paineis) {
        // O de PBL empilha em fluxo no retrato (a cena não cabe numa tela, quem
        // gruda é só o palco). Grudá-lo prenderia o texto que vem depois dele.
        expect(p.pos, p.pbl ? "painel de PBL" : "painel comum").toBe(p.pbl ? "static" : "sticky");
      }
    });

    /* A regra que o desktop cumpre de graça, porque lá TODO painel gruda: atrás
       da borda transparente de um painel está sempre o painel imediatamente
       anterior. Onde a pilha se mistura (uns grudam, outros rolam), um painel
       preso lá atrás vira fundo permanente e aparece pela emenda — foi assim
       que a arte do capítulo de LMS sangrou atrás da cena de marca, dois
       capítulos depois. Aqui a invariante vira asserção: painel que vem depois
       de um painel que ROLA não pode ter topo transparente. */
    test("nenhuma emenda abre janela para painel que não é o anterior", async ({ page }) => {
      await assentar(page);
      const ps = await page.evaluate(() =>
        [...document.querySelectorAll(".lp-capstack-panel")].map((p) => ({
          nome: p.className.replace(/lp-capstack-panel\s*/, "").trim() || "cap1",
          gruda: getComputedStyle(p).position === "sticky",
          mascara: getComputedStyle(p).maskImage !== "none",
        })),
      );
      for (let i = 1; i < ps.length; i++) {
        if (!ps[i - 1].gruda && ps[i].mascara) {
          throw new Error(
            `${ps[i].nome} tem topo transparente mas vem depois de ${ps[i - 1].nome}, que rola — ` +
            "a emenda vai revelar um painel mais antigo, ainda preso no topo.",
          );
        }
      }
    });

    /* O lock do palco de PBL é a `margin-bottom` dele: o JS lê ela já resolvida
       para montar o range (ver gatilhoDaCena). Mas um sticky não gruda o quanto
       a margem pedir — ele para quando sua caixa de margem alcança o fim do
       bloco que o contém. A PISTA aqui é o que vem depois do palco dentro do
       stick (vão do grid + coluna de texto), um valor em px que ENCOLHE quando
       a tela alarga, enquanto uma margem em svh cresce.

       Pedir mais do que a pista tem custou dois sintomas relatados: espaço morto
       entre a cena e o texto (300px medidos), e — pior — o trecho final da
       animação tocando com o palco já saindo, porque o JS mapeia a timeline
       sobre a margem inteira. */
    test("o lock do palco de PBL cabe na pista do sticky", async ({ page }) => {
      await assentar(page);
      const r = await page.evaluate(() => {
        const stick = document.querySelector(".lp-pbl-stick")!;
        const palco = document.querySelector(".lp-pbl-stage")!;
        const txt = stick.querySelector(".lp-cap-txt")!;
        return {
          margem: parseFloat(getComputedStyle(palco).marginBottom),
          pista: (parseFloat(getComputedStyle(stick).rowGap) || 0)
            + txt.getBoundingClientRect().height,
        };
      });
      expect(r.margem, "sem margem não há lock: a cena acabaria ao começar").toBeGreaterThan(200);
      expect(r.margem, "o lock pede mais rolagem do que o sticky consegue segurar").toBeLessThanOrEqual(r.pista);
    });

    test("a cena de marca cabe na tela com a barra do navegador à mostra", async ({ page }) => {
      await assentar(page);
      const alt = await page.evaluate(() => {
        const s = document.querySelector(".lp-skin-stick")!;
        let top = Infinity, bot = -Infinity;
        for (const c of Array.from(s.children)) {
          const b = c.getBoundingClientRect();
          if (!b.height || getComputedStyle(c).position === "absolute") continue;
          top = Math.min(top, b.top); bot = Math.max(bot, b.bottom);
        }
        return bot - top;
      });
      /* O stick tem 100svh, e o headless não modela barra retrátil: aqui svh ==
         altura da janela. O orçamento desconta à mão o que um Safari real tira
         (~90px). Uso 60 e não 90 para o teste não virar moeda ao vento — 360x800
         é o caso apertado e passa por ~36px. Se este teste falhar, o aparelho
         real já estava cortando conteúdo. */
      expect(alt).toBeLessThanOrEqual(vp.height - 60);
    });

    test("alvos de toque têm 44px", async ({ page }) => {
      await assentar(page);
      const pequenos = await page.evaluate(() =>
        [...document.querySelectorAll(".lp-nav a, .lp-foot-col a, .lp-foot-legal a, .lp-hero-cta a")]
          .map((e) => ({ t: (e.textContent || "").trim().slice(0, 24), h: e.getBoundingClientRect().height }))
          .filter((a) => a.h > 0 && a.h < 44),
      );
      expect(pequenos).toEqual([]);
    });

    /* A cena de PBL segue a composição do desktop: facilitador em cima, dois
       grupos LADEANDO o card, um embaixo. O que a torna frágil é a largura: a
       pílula, o jitter e o card dividem a mesma linha, e a folga entre eles sai
       de uma conta (ver `min(70% - 98px, 230px)` em landing.css). Mexer em
       qualquer um dos três sem refazer a conta faz chip encostar no card — e em
       360px isso já aconteceu, por 1px. */
    test("os grupos ladeiam o card sem encostar nele", async ({ page }) => {
      await assentar(page);
      await cenaEmRepouso(page);
      const r = await page.evaluate(() => {
        const R = document.querySelector(".lp-pbl-room")!.getBoundingClientRect();
        const cx = R.left + R.width / 2;
        const cartao = document.querySelector(".lp-pbl-problem")!.getBoundingClientRect();
        const bx = (e: Element) => e.getBoundingClientRect();
        const chips = [...document.querySelectorAll(".lp-pbl-p")].map(bx);
        const badge = document.querySelector(".lp-pbl-fac-badge");
        const alvos = badge ? chips.concat([bx(badge)]) : chips;
        // Só os chips na mesma faixa de ALTURA do card ladeiam de fato.
        const faixa = chips.filter((c) => c.bottom > cartao.top && c.top < cartao.bottom);
        const esq = faixa.filter((c) => c.right <= cartao.left);
        const dir = faixa.filter((c) => c.left >= cartao.right);
        return {
          // "ladear" é verificável: há chip inteiramente à esquerda e à direita
          // do card, na mesma faixa de altura dele.
          esquerda: esq.length > 0,
          direita: dir.length > 0,
          // A folga sai da conta em `min(70% - 110px, 230px)`. Com 8px o grupo
          // lia como COLADO no card (relatado); 14 é o valor atual. Mexer na
          // pílula, no jitter ou na constante sem refazer a conta reaperta isto.
          folga: Math.min(
            ...esq.map((c) => cartao.left - c.right),
            ...dir.map((c) => c.left - cartao.right),
          ),
          sobreCartao: alvos.filter((c) =>
            c.left < cartao.right && c.right > cartao.left && c.top < cartao.bottom && c.bottom > cartao.top).length,
          foraDoPalco: alvos.filter((c) => c.left < R.left - 1 || c.right > R.right + 1).length,
          cardCentrado: Math.abs((cartao.left + cartao.right) / 2 - cx) < 2,
        };
      });
      expect(r.esquerda, "nenhum chip ladeia o card pela esquerda").toBe(true);
      expect(r.direita, "nenhum chip ladeia o card pela direita").toBe(true);
      expect(r.folga, "grupo colado no card").toBeGreaterThanOrEqual(12);
      expect(r.sobreCartao, "chip por cima do card").toBe(0);
      expect(r.foraDoPalco, "chip fora do palco").toBe(0);
      expect(r.cardCentrado).toBe(true);
    });

    /* Reticência não avisa: ela simplesmente aparece, e o nome vira "Marcus …".
       Aconteceu ao encolher a pílula para o arranjo ladeado. É o NOME MAIS
       LONGO de PBL_NAMES que dita o piso da largura. */
    test("nenhum nome da cena é truncado", async ({ page }) => {
      await assentar(page);
      const cortados = await page.evaluate(() =>
        [...document.querySelectorAll(".lp-pbl-nome")]
          .filter((e) => e.scrollWidth > e.clientWidth + 1)
          .map((e) => e.textContent),
      );
      expect(cortados).toEqual([]);
    });

    test("o card de código é legível", async ({ page }) => {
      await assentar(page);
      const fs = await page.evaluate(() =>
        parseFloat(getComputedStyle(document.querySelector(".lp-code")!).fontSize),
      );
      // Era 9.6px: o piso do clamp batia antes do cqw. É o `curl` real que a
      // seção existe para provar — código que não se lê não prova nada.
      expect(fs).toBeGreaterThanOrEqual(11);
    });

    test("o wordmark do rodapé não é cortado", async ({ page }) => {
      await assentar(page);
      const { scroll, client } = await page.evaluate(() => {
        const e = document.querySelector(".lp-wordmark")!;
        return { scroll: e.scrollWidth, client: e.clientWidth };
      });
      expect(scroll).toBeLessThanOrEqual(client);
    });
  });
}

test.describe("desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("as regras de toque não vazam, e a sanfona segue inteira", async ({ page }) => {
    await assentar(page);
    const r = await page.evaluate(() => ({
      navVisivel: getComputedStyle(document.querySelector(".lp-navlinks")!).display !== "none",
      // A pílula do desktop tem ~43px de propósito: o min-height de 44 mora em
      // (hover: none). Se ela crescer aqui, a regra de toque vazou.
      pill: document.querySelector(".lp-nav .lp-pill-solid")!.getBoundingClientRect().height,
      posicoes: [...document.querySelectorAll(".lp-capstack-panel")].map(
        (p) => getComputedStyle(p).position,
      ),
    }));
    expect(r.navVisivel).toBe(true);
    expect(r.pill).toBeLessThan(44);
    // No desktop TODOS os painéis grudam — inclusive o de PBL, que lá tem
    // altura explícita e um filho sticky de uma tela.
    expect(new Set(r.posicoes)).toEqual(new Set(["sticky"]));
  });
});
