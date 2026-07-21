-- Migración: módulo Logística (bookings, transporte terrestre, operación portuaria)
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS logistica_bookings (
  id                       bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  numero_booking           text,
  numero_contenedor        text,
  historial_contenedores   jsonb NOT NULL DEFAULT '[]',  -- [{numeroAnterior, fecha, motivo}] en Roll Over
  estado                   text NOT NULL DEFAULT 'Pendiente', -- Pendiente|Confirmado|Cancelado|Roll Over|Finalizado
  fecha_confirmado         timestamptz,                  -- se setea solo al pasar a Confirmado
  puerto_origen            text,
  puerto_destino           text,
  naviera                  text,
  si_cutoff_fecha          date,
  si_cutoff_hora           text,
  cy_cutoff_fecha          date,
  cy_cutoff_hora           text,
  documentos_completos     boolean NOT NULL DEFAULT false,
  eta_actual               date,
  eta_anterior             date,                         -- valor previo de eta_actual, seteado al detectar cambio
  eta_cambio_visto         boolean NOT NULL DEFAULT true, -- false = alerta de cambio de ETA pendiente de ver
  -- Gestión de Contenedores (misma fila, pestaña distinta en el UI):
  estado_contenedor        text NOT NULL DEFAULT 'Vacío', -- Vacío|Cargado|En tránsito|Puerto|Embarcado
  fecha_ingreso_puerto     date,   -- solo aplica Maersk/ZIM/Hapag/CMA (naviera.diasLibresDesde='ingreso_puerto')
  fecha_asignacion         date,   -- solo aplica King Ocean/Seaboard (naviera.diasLibresDesde='asignacion')
  -- Seguimiento de exportación — hitos manuales (los derivados salen de otras tablas/campos):
  fecha_orden_recibida     date,
  fecha_produccion         date,
  fecha_packing_terminado  date,
  fecha_zarpe              date,
  fecha_llegada_destino    date,
  fecha_entrega_final      date,
  obs                      text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS logistica_transporte (
  id                bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  booking_id        bigint NOT NULL REFERENCES logistica_bookings(id) ON DELETE CASCADE,
  placa             text,
  conductor         text,
  transportadora    text,
  trailer           text,
  fecha_cargue      date,
  fecha_descargue   date,
  stand_by          boolean NOT NULL DEFAULT false,
  costo_adicional   numeric,
  comentarios       text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS logistica_novedades (
  id           bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  booking_id   bigint NOT NULL REFERENCES logistica_bookings(id) ON DELETE CASCADE,
  fecha        date NOT NULL DEFAULT current_date,
  descripcion  text NOT NULL,
  responsable  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS logistica_inspecciones (
  id             bigint PRIMARY KEY DEFAULT extract(epoch from now())*1000,
  booking_id     bigint NOT NULL REFERENCES logistica_bookings(id) ON DELETE CASCADE,
  fecha          date NOT NULL DEFAULT current_date,
  entidad        text NOT NULL,   -- 'PONAL' | 'DIAN' | 'ICA'
  resultado      text NOT NULL,   -- 'Física' | 'Documental' | 'Libre'
  observaciones  text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_logistica_bookings_numero_contenedor ON logistica_bookings(numero_contenedor);
CREATE INDEX IF NOT EXISTS idx_logistica_bookings_estado ON logistica_bookings(estado);
CREATE INDEX IF NOT EXISTS idx_logistica_transporte_booking ON logistica_transporte(booking_id);
CREATE INDEX IF NOT EXISTS idx_logistica_novedades_booking ON logistica_novedades(booking_id);
CREATE INDEX IF NOT EXISTS idx_logistica_inspecciones_booking ON logistica_inspecciones(booking_id);

ALTER TABLE logistica_bookings     DISABLE ROW LEVEL SECURITY;
ALTER TABLE logistica_transporte   DISABLE ROW LEVEL SECURITY;
ALTER TABLE logistica_novedades    DISABLE ROW LEVEL SECURITY;
ALTER TABLE logistica_inspecciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE logistica_bookings     REPLICA IDENTITY FULL;
ALTER TABLE logistica_transporte   REPLICA IDENTITY FULL;
ALTER TABLE logistica_novedades    REPLICA IDENTITY FULL;
ALTER TABLE logistica_inspecciones REPLICA IDENTITY FULL;

-- Verificar
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'logistica_bookings'
ORDER BY ordinal_position;
