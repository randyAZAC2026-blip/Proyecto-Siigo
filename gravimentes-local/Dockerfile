FROM python:3.13-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Solo código de ejecución: los datos se montan al iniciar el contenedor.
COPY conversor/motor.py conversor/servidor.py conversor/revision.py conversor/facturas.py conversor/importador.py conversor/nomina.py conversor/clasificacion.py ./
COPY conversor/interfaz.html conversor/facturas.js conversor/flujo.js conversor/oficina.js conversor/facturas.css conversor/revision.js ./

RUN mkdir -p /data

EXPOSE 8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/', timeout=3).close()"]

CMD ["python", "servidor.py", "--host", "0.0.0.0", "--puerto", "8765", "--sin-abrir", "--db", "/data/gravimentes.sqlite3"]
