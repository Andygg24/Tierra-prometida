-- Tabla para packing lists vinculados a contenedores
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS packing_lists (
  id             bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  contenedor_id  bigint NOT NULL,
  fase           int    NOT NULL DEFAULT 1,
  total_cajas    int    NOT NULL DEFAULT 1400,
  cajas_input    text   NOT NULL DEFAULT '1400',
  pallets        jsonb  NOT NULL DEFAULT '[]',
  layout_camion  jsonb  NOT NULL DEFAULT '{"left":[],"right":[]}',
  layout_cont    jsonb  NOT NULL DEFAULT '{"left":[],"right":[]}',
  admin_data     jsonb  NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE packing_lists DISABLE ROW LEVEL SECURITY;
ALTER TABLE packing_lists REPLICA IDENTITY FULL;

-- Índice para buscar por contenedor rápido
CREATE INDEX IF NOT EXISTS idx_packing_lists_contenedor
  ON packing_lists (contenedor_id);

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'packing_lists'
ORDER BY ordinal_position;
