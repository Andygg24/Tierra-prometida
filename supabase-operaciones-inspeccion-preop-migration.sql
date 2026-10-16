-- Migración: Operaciones — Registro de Inspección Pre-Operacional Diario
-- (TP-DOP-FOR-001 v02). Una fila por semana (lunes a domingo).
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS operaciones_inspeccion_preop (
  id                bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,

  semana_inicio     date NOT NULL UNIQUE,      -- lunes de la semana inspeccionada

  -- { "<id ítem>": ["C"|"NC"|"", x7 Lun..Dom] }
  marcas            jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Iniciales del encargado, 7 textos Lun..Dom
  iniciales         jsonb NOT NULL DEFAULT '[]'::jsonb,
  observaciones     text,

  -- Firmas: Realizó (operario / inspector), Visto bueno Inocuidad y Calidad,
  -- Aprobación Jefe de Planta / Operaciones (con fecha = aprobada)
  realizo_nombre    text,
  realizo_cargo     text,
  realizo_fecha     date,
  inocuidad_nombre  text,
  inocuidad_cargo   text,
  inocuidad_fecha   date,
  jefe_nombre       text,
  jefe_cargo        text,
  jefe_fecha        date,
  firma_realizo     text,    -- imagen PNG en base64 (data URL)
  firma_inocuidad   text,
  firma_jefe        text,

  registrado_por    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE operaciones_inspeccion_preop DISABLE ROW LEVEL SECURITY;
ALTER TABLE operaciones_inspeccion_preop REPLICA IDENTITY FULL;

-- Tiempo real (para que la lista se actualice sola en todos los equipos)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE operaciones_inspeccion_preop;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'operaciones_inspeccion_preop'
ORDER BY ordinal_position;
