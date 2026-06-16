-- Migración: tabla inventario_movimientos
-- Columnas alineadas con useInventario.js
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS inventario_movimientos (
  id          bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  item_nombre text NOT NULL,
  tipo        text NOT NULL,        -- 'entrada' | 'salida' | 'ajuste'
  cant        numeric NOT NULL,
  obs         text,
  antes       numeric NOT NULL DEFAULT 0,
  despues     numeric NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE inventario_movimientos DISABLE ROW LEVEL SECURITY;

ALTER TABLE inventario_movimientos REPLICA IDENTITY FULL;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'inventario_movimientos'
ORDER BY ordinal_position;
