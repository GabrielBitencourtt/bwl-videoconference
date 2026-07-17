# Logos das marcas da faixa da landing

Origem de cada arquivo. NÃO substituir por download de site agregador de logos
(worldvectorlogo, seeklogo, freebiesupply e afins): a procedência ali não é
verificável e a licença costuma ser inexistente.

| arquivo           | marca      | origem                                                      |
|-------------------|------------|-------------------------------------------------------------|
| `grupo-asas.webp` | Grupo Asas | https://grupoasas.com.br/imgs/logos/logo_branco.webp (site oficial) |
| `idomed.svg`      | Idomed     | https://cdn.portal.estacio.br/Idomed_1f14c4c152.svg (CDN oficial da Estácio) |
| `yduqs.svg`       | Yduqs      | https://upload.wikimedia.org/wikipedia/commons/0/0b/YDUQS_Logo.svg (Wikimedia Commons; enviado pela própria Estácio Participações; domínio público por não atingir o limiar de originalidade, marca registrada preservada) |
| `john-deere.png`  | John Deere | fornecido pelo cliente (`john-deere-logo-0.png`, 17/07/2026) |
| `openpbl.png`     | OpenPBL    | fornecido pelo cliente (`openpbl_logo.jpg`, 17/07/2026) |

Não achei fonte legítima na web para John Deere: o arquivo da Wikipedia é
declaradamente não-livre / uso justo, e uso justo em verbete de enciclopédia não
se estende a página comercial. Por isso as duas últimas vieram do cliente.

## Fundo transparente não é detalhe

A faixa pinta tudo de cinza com `filter: brightness(0) invert(1)`, que achata a
cor preservando o alpha. Num JPEG — ou num PNG com fundo chapado — o filtro
pinta o RETÂNGULO INTEIRO e a marca vira um bloco sólido. Todo arquivo aqui tem
alpha; ao acrescentar um, conferir isso ANTES.

## Tratamento aplicado aos arquivos do cliente

- `john-deere.png` — dois tratamentos.
  1. O original era 4096x4096 com a tinta ocupando só 3606x674 no meio (95%
     vazio). Recortado na caixa da tinta e reamostrado para 1370x256, senão o
     `height` da faixa cairia sobre o vazio e a marca sairia minúscula.
  2. **O cervo foi VAZADO.** No original ele é amarelo dentro do quadrado verde,
     isto é, existe por COR e não por alpha — e o filtro cinza da faixa achata
     cor, então verde e amarelo viravam o mesmo branco e o cervo sumia num
     retângulo cego. O amarelo virou transparente (o canal R separa os dois:
     verde R=32, amarelo R=224; a rampa entre eles vira alpha parcial e preserva
     o antialiasing da silhueta). Agora o cervo é recorte, e sobrevive a
     qualquer achatamento de cor.
  160 KB → 27 KB.

  Lição geral: logo cujo detalhe interno é definido por cor não sobrevive ao
  filtro da faixa. Ao acrescentar marca nova, conferir o detalhe interno — não
  só se a logo "aparece".
- `openpbl.png` — o original era JPEG (sem alpha), tinta branca sobre fundo
  preto. O alpha foi derivado da LUMINÂNCIA (branco = tinta = opaco, preto =
  fundo = transparente), o que resolve a borda antialiasada sozinho; um piso de
  luminância descarta o "ringing" do JPEG progressivo. Recortado para 177x59.
  Resolução no limite: 59px de tinta para 64px em tela retina. Se aparecer
  moleza na faixa, pedir SVG ou PNG maior.
