"""Configuración leída de api/.env (ver .env.example)."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Vacío = la API arranca sin base de datos (Back 2 usa memoria mientras Back 1 crea las tablas)
    database_url: str = ""
    front_origin: str = "http://localhost:5173"

    # Modo demo: 1 día simulado cada N segundos
    demo_segundos_por_dia: float = 5.0
    # En la demo la cola usa retraso_demo_s del perfil (visible); fuera de la demo, retraso_s real
    demo_retraso_visible: bool = True
    entorno_inicial: str = "nave"

    @property
    def cors_origins(self) -> list[str]:
        return [self.front_origin, "*"]


settings = Settings()
