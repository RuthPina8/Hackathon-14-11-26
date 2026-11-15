"""Congelar la línea base mientras hay una alerta abierta.

Por qué: si la línea base sigue aprendiendo durante una anomalía, "aprende" lo
anormal como si fuera tu normal y la alerta se apaga sola.

- Back 2 congela al levantar la alerta y descongela al atenderla o resolverla.
- Back 1 consulta `esta_congelada()` en `update_baseline()` (o lee `baselines.congelada`).
- Cuando exista la tabla `baselines`, Back 1 registra un persistor con
  `registrar_persistor(fn)` para que el cambio también quede en la base.
"""

from collections.abc import Callable

_congeladas: set[tuple[int, str]] = set()
_persistor: Callable[[int, str, bool], None] | None = None


def registrar_persistor(fn: Callable[[int, str, bool], None] | None) -> None:
    """fn(astronauta_id, tipo, congelada) escribe baselines.congelada en la base."""
    global _persistor
    _persistor = fn


def congelar(astronauta_id: int, tipo: str) -> None:
    _congeladas.add((astronauta_id, tipo))
    if _persistor:
        _persistor(astronauta_id, tipo, True)


def descongelar(astronauta_id: int, tipo: str) -> None:
    _congeladas.discard((astronauta_id, tipo))
    if _persistor:
        _persistor(astronauta_id, tipo, False)


def esta_congelada(astronauta_id: int, tipo: str) -> bool:
    return (astronauta_id, tipo) in _congeladas


def congeladas() -> list[tuple[int, str]]:
    return sorted(_congeladas)


def reset() -> None:
    _congeladas.clear()
