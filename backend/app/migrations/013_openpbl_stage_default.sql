-- Sequenciador do facilitador redesenhado (12 etapas granulares que espelham as
-- "ETAPAS E ATIVIDADES DO ENCONTRO"). Realinha o default da coluna e migra as
-- classes antigas (etapas do modelo de 6 passos) para a nova etapa inicial.
ALTER TABLE video_room_openpbl_class ALTER COLUMN stage SET DEFAULT 'session_start';

UPDATE video_room_openpbl_class
   SET stage = 'session_start'
 WHERE stage IN ('presentation', 'close', 'open_groups', 'close_groups', 'risks', 'perceptions');
