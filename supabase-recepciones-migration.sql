-- Migración: tabla recepciones (llegada/salida de fruta a la planta)
-- Columnas alineadas con useRecepciones.js
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS recepciones (
  id          bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  remision    text,
  fecha       date NOT NULL DEFAULT current_date,
  tipo        text NOT NULL DEFAULT 'entrada',  -- 'entrada' | 'salida'
  placa       text,
  conductor   text,
  proveedor   text,
  supervisor  text,
  hora_inicio text,
  hora_fin    text,
  estibas     jsonb NOT NULL DEFAULT '[]',
  -- cada estiba: { numero, pesoBruto, estibaPlastica, tipoCanastilla ('2'|'2.4'), cantCanastillas, pesoEstiba, descuentoEstiba (= canastillas+estiba, calculado), pesoNeto }
  total       numeric NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE recepciones DISABLE ROW LEVEL SECURITY;

ALTER TABLE recepciones REPLICA IDENTITY FULL;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'recepciones'
ORDER BY ordinal_position;
