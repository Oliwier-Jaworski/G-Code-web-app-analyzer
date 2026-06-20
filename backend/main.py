"""FastAPI app for G-code analysis.

Serves the static frontend from ../frontend at /, and exposes
POST /api/analyze for uploading a .gcode file.

Run:
    uvicorn main:app --reload
"""

from __future__ import annotations

import io
import os
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from parser import analyze

ALLOWED_EXTS = {".gcode", ".gco", ".g"}
MAX_BYTES = 200 * 1024 * 1024  # 200 MB hard cap
CHUNK = 1024 * 1024  # 1 MiB read chunks

app = FastAPI(title="G-code Analyzer", version="1.0.0")


@app.post("/api/analyze")
async def analyze_endpoint(file: UploadFile = File(...)) -> JSONResponse:
    filename = file.filename or ""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Nieobsługiwane rozszerzenie '{ext}'. Dozwolone: {sorted(ALLOWED_EXTS)}",
        )

    # Stream into an in-memory buffer with a size cap.
    buf = bytearray()
    total = 0
    while True:
        chunk = await file.read(CHUNK)
        if not chunk:
            break
        total += len(chunk)
        if total > MAX_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Plik przekracza limit {MAX_BYTES // (1024 * 1024)} MB.",
            )
        buf.extend(chunk)

    if total == 0:
        raise HTTPException(status_code=400, detail="Plik jest pusty.")

    # Decode tolerantly; G-code is ASCII in practice.
    text_stream = io.TextIOWrapper(
        io.BytesIO(bytes(buf)),
        encoding="utf-8",
        errors="ignore",
        newline="",
    )

    try:
        result = analyze(text_stream)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=422, detail=f"Błąd parsowania: {exc}"
        ) from exc

    result["filename"] = filename
    result["fileSizeBytes"] = total
    return JSONResponse(result)


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok"}


# Mount static frontend. Must be last so /api/* routes still match.
_FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if _FRONTEND_DIR.is_dir():
    app.mount(
        "/",
        StaticFiles(directory=str(_FRONTEND_DIR), html=True),
        name="frontend",
    )
