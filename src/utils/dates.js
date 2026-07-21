// Todas las fechas ISO "YYYY-MM-DD" de la app se comparan a medianoche LOCAL,
// no UTC. `new Date().toISOString()` siempre reporta la fecha en UTC, y en
// zonas con offset negativo (Colombia, UTC-5) eso ya es el día siguiente
// entre las 7pm y la medianoche hora local — un conteo de "días restantes"
// basado en toISOString() cuenta un día de más durante esas horas.
export function fechaLocalISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

export function diferenciaDiasLocal(fechaDesdeISO, fechaHastaISO) {
  if (!fechaDesdeISO || !fechaHastaISO) return null;
  const desde = new Date(fechaDesdeISO + "T00:00:00");
  const hasta = new Date(fechaHastaISO + "T00:00:00");
  return Math.round((hasta - desde) / 86400000);
}
