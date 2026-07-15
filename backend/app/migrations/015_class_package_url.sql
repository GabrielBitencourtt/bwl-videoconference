-- URL do Pacote de Classe (ex.: https://play2.openpbl.ai/Invite/{activityId}?profile=aluno)
-- informada na criação da sala; o webconf gera um QR code dela para os alunos.
ALTER TABLE video_rooms ADD COLUMN IF NOT EXISTS class_package_url text;
