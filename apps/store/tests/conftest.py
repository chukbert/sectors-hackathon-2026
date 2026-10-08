import os
import tempfile

os.environ.setdefault("IDXMACA_STORE_MODE", "offline")
os.environ.setdefault("IDXMACA_DATA_DIR", tempfile.mkdtemp(prefix="paham-store-test-"))
