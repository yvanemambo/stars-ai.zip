#!/usr/bin/env python3
"""YvanAI Windows Agent — première version locale, lecture seule.

Cette version recherche des noms de fichiers dans les dossiers personnels autorisés.
Elle ne lit pas le contenu des fichiers, ne les modifie pas et n'exécute aucune commande.
Aucune connexion réseau n'est ouverte.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

VERSION = "0.1.0"
MAX_RESULTS = 100
MAX_VISITED = 100_000
MAX_DEPTH = 12
SKIP_DIRS = {
    "$recycle.bin", "appdata", "node_modules", ".git", ".venv",
    "venv", "windows", "program files", "program files (x86)",
    "programdata", "system volume information"
}


def allowed_roots() -> list[Path]:
    home = Path.home()
    candidates = [
        home / "Desktop",
        home / "Documents",
        home / "Downloads",
        home / "OneDrive" / "Desktop",
        home / "OneDrive" / "Documents",
    ]
    roots: list[Path] = []
    seen: set[str] = set()
    for path in candidates:
        try:
            if path.is_dir():
                resolved = path.resolve()
                key = str(resolved).casefold()
                if key not in seen:
                    roots.append(resolved)
                    seen.add(key)
        except OSError:
            continue
    return roots


def search_names(query: str) -> dict:
    needle = query.strip().casefold()
    if len(needle) < 2:
        raise ValueError("Entre au moins 2 caractères pour rechercher un fichier.")

    roots = allowed_roots()
    results: list[dict] = []
    visited = 0
    skipped = 0
    started = time.monotonic()

    for root in roots:
        for current, dirs, files in os.walk(root, topdown=True, followlinks=False):
            current_path = Path(current)
            try:
                depth = len(current_path.relative_to(root).parts)
            except ValueError:
                dirs[:] = []
                continue
            if depth >= MAX_DEPTH:
                dirs[:] = []
            else:
                dirs[:] = [
                    d for d in dirs
                    if d.casefold() not in SKIP_DIRS
                    and not d.startswith(".")
                    and not (current_path / d).is_symlink()
                ]

            for filename in files:
                visited += 1
                if visited > MAX_VISITED:
                    return {
                        "ok": True, "query": query, "results": results,
                        "truncated": True, "visited": MAX_VISITED,
                        "roots": [str(p) for p in roots],
                        "elapsed_seconds": round(time.monotonic() - started, 2),
                    }
                if needle in filename.casefold():
                    candidate = current_path / filename
                    try:
                        if candidate.is_symlink() or not candidate.is_file():
                            skipped += 1
                            continue
                        stat = candidate.stat()
                        results.append({
                            "name": filename,
                            "path": str(candidate),
                            "size_bytes": stat.st_size,
                            "modified": time.strftime("%Y-%m-%d %H:%M", time.localtime(stat.st_mtime)),
                        })
                    except OSError:
                        skipped += 1
                    if len(results) >= MAX_RESULTS:
                        return {
                            "ok": True, "query": query, "results": results,
                            "truncated": True, "visited": visited,
                            "roots": [str(p) for p in roots],
                            "elapsed_seconds": round(time.monotonic() - started, 2),
                        }

    return {
        "ok": True, "query": query, "results": results,
        "truncated": False, "visited": visited, "skipped": skipped,
        "roots": [str(p) for p in roots],
        "elapsed_seconds": round(time.monotonic() - started, 2),
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Recherche locale et sécurisée de fichiers pour YvanAI."
    )
    parser.add_argument("query", nargs="?", help="Une partie du nom du fichier à retrouver")
    parser.add_argument("--json", action="store_true", help="Afficher le résultat au format JSON")
    parser.add_argument("--roots", action="store_true", help="Afficher les dossiers qui seront recherchés")
    parser.add_argument("--version", action="version", version=f"YvanAI Windows Agent {VERSION}")
    args = parser.parse_args()

    roots = allowed_roots()
    if args.roots:
        print("\n".join(str(p) for p in roots) if roots else "Aucun dossier personnel accessible.")
        return 0
    if not args.query:
        parser.error("Indique le nom ou une partie du nom du fichier.")
    try:
        data = search_names(args.query)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))
        return 0

    print(f'Recherche : "{data["query"]}"')
    print("Dossiers analysés :")
    for root in data["roots"]:
        print(f"  • {root}")
    print(f'\n{len(data["results"])} résultat(s) — {data["visited"]} fichier(s) examinés.')
    for item in data["results"]:
        print(f'\n{item["name"]}\n  {item["path"]}\n  Modifié : {item["modified"]} — {item["size_bytes"]} octets')
    if not data["results"]:
        print("Aucun fichier correspondant trouvé dans les dossiers analysés.")
    if data["truncated"]:
        print("\nRecherche limitée pour protéger les performances. Affichage partiel.")
    print(f'Temps : {data["elapsed_seconds"]} s')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
