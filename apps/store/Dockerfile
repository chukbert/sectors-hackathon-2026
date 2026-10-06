FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
# Layout mengikuti repo (config.py mencari REPO_ROOT = parents[3]).
WORKDIR /repo

COPY apps/store/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY apps/store/app ./apps/store/app
COPY fixtures ./fixtures
COPY packages/prompts ./packages/prompts

ENV IDXMACA_DATA_DIR=/data \
    IDXMACA_STORE_MODE=offline

EXPOSE 8787
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8787", "--app-dir", "apps/store"]
