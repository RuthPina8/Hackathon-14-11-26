import { Link } from 'react-router-dom'
import { ScanFace } from 'lucide-react'

// Placeholder de las pantallas de Front 1 (cámara, prueba cognitiva, registro, resumen).
// Front 2 deja la ruta lista; Front 1 reemplaza este componente por el real en App.tsx.
// Referencia visual: canvas "AstroHealth, pantallas v2", artboards 2, 3, 4 y 4b.
export default function Front1Placeholder({ titulo, paso }: { titulo: string; paso: string }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-center rounded-2xl border border-dashed border-[#46536F] p-10">
      <ScanFace className="text-[#46536F]" size={36} />
      <p className="k">Chequeo diario · {paso}</p>
      <p className="m-0 font-[family-name:var(--font-display)] text-xl font-semibold">{titulo}</p>
      <p className="m-0 text-sm text-[#A3AEC4]">Pantalla de Front 1, en construcción</p>
      <Link to="/" className="btn sec mt-2">Volver al inicio</Link>
    </div>
  )
}
