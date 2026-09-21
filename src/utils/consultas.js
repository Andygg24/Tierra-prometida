// Ayudantes compartidos para consultas a Supabase.

export const dormir = (ms) => new Promise(r => setTimeout(r, ms));

// Reintenta si la consulta falla (típicamente un timeout en frío: el segundo
// intento ya encuentra los datos en caché y pasa). `consulta` es una función
// que devuelve la consulta de supabase-js ({ data, error }).
export async function conReintentos(consulta, reintentos = 2) {
  let res;
  for (let i = 0; i <= reintentos; i++) {
    res = await consulta();
    if (!res.error) return res;
    if (i < reintentos) await dormir(1200 * (i + 1));
  }
  return res;
}
