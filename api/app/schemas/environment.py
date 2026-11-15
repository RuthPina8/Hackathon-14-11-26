from pydantic import BaseModel, Field


class EnvironmentProfile(BaseModel):
    id: str
    nombre: str
    descripcion: str
    gravedad_g: float
    radiacion_msv_dia: float
    retraso_s: float = Field(description="actual one-way delay with Earth, in seconds")
    retraso_demo_s: float = Field(description="delay shown in the demo")
    ancho_banda_kbps: float
    perdida_osea_pct_mes: float
    evacuacion: str
    fuentes: list[str] = Field(default_factory=list)


class EnvironmentState(BaseModel):
    activo: str
    perfil: EnvironmentProfile
    disponibles: list[str]


class EnvironmentIn(BaseModel):
    id: str
