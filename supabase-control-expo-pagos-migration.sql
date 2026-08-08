-- Migración: Liquidación de DEX (abonos/pagos en USD sobre control_expo)
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS control_expo_pagos (
  id         bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  dex_id     bigint NOT NULL REFERENCES control_expo(id) ON DELETE CASCADE,
  fecha      date,
  monto_usd  numeric NOT NULL,
  obs        text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_control_expo_pagos_dex_id ON control_expo_pagos(dex_id);
CREATE INDEX IF NOT EXISTS idx_control_expo_pagos_fecha  ON control_expo_pagos(fecha);

ALTER TABLE control_expo_pagos DISABLE ROW LEVEL SECURITY;
ALTER TABLE control_expo_pagos REPLICA IDENTITY FULL;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'control_expo_pagos'
ORDER BY ordinal_position;
