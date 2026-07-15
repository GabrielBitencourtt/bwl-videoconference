-- Papéis de sessão por sala: moderadores (poderes de host), controlador (dirige o
-- sequenciador/apresentação OpenPBL) e webcam fixada na área de conteúdo. Persiste
-- entre restarts do backend (antes era só em memória).
CREATE TABLE IF NOT EXISTS video_room_session_roles (
  room_id    text PRIMARY KEY,
  moderators jsonb NOT NULL DEFAULT '[]'::jsonb,
  controller text,
  pinned     text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
