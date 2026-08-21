-- Migración: bitácora de actividad — quién hizo qué y cuándo, cruzando
-- Inventario, Recepción y Packing List (Paso 1/2 y sus informes).
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS actividad_log (
  id         bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  usuario    text,
  modulo     text NOT NULL,   -- 'Inventario' | 'Recepción' | 'Packing List' | ...
  accion     text NOT NULL,   -- tag corto para filtrar: 'entrada', 'salida', 'informe_planta', ...
  detalle    text NOT NULL,   -- frase legible completa, ej. "Robinson ingresó 1000 unidades de CAJAS DEL MONTE"
  referencia text,            -- opcional: n° de contenedor, remisión, etc., para contexto
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_actividad_log_created_at ON actividad_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_actividad_log_modulo ON actividad_log(modulo);

ALTER TABLE actividad_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE actividad_log REPLICA IDENTITY FULL;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'actividad_log'
ORDER BY ordinal_position;
