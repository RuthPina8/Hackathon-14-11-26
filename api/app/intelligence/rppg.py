"""rPPG: ritmo cardiaco desde el color de la cara (docs/motor.md §2). Funciones puras.

Front 1 ya calcula el ritmo en el navegador; este cálculo en Python es la versión de referencia
(Butterworth real con filtfilt y confianza por SNR, auditoría P1-9 y P1-10) y el respaldo del
endpoint POST /rppg/estimate del contrato.
"""

from dataclasses import dataclass

import numpy as np
from scipy import signal

BANDA_HZ = (0.7, 4.0)  # 42 a 240 lpm
FS_OBJETIVO = 30.0
SNR_DB_MIN, SNR_DB_MAX = -3.0, 8.0  # se mapea linealmente a confianza 0..1 (ajustable con la prueba de la foto)


@dataclass
class ResultadoRppg:
    hr_lpm: float | None
    confianza: float
    snr_db: float | None
    hrv_rmssd: float | None = None
    resp_rpm: float | None = None
    fs: float | None = None


def _remuestrear(t_ms: np.ndarray, x: np.ndarray, fs: float) -> tuple[np.ndarray, np.ndarray]:
    t = (t_ms - t_ms[0]) / 1000.0
    tu = np.arange(0, t[-1], 1.0 / fs)
    return tu, np.interp(tu, t, x)


def pos(rgb: np.ndarray, fs: float) -> np.ndarray:
    """Plane-Orthogonal-to-Skin (Wang et al. 2016) con ventanas de 1.6 s y traslape."""
    n = rgb.shape[0]
    w = max(2, int(1.6 * fs))
    h = np.zeros(n)
    proy = np.array([[0, 1, -1], [-2, 1, 1]], dtype=float)
    for i in range(0, n - w + 1):
        bloque = rgb[i:i + w]
        media = bloque.mean(axis=0)
        media[media == 0] = 1e-9
        cn = bloque / media
        s = cn @ proy.T
        sd1 = s[:, 1].std() or 1e-9
        hi = s[:, 0] + (s[:, 0].std() / sd1) * s[:, 1]
        h[i:i + w] += hi - hi.mean()
    return h


def pasa_banda(x: np.ndarray, fs: float, lo: float = BANDA_HZ[0], hi: float = BANDA_HZ[1], orden: int = 3) -> np.ndarray:
    b, a = signal.butter(orden, [lo / (fs / 2), min(hi / (fs / 2), 0.99)], btype="band")
    return signal.filtfilt(b, a, x)


def _pico_fft(x: np.ndarray, fs: float, lo: float, hi: float) -> tuple[float | None, float | None]:
    """Frecuencia del pico (interpolación parabólica) y SNR en dB: pico y su armónico contra el resto de la banda."""
    n = int(2 ** np.ceil(np.log2(len(x) * 8)))  # zero-padding
    espectro = np.abs(np.fft.rfft(x * np.hanning(len(x)), n)) ** 2
    f = np.fft.rfftfreq(n, 1.0 / fs)
    banda = (f >= lo) & (f <= hi)
    if not banda.any():
        return None, None
    idx = np.flatnonzero(banda)
    k = idx[np.argmax(espectro[idx])]
    if 0 < k < len(espectro) - 1:
        a, b, c = espectro[k - 1], espectro[k], espectro[k + 1]
        d = 0.5 * (a - c) / (a - 2 * b + c) if (a - 2 * b + c) != 0 else 0.0
        f_pico = f[k] + d * (f[1] - f[0])
    else:
        f_pico = f[k]
    ancho = 0.1  # Hz alrededor del pico y del armónico
    senal = ((np.abs(f - f_pico) <= ancho) | (np.abs(f - 2 * f_pico) <= ancho)) & (f >= lo) & (f <= hi * 2)
    ruido = banda & ~senal
    p_senal, p_ruido = espectro[senal].sum(), espectro[ruido].sum()
    snr = 10 * np.log10(p_senal / p_ruido) if p_ruido > 0 and p_senal > 0 else None
    return float(f_pico), (float(snr) if snr is not None else None)


def _rmssd(onda: np.ndarray, fs: float) -> float | None:
    picos, _ = signal.find_peaks(onda, distance=max(1, int(0.33 * fs)))
    if len(picos) < 41:
        return None
    ibi = np.diff(picos) / fs * 1000.0
    limpios = [ibi[0]]
    for v in ibi[1:]:
        if abs(v - limpios[-1]) <= 0.2 * limpios[-1]:
            limpios.append(v)
    if len(limpios) < 40:
        return None
    return float(np.sqrt(np.mean(np.diff(limpios) ** 2)))


def estimar(t_ms: list[float], rgb: list[list[float]], fps: float | None = None) -> ResultadoRppg:
    t = np.asarray(t_ms, dtype=float)
    c = np.asarray(rgb, dtype=float)
    if len(t) < 3 or c.ndim != 2 or c.shape[1] != 3 or (t[-1] - t[0]) < 5000:
        return ResultadoRppg(hr_lpm=None, confianza=0.0, snr_db=None)
    fs = FS_OBJETIVO
    tu, _ = _remuestrear(t, c[:, 0], fs)
    canales = np.stack([_remuestrear(t, c[:, i], fs)[1] for i in range(3)], axis=1)
    canales = signal.detrend(canales, axis=0) + canales.mean(axis=0)  # quita la tendencia, conserva el nivel

    onda = pasa_banda(pos(canales, fs), fs)
    f_pico, snr = _pico_fft(onda, fs, *BANDA_HZ)
    if f_pico is None or snr is None:
        return ResultadoRppg(hr_lpm=None, confianza=0.0, snr_db=None, fs=fs)
    confianza = float(np.clip((snr - SNR_DB_MIN) / (SNR_DB_MAX - SNR_DB_MIN), 0, 1))

    duracion = tu[-1] if len(tu) else 0
    hrv = _rmssd(onda, fs) if duracion >= 55 and confianza >= 0.7 else None
    resp = None
    if duracion >= 30:
        env = np.abs(signal.hilbert(onda))
        env_f = pasa_banda(env - env.mean(), fs, 0.1, 0.5, orden=2)
        f_resp, snr_resp = _pico_fft(env_f, fs, 0.1, 0.5)
        if f_resp and snr_resp is not None and snr_resp > 0:
            resp = round(f_resp * 60, 1)
    return ResultadoRppg(hr_lpm=round(f_pico * 60, 1), confianza=round(confianza, 3), snr_db=round(snr, 2),
                         hrv_rmssd=round(hrv, 1) if hrv else None, resp_rpm=resp, fs=fs)
