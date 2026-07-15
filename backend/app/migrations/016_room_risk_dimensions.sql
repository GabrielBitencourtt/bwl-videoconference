-- Nomes das dimensões de risco do conjunto selecionado na criação da sala
-- (o CustomerApp já busca as sub-dimensões do /content/dimensions). O webconf mostra
-- essas dimensões em cascata na "Análise situacional" SEM depender de alunos/respostas.
ALTER TABLE video_rooms ADD COLUMN IF NOT EXISTS risk_dimensions jsonb;
