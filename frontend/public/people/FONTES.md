# Retratos dos participantes da sala da landing

Os quatro rostos dos tiles da cena "Your brand, end to end" (`SkinPanel` em
`Landing.tsx`).

| arquivo       | participante | origem                                  |
|---------------|--------------|-----------------------------------------|
| `ana.webp`    | Ana L.       | gerado por IA, fornecido pelo cliente (20/07/2026) |
| `marcus.webp` | Marcus T.    | gerado por IA, fornecido pelo cliente (20/07/2026) |
| `priya.webp`  | Priya S.     | gerado por IA, fornecido pelo cliente (20/07/2026) |
| `diego.webp`  | Diego F.     | gerado por IA, fornecido pelo cliente (20/07/2026) |

## Por que a origem importa aqui

São rostos SINTÉTICOS: não há pessoa real retratada, então não há imagem de
ninguém sendo usada sem consentimento — que é o risco real de pôr retrato em
página comercial. Ao trocar qualquer um destes arquivos, manter a regra: ou
outro rosto gerado, ou foto com cessão de uso por escrito da pessoa. Foto de
banco de imagens capturada de tela NÃO serve, pelo mesmo motivo que os logos
de site agregador não servem (ver `../brands/FONTES.md`).

Os nomes que acompanham os rostos são fictícios e vivem em `PBL_NAMES`
(`Landing.tsx`) — os mesmos quatro do capítulo de PBL, que é o que faz a cena
seguinte ser literalmente "a mesma sala".

## Formato

WebP, na resolução nativa do original (~300px). Os PNGs de origem somavam
473 KB; em WebP q86 são 37 KB no total, para um tile que exibe ~280px de
largura. Não upscalei: a fonte tem ~300px e esticar só produziria borrão maior.

O recorte é do CSS (`object-fit: cover` + `object-position` puxando para cima),
porque o tile é 16/9 e os originais são quase quadrados — o corte tem de tirar
do queixo e do topo, não do rosto. Ao trocar um arquivo por outro com
enquadramento diferente, conferir esse valor.
