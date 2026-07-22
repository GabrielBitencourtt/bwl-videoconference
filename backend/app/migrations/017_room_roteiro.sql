-- Roteiro da Videoconferência Integrada do episódio escolhido na criação da sala.
--
-- É um RETRATO: o CustomerApp busca o roteiro no CoreService (GET /api/episode/{id}/roteiro,
-- tabela EpisodeRoteiros) e envia junto com a sala. Guardar aqui evita que o BWL precise
-- de token de usuário do CoreService e congela o conteúdo do encontro — uma edição no
-- meio da sessão não muda a tela dos alunos.
--
-- A partir daqui a webconferência renderiza os cards nativamente (sinopse, questões,
-- riscos) no lugar do antigo pacote SCORM de apresentação.
ALTER TABLE video_rooms ADD COLUMN IF NOT EXISTS episode_id text;
ALTER TABLE video_rooms ADD COLUMN IF NOT EXISTS roteiro jsonb;
