SHELL := /bin/bash
PY    := .venv/bin/python
PIP   := uv pip install

.PHONY: setup fixtures serve web dev stop test test-store test-core eval build docker clean help

help:
	@echo "IDXMACA — targets:"
	@echo "  make setup      venv + deps Python & Node"
	@echo "  make fixtures   regenerate fixtures/sectors (deterministik)"
	@echo "  make serve      Store(8787) + Core(8788) + Web(3000, build+start)"
	@echo "  make dev        Store + Core + Web (next dev)"
	@echo "  make stop       matikan semua layanan"
	@echo "  make test       unit test Store + Core"
	@echo "  make eval       20 pertanyaan baku (butuh store+core jalan)"
	@echo "  make build      build production web"
	@echo "  make docker     docker compose up --build"

setup:
	uv venv .venv --python 3.12
	$(PIP) -r apps/store/requirements.txt
	$(PIP) -r apps/core/requirements.txt
	$(PIP) pytest pytest-asyncio
	cd apps/web && npm install

fixtures:
	python3 tools/gen_fixtures.py

serve: 
	tools/serve.sh
	tools/web.sh start

dev:
	tools/serve.sh
	tools/web.sh dev

stop:
	tools/serve.sh stop || true
	tools/web.sh stop || true

test: test-store test-core

test-store:
	cd apps/store && ../../$(PY) -m pytest -q

test-core:
	cd apps/core && ../../$(PY) -m pytest -q

eval:
	$(PY) packages/evals/run_evals.py

build:
	tools/web.sh build

docker:
	docker compose up --build

clean:
	rm -rf .data .logs apps/web/.next
	find apps -name "__pycache__" -type d -prune -exec rm -rf {} +