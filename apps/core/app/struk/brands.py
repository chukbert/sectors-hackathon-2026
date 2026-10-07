"""Katalog kurasi merek sehari-hari → emiten IDX, hanya untuk tampilan.

Input aplikasi adalah kode saham. Katalog ini cuma menambahkan chip "merek yang kamu kenal" di kepala
kartu (ICBP → Indomie, Chitato, …) supaya pengguna langsung menangkap bisnis perusahaannya. Ini
satu-satunya pengetahuan non-Sectors di aplikasi; semua angka, pemilik, dan segmen hanya dari Sectors.

relation:
  direct   — merek milik emiten atau anak usaha yang dikonsolidasi
  indirect — emiten hanya pemegang saham minoritas pemilik merek (tidak ditampilkan sebagai merek emiten)
"""
from __future__ import annotations

# symbol: (relation, [merek...], catatan opsional)
CATALOG: dict[str, tuple[str, list[str], str | None]] = {
    "ICBP": ("direct", ["Indomie", "Supermi", "Sarimi", "Pop Mie", "Sakura", "Chitato", "Qtela", "JetZ",
                        "Indomilk", "Cap Enaak", "Kremer", "Indofood Kecap", "Indofood Sambal", "Promina",
                        "SUN bubur bayi", "Club air mineral", "Ichi Ocha", "Milkuat"], None),
    "INDF": ("direct", ["Bimoli", "Bogasari", "Segitiga Biru", "Cakra Kembar", "Kunci Biru", "Indofood"], None),
    "UNVR": ("direct", ["Pepsodent", "Close Up", "Lifebuoy", "Lux", "Dove", "Sunsilk", "Clear", "Rexona",
                        "Citra", "Pond's", "Vaseline", "Glow & Lovely", "Rinso", "Molto", "Sunlight", "Wipol",
                        "Vixal", "Super Pell", "Royco", "Bango"], None),
    "MYOR": ("direct", ["Kopiko", "Torabika", "Le Minerale", "Teh Pucuk Harum", "Roma Kelapa", "Roma Malkist",
                        "Energen", "Beng-Beng", "Choki-Choki", "Slai O'lai", "Astor", "Danisa", "Better",
                        "Kopiko 78"], None),
    "AMRT": ("direct", ["Alfamart", "Alfagift", "Dan+Dan"], None),
    "MIDI": ("direct", ["Alfamidi", "Lawson"], None),
    "DNET": ("indirect", ["Indomaret"], "Indomaret bukan perusahaan terbuka; DNET memegang sebagian saham pengelolanya."),
    "HERO": ("direct", ["Guardian", "IKEA"], None),
    "MPPA": ("direct", ["Hypermart", "Foodmart"], None),
    "LPPF": ("direct", ["Matahari Department Store"], None),
    "RALS": ("direct", ["Ramayana"], None),
    "ERAA": ("direct", ["Erafone", "iBox"], None),
    "MAPI": ("direct", ["Zara", "SOGO", "Starbucks"], "Starbucks Indonesia dikelola anak usaha MAPI (MAP Boga)."),
    "MAPA": ("direct", ["Sports Station", "Converse", "Skechers"], None),
    "ACES": ("direct", ["AZKO", "Ace Hardware"], None),
    "TLKM": ("direct", ["Telkomsel", "IndiHome", "simPATI", "by.U", "Kartu Halo", "Telkom"], None),
    "ISAT": ("direct", ["Indosat", "IM3", "Tri", "3 (Three)"], None),
    "EXCL": ("direct", ["XL", "AXIS", "Smartfren", "XLSmart"], None),
    "BBRI": ("direct", ["BRI", "BRImo"], None),
    "BBCA": ("direct", ["BCA", "myBCA", "BCA Mobile", "Flazz"], None),
    "BMRI": ("direct", ["Bank Mandiri", "Livin'", "e-money Mandiri"], None),
    "BBNI": ("direct", ["BNI", "wondr"], None),
    "BRIS": ("direct", ["BSI", "Bank Syariah Indonesia", "BYOND"], None),
    "GOTO": ("direct", ["Gojek", "GoPay", "GoFood", "GoRide", "GoSend"], None),
    "BUKA": ("direct", ["Bukalapak"], None),
    "KLBF": ("direct", ["Promag", "Mixagrip", "Hydro Coco", "Prenagen", "Fatigon", "Extra Joss", "Komix",
                        "Entrostop", "Woods", "Diabetasol", "Zee"], None),
    "SIDO": ("direct", ["Tolak Angin", "Tolak Linu", "Kuku Bima Ener-G", "Alang Sari"], None),
    "ULTJ": ("direct", ["Ultra Milk", "Teh Kotak", "Sari Kacang Ijo", "Ultra Mimi"], None),
    "CMRY": ("direct", ["Cimory", "Kanzler"], None),
    "GOOD": ("direct", ["Garuda Kacang", "Gery", "Chocolatos", "Clevo", "Leo"], None),
    "CPIN": ("direct", ["Fiesta", "Champ", "Okey nugget", "Golden Fiesta"], None),
    "JPFA": ("direct", ["So Good", "Best Chicken"], None),
    "HMSP": ("direct", ["Sampoerna A Mild", "Dji Sam Soe", "Marlboro", "U Mild"], None),
    "GGRM": ("direct", ["Gudang Garam", "Surya", "GG Mild"], None),
    "WIIM": ("direct", ["Wismilak"], None),
    "CLEO": ("direct", ["Cleo"], None),
    "ROTI": ("direct", ["Sari Roti"], None),
    "MLBI": ("direct", ["Bir Bintang", "Bintang Zero"], None),
    "TCID": ("direct", ["Gatsby", "Pixy", "Pucelle"], None),
    "FAST": ("direct", ["KFC"], None),
    "PZZA": ("direct", ["Pizza Hut"], None),
    "ASII": ("direct", ["Honda (sepeda motor)", "Toyota", "Daihatsu", "FIFGROUP", "Astra"], None),
    "AUTO": ("direct", ["Aspira"], None),
    "SMGR": ("direct", ["Semen Gresik", "Semen Padang", "Dynamix"], None),
    "INTP": ("direct", ["Semen Tiga Roda"], None),
    "AVIA": ("direct", ["Avian", "No Drop"], None),
    "JSMR": ("direct", ["Jasa Marga", "jalan tol"], None),
    "GIAA": ("direct", ["Garuda Indonesia", "Citilink"], None),
    "BIRD": ("direct", ["Blue Bird", "Golden Bird"], None),
    "PGAS": ("direct", ["PGN", "gas PGN"], None),
    "KAEF": ("direct", ["Kimia Farma", "Apotek Kimia Farma"], None),
    "SILO": ("direct", ["Siloam"], None),
    "MIKA": ("direct", ["Mitra Keluarga"], None),
    "HEAL": ("direct", ["Hermina"], None),
    "SCMA": ("direct", ["SCTV", "Indosiar", "Vidio"], None),
    "MNCN": ("direct", ["RCTI", "MNCTV", "GTV"], None),
    "BELI": ("direct", ["Blibli", "tiket.com"], None),
    # --- perluasan Okt 2026: apotek, perawatan diri, makanan ringan, hiburan, ritel, bank
    "TSPC": ("direct", ["Bodrex", "Bodrexin", "Hemaviton", "Marina", "My Baby", "Vidoran", "Neo Rheumacyl",
                        "Contrexyn", "Tempo Scan"], None),
    "DVLA": ("direct", ["Natur-E", "Enervon-C", "Darya-Varia"], None),
    "SOHO": ("direct", ["Imboost", "Curcuma Plus", "Diapet"], None),
    "MBTO": ("direct", ["Sariayu", "Martina Berto"], None),
    "MRAT": ("direct", ["Mustika Ratu"], None),
    "KINO": ("direct", ["Ellips", "Sleek Baby", "Eskulin", "Resik-V", "Bellagio"], None),
    "UCID": ("direct", ["MamyPoko", "Charm", "Lifree", "Uni-Charm"], None),
    "SKLT": ("direct", ["Finna", "Krupuk Finna", "Sekar Laut"], None),
    "STTP": ("direct", ["Go Potato", "Twistko", "French Fries 2000", "Mie Gemez", "Siantar Top"], None),
    "CAMP": ("direct", ["Campina"], None),
    "HOKI": ("direct", ["Topi Koki"], None),
    "DLTA": ("direct", ["Anker Bir", "Anker Stout", "Delta Djakarta"], None),
    "BLTZ": ("direct", ["CGV", "CGV Cinemas"], None),
    "CNMA": ("direct", ["Cinema XXI", "XXI", "M.tix"], None),
    "MAPB": ("direct", ["Krispy Kreme", "Pizza Marzano", "Cold Stone", "Genki Sushi"], None),
    "RANC": ("direct", ["Ranch Market", "Farmers Market"], None),
    "ECII": ("direct", ["Electronic City"], None),
    "CSAP": ("direct", ["Mitra10"], None),
    "LINK": ("direct", ["First Media"], None),
    "BBTN": ("direct", ["BTN", "Bank BTN"], None),
    "BNGA": ("direct", ["CIMB Niaga", "OCTO Mobile"], None),
    "BDMN": ("direct", ["Danamon", "D-Bank"], None),
    "NISP": ("direct", ["OCBC", "OCBC NISP", "Nyala"], None),
    "ARTO": ("direct", ["Bank Jago"], None),
    "BNLI": ("direct", ["PermataBank", "Permata"], None),
    "BJBR": ("direct", ["bank bjb", "bjb"], None),
    "MEGA": ("direct", ["Bank Mega"], None),
    "BTPN": ("direct", ["Jenius", "SMBC Indonesia"], None),
    "PNBN": ("direct", ["Panin Bank", "Bank Panin"], None),
}


def catalog_symbols() -> list[str]:
    return sorted(CATALOG)


def brands_of(symbol: str) -> list[str]:
    entry = CATALOG.get(symbol.upper())
    return list(entry[1]) if entry and entry[0] == "direct" else []
