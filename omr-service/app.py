"""Serviço OMR: recebe um PDF/imagem de partitura e devolve MusicXML compactado (.mxl).

POST /convert  (multipart: file)  ->  .mxl
    autorização: header X-Ticket (bilhete de uso único, 5 min, emitido pela função omr-convert do Supabase)
                 ou X-API-Key (uso técnico/ensaio)
GET  /health

Variáveis: OMR_API_KEY, OMR_TICKET_SECRET (o mesmo segredo da função), OMR_ALLOWED_ORIGIN (endereço do site, com https://),
OMR_MAX_MB (30), OMR_TIMEOUT_S (420), OMR_MAX_QUEUE (3 trabalhos esperando).
"""
import base64
import hashlib
import json
import time
import asyncio
import glob
import hmac
import os
import shutil
import subprocess
import tempfile

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

API_KEY = os.environ.get("OMR_API_KEY", "")
TICKET_SECRET = os.environ.get("OMR_TICKET_SECRET", "")
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("OMR_ALLOWED_ORIGIN", "").split(",") if o.strip()]
MAX_QUEUE = int(os.environ.get("OMR_MAX_QUEUE", "3"))
MAX_BYTES = int(os.environ.get("OMR_MAX_MB", "30")) * 1024 * 1024
TIMEOUT_S = int(os.environ.get("OMR_TIMEOUT_S", "420"))
AUDIVERIS = os.environ.get("AUDIVERIS_BIN", "/opt/audiveris/bin/Audiveris")
ALLOWED = {".pdf", ".png", ".jpg", ".jpeg", ".tif", ".tiff"}

app = FastAPI(title="RF OMR", docs_url=None, redoc_url=None)
# o navegador do aluno fala direto com este serviço: só o site autorizado pode chamar
app.add_middleware(CORSMiddleware, allow_origins=ALLOWED_ORIGINS, allow_methods=["POST", "GET", "OPTIONS"],
                   allow_headers=["X-Ticket", "Content-Type"], max_age=600)
_one_at_a_time = asyncio.Semaphore(1)  # o Audiveris é pesado: um trabalho por vez
_waiting = 0                           # trabalhos na fila + em andamento
_used_nonces = {}                      # bilhetes já usados (cada bilhete vale uma vez)


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _ticket_ok(ticket: str) -> bool:
    """Bilhete = base64url(JSON {u: usuário, e: expira (s), n: código único}) + '.' + base64url(HMAC-SHA256 do primeiro trecho)."""
    if not TICKET_SECRET or "." not in ticket:
        return False
    payload_b64, sig_b64 = ticket.split(".", 1)
    expected = hmac.new(TICKET_SECRET.encode(), payload_b64.encode(), hashlib.sha256).digest()
    try:
        if not hmac.compare_digest(_b64d(sig_b64), expected):
            return False
        data = json.loads(_b64d(payload_b64))
    except Exception:
        return False
    now = time.time()
    nonce = data.get("n")
    if data.get("e", 0) < now or not nonce or nonce in _used_nonces:
        return False
    for k, v in list(_used_nonces.items()):
        if v < now:
            _used_nonces.pop(k, None)
    _used_nonces[nonce] = data["e"]
    return True


@app.get("/health")
def health():
    return {"ok": True, "configured": bool(API_KEY)}


@app.post("/convert")
async def convert(file: UploadFile = File(...), x_api_key: str = Header(default=""), x_ticket: str = Header(default="")):
    global _waiting
    if _waiting >= MAX_QUEUE:
        raise HTTPException(status_code=429, detail="O leitor de partituras está ocupado. Tente de novo em instantes.")
    key_ok = bool(API_KEY) and hmac.compare_digest(x_api_key, API_KEY)
    if not key_ok and not _ticket_ok(x_ticket):
        raise HTTPException(status_code=401, detail="Autorização inválida ou expirada. Tente de novo.")
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
        _waiting += 1
        try:
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
        finally:
            _waiting -= 1

        results = sorted(glob.glob(os.path.join(outdir, "**", "*.mxl"), recursive=True))
        if not results:
            # o registro técnico do Audiveris fica só no log do servidor; quem envia vê uma mensagem clara
            print("Audiveris não gerou MusicXML:\n" + log.decode("utf-8", "replace")[-1500:], flush=True)
            raise HTTPException(
                status_code=422,
                detail="Não foi possível reconhecer a partitura. Use um PDF de partitura digital (não foto nem digitalização torta) e tente de novo.",
            )
        return FileResponse(
            results[0], media_type="application/vnd.recordare.musicxml",
            filename="partitura.mxl", background=cleanup,
        )
    except Exception:
        shutil.rmtree(work, ignore_errors=True)
        raise
