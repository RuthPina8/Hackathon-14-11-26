"""POST /rppg/estimate (Back 1): color de la cara por cuadro -> ritmo, confianza y experimentales."""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.intelligence import rppg

router = APIRouter(prefix="/rppg", tags=["rppg"])


class RppgIn(BaseModel):
    fps: float | None = None
    t_ms: list[float] = Field(description="time of each frame in ms")
    rgb: list[list[float]] = Field(description="[r, g, b] average of cheeks and forehead per frame")


class RppgOut(BaseModel):
    hr_lpm: float | None
    confianza: float
    snr_db: float | None
    hrv_rmssd: float | None = Field(default=None, description="experimental; null if quality is low")
    resp_rpm: float | None = Field(default=None, description="experimental; null if there’s no clear peak")


@router.post("/estimate", response_model=RppgOut)
def estimate(body: RppgIn):
    r = rppg.estimar(body.t_ms, body.rgb, body.fps)
    return RppgOut(hr_lpm=r.hr_lpm, confianza=r.confianza, snr_db=r.snr_db, hrv_rmssd=r.hrv_rmssd, resp_rpm=r.resp_rpm)
