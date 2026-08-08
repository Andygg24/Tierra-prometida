-- Migración: Lista de Chequeo por operación de Logística (replica el Excel de control)
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS logistica_checklist (
  id                 bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  booking_id         bigint NOT NULL UNIQUE REFERENCES logistica_bookings(id) ON DELETE CASCADE,
  empresa            text,
  salida             text,     -- puerto/ciudad de salida (manual, ej: "Cartagena")
  cliente            text,
  proforma_hecha     boolean NOT NULL DEFAULT false,
  temperatura        boolean NOT NULL DEFAULT false,
  isf_borrador       boolean NOT NULL DEFAULT false,
  isf_aprobado       boolean NOT NULL DEFAULT false,
  transporte_placa   text,
  tmr_diaria         numeric,  -- TRM del día, para convertir costos COP <-> USD
  factura_comercial  text,
  certificado_origen boolean NOT NULL DEFAULT false,
  docs               boolean NOT NULL DEFAULT false,
  orden_despacho     boolean NOT NULL DEFAULT false,
  dex_listo          boolean NOT NULL DEFAULT false,
  costo              numeric,  -- COP
  costo_cajas        numeric,  -- COP
  costo_transporte   numeric,  -- COP
  costo_puerto       numeric,  -- COP
  costo_agencia      numeric,  -- COP
  precio_venta       numeric,  -- USD por caja
  obs                text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logistica_checklist_booking_id ON logistica_checklist(booking_id);

ALTER TABLE logistica_checklist DISABLE ROW LEVEL SECURITY;
ALTER TABLE logistica_checklist REPLICA IDENTITY FULL;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'logistica_checklist'
ORDER BY ordinal_position;
