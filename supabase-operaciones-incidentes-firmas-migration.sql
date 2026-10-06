-- Migración: Operaciones — Incidentes Inusuales: firmas dibujadas de las 3
-- personas de la sección 6 (imagen PNG en base64 / data URL).
-- Ejecutar en Supabase SQL Editor

ALTER TABLE operaciones_incidentes ADD COLUMN IF NOT EXISTS firma_reporta      text;
ALTER TABLE operaciones_incidentes ADD COLUMN IF NOT EXISTS firma_supervision  text;
ALTER TABLE operaciones_incidentes ADD COLUMN IF NOT EXISTS firma_verificacion text;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'operaciones_incidentes' AND column_name LIKE 'firma_%';
