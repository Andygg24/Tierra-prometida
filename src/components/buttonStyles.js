// Estilos de botón compartidos entre los distintos tabs (Recepciones,
// Logística, ...) para no duplicar los mismos literales de color en cada
// componente.
export const btnSecundario = {
  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8,
  color: "rgba(255,255,255,0.7)", padding: "9px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer",
};

export function btnPrimario(ok, loading) {
  return {
    background: ok ? "#00C9A7" : "linear-gradient(135deg,#845EF7,#6366F1)", border: "none", borderRadius: 8,
    color: "white", padding: "9px 18px", fontSize: 12, fontWeight: 700,
    cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1,
  };
}

export const btnTablaEditar = {
  background: "rgba(132,94,247,0.12)", border: "1px solid rgba(132,94,247,0.3)", borderRadius: 6,
  color: "#a78bfa", padding: "4px 8px", fontSize: 11, cursor: "pointer", marginRight: 6,
};

export const btnTablaEliminar = {
  background: "rgba(255,107,107,0.12)", border: "1px solid rgba(255,107,107,0.3)", borderRadius: 6,
  color: "#FF6B6B", padding: "4px 8px", fontSize: 11, cursor: "pointer",
};
