-- Breakout rooms ("grupos"): sub-salas LiveKit por sala-pai.
-- O plano de mídia é cada grupo numa sala LiveKit própria; o plano de controle
-- (abrir/fechar/timer/mensagem) continua na sala-pai via WS hub.

ALTER TABLE video_rooms
  ADD COLUMN IF NOT EXISTS breakout_open BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS breakout_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS breakout_mode TEXT NOT NULL DEFAULT 'auto';

CREATE TABLE IF NOT EXISTS video_breakout_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_room_id UUID NOT NULL REFERENCES video_rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  room_name TEXT NOT NULL,                 -- nome da sala LiveKit do grupo
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_breakout_groups_room ON video_breakout_groups(parent_room_id);

CREATE TABLE IF NOT EXISTS video_breakout_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_room_id UUID NOT NULL REFERENCES video_rooms(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES video_breakout_groups(id) ON DELETE CASCADE,
  identity TEXT NOT NULL,                   -- LiveKit identity do participante
  display_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_room_id, identity)         -- um participante em no máximo um grupo
);
CREATE INDEX IF NOT EXISTS idx_breakout_assign_group ON video_breakout_assignments(group_id);
