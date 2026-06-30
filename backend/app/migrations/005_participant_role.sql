-- Marca o papel do participante. O progresso SCORM/OpenPBL deve listar apenas
-- alunos (convidados), nunca o anfitrião/staff — senão o host aparece como
-- "aluno" em toda sala que abre.
ALTER TABLE video_room_participants ADD COLUMN IF NOT EXISTS is_staff BOOLEAN NOT NULL DEFAULT false;
