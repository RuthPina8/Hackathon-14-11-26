// Onda del pulso medida por la cámara, valores de -1 a 1
export default function PulseWave({ valores }: { valores: number[] }) {
  const puntos =
    valores.length > 1
      ? valores.map((v, i) => `${((i / (valores.length - 1)) * 300).toFixed(1)},${(32 - v * 24).toFixed(1)}`).join(' ')
      : '0,32 300,32'
  return (
    <svg width="100%" height="64" viewBox="0 0 300 64" preserveAspectRatio="none" role="img" aria-label="Señal del pulso">
      <polyline fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" points={puntos} />
    </svg>
  )
}
