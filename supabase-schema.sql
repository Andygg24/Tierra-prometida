-- ═══════════════════════════════════════════════════════════════
-- TIERRA PROMETIDA TRADING — Supabase Schema
-- Ejecutar en: Supabase Dashboard → SQL Editor → New query
-- ═══════════════════════════════════════════════════════════════

-- ── EMPLEADOS ─────────────────────────────────────────────────
create table if not exists empleados (
  id          serial primary key,
  no          int,
  nombre      text not null,
  doc         text not null default 'CC Nacional',
  num         text unique not null,
  tel         text,
  area        text,
  banco       text,
  cuenta      text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── CONTRATOS ─────────────────────────────────────────────────
create table if not exists contratos (
  id           serial primary key,
  emp_num      text not null references empleados(num) on delete cascade,
  tipo         text not null default 'OPS',
  fecha_inicio date,
  fecha_fin    date,
  notas        text,
  created_at   timestamptz not null default now()
);

-- ── HISTORIAL DE PAGOS ────────────────────────────────────────
create table if not exists pagos (
  id         bigint primary key default extract(epoch from now())*1000,
  emp_num    text not null references empleados(num) on delete cascade,
  fecha      date not null,
  monto      numeric not null,
  tipo       text not null default 'Nómina',
  ref        text,
  created_at timestamptz not null default now()
);

-- ── DOCUMENTOS ────────────────────────────────────────────────
create table if not exists documentos (
  emp_num  text primary key references empleados(num) on delete cascade,
  cedula   boolean not null default false,
  contrato boolean not null default false,
  foto     boolean not null default false,
  eps      boolean not null default false,
  arl      boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ── EVALUACIONES DE DESEMPEÑO ─────────────────────────────────
create table if not exists evaluaciones (
  id            bigint primary key default extract(epoch from now())*1000,
  emp_num       text not null references empleados(num) on delete cascade,
  fecha         date not null,
  puntualidad   int not null default 4 check (puntualidad between 1 and 5),
  calidad       int not null default 4 check (calidad between 1 and 5),
  actitud       int not null default 4 check (actitud between 1 and 5),
  productividad int not null default 4 check (productividad between 1 and 5),
  nota          text,
  created_at    timestamptz not null default now()
);

-- ── SEGURIDAD SOCIAL ──────────────────────────────────────────
create table if not exists seguridad_social (
  emp_num    text primary key references empleados(num) on delete cascade,
  eps        text,
  fecha_eps  date,
  arl        text,
  fecha_arl  date,
  estado     text not null default 'Activo',
  updated_at timestamptz not null default now()
);

-- ── ASISTENCIA ────────────────────────────────────────────────
create table if not exists asistencia (
  id          serial primary key,
  fecha       date not null,
  emp_nombre  text not null,
  estado      text not null default 'P',  -- P=Presente, A=Ausente, PM=Permiso, INC=Incapacidad
  contenedor  text,
  obs         text,
  unique (fecha, emp_nombre)
);

create table if not exists asistencia_meta (
  fecha             date primary key,
  turno             text,
  contenedor_dia    text,
  roger_contenedor  text,
  obs_general       text,
  updated_at        timestamptz not null default now()
);

-- ── LIQUIDACIONES ─────────────────────────────────────────────
create table if not exists liquidaciones (
  id           bigint primary key default extract(epoch from now())*1000,
  emp_num      text not null,
  nombre       text not null,
  area         text,
  periodo      text not null,
  sal_base     numeric,
  devengado    numeric,
  total_deduc  numeric,
  neto         numeric,
  ausencias    int,
  fecha        date not null,
  tipo         text not null default 'nomina',  -- 'nomina' | 'contenedor'
  contenedores int,
  metodo_pago  text,
  created_at   timestamptz not null default now()
);

-- ── TIPOS DE PAGO ─────────────────────────────────────────────
create table if not exists tipos_pago (
  emp_num  text primary key references empleados(num) on delete cascade,
  tipo     text not null default 'contenedor'  -- 'contenedor' | 'nomina'
);

-- ── CONTENEDORES ──────────────────────────────────────────────
create table if not exists contenedores (
  id              bigint primary key default extract(epoch from now())*1000,
  fecha           date not null,
  num_contenedor  text,
  proveedor       text,
  producto        text,
  cajas_salida    int,
  turno           text,
  estado          text not null default 'En proceso',
  operadores      text,
  transporte      text,
  placa           text,
  trailer         text,
  obs             text,
  grupo_dia       text,
  grupo_noche     text,
  booking         text,
  naviera         text,
  destino         text,
  trazabilidad    jsonb not null default '[]',
  created_at      timestamptz not null default now()
);

-- ── GRUPOS DE TRABAJO ─────────────────────────────────────────
create table if not exists grupos_trabajo (
  id        bigint primary key default extract(epoch from now())*1000,
  nombre    text not null,
  turno     text not null default 'Día',
  miembros  jsonb not null default '[]',  -- array de emp_num strings
  created_at timestamptz not null default now()
);

-- ── CONTENEDOR INSUMOS (Centro de costos) ─────────────────────
create table if not exists contenedor_insumos (
  id          bigint primary key default extract(epoch from now())*1000,
  cont_id     bigint references contenedores(id) on delete cascade,
  nombre      text not null,
  unidad      text,
  cantidad    numeric,
  costo_unit  numeric,
  created_at  timestamptz not null default now()
);

-- ── INVENTARIO ────────────────────────────────────────────────
create table if not exists inventario (
  id         serial primary key,
  nombre     text not null,
  cant       numeric not null default 0,
  unidad     text,
  minimo     numeric not null default 0,
  categoria  text,
  obs        text,
  costo      numeric,
  updated_at timestamptz not null default now()
);

create table if not exists inventario_movimientos (
  id         bigint primary key default extract(epoch from now())*1000,
  inv_id     int references inventario(id) on delete set null,
  nombre     text not null,
  tipo       text not null,  -- 'entrada' | 'salida' | 'ajuste'
  cantidad   numeric not null,
  obs        text,
  fecha      timestamptz not null default now()
);

-- ── PEDIDOS ───────────────────────────────────────────────────
create table if not exists pedidos (
  id         bigint primary key default extract(epoch from now())*1000,
  estado     text not null default 'cotizacion',
  cliente    text,
  producto   text,
  cantidad   numeric,
  precio     numeric,
  fecha      date,
  notas      text,
  data       jsonb not null default '{}',  -- resto de campos del pedido
  created_at timestamptz not null default now()
);

-- ── CONFIGURACIÓN (key-value store) ───────────────────────────
create table if not exists configuracion (
  clave      text primary key,
  valor      jsonb not null,
  updated_at timestamptz not null default now()
);

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (activar para producción)
-- Por ahora desactivado para facilitar el desarrollo.
-- Activar cuando tengas auth real con Supabase Auth.
-- ═══════════════════════════════════════════════════════════════

alter table empleados           disable row level security;
alter table contratos           disable row level security;
alter table pagos               disable row level security;
alter table documentos          disable row level security;
alter table evaluaciones        disable row level security;
alter table seguridad_social    disable row level security;
alter table asistencia          disable row level security;
alter table asistencia_meta     disable row level security;
alter table liquidaciones       disable row level security;
alter table tipos_pago          disable row level security;
alter table contenedores        disable row level security;
alter table grupos_trabajo      disable row level security;
alter table contenedor_insumos  disable row level security;
alter table inventario          disable row level security;
alter table inventario_movimientos disable row level security;
alter table pedidos             disable row level security;
alter table configuracion       disable row level security;

-- ═══════════════════════════════════════════════════════════════
-- SEED: empleados base (los 50 del EMPLEADOS_DB hardcodeado)
-- ═══════════════════════════════════════════════════════════════

insert into empleados (no, nombre, doc, num, tel, area, banco, cuenta) values
(1,  'Miguel Angel Rodriguez Rincon',      'CC Venezuela', '26694253',   '3203228384', 'Alimentador',       'Nequi',       '3203228384'),
(2,  'Yuliana Andrea Castillo Molina',     'CC Nacional',  '1007413088', '3189647338', 'Selección',         'Nequi',       '3203352730'),
(3,  'Yrma Rosa Hernandez Alvarez',        'PPT',          '6439889',    '3023371700', 'PLU',               'Nequi',       '3222386672'),
(4,  'Roger Jose Brito Rosas',             'CC Venezuela', '24501119',   '3244046005', 'Cajas',             'Nequi',       '3188429126'),
(5,  'Maria Jose Suarez Serrano',          'CC Nacional',  '1099736037', '3152290981', 'Cajas',             'Nequi',       '3152290981'),
(6,  'YoxeLis Teresa Marcano Gutierrez',   'CC Venezuela', '20312508',   '3118472208', 'Empaque',           'Nequi',       '3009991749'),
(7,  'Elvis Gabriel Lopez Lopez',          'PPT',          '993452',     '3136447114', 'Empaque',           'Nequi',       '3136447114'),
(8,  'Gehiner Daniela Bracho Lopez',       'PPT',          '3403729',    '3183289317', 'Empaque',           'Nequi',       '3183289317'),
(9,  'Jessimar Karina Teran Diaz',         'PPT',          '4583258',    '3101977950', 'Empaque',           'Nequi',       '3170202942'),
(10, 'Yumilys Susana Marcano Gutierrez',   'CC Venezuela', '20312506',   '3187400888', 'Empaque',           'Nequi',       '3172434608'),
(11, 'Edimar Luzmari Hernandez Sanchez',   'PPT',          '5648489',    '3106228123', 'Empaque',           'Nequi',       '3106228123'),
(12, 'Gisela Josefina Sanchez',            'PPT',          '5407490',    '3153686197', 'Empaque',           'Nequi',       '3153686197'),
(13, 'Sandra Milena Garridos Lizcano',     'CC Nacional',  '1098686754', '3143363829', 'Empaque',           'Nequi',       '3143363829'),
(14, 'Jesus Manuel Quintero',              'PPT',          '6647779',    '3134933691', 'Pesador',           'Nequi',       '3158951478'),
(15, 'Dairo Andres Perez Alvarez',         'CC Nacional',  '10993704',   '3244309535', 'Pesador',           'Nequi',       '3244309535'),
(16, 'Gerardo José Jimenéz Castañeda',     'PPT',          '4990236',    '3245425578', 'Cajas',             'Nequi',       '3245425578'),
(17, 'Sebastian García Arismendi',         'PPT',          '6945629',    '3507810901', 'Paletizador',       'Nequi',       '3507810901'),
(18, 'Yerson Cárdenas Gómez',             'CC Nacional',  '1065909514', '3175521445', 'Paletizador',       'Nequi',       '3138773881'),
(19, 'Yaneth Bautista Guevara',            'CC Nacional',  '1099367342', '3152293848', 'Selección',         'Nequi',       '3001767022'),
(20, 'Roxana Yamileth Hernandez Rivera',   'PPT',          '22553558',   '3181558410', 'Empaque',           'Nequi',       '3161693312'),
(21, 'Oscar Perez Rios',                   'CC Nacional',  '109937629',  '3184591161', 'Empaque',           'Bancolombia', '3184591161'),
(22, 'Jhanneth Gutierrez',                 'CC Nacional',  '228822356',  '1099354423', 'Empaque',           'Nequi',       '3148674711'),
(23, 'Emily Sulimar Zanez',                'PPT',          '7123487',    '3503064571', 'Empaque',           'Nequi',       '3503064571'),
(24, 'Yolis Tibisay Ortiz Lopéz',         'PPT',          '1552095',    '3162068305', 'Empaque',           'Nequi',       '3224410126'),
(25, 'Thaisscha Nayleth Lara Hernandez',   'PPT',          '6347776',    '3222386672', 'Empaque',           'Nequi',       '3222386672'),
(26, 'Daniel Landinez',                    'CC Nacional',  '1005322656', '3170626375', 'Empaque',           'Nequi',       '3186970998'),
(27, 'Jose Luis Unda',                     'PPT',          '5648441',    '3112704726', 'Empaque',           'Nequi',       '3112704726'),
(28, 'Michell Nohemí Castillo Aguilar',   'PPT',          '6370122',    '3175724729', 'Empaque',           'Nequi',       '3175724729'),
(29, 'Rosa America Lopez',                 'PPT',          '12425232',   '-',          'Empaque',           'Nequi',       '-'),
(30, 'Jhon Anderson Ortiz Gutierrez',      'CC Nacional',  '1006097443', '-',          'Descargador',       'Nequi',       '-'),
(31, 'Dainy Jose Alvarado',                'CC Venezuela', '34327999',   '-',          'Descargador',       'Nequi',       '-'),
(32, 'Robert Pinto',                       'PPT',          '7228447',    '-',          'Descargador',       'Nequi',       '-'),
(33, 'Cristian David Sarmiento Ayala',     'CC Nacional',  '1098629911', '-',          'Empaque',           'Nequi',       '-'),
(34, 'Anyer Daniel Castillo Seco',         'CC Venezuela', '32914737',   '3138703023', 'Empaque',           'Nequi',       '-'),
(35, 'Jonny Alejandro Rangel León',        'CC Nacional',  '1097498343', '3003312555', 'Empaque',           'Nequi',       '-'),
(36, 'Angela Maria Lopez Lopez',           'PPT',          '1149724',    '3177616701', 'Empaque',           'Nequi',       '3177616701'),
(37, 'Janeth Gomez Saavedra',              'CC Nacional',  '37862715',   '3214049035', 'Empaque',           'Nequi',       '3214049035'),
(38, 'Ludy Gomez Saavedra',               'CC Nacional',  '1098603576', '3225033891', 'Empaque',           'Nequi',       '3170515267'),
(39, 'Kleiderbe José Milde Lopez',         'PPT',          '5943',       '3188265614', 'Empaque',           'Nequi',       '3188265614'),
(40, 'Pablo Antonio Sierra Huertas',       'CC Nacional',  '1006594377', '3124566428', 'Empaque',           'Bancolombia', '3124566428'),
(41, 'Michael Andres Garcia Rojas',        'CC Nacional',  '1007740745', '3183925876', 'Empaque',           'Nequi',       '3228778485'),
(42, 'Ismael Jesús Villarreal',            'PPT',          '6286546',    '3168150582', 'Empaque',           'Nequi',       '3168150582'),
(43, 'Juan Carlos Quijano Guitierrez',     'CC Nacional',  '1102385242', '3212319004', 'Empaque',           'Nequi',       '3212319004'),
(44, 'Junior Rodriguez Gamarra',           'CC Nacional',  '1024684884', '3202636657', 'Empaque',           'Nequi',       '-'),
(45, 'Zarith Diaz Carreño',               'CC Nacional',  '1098629602', '3177443821', 'Empaque',           'Nequi',       '-'),
(46, 'Andrea Katherine Ayala Duarte',      'CC Nacional',  '1102714297', '3228834617', 'Nueva',             'Nequi',       '-'),
(47, 'Karen Almeida',                      'CC Nacional',  '-47',        '-',          'PLU',               'Nequi',       '-'),
(48, 'Roxana Hernandez',                   'PPT',          '-48',        '3181558410', 'Empaque',           'Nequi',       '-'),
(49, 'Lennix Vega',                        'CC Nacional',  '63557421',   '3016366258', 'Administración',    'Nequi',       '-'),
(50, 'Juan Abuchaibe',                     'CC Nacional',  '123456789',  '+17867102522','Owner / Propietario','-',         '-')
on conflict (num) do nothing;
