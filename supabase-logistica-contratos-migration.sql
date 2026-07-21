-- Migración: contratos con navieras (módulo Logística)
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS logistica_contratos (
  id              bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  naviera         text NOT NULL,
  numero_contrato text,
  fecha_inicio    date,
  fecha_fin       date,
  destinos        jsonb NOT NULL DEFAULT '[]',  -- ["Miami Fl", "San Juan, PR", ...]
  obs             text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logistica_contratos_naviera   ON logistica_contratos(naviera);
CREATE INDEX IF NOT EXISTS idx_logistica_contratos_fecha_fin ON logistica_contratos(fecha_fin);

ALTER TABLE logistica_contratos DISABLE ROW LEVEL SECURITY;
ALTER TABLE logistica_contratos REPLICA IDENTITY FULL;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'logistica_contratos'
ORDER BY ordinal_position;
