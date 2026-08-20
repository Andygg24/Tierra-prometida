-- Migración: Caja Menor — facturas (gastos) + abonos (recargas), con foto y QR de consulta
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS caja_menor_facturas (
  id               bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  fecha            date NOT NULL,
  nit              text,     -- NIT o Cédula de quien emite
  nombre           text,     -- Nombre de esa persona o empresa
  tipo_documento   text,     -- 'Factura' | 'Cuenta de cobro' | 'N/A'
  numero_documento text,
  concepto         text NOT NULL,
  monto            numeric NOT NULL DEFAULT 0,
  foto             text,     -- imagen en base64 (data URL), igual que la firma de Carta de Responsabilidad
  obs              text,
  registrado_por   text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caja_menor_facturas_fecha ON caja_menor_facturas(fecha);

ALTER TABLE caja_menor_facturas DISABLE ROW LEVEL SECURITY;
ALTER TABLE caja_menor_facturas REPLICA IDENTITY FULL;

-- Abonos: recargas/reembolsos que la empresa hace A la caja menor (dinero que
-- entra al fondo, no un gasto) — se manejan aparte de las facturas.
CREATE TABLE IF NOT EXISTS caja_menor_abonos (
  id             bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  fecha          date NOT NULL,
  monto          numeric NOT NULL DEFAULT 0,
  concepto       text NOT NULL,  -- motivo del abono, ej. "Reembolso mensual"
  obs            text,
  registrado_por text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caja_menor_abonos_fecha ON caja_menor_abonos(fecha);

ALTER TABLE caja_menor_abonos DISABLE ROW LEVEL SECURITY;
ALTER TABLE caja_menor_abonos REPLICA IDENTITY FULL;

-- Verificar
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('caja_menor_facturas', 'caja_menor_abonos')
ORDER BY table_name, ordinal_position;
