import { useState } from 'react'
import ChequeoCamara from './ChequeoCamara'
import StepBar from './components/StepBar'

// Flujo completo del chequeo diario: Front 2 lo monta en la ruta /chequeo
export default function ChequeoFlow({ onSalir }: { onSalir?: () => void }) {
  const [paso, setPaso] = useState(0)

  if (paso === 0) {
    return <ChequeoCamara onSiguiente={() => setPaso(1)} onCancelar={() => onSalir?.()} />
  }

  // Pasos 2 a 5: se van agregando aquí conforme se construyen
  return (
    <div className="flex flex-col gap-6">
      <StepBar actual={paso} />
      <section className="rounded-2xl border border-line bg-panel p-8">
        <p className="m-0 text-soft">Este paso se agrega en el siguiente bloque.</p>
        <button
          type="button"
          onClick={() => setPaso(paso - 1)}
          className="mt-4 min-h-11 rounded-xl px-5 text-sm font-semibold shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-nav"
        >
          Atrás
        </button>
      </section>
    </div>
  )
}
