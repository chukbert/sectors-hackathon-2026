FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /repo

COPY apps/core/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY apps/core/app ./apps/core/app

ENV IDXMACA_STORE_URL=http://store:8787

EXPOSE 8788
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8788", "--app-dir", "apps/core"]
