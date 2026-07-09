-- Aula OpenPBL: conjunto de dimensões (dimensionsId, row da tabela `dimensions`
-- no CoreService) usado para o gráfico radar do Questionário de Riscos dentro da
-- webconference. Selecionado na criação da sala (seletor replicado do ContentBuilder).
ALTER TABLE video_rooms
  ADD COLUMN IF NOT EXISTS openpbl_dimensions_id TEXT;
