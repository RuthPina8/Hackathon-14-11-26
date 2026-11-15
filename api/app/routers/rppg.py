"""POST /rppg/estimate (Back 1): color de la cara por cuadro -> ritmo, confianza y experimentales."""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.intelligence import rppg

router = APIRouter(prefix="/rppg", tags=["rppg"])


class RppgIn(BaseModel):
    fps: float | None = None
    t_ms: list[float] = Field(description="tiempo de cada cuadro en ms")
    rgb: list[list[float]] = Field(description="[r, g, b] promedio de mejillas y frente por cuadro")


class RppgOut(BaseModel):
    hr_lpm: float | None
    confianza: float
    snr_db: float | None
    hrv_rmssd: float | None = Field(default=None, description="experimental; null si la calidad es baja")
    resp_rpm: float | None = Field(default=None, description="experimental; null si no hay pico claro")


@router.post("/estimate", response_model=RppgOut)
def estimate(body: RppgIn):
    r = rppg.estimar(body.t_ms, body.rgb, body.fps)
    return RppgOut(hr_lpm=r.hr_lpm, confianza=r.confianza, snr_db=r.snr_db, hrv_rmssd=r.hrv_rmssd, resp_rpm=r.resp_rpm)
