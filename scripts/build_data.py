#!/usr/bin/env python3
"""
build_data.py — Gera public/data.json para o site "Eleições 2026 — Patrimônio dos Candidatos".

Fonte: Portal de Dados Abertos do TSE (https://dadosabertos.tse.jus.br/)
  - Candidatos 2026:      consulta_cand_2026_BRASIL.csv
  - Bens de candidatos 2026: bem_candidato_2026_BRASIL.csv
  - Candidatos 2022:      consulta_cand_2022_BRASIL.csv   (para saber quem já concorreu em 2022)
  - Bens de candidatos 2022: bem_candidato_2022_BRASIL.csv

O cruzamento entre 2026 e 2022 é feito pelo CPF do candidato (NR_CPF_CANDIDATO),
já que o identificador SQ_CANDIDATO muda a cada eleição. O CPF não é publicado
no site final — é usado só internamente para o cruzamento.

Regra do usuário: se o candidato não concorreu em 2022 (primeira candidatura,
ou concorreu em outro ano mas não em 2022), o patrimônio de 2022 exibido é 0.

Uso:
    python3 scripts/build_data.py             # usa cache local se existir
    python3 scripts/build_data.py --refresh   # baixa tudo de novo do TSE
"""
import csv
import io
import json
import sys
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / "data_cache"
OUT_PATH = ROOT / "public" / "data.json"

BASE_URL = "https://cdn.tse.jus.br/estatistica/sead/odsele"
FILES = {
    "cand_2026": f"{BASE_URL}/consulta_cand/consulta_cand_2026.zip",
    "bens_2026": f"{BASE_URL}/bem_candidato/bem_candidato_2026.zip",
    "cand_2022": f"{BASE_URL}/consulta_cand/consulta_cand_2022.zip",
    "bens_2022": f"{BASE_URL}/bem_candidato/bem_candidato_2022.zip",
}

CARGOS_ORDEM = [
    "PRESIDENTE", "VICE-PRESIDENTE",
    "GOVERNADOR", "VICE-GOVERNADOR",
    "SENADOR", "1º SUPLENTE", "2º SUPLENTE",
    "DEPUTADO FEDERAL", "DEPUTADO ESTADUAL", "DEPUTADO DISTRITAL",
]


def download(name: str, url: str, refresh: bool) -> Path:
    zip_path = CACHE_DIR / f"{name}.zip"
    if refresh or not zip_path.exists():
        print(f"Baixando {name} de {url} ...", file=sys.stderr)
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            zip_path.write_bytes(resp.read())
    else:
        print(f"Usando cache local para {name} ({zip_path})", file=sys.stderr)
    return zip_path


def read_brasil_csv(zip_path: Path, inner_name_prefix: str):
    """Lê o CSV consolidado *_BRASIL.csv de dentro do zip do TSE (latin-1, ';')."""
    with zipfile.ZipFile(zip_path) as zf:
        target = f"{inner_name_prefix}_BRASIL.csv"
        names = zf.namelist()
        if target not in names:
            # fallback: procura por nome que termine em _BRASIL.csv
            candidates = [n for n in names if n.upper().endswith("_BRASIL.CSV")]
            if not candidates:
                raise FileNotFoundError(f"Nenhum *_BRASIL.csv em {zip_path}")
            target = candidates[0]
        raw = zf.read(target).decode("latin-1")
    reader = csv.DictReader(io.StringIO(raw), delimiter=";", quotechar='"')
    return list(reader)


def parse_brl(value: str) -> float:
    """Converte número no formato TSE ('1.234,56' ou '1234,56') para float."""
    if not value:
        return 0.0
    value = value.strip().replace(".", "").replace(",", ".")
    try:
        return float(value)
    except ValueError:
        return 0.0


def build(refresh: bool):
    CACHE_DIR.mkdir(exist_ok=True)

    cand26_zip = download("cand_2026", FILES["cand_2026"], refresh)
    bens26_zip = download("bens_2026", FILES["bens_2026"], refresh)
    cand22_zip = download("cand_2022", FILES["cand_2022"], refresh)
    bens22_zip = download("bens_2022", FILES["bens_2022"], refresh)

    print("Lendo candidatos 2026...", file=sys.stderr)
    cand26 = read_brasil_csv(cand26_zip, "consulta_cand_2026")
    print(f"  {len(cand26)} candidatos em 2026", file=sys.stderr)

    print("Lendo bens 2026...", file=sys.stderr)
    bens26 = read_brasil_csv(bens26_zip, "bem_candidato_2026")

    print("Lendo candidatos 2022...", file=sys.stderr)
    cand22 = read_brasil_csv(cand22_zip, "consulta_cand_2022")
    print(f"  {len(cand22)} candidatos em 2022", file=sys.stderr)

    print("Lendo bens 2022...", file=sys.stderr)
    bens22 = read_brasil_csv(bens22_zip, "bem_candidato_2022")

    # --- Data de geração (para exibir "dados atualizados em") ---
    dt_geracao = cand26[0]["DT_GERACAO"] if cand26 else None

    # --- Patrimônio 2026 por SQ_CANDIDATO ---
    pat26_by_sq = {}
    n_bens26_by_sq = {}
    for row in bens26:
        sq = row["SQ_CANDIDATO"]
        pat26_by_sq[sq] = pat26_by_sq.get(sq, 0.0) + parse_brl(row["VR_BEM_CANDIDATO"])
        n_bens26_by_sq[sq] = n_bens26_by_sq.get(sq, 0) + 1

    # --- Mapa SQ_CANDIDATO(2022) -> CPF, e conjunto de CPFs que concorreram em 2022 ---
    cpf_by_sq22 = {}
    cpfs_2022 = set()
    for row in cand22:
        cpf = row["NR_CPF_CANDIDATO"]
        cpf_by_sq22[row["SQ_CANDIDATO"]] = cpf
        cpfs_2022.add(cpf)

    # --- Patrimônio 2022 por CPF (soma dos bens do SQ ligado àquele CPF) ---
    pat22_by_cpf = {}
    n_bens22_by_cpf = {}
    for row in bens22:
        sq = row["SQ_CANDIDATO"]
        cpf = cpf_by_sq22.get(sq)
        if cpf is None:
            continue
        v = parse_brl(row["VR_BEM_CANDIDATO"])
        pat22_by_cpf[cpf] = pat22_by_cpf.get(cpf, 0.0) + v
        n_bens22_by_cpf[cpf] = n_bens22_by_cpf.get(cpf, 0) + 1

    # --- Monta a lista final de candidatos 2026 ---
    candidatos = []
    for row in cand26:
        sq = row["SQ_CANDIDATO"]
        cpf = row["NR_CPF_CANDIDATO"]
        concorreu_2022 = cpf in cpfs_2022
        pat2026 = round(pat26_by_sq.get(sq, 0.0), 2)
        pat2022 = round(pat22_by_cpf.get(cpf, 0.0), 2) if concorreu_2022 else 0.0

        candidatos.append({
            "sq": sq,
            "nr": row["NR_CANDIDATO"],
            "nome": row["NM_CANDIDATO"].strip(),
            "urna": row["NM_URNA_CANDIDATO"].strip(),
            "cargo": row["DS_CARGO"].strip(),
            "uf": row["SG_UF"].strip(),
            "partido": row["SG_PARTIDO"].strip(),
            "partidoNome": row["NM_PARTIDO"].strip(),
            "genero": row["DS_GENERO"].strip(),
            "situacao": row["DS_SITUACAO_CANDIDATURA"].strip(),
            "pat2026": pat2026,
            "pat2022": pat2022,
            "nBens2026": n_bens26_by_sq.get(sq, 0),
            "nBens2022": n_bens22_by_cpf.get(cpf, 0) if concorreu_2022 else 0,
            "concorreu2022": concorreu_2022,
        })

    # Ordena por patrimônio 2026 desc como ordem padrão (o front reordena à vontade)
    candidatos.sort(key=lambda c: c["pat2026"], reverse=True)

    # --- Metadados agregados para filtros/estatísticas no front ---
    ufs = sorted({c["uf"] for c in candidatos})
    cargos = [c for c in CARGOS_ORDEM if c in {c2["cargo"] for c2 in candidatos}]
    partidos = sorted({c["partido"] for c in candidatos})

    total_pat_2026 = sum(c["pat2026"] for c in candidatos)
    com_patrimonio = sum(1 for c in candidatos if c["pat2026"] > 0)
    concorreram_2022 = sum(1 for c in candidatos if c["concorreu2022"])

    meta = {
        "geradoEm": dt_geracao,
        "totalCandidatos": len(candidatos),
        "totalPatrimonio2026": round(total_pat_2026, 2),
        "candidatosComPatrimonio": com_patrimonio,
        "candidatosConcorreram2022": concorreram_2022,
        "ufs": ufs,
        "cargos": cargos,
        "partidos": partidos,
        "fonte": "TSE - Portal de Dados Abertos (dadosabertos.tse.jus.br)",
    }

    out = {"meta": meta, "candidatos": candidatos}
    OUT_PATH.parent.mkdir(exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"\nOK: {OUT_PATH} gerado com {len(candidatos)} candidatos ({size_kb:.0f} KB)", file=sys.stderr)
    print(f"  Concorreram também em 2022: {concorreram_2022} ({100*concorreram_2022/len(candidatos):.1f}%)", file=sys.stderr)
    print(f"  Com algum bem declarado em 2026: {com_patrimonio}", file=sys.stderr)


if __name__ == "__main__":
    refresh = "--refresh" in sys.argv
    build(refresh)
