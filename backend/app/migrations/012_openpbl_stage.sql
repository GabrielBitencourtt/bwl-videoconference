-- Sequenciamento da aula OpenPBL (botão verde ▶): cursor da etapa atual do
-- facilitador. presentation → close → risks → perceptions → done.
ALTER TABLE video_room_openpbl_class
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'presentation';
