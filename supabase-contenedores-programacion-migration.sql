-- Migración: fecha de programación del contenedor (distinta de "fecha" que
-- es la fecha del registro/proceso) — permite marcar para qué día está
-- programado un contenedor, usado por el widget de Inicio y por Jarvis.
-- Ejecutar en Supabase SQL Editor

ALTER TABLE contenedores
  ADD COLUMN IF NOT EXISTS fecha_programacion date;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'contenedores'
ORDER BY ordinal_position;
