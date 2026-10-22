# Serviço de reconhecimento de partitura (OMR): PDF/imagem -> MusicXML, usando o Audiveris (AGPL-3.0, usado como ferramenta
# de linha de comando, sem modificações). Roda no seu VPS (Easypanel) e é chamado pela plataforma.
FROM --platform=linux/amd64 ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates wget python3 python3-venv python3-pip \
        tesseract-ocr tesseract-ocr-eng tesseract-ocr-por \
        libfreetype6 fontconfig xdg-utils desktop-file-utils shared-mime-info \
        libgtk-3-0t64 libxtst6 libxi6 libxrender1 libxext6 libx11-6 xvfb && \
    rm -rf /var/lib/apt/lists/*

ARG AUDIVERIS_VERSION=5.11.0
RUN wget -q -O /tmp/audiveris.deb \
        "https://github.com/Audiveris/audiveris/releases/download/${AUDIVERIS_VERSION}/Audiveris-${AUDIVERIS_VERSION}-ubuntu24.04-x86_64.deb" && \
    dpkg -x /tmp/audiveris.deb / && rm -f /tmp/audiveris.deb && \
    ls /opt/audiveris/bin

ENV JAVA_TOOL_OPTIONS="-Djava.awt.headless=true"
ENV TESSDATA_PREFIX=/usr/share/tesseract-ocr/5/tessdata
WORKDIR /app
COPY requirements.txt .
RUN python3 -m venv /venv && /venv/bin/pip install --no-cache-dir -r requirements.txt
COPY app.py .
EXPOSE 8080
CMD ["/venv/bin/uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
