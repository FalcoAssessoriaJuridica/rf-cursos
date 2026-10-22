"""Serviço OMR: recebe um PDF/imagem de partitura e devolve MusicXML compactado (.mxl).

POST /convert  (multipart: file)  header X-API-Key  ->  .mxl
GET  /health
"""
import asyncio
import glob
import hmac
import os
import shutil
import subprocess
import tempfile

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

API_KEY = os.environ.get("OMR_API_KEY", "")
MAX_BYTES = int(os.environ.get("OMR_MAX_MB", "30")) * 1024 * 1024
TIMEOUT_S = int(os.environ.get("OMR_TIMEOUT_S", "420"))
AUDIVERIS = os.environ.get("AUDIVERIS_BIN", "/opt/audiveris/bin/Audiveris")
ALLOWED = {".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff"}

app = FastAPI(title="RF OMR", docs_url=None, redoc_url=None)
_one_at_a_time = asyncio.Semaphore(1)  # o Audiveris é pesado: um trabalho por vez


@app.get("/health")
def health():
    return {"ok": True, "configured": bool(API_KEY)}


@app.post("/convert")
async def convert(file: UploadFile = File(...), x_api_key: str = Header(default="")):
    if not API_KEY or not hmac.compare_digest(x_api_key, API_KEY):
        raise HTTPException(status_code=401, detail="Chave inválida.")
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED:
        raise HTTPException(status_code=415, detail="Envie um PDF ou uma imagem (PNG/JPG/TIFF).")

    work = tempfile.mkdtemp(prefix="omr_")
    cleanup = BackgroundTask(shutil.rmtree, work, ignore_errors=True)
    try:
        src = os.path.join(work, "input" + ext)
        size = 0
        with open(src, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(status_code=413, detail="Arquivo grande demais.")
                out.write(chunk)

        outdir = os.path.join(work, "out")
        os.makedirs(outdir)
        async with _one_at_a_time:
            proc = await asyncio.create_subprocess_exec(
                AUDIVERIS, "-batch", "-transcribe", "-export", "-output", outdir, "--", src,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
            )
            try:
                log, _ = await asyncio.wait_for(proc.communicate(), timeout=TIMEOUT_S)
            except asyncio.TimeoutError:
                proc.kill()
                raise HTTPException(status_code=504, detail="O reconhecimento demorou demais.")

        results = sorted(glob.glob(os.path.join(outdir, "**", "*.mxl"), recursive=True))
        if not results:
            tail = log.decode("utf-8", "replace")[-600:]
            raise HTTPException(status_code=422, detail="Não foi possível reconhecer a partitura. " + tail)
        return FileResponse(
            results[0], media_type="application/vnd.recordare.musicxml",
            filename="partitura.mxl", background=cleanup,
        )
    except Exception:
        shutil.rmtree(work, ignore_errors=True)
        raise
