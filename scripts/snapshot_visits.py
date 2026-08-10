#!/usr/bin/env python3
"""
snapshot_visits.py — Salva uma marcação (snapshot) do contador de acessos
do site no próprio repositório, como salvaguarda.

O contador ao vivo (public/app.js) usa um serviço gratuito de terceiros
(abacus.jasoncameron.dev) que não tem garantia de permanência. Este script
lê o valor atual e acrescenta {data, contagem} em visit_history.json, que
fica versionado no git — se o serviço sair do ar um dia, o histórico até
aquele momento continua salvo aqui.

Rodado automaticamente 1x por dia via GitHub Actions
(.github/workflows/snapshot-visits.yml), mas pode ser rodado manualmente:
    python3 scripts/snapshot_visits.py
"""
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://abacus.jasoncameron.dev/get/eleicoes2026-abnergomes-tse/acessos"
OUT = Path(__file__).resolve().parent.parent / "visit_history.json"


def main():
    with urllib.request.urlopen(API, timeout=15) as resp:
        count = json.load(resp)["value"]

    history = json.loads(OUT.read_text()) if OUT.exists() else []
    entry = {
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count": count,
    }
    history.append(entry)
    OUT.write_text(json.dumps(history, indent=2, ensure_ascii=False) + "\n")
    print(f"Snapshot salvo: {count} acessos em {entry['date']}")


if __name__ == "__main__":
    main()
