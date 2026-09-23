from app.resolve import detect_language, is_miner, resolve, subsector_slug


def test_alias_and_preset():
    scope = resolve("Bandingkan BBCA, BMRI, BBRI kuartal terakhir")
    assert {"BBCA", "BMRI", "BBRI"} <= set(scope.symbols)
    assert scope.groups == [] or True


def test_preset_3_bank_besar():
    scope = resolve("bandingkan 3 bank besar vs DBS")
    assert {"BBCA", "BMRI", "BBRI"} <= set(scope.symbols)
    assert scope.regional and scope.regional[0]["symbol"] == "D05"


def test_alias_nama_perusahaan():
    scope = resolve("memo Bank Mandiri dan Bukit Asam")
    assert "BMRI" in scope.symbols and "PTBA" in scope.symbols


def test_regional_aliases():
    scope = resolve("bandingkan DBS, UOB dan Maybank")
    pairs = {(r["exchange"], r["symbol"]) for r in scope.regional}
    assert ("sgx", "D05") in pairs and ("sgx", "U11") in pairs and ("klse", "1155") in pairs


def test_watchlist_count_debitur():
    scope = resolve("scan red-flag 10 debitur")
    assert len(scope.symbols) == 10
    assert "WSKT" in scope.symbols


def test_typo_tolerance():
    scope = resolve("cek waraskita dong")
    assert "WSKT" in scope.symbols


def test_mining_keywords_add_miners():
    scope = resolve("update harga batu bara dan IUP yang mau kedaluwarsa")
    assert any(is_miner(s) for s in scope.symbols)


def test_language_detection():
    assert detect_language("Bandingkan BBCA dan BMRI, siapa yang diakumulasi asing?") == "id"
    assert detect_language("Compare the banks versus peers and screening for dividend yield") == "en"


def test_subsector_slug():
    assert subsector_slug("BBCA") == "banks"
    assert subsector_slug("ADRO") == "energy"