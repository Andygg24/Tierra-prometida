import { useState } from "react";
import CustomSelect from "./CustomSelect.jsx";

const MANUAL = "manual";

const pesoCajaValido = (v) => Number(v) > 0 && Number(v) < 100;

// Peso por caja (kg): elige uno de los pesos comunes o "Manual" para digitar
// cualquier otro. `value` es texto, como el resto del formulario.
export default function PesoCajaInput({ value, onChange, opciones, inp }) {
  const [manual, setManual] = useState(() => !!value && !opciones.includes(String(value)));
  const invalido = manual && !pesoCajaValido(value);

  return (
    <>
      <CustomSelect
        value={manual ? MANUAL : String(value)}
        onChange={e => {
          if (e.target.value === MANUAL) { setManual(true); return; }
          setManual(false);
          onChange(e.target.value);
        }}
        style={{ ...inp, width: manual ? 96 : 104, flexShrink: 0 }}
      >
        {opciones.map(o => <option key={o} value={o}>{o} kg</option>)}
        <option value={MANUAL}>✏️ Manual</option>
      </CustomSelect>
      {manual && (
        <input
          type="number" min="0" step="0.01" inputMode="decimal"
          value={value} onChange={e => onChange(e.target.value)}
          placeholder="kg" title="Peso por caja en kg"
          style={{ ...inp, width: 74, flexShrink: 0, ...(invalido ? { borderColor: "rgba(255,107,107,0.7)" } : {}) }}
        />
      )}
    </>
  );
}
