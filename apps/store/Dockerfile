FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY apps/store/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/store/app ./app
COPY fixtures ./fixtures
COPY packages/prompts ./packages/prompts

ENV IDXMACA_FIXTURES_DIR=/app/fixtures/sectors \
    IDXMACA_DATA_DIR=/data \
    IDXMACA_STORE_MODE=fixture

EXPOSE 8787
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8787"]