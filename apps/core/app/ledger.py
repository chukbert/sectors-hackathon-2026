"""Evidence Ledger — setiap angka punya jejak endpoint + params + fetched_at + source."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Evidence:
    id: str
    label: str
    endpoint: str
    params: dict[str, Any]
    fetched_at: str
    source: str
    value: Any = None
    unit: str | None = None
    node_key: str | None = None
    note: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id, "label": self.label, "endpoint": self.endpoint, "params": self.params,
            "fetched_at": self.fetched_at, "source": self.source, "value": self.value,
            "unit": self.unit, "node_key": self.node_key, "note": self.note,
        }


@dataclass
class Ledger:
    items: list[Evidence] = field(default_factory=list)
    _seq: int = 0

    def add(self, *, label: str, endpoint: str, params: dict, fetched_at: str, source: str,
            value: Any = None, unit: str | None = None, node_key: str | None = None) -> str:
        self._seq += 1
        ev = Evidence(id=f"ev-{self._seq:03d}", label=label, endpoint=endpoint, params=params,
                      fetched_at=fetched_at, source=source, value=value, unit=unit, node_key=node_key)
        self.items.append(ev)
        return ev.id

    def get(self, evidence_id: str) -> Evidence | None:
        return next((e for e in self.items if e.id == evidence_id), None)

    def as_list(self) -> list[dict[str, Any]]:
        return [e.as_dict() for e in self.items]

    def as_map(self) -> dict[str, dict[str, Any]]:
        return {e.id: e.as_dict() for e in self.items}

    def numeric_values(self) -> list[float]:
        """Semua angka yang sah menurut ledger (rekursif) — dasar verifier numerik."""
        out: list[float] = []

        def walk(v: Any) -> None:
            if isinstance(v, bool) or v is None:
                return
            if isinstance(v, (int, float)):
                out.append(float(v))
            elif isinstance(v, str):
                try:
                    out.append(float(v.replace(",", ".")))
                except ValueError:
                    return
            elif isinstance(v, dict):
                for x in v.values():
                    walk(x)
            elif isinstance(v, (list, tuple)):
                for x in v:
                    walk(x)

        for ev in self.items:
            walk(ev.value)
        return out