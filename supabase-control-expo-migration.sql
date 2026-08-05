-- Migración: módulo Control Expo (seguimiento de documentos DEX)
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS control_expo (
  id                bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  numero_expo       integer,                       -- correlativo interno de la operación de exportación
  numero_dex        text,                          -- número real del DEX, solo una vez radicado
  estado            text NOT NULL DEFAULT 'Pendiente', -- Pendiente|Radicado|Cancelado
  valor_dex_usd     numeric,
  factura_comercial text,
  fecha             date,                          -- fecha real del DEX/registro, si se conoce (no inventada)
  verificado        boolean NOT NULL DEFAULT false,
  obs               text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_control_expo_numero_expo ON control_expo(numero_expo);
CREATE INDEX IF NOT EXISTS idx_control_expo_estado      ON control_expo(estado);
CREATE INDEX IF NOT EXISTS idx_control_expo_fecha        ON control_expo(fecha);

ALTER TABLE control_expo DISABLE ROW LEVEL SECURITY;
ALTER TABLE control_expo REPLICA IDENTITY FULL;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'control_expo'
ORDER BY ordinal_position;
