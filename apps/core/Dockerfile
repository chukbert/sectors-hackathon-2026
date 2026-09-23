FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY apps/core/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/core/app ./app
COPY packages/prompts ./packages/prompts

ENV IDXMACA_PROMPTS_DIR=/app/packages/prompts \
    IDXMACA_DATA_DIR=/data \
    IDXMACA_STORE_URL=http://store:8787

EXPOSE 8788
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8788"]