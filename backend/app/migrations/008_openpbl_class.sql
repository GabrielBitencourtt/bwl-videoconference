-- Aula OpenPBL ao vivo: a sala BWL gera o class-code (presentationCode) e
-- comanda a turma (liberar questionários, encerrar registro) direto da webconf,
-- replicando as chamadas do pacote PRESENTATION à integration.openpbl.ai.
CREATE TABLE IF NOT EXISTS video_room_openpbl_class (
  room_id UUID PRIMARY KEY REFERENCES video_rooms(id) ON DELETE CASCADE,
  activity_id TEXT NOT NULL,                    -- courseActivityId (ContentBuilder)
  presentation_code TEXT NOT NULL,              -- código único da sessão (alunos digitam)
  class_course_id TEXT NOT NULL,                -- ClassCourseId (necessário p/ liberar)
  group_codes JSONB NOT NULL DEFAULT '[]'::jsonb, -- 6 códigos de grupo (classeRooms)
  facilitator_email TEXT NOT NULL,
  facilitator_name TEXT NOT NULL DEFAULT '',
  checking_open BOOLEAN NOT NULL DEFAULT true,  -- registro aberto?
  released_dimensions BOOLEAN NOT NULL DEFAULT false, -- gate Riscos (/performance)
  released BOOLEAN NOT NULL DEFAULT false,      -- gate Percepções
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
