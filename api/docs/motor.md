# Especificación del motor de AstroHealth (Back 1)

Este documento es la referencia para implementar `app/intelligence/`, `app/simulator/` y `app/ingest/`. Los valores marcados **(ajustable)** son puntos de partida: se calibran con datos y se documenta el cambio aquí.

---

## 1. Cámara: qué medimos y qué no

La cámara es el diferenciador del proyecto. **Front 1** extrae las señales por cuadro con MediaPipe Face Landmarker (478 puntos con iris, 52 blendshapes y matriz de pose de cabeza). **Back 1** las procesa, las compara contra tu normal y aprende de ellas.

| Señal | Cómo se obtiene | Estado | `tipo` |
|---|---|---|---|
| Ritmo cardiaco | rPPG: color de mejillas y frente → POS → FFT (sección 2) | **Sólido** | `hr_reposo` |
| Variabilidad del ritmo (VFC) | Picos de la onda rPPG → intervalos entre latidos → RMSSD | **Experimental**. La webcam mide bien el promedio, pero la VFC individual es imprecisa | `hrv_rmssd` |
| Respiración | Modulación de la onda rPPG en 0.1 a 0.5 Hz, o movimiento vertical de la cabeza | **Experimental** | `resp_rpm` |
| Fatiga ocular | Apertura de ojos por cuadro (blendshapes `eyeBlinkLeft/Right` o relación de aspecto del ojo) → PERCLOS, parpadeos por minuto, duración del parpadeo | **Sólido** | `perclos`, `parpadeo_min`, `parpadeo_dur_ms` |
| Expresividad | Varianza de blendshapes clave durante el chequeo (`mouthSmile*`, `browDown*`, `browInnerUp`, `jawOpen`), normalizada contra tu normal | **Sólido como medida de movimiento**; no es una emoción | `expresividad`, `sonrisa_media`, `ceno_medio` |
| Inquietud | Desviación estándar de los ángulos de cabeza (de la matriz de pose) | **Sólido como movimiento** | `movimiento_cabeza` |

**Lo que NO hacemos, y por qué** (también sirve para responder al jurado):

- **Etiquetar emociones por la cara** ("feliz", "triste"). La revisión de Barrett et al. (2019) concluye que los movimientos faciales no son lo bastante confiables ni específicos para diagnosticar emociones.
- **Tamaño de pupila.** Con cámara RGB en luz visible es muy difícil separar pupila e iris, sobre todo en iris oscuros (la mayoría en México). Los pupilómetros clínicos usan infrarrojo. Queda para "más adelante, con cámara IR".
- **Presión arterial por cámara.** Es nivel investigación y no es confiable. No se promete.

### Modelo personal de ánimo (`mood_model.py`)

La idea que lo hace innovador y defendible: **la cámara no lee tu ánimo; aprende cómo cambian TUS señales los días que TÚ reportas sentirte mal.**

- **Etiquetas:** `animo` (1 a 5) y `estres` (0 a 10) del Registro. Es lo mismo que pide el Reaction Self Test de la NASA en la ISS: autorreporte de sueño, estrés y carga de trabajo, junto con una prueba de vigilancia.
- **Variables de entrada**, en z-score contra tu propia línea base: `hr_reposo`, `hrv_rmssd`, `resp_rpm`, `perclos`, `parpadeo_min`, `expresividad`, `sonrisa_media`, `ceno_medio`, `movimiento_cabeza`, `reaccion_ms`, `sueno_horas`.
- **Modelo:** `Ridge` de scikit-learn, uno por astronauta, con `alpha` elegido por validación cruzada.
  - Se entrena cuando hay **10 o más días** con chequeo de cámara y registro de ánimo. Antes de eso, el estado es `aprendiendo`.
  - Se reentrena cada vez que llega un registro nuevo.
- **Evaluación:** leave-one-day-out. Se reporta `acierto_pct` = % de días en que el estimado queda a ±1 punto del reporte, y el error medio absoluto (MAE). Esto es la "calibración del ánimo" que se ve en Perfil.
- **Uso:**
  1. Si un día no hay registro, se muestra `animo_estimado` (fuente `modelo`, etiqueta "estimado por cámara").
  2. Si el estimado queda ≥ 1.5 puntos por debajo del reporte durante 3 días o más, se lanza una sugerencia suave ("¿Cómo te sientes de verdad hoy?"). **Nunca es una alerta por sí sola.**
  3. Explicación: los 2 o 3 coeficientes más grandes en lenguaje simple. Ejemplo: "tus días bajos suelen venir con menos sueño y menos expresividad".
- **Arranque en frío (opcional):** un clasificador de estrés entrenado con WESAD (pulso de muñeca) como referencia de población. Se aclara que se entrenó con pulsera en laboratorio.
- `fuente="modelo"` **nunca** actualiza la línea base ni dispara detectores.

---

## 2. rPPG (`/rppg/estimate`)

- **Entrada:** `{fps, t_ms[], rgb[[r,g,b],...]}`, el color promedio de mejillas y frente por cuadro, en ventanas de 10 s más un acumulado del chequeo de 60 s.
- **Pasos:**
  1. Remuestrear a frecuencia uniforme.
  2. Quitar la tendencia.
  3. POS (Wang 2016); si la señal es débil, usar el canal verde.
  4. Butterworth pasa banda de 0.7 a 4 Hz con `filtfilt`.
  5. FFT con zero-padding e interpolación parabólica del pico.
- **Resolución:** una ventana de 10 s da bins de 0.1 Hz (6 lpm); sirve para el número en vivo. El valor que se guarda sale de los 60 s, o de la mediana de las ventanas ponderada por confianza.
- **Confianza:** SNR del pico y su armónico contra el resto de la banda, mapeada a 0–1. Baja si Front 1 reporta mala luz o mucho movimiento. Con confianza menor a 0.5 no se actualiza la línea base.
- **VFC (experimental):** solo con 60 s y confianza ≥ 0.7.
  - `scipy.signal.find_peaks` sobre la onda filtrada, con distancia mínima de 0.33 s.
  - Se descartan intervalos que cambian más de 20% respecto al anterior.
  - RMSSD con lo que quede. Si quedan menos de 40 latidos, `null`.
- **Respiración (experimental):** pico espectral entre 0.1 y 0.5 Hz de la envolvente de la onda; `null` si no hay pico claro.
- **Salida:** `{hr_lpm, confianza, snr_db, hrv_rmssd, resp_rpm}`.

**Validación:** guardar cada par (cámara, Apple Watch) del mismo momento. `ml/03_validar_rppg.ipynb` calcula el MAE y el gráfico de Bland-Altman. Ese número va al pitch.

---

## 3. Línea base, fases y detectores

### Fases (la misión empieza en el día 1)

| Fase | Cuándo | Qué alerta |
|---|---|---|
| `tierra` | Antes del lanzamiento. En la demo: las mediciones reales del equipo durante el hackathon | Nada; solo aprende |
| `adaptacion` | Días de misión 1 a 14 | Solo rangos clínicos (el cuerpo se está adaptando) |
| `personal` | Día 15 en adelante | Contra tu propio normal |

### Reglas de la línea base

- `peso_personal = n / (n + 7)`.
- Referencia: `mu = w·mu_personal + (1 − w)·mu_poblacional`, y lo mismo para sigma. Las referencias de población salen de MMASH (`ml/01`); mientras tanto, valores provisionales con `# TODO fuente`.
- Peso de cada dato al actualizar: `real` 1.0, `auto` 0.7. `sim` y `modelo`: 0 (nunca).
- Las primeras 3 sesiones de prueba cognitiva son práctica y no cuentan en `n`.

### Detectores

| Detector | Detecta | Parámetros (ajustable) |
|---|---|---|
| z-score | Valor puntual fuera de tu normal | \|z\| ≥ 2 amarilla, ≥ 3 roja (en `umbrales.py`) |
| EWMA | Deriva lenta | λ = 0.2, L = 3 |
| CUSUM | Cambio sostenido y su "desde cuándo" | k = 0.5σ, h = 5σ |
| Isolation Forest | Combinación rara de señales | Vector diario, se activa con ≥ 14 días; `contamination=0.05`, `random_state=42` |
| Rango clínico | Valores fuera de lo seguro | Por ejemplo, HR en reposo 60–100 |
| Regla de sueño | Deuda de sueño | `sueno_horas` < 6 durante 3 o más días (hipótesis del Reaction Self Test de la NASA) |

- **Factores de cada alerta:** `|z_i| / Σ|z|` en porcentaje.
- Cada `Anomaly` lleva: `senal`, `detector`, `valor`, `referencia`, `z`, `desde`, `direccion`, `factores`.

### `/status`

- **Readiness:** `100 − Σ penalizaciones`, cada una con `{senal, delta_pct, texto}` y ordenadas. Si falta un registro del día, −1.
- **Semáforo por sistema:** el peor estado entre sus señales. Si no hay datos, `sin_datos` (nunca verde).
- **Calibración general:** promedio ponderado de `peso_personal`: HR 0.25, PERCLOS 0.25, reacción 0.20, presión 0.15, ánimo 0.15. Con estos pesos sale el 64% del prototipo.
- Emitir `calibration_changed {antes, despues, delta}` cuando la calibración sube 1 punto o más.

---

## 4. Sueño (`sleep.py`)

### Registro manual (Consensus Sleep Diary, versión "core")

Campos:
1. Hora de acostarse
2. Hora en que intentó dormir (por defecto, igual que la anterior)
3. Minutos para quedarse dormido (latencia)
4. Número de despertares
5. Minutos despierto en total durante la noche (WASO)
6. Hora del despertar final
7. Hora de levantarse
8. Calidad: muy mala, mala, regular, buena o muy buena (1 a 5)
9. **Extra NASA:** si tomó medicamento para dormir. En la ISS es muy común y afecta el estado de alerta.

Cálculos:
- `TIB = levantarse − acostarse`
- `TST = despertar_final − intento − latencia − WASO`
- `eficiencia = TST / TIB × 100`

Se guardan como `sueno_horas`, `sueno_latencia_min`, `sueno_waso_min`, `sueno_despertares`, `sueno_eficiencia_pct`, `sueno_calidad` y `sueno_medicamento`, con los horarios crudos en `detalle`.

### Apple Watch (vía Health Auto Export)

- HealthKit guarda el sueño por fases: `inBed`, `awake`, `asleepCore`, `asleepDeep`, `asleepREM`.
- `TST` = suma de las fases dormidas. `WASO` = suma de `awake` dentro del periodo. Despertares = número de segmentos `awake`.
- Desde iOS 18, el reloj a veces no registra `inBed`; en ese caso, `eficiencia = null`.
- Los datos se escriben después de despertar, no en tiempo real.

### Contexto para el pitch

La NASA programa 8.5 h de sueño, pero los astronautas duermen en promedio alrededor de 6 h. Por eso el sueño es un sistema propio.

---

## 5. Inmune por síntomas (`immune.py`)

Basado en la incidencia de síntomas en la ISS (Crucian et al. 2016, NASA): erupciones de piel y síntomas respiratorios altos son los más frecuentes.

### Catálogo de síntomas (cada uno con intensidad 1 a 3)

| Sistema | Síntoma (`clave`) | Peso inmune (ajustable) |
|---|---|---|
| Inmune | Erupción, ronchas o comezón en la piel (`erupcion_piel`) | 1 |
| Inmune | Congestión, estornudos u ojos llorosos persistentes (`congestion`) | 1 (0.5 en adaptación: puede ser redistribución de líquidos) |
| Inmune | Fuego labial o herpes (`fuego_labial`) | 2 (reactivación viral) |
| Inmune | Herida infectada o con pus (`infeccion_piel`) | 2 |
| Inmune | Dolor de garganta (`garganta`) | 1 |
| Inmune | Dolor o molestia de oído (`oido`) | 1 |
| Inmune | Ardor al orinar (`urinario`) | 1 |
| Inmune | Fiebre (`fiebre`) | 3 |
| Otros | Dolor de cabeza, mareo, náusea, visión borrosa, dolor de espalda, dificultad para dormir | 0 (van a su propio sistema o a "Otros") |

### Cálculo

- **Puntaje diario** = Σ peso × intensidad. **Puntaje inmune** = suma de los últimos 7 días.
- **Amarillo** si se cumple cualquiera:
  - (a) un síntoma inmune 3 días seguidos o más
  - (b) 2 categorías inmunes el mismo día
  - (c) fiebre un día
- **Rojo** si se cumple cualquiera:
  - (a) fiebre 2 días seguidos junto con otro síntoma inmune
  - (b) cualquier síntoma inmune 7 días o más ("notable": prolongado)
- **Verde:** ninguno de los anteriores. Sin registros, `sin_datos`.
- **Contexto, no diagnóstico:** si en la semana hay deuda de sueño o estrés ≥ 7, el motivo agrega "tu sueño y estrés de esta semana aumentan el riesgo; vigila síntomas". La NASA asocia estrés y desajuste circadiano con la reactivación de virus latentes.

---

## 6. Presión arterial

- **No hay brazalete en el equipo.** El Apple Watch no mide presión: su aviso de hipertensión analiza unos 30 días de datos y nunca muestra cifras.
- La presión es `auto` con `fuente="manual"` cuando alguien tiene brazalete; en la ISS hay uno en el kit médico. En la demo viene de `fuente="simulador"`, marcada como demo.
- Nunca se estima presión con la cámara. El sistema cardiovascular en vivo se apoya en `hr_reposo` y `hrv_*`.

---

## 7. Ingesta del Apple Watch (`POST /ingest/apple-health`)

- **Entrada:** el JSON "v2" de Health Auto Export, por automatización REST o subiendo el archivo exportado como plan B.
- **Mapeo:**
  - Ritmo en reposo → `hr_reposo`
  - VFC (SDNN) → `hrv_sdnn`
  - Análisis de sueño → sección 4
  - "State of Mind" (si existe) → `animo` con `fuente="apple_watch"`
- **Verificar los nombres exactos** de las métricas en el wiki de Health Auto Export ("API Export – JSON Format") antes de escribir el parser.
- Las automatizaciones REST requieren la versión Premium o su prueba gratis.
- **Idempotente:** si se recibe dos veces el mismo dato, no se duplica.

---

## 8. Simulador (`simulator/`)

- `dia(astronauta, dia) -> list[MeasurementIn]`, con semilla fija, desde el **día 1**. Las señales están correlacionadas: poco sueño → más PERCLOS, reacción más lenta, VFC más baja, menos expresividad, ánimo más bajo. Así el modelo de ánimo tiene qué aprender.
- **Guion corto para la demo** (con 1 día cada 5 s, ~2 minutos):

| Días | Qué pasa |
|---|---|
| 1–14 | Adaptación; la calibración sube |
| 15 | Empieza la fase personal |
| 18–22 | A1 duerme menos de 6 h → sube PERCLOS y la reacción → regla de sueño + CUSUM en el ritmo |
| 23 | Alerta. A1 descansa y la alerta se resuelve sola en los días siguientes (el cierre del ciclo "actuar") |
| 25–29 | A3 con congestión y luego fuego labial → inmune amarillo → rojo → escalar a Tierra |
| 30 | El modelo de ánimo ya está activo con su `acierto_pct` |

- `/demo/advance` (Back 2) pide el siguiente día y lo manda por el mismo pipeline de `/measurements`.

---

## 9. Machine learning (`ml/`)

- Dependencias aparte en `ml/requirements-ml.txt` (jupyterlab, ipykernel, matplotlib, joblib; neurokit2 para extraer VFC de WESAD; torch y onnx solo si se usan).
- Notebooks:
  - `01_mmash_priors.ipynb`: referencias de población (ritmo, sueño, PANAS, STAI) → `priors.json`.
  - `02_wesad_estres.ipynb`: clasificador estrés / no estrés con pulso de muñeca (64 Hz), validación leave-one-subject-out; exportar con joblib.
  - `03_validar_rppg.ipynb`: cámara contra Apple Watch (MAE y Bland-Altman).
- Licencias: WESAD solo para uso científico no comercial y citando a los autores; MMASH bajo ODbL. Los datasets no se suben al repo.
