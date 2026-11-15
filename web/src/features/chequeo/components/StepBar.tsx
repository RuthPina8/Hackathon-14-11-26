const PASOS = ['Camera', 'Cognitive test', 'Blood pressure', 'Mood and symptoms', 'Summary']

// Barra de los 5 pasos del chequeo: verde lo hecho, cian el actual
export default function StepBar({ actual }: { actual: number }) {
  return (
    <ol aria-label="Check-up steps" className="m-0 grid list-none grid-cols-5 gap-2 p-0">
      {PASOS.map((nombre, i) => {
        const hecho = i < actual
        const ahora = i === actual
        return (
          <li
            key={nombre}
            aria-current={ahora ? 'step' : undefined}
            className={`flex flex-col gap-2 text-sm font-semibold ${ahora ? 'text-ink' : 'text-muted'}`}
          >
            <span className={`block h-1 rounded-sm transition-colors duration-500 ${hecho ? 'bg-ok' : ahora ? 'bg-accent' : 'bg-line'}`} />
            {i + 1} {nombre}
          </li>
        )
      })}
    </ol>
  )
}
