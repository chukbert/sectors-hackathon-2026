from app.sectors_client import auth_header


def test_auth_header_raw_key_by_default():
    assert auth_header("", "abc123") == "abc123"
    assert auth_header(None, "abc123") == "abc123"


def test_auth_header_optional_scheme():
    assert auth_header("Bearer", "abc123") == "Bearer abc123"


def test_auth_header_empty_key():
    assert auth_header("Bearer", None) is None
    assert auth_header("Bearer", "") is None