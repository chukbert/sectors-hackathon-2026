import os
import sys
import tempfile

os.environ.setdefault("IDXMACA_DATA_DIR", tempfile.mkdtemp(prefix="idxmaca-core-test-"))
os.environ.setdefault("IDXMACA_LLM_MODE", "template")
os.environ.setdefault("IDXMACA_STORE_MODE", "fixture")

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))