-- Migración: registrar quién inició cada ronda de conteo de canastillas,
-- para que la siguiente persona que entre sepa quién ya está contando y
-- pueda unirse a propósito en vez de simplemente aparecer en la pantalla
-- de escaneo sin contexto.
-- Ejecutar en Supabase SQL Editor DESPUÉS de las migraciones anteriores
-- de canastillas (supabase-canastillas-rondas-migration.sql y
-- supabase-canastillas-rondas-concurrencia-migration.sql).

ALTER TABLE canastilla_rondas ADD COLUMN IF NOT EXISTS iniciada_por text;

-- Verificar
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'canastilla_rondas' ORDER BY ordinal_position;
