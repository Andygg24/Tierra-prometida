import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// /registro es la página pública donde cada trabajador registra su rostro
// desde su celular (sin login) — no carga el resto de la app.
const esRegistro = /^\/registro\/?$/i.test(window.location.pathname)
const Pagina = esRegistro
  ? lazy(() => import('./components/RegistroEnLinea.jsx'))
  : lazy(() => import('./App.jsx'))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Pagina />
    </Suspense>
  </StrictMode>,
)
