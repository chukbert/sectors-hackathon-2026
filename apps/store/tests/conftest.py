import os
import tempfile

os.environ.setdefault("IDXMACA_STORE_MODE", "fixture")
os.environ.setdefault("IDXMACA_DATA_DIR", tempfile.mkdtemp(prefix="idxmaca-test-"))
os.environ.setdefault("IDXMACA_LLM_MODE", "template")