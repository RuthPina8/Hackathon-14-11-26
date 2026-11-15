"""Evalúa nuestro rPPG (app/intelligence/rppg.py, POS) contra bases públicas con ritmo de referencia.

Bases soportadas (se descargan aparte, pidiendo acceso a sus autores; NUNCA se suben al repo):
- UBFC-rPPG, "DATASET_2": carpetas subjectN/ con vid.avi y ground_truth.txt
  (renglón 1: señal PPG, renglón 2: ritmo en lpm, renglón 3: tiempo en s).
- PURE: carpetas 01-01/ con imágenes .png y un 01-01.json con /FullPackage (pulseRate) e /Image (Timestamp, ns).

Para cada video se toman ventanas de 20 s cada 5 s (igual que la app), se estima el ritmo y se
compara contra el promedio de la referencia en esa ventana. Salen pares (cámara, referencia,
confianza, origen) que se cargan en POST /validacion/lote: así la pantalla de confiabilidad
muestra el error de NUESTRO código en esas bases junto al de nuestros propios usuarios.

Uso (desde api/, con el venv activo):
    pip install -r ml/requirements.txt
    python -m ml.validar_dataset --base ubfc --ruta D:/datos/UBFC/DATASET_2 --salida data/pares_ubfc.json
    python -m ml.validar_dataset --base pure --ruta D:/datos/PURE --api http://localhost:8000

La zona de piel se toma de la caja de la cara (detector Haar de OpenCV): frente y mejillas en
proporciones fijas. Es más simple que los 478 puntos de MediaPipe del navegador, así que el error
aquí es un límite superior honesto del que tiene la app.
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

from app.intelligence import rppg

VENTANA_S = 20.0
PASO_S = 5.0


def _cv2():
    try:
        import cv2  # noqa: PLC0415
    except ImportError:
        sys.exit("Falta OpenCV: pip install -r ml/requirements.txt")
    return cv2


class Piel:
    """Saca el color promedio de frente y mejillas de cada cuadro."""

    def __init__(self):
        cv2 = _cv2()
        self.cv2 = cv2
        self.det = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        self.caja = None

    def color(self, bgr: np.ndarray) -> list[float] | None:
        gris = self.cv2.cvtColor(bgr, self.cv2.COLOR_BGR2GRAY)
        caras = self.det.detectMultiScale(gris, 1.2, 5, minSize=(80, 80))
        if len(caras):
            x, y, w, h = max(caras, key=lambda c: c[2] * c[3])
            # Suaviza la caja para que no tiemble entre cuadros
            self.caja = (x, y, w, h) if self.caja is None else tuple(int(0.7 * a + 0.3 * b) for a, b in zip(self.caja, (x, y, w, h)))
        if self.caja is None:
            return None
        x, y, w, h = self.caja
        zonas = [
            bgr[y + int(0.08 * h): y + int(0.22 * h), x + int(0.3 * w): x + int(0.7 * w)],  # frente
            bgr[y + int(0.5 * h): y + int(0.7 * h), x + int(0.15 * w): x + int(0.35 * w)],  # mejilla
            bgr[y + int(0.5 * h): y + int(0.7 * h), x + int(0.65 * w): x + int(0.85 * w)],  # mejilla
        ]
        pix = np.concatenate([z.reshape(-1, 3) for z in zonas if z.size])
        if len(pix) < 50:
            return None
        b, g, r = pix.mean(axis=0)
        return [float(r), float(g), float(b)]


def _ventanas(t_ms: np.ndarray, rgb: np.ndarray, ref_t: np.ndarray, ref_hr: np.ndarray, origen: str) -> list[dict]:
    pares = []
    fin = t_ms[-1] / 1000
    ini = t_ms[0] / 1000
    s = ini
    while s + VENTANA_S <= fin + 1e-6:
        sel = (t_ms / 1000 >= s) & (t_ms / 1000 < s + VENTANA_S)
        refsel = (ref_t >= s) & (ref_t < s + VENTANA_S)
        if sel.sum() > 100 and refsel.sum() > 0:
            r = rppg.estimar(list(t_ms[sel]), rgb[sel].tolist(), None)
            ref = float(np.mean(ref_hr[refsel]))
            if r.hr_lpm is not None and 30 <= ref <= 240:
                pares.append({"camara": round(float(r.hr_lpm), 1), "referencia": round(ref, 1),
                              "confianza": round(float(r.confianza), 3), "origen": origen})
        s += PASO_S
    return pares


def ubfc(ruta: Path) -> list[dict]:
    cv2 = _cv2()
    pares = []
    for sujeto in sorted(p for p in ruta.iterdir() if p.is_dir()):
        video, gt = sujeto / "vid.avi", sujeto / "ground_truth.txt"
        if not video.exists() or not gt.exists():
            continue
        lineas = gt.read_text().split("\n")
        ref_hr = np.array([float(v) for v in lineas[1].split()])
        ref_t = np.array([float(v) for v in lineas[2].split()])
        cap = cv2.VideoCapture(str(video))
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        piel, t, rgb, i = Piel(), [], [], 0
        while True:
            ok, cuadro = cap.read()
            if not ok:
                break
            c = piel.color(cuadro)
            if c:
                t.append(1000 * i / fps)
                rgb.append(c)
            i += 1
        cap.release()
        if len(t) > 300:
            nuevos = _ventanas(np.array(t), np.array(rgb), ref_t, ref_hr, "UBFC-rPPG")
            pares += nuevos
            print(f"{sujeto.name}: {len(nuevos)} ventanas", file=sys.stderr)
    return pares


def pure(ruta: Path) -> list[dict]:
    cv2 = _cv2()
    pares = []
    for carpeta in sorted(p for p in ruta.iterdir() if p.is_dir()):
        meta = ruta / f"{carpeta.name}.json"
        if not meta.exists():
            meta = carpeta / f"{carpeta.name}.json"
        if not meta.exists():
            continue
        datos = json.loads(meta.read_text())
        ref_t = np.array([p["Timestamp"] for p in datos["/FullPackage"]]) / 1e9
        ref_hr = np.array([p["Value"]["pulseRate"] for p in datos["/FullPackage"]], dtype=float)
        tiempos = {Path(f"Image{p['Timestamp']}.png").name: p["Timestamp"] / 1e6 for p in datos["/Image"]}
        piel, t, rgb = Piel(), [], []
        for img in sorted(carpeta.glob("*.png")):
            if img.name not in tiempos:
                continue
            c = piel.color(cv2.imread(str(img)))
            if c:
                t.append(tiempos[img.name])
                rgb.append(c)
        if len(t) > 300:
            t0 = t[0]
            nuevos = _ventanas(np.array(t) - t0, np.array(rgb), ref_t - t0 / 1000, ref_hr, "PURE")
            pares += nuevos
            print(f"{carpeta.name}: {len(nuevos)} ventanas", file=sys.stderr)
    return pares


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", choices=["ubfc", "pure"], required=True)
    ap.add_argument("--ruta", type=Path, required=True)
    ap.add_argument("--salida", type=Path, help="JSON con los pares")
    ap.add_argument("--api", help="URL de la API para cargarlos con POST /validacion/lote")
    a = ap.parse_args()
    pares = ubfc(a.ruta) if a.base == "ubfc" else pure(a.ruta)
    if not pares:
        sys.exit("No salió ningún par: revisa la ruta y el formato de la base")
    err = np.array([p["camara"] - p["referencia"] for p in pares])
    print(f"{len(pares)} ventanas · MAE {np.abs(err).mean():.2f} lpm · RMSE {np.sqrt((err ** 2).mean()):.2f} · "
          f"a ±5 lpm: {(np.abs(err) <= 5).mean():.0%}")
    if a.salida:
        a.salida.parent.mkdir(parents=True, exist_ok=True)
        a.salida.write_text(json.dumps({"pares": pares}, indent=1))
    if a.api:
        import httpx  # noqa: PLC0415

        r = httpx.post(a.api.rstrip("/") + "/validacion/lote", json={"pares": pares}, timeout=60)
        r.raise_for_status()
        print(f"Cargados {len(r.json())} pares en {a.api}")


if __name__ == "__main__":
    main()
