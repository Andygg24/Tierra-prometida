-- Migración: Costo de Venta por contenedor de Logística (reemplaza Lista de Chequeo)
-- Replica el Excel "Costo contenedor.xlsx": costo fruta, costo cajas, transporte,
-- puerto, agencia -> costo total -> costo unitario USD -> precio venta -> ganancia.
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS logistica_costo_venta (
  id               bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  booking_id       bigint NOT NULL UNIQUE REFERENCES logistica_bookings(id) ON DELETE CASCADE,
  tmr              numeric,  -- tasa de cambio (TRM) del día, COP por USD
  kilos            numeric,  -- kilos de fruta del contenedor
  precio_kg        numeric,  -- valor unitario por kilo (COP) -> costo fruta = kilos * precio_kg
  tipo_caja        text,     -- 'Princesa' | 'Del Monte' | otro (referencia, precio_caja manda)
  precio_caja      numeric,  -- valor unitario de la caja (COP) -> costo cajas = precio_caja * cajas del booking
  costo_transporte numeric,  -- COP
  costo_puerto     numeric,  -- COP
  costo_agencia    numeric,  -- COP
  margen           numeric NOT NULL DEFAULT 1.5,  -- % de margen sobre el costo unitario -> PV = CU * (1 + margen/100)
  obs              text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logistica_costo_venta_booking_id ON logistica_costo_venta(booking_id);

ALTER TABLE logistica_costo_venta DISABLE ROW LEVEL SECURITY;
ALTER TABLE logistica_costo_venta REPLICA IDENTITY FULL;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'logistica_costo_venta'
ORDER BY ordinal_position;
