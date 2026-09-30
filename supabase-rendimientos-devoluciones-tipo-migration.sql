-- Migración: agregar columna devoluciones_tipo a contenedor_rendimientos
-- Desglose de la devolución por tipo (Quemado, Richi, Plaga, etc.), usado
-- por el Informe Gerencial de Rendimiento. Cada elemento: { tipo, kg }.
-- Ejecutar en Supabase SQL Editor

ALTER TABLE contenedor_rendimientos
  ADD COLUMN IF NOT EXISTS devoluciones_tipo jsonb DEFAULT '[]';

-- Verificar
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'contenedor_rendimientos'
ORDER BY ordinal_position;
