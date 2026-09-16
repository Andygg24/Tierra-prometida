-- Migración: Terceros de Caja Menor (personas y empresas registradas)
-- Catálogo editable — antes el "proveedor" de una factura era solo texto
-- libre con autocompletado heurístico; esto permite guardar y editar cada
-- tercero como su propio registro.
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS caja_menor_terceros (
  id             bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  nombre         text NOT NULL,
  nit            text,
  tipo           text NOT NULL DEFAULT 'Persona', -- 'Persona' | 'Empresa'
  telefono       text,
  obs            text,
  activo         boolean NOT NULL DEFAULT true,
  registrado_por text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caja_menor_terceros_nombre ON caja_menor_terceros(nombre);

ALTER TABLE caja_menor_terceros DISABLE ROW LEVEL SECURITY;
ALTER TABLE caja_menor_terceros REPLICA IDENTITY FULL;

-- Verificar
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'caja_menor_terceros' ORDER BY ordinal_position;
