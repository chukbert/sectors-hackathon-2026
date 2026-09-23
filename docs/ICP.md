# ICP (Ideal Customer Profile): Pekerjaan yang Membutuhkan Data Sectors Financial API

Sumber: https://docs.sectors.app/ (Sectors Financial API v2, oleh Supertype)

## Ringkasan Data yang Tersedia di Sectors

| Domain | Contoh Endpoint |
|---|---|
| **Screener & Fundamental (IDX)** | Companies Screener (SQL-like dan natural language), Free Float, Company Report, Quarterly Financials, Revenue & Cost Segments, Subsector Report |
| **Harga & Transaksi** | Daily Transaction, Daily Full-Universe Close, Index Daily, IDX Market Cap, Top Movers, Most Traded, IPO Listing Performance |
| **Broker & Foreign Flow** | Broker Activity by Code/Symbol, Top Buyers/Sellers, Top Accumulation/Distribution, Broker Registry, Top Brokers Ranking, Net Foreign Inflow |
| **Corporate Event & Berita** | Corporate Actions (per saham dan kalender), Shareholders Composition, Insider Filings, Stock Suspensions, News (IDX dan tambang) |
| **Regional** | SGX (screener, report, buyback, short sell, insider filings, news), KLSE (companies, report, top companies) |
| **Pertambangan & Komoditas** | Mining Companies (detail, financials, ownership, performance), Mining Sites, Produksi Nasional, Resources & Reserves per provinsi, Harga Komoditas, Tujuan Ekspor, Sales Destination, Kontrak Tambang, IUP/IUPK, Lelang WIUP |
| **Integrasi AI & Tools** | MCP Server, Agent Skill, OAuth ke Claude/ChatGPT, n8n, Excel Power Query, Google Sheets, Looker Studio, Postman |

---

## A. Riset Investasi & Manajemen Aset (Core ICP)

### 1. Equity Research Analyst (Sell-side)
- **Job desc:** Menulis riset saham (initiation, earnings review, sector outlook), membangun model valuasi (DCF, P/E, P/BV, EV/EBITDA), memberi rekomendasi Buy/Hold/Sell dan target harga untuk klien institusi dan ritel.
- **Data Sectors yang dipakai:** Company Report, Quarterly Financials, Revenue Segments, Subsector Report, Screener, Corporate Actions, Shareholders, News.
- **Tempat bekerja:** Perusahaan sekuritas / broker. Contoh: Mandiri Sekuritas, BRI Danareksa Sekuritas, BCA Sekuritas, Mirae Asset Sekuritas Indonesia, Indo Premier Sekuritas, Trimegah Sekuritas, Samuel Sekuritas, CGS International Sekuritas Indonesia, Maybank Sekuritas, Kiwoom Sekuritas, Stockbit Sekuritas.

### 2. Buy-side Analyst / Investment Analyst
- **Job desc:** Mencari ide investasi, menyaring saham, melakukan due diligence fundamental, dan menyusun rekomendasi untuk portofolio internal (reksa dana, dana pensiun, dana asuransi).
- **Data Sectors yang dipakai:** Screener (filter P/E, ROE, dividend yield, market cap), Company Report, Quarterly Financials, Free Float (cek likuiditas dan kelayakan masuk indeks), Foreign Flow.
- **Tempat bekerja:** Manajer Investasi, asuransi, dana pensiun, family office. Contoh: Schroders Indonesia, Manulife Aset Manajemen Indonesia, Mandiri Manajemen Investasi, Batavia Prosperindo AM, Eastspring Investments Indonesia, Ashmore AM Indonesia, Sucorinvest AM, BNI Asset Management, Prudential Indonesia, Allianz Life, BPJS Ketenagakerjaan, Taspen.

### 3. Portfolio Manager / Fund Manager
- **Job desc:** Mengambil keputusan alokasi aset dan pemilihan saham, mengelola risiko portofolio, melakukan rebalancing, dan mengukur kinerja terhadap benchmark (IHSG, LQ45, IDX30).
- **Data Sectors yang dipakai:** Index Daily, Daily Full-Universe Close, IDX Market Cap, Corporate Actions Calendar (dividen, stock split, rights issue), Foreign Flow, Top Movers.
- **Tempat bekerja:** Manajer Investasi, divisi treasury/investasi bank dan asuransi, sovereign wealth fund, family office. Contoh: seluruh MI di atas, Indonesia Investment Authority (INA), Danantara, Saratoga Investama.

### 4. Quantitative Analyst / Quant Researcher
- **Job desc:** Membangun model kuantitatif (factor model, momentum, mean reversion, portfolio optimization, deteksi anomali), melakukan backtest, dan mengotomasi strategi trading berbasis data.
- **Data Sectors yang dipakai:** Daily Full-Universe Close, Daily Transaction (bulk historis), Broker Activity, Foreign Flow, Quarterly Financials (factor fundamental). Recipes terkait: Portfolio Optimization, GNN Anomaly Detection, Simple Moving Average, EDA + ML Prediction.
- **Tempat bekerja:** Quant fund, proprietary trading desk sekuritas, manajer investasi dengan tim quant, hedge fund regional yang berinvestasi di ASEAN, fintech investasi.

### 5. Equity Trader / Dealer / Proprietary Trader
- **Job desc:** Mengeksekusi transaksi saham untuk klien atau modal sendiri (prop), membaca pergerakan pasar harian, bandarmologi (analisis arus broker), dan momentum.
- **Data Sectors yang dipakai:** Broker Activity per Symbol/Code, Top Buyers/Sellers, Top Accumulation/Distribution, Broker Registry (asing/domestik, ritel/institusi), Foreign Flow, Most Traded, Top Movers, Stock Suspensions.
- **Tempat bekerja:** Dealing room sekuritas, prop desk, trader profesional independen.

### 6. Institutional Equity Sales / Sales Trader
- **Job desc:** Menjual ide riset dan layanan eksekusi ke klien institusi domestik maupun asing, menyampaikan market color harian (siapa yang beli/jual, arus asing).
- **Data Sectors yang dipakai:** Foreign Flow (per saham dan seluruh pasar), Top Brokers Daily Ranking, Broker Summary, News, Corporate Actions Calendar.
- **Tempat bekerja:** Sekuritas lokal dan asing. Contoh: Mandiri Sekuritas, UBS Sekuritas Indonesia, Macquarie Sekuritas Indonesia, CLSA Sekuritas Indonesia, Verdhana Sekuritas.

### 7. Wealth Manager / Financial Planner / Relationship Manager (Priority Banking)
- **Job desc:** Memberi nasihat investasi ke nasabah high-net-worth, menyusun rekomendasi portofolio saham dan reksa dana, menjelaskan kondisi pasar ke nasabah.
- **Data Sectors yang dipakai:** Company Report ringkas, Top Companies Ranked (dividend yield), Corporate Actions (jadwal dividen), News, Top Movers.
- **Tempat bekerja:** Priority/private banking. Contoh: BCA Prioritas, Mandiri Prioritas, BNI Emerald, CIMB Niaga Preferred, DBS Treasures, UOB Privilege; perencana keuangan independen.

---

## B. Investment Banking, Korporasi & Advisory

### 8. Investment Banking Analyst / Associate (ECM & M&A)
- **Job desc:** Menyiapkan pitch book, comparable company analysis (trading comps), valuasi IPO, rights issue, dan M&A; memantau kinerja IPO pasca-listing.
- **Data Sectors yang dipakai:** Screener (peer set per subsector), Company Report (valuasi dan multiples), IPO Listing Performance, Shareholders Composition, Corporate Actions, Free Float.
- **Tempat bekerja:** Divisi IB/underwriter sekuritas. Contoh: Mandiri Sekuritas, BRI Danareksa, Indo Premier, Trimegah, Verdhana, CGS International, Sucor Sekuritas.

### 9. Valuation Analyst / Deal Advisory Consultant
- **Job desc:** Menyusun laporan penilaian bisnis dan fairness opinion (wajib untuk transaksi material/afiliasi sesuai aturan OJK), purchase price allocation, dan impairment test.
- **Data Sectors yang dipakai:** Comparable multiples dari Screener dan Company Report, Subsector Report, Quarterly Financials.
- **Tempat bekerja:** KJPP (Kantor Jasa Penilai Publik), divisi Deal Advisory Big 4 Indonesia (EY/Purwantono Sungkoro & Surja, PwC/Tanudiredja Wibisana Rintis, Deloitte/Imelda & Rekan, KPMG/Siddharta Widjaja), boutique advisory.

### 10. Private Equity / Venture Capital Analyst
- **Job desc:** Mengevaluasi target investasi, membandingkan valuasi dengan perusahaan publik sejenis, merancang strategi exit via IPO.
- **Data Sectors yang dipakai:** Screener dan Subsector Report (public comps), IPO Listing Performance (acuan exit), Revenue Segments.
- **Tempat bekerja:** Northstar Group, Saratoga Investama, Provident Growth, East Ventures, Openspace, Alpha JWC, MDI Ventures, BRI Ventures, Mandiri Capital Indonesia.

### 11. Corporate Development / M&A / Strategy Analyst
- **Job desc:** Menganalisis kompetitor dan target akuisisi, memetakan struktur industri, dan menyusun rekomendasi strategis untuk manajemen.
- **Data Sectors yang dipakai:** Subsector Report, Revenue Segments, Shareholders Composition, Mining Company Ownership (struktur grup), Company Report.
- **Tempat bekerja:** Konglomerasi dan emiten besar. Contoh: Astra International, Sinar Mas, Djarum Group, Salim Group, Lippo Group, MNC Group, Telkom Indonesia, holding BUMN (MIND ID, Pertamina).

### 12. Investor Relations Officer / Corporate Secretary
- **Job desc:** Mengelola komunikasi dengan investor dan analis, memantau komposisi pemegang saham, membandingkan kinerja dan valuasi perusahaan dengan peer, memastikan keterbukaan informasi.
- **Data Sectors yang dipakai:** Shareholders Composition, Insider Filings, Foreign Flow atas saham sendiri, Broker Summary (siapa yang akumulasi), Company Report peer, News.
- **Tempat bekerja:** Seluruh emiten di BEI (900+ perusahaan tercatat), emiten di SGX dan Bursa Malaysia.

### 13. FP&A / Corporate Finance Analyst
- **Job desc:** Menyusun budgeting, forecasting, dan benchmarking kinerja keuangan perusahaan terhadap kompetitor yang tercatat di bursa.
- **Data Sectors yang dipakai:** Quarterly Financials peer, Subsector Report, Revenue Segments.
- **Tempat bekerja:** Divisi keuangan emiten dan perusahaan besar non-listed yang bersaing dengan emiten.

### 14. Management / Strategy Consultant
- **Job desc:** Membuat industry deep-dive, market sizing, benchmarking, dan rekomendasi transformasi untuk klien korporasi dan pemerintah.
- **Data Sectors yang dipakai:** Subsector Report, Screener, Revenue Segments, data produksi dan cadangan komoditas.
- **Tempat bekerja:** McKinsey, BCG, Bain, Kearney, Oliver Wyman, divisi Consulting Big 4, konsultan lokal.

---

## C. Kredit, Risiko & Kepatuhan

### 15. Credit Analyst (Corporate Banking)
- **Job desc:** Menilai kelayakan kredit korporasi, menganalisis rasio leverage, likuiditas, dan arus kas debitur yang tercatat di bursa, serta memantau early warning signal.
- **Data Sectors yang dipakai:** Quarterly Financials, Company Report (bagian financials), News, Stock Suspensions (sinyal distress), Insider Filings.
- **Tempat bekerja:** Divisi corporate/commercial banking. Contoh: BCA, Bank Mandiri, BRI, BNI, CIMB Niaga, Bank Danamon, Permata Bank, OCBC Indonesia; perusahaan multifinance dan leasing.

### 16. Fixed Income / Bond Credit Analyst
- **Job desc:** Menganalisis penerbit obligasi korporasi dan sukuk, menilai risiko gagal bayar dari fundamental emiten.
- **Data Sectors yang dipakai:** Quarterly Financials, Company Report, Subsector Report, Corporate Actions.
- **Tempat bekerja:** Manajer investasi pendapatan tetap, treasury bank, asuransi; lembaga pemeringkat seperti Pefindo, Fitch Ratings Indonesia, Kredit Rating Indonesia (KRI).

### 17. Risk Manager / Market Risk Analyst
- **Job desc:** Mengukur eksposur risiko pasar (VaR, konsentrasi, likuiditas) atas portofolio saham, melakukan stress testing.
- **Data Sectors yang dipakai:** Daily Full-Universe Close, Index Daily, Free Float, Most Traded (likuiditas), IDX Market Cap.
- **Tempat bekerja:** Bank, asuransi, dana pensiun, manajer investasi, sekuritas (divisi risk management).

### 18. Compliance Officer / Market Surveillance Analyst
- **Job desc:** Mendeteksi indikasi insider trading, manipulasi harga (pump and dump, goreng saham), dan transaksi tidak wajar; memastikan kepatuhan pada peraturan pasar modal.
- **Data Sectors yang dipakai:** Insider Filings, Broker Activity (konsentrasi broker), Stock Suspensions, Top Movers, Shareholders. Recipe terkait: GNN Anomaly Detection dengan konfirmasi dari broker flow dan foreign flow.
- **Tempat bekerja:** Regulator dan SRO: OJK, Bursa Efek Indonesia (Divisi Pengawasan Transaksi), KSEI, KPEI; divisi compliance sekuritas dan manajer investasi.

### 19. Forensic Accountant / Auditor
- **Job desc:** Menginvestigasi kejanggalan laporan keuangan dan transaksi pihak berelasi, mendukung audit emiten.
- **Data Sectors yang dipakai:** Quarterly Financials (analisis tren dan anomali), Shareholders Composition, Mining Company Ownership, Insider Filings.
- **Tempat bekerja:** KAP Big 4 dan KAP menengah, divisi forensik konsultan, BPK, BPKP.

---

## D. Pertambangan, Energi & Komoditas

### 20. Mining & Commodity Equity Analyst
- **Job desc:** Meriset emiten tambang (batu bara, nikel, emas, tembaga, timah, bauksit): memproyeksikan produksi, strip ratio, cash cost, dan sensitivitas terhadap harga komoditas.
- **Data Sectors yang dipakai:** Mining Company Performance (produksi, penjualan, strip ratio, cadangan), Mining Company Financials, Commodity Price History, Mining Sites, Sales Destination, Mining News.
- **Tempat bekerja:** Sekuritas dan MI (sektor tambang adalah salah satu sektor terbesar di IDX), bank investasi regional, commodity-focused fund.

### 21. Commodity Trader / Commodity Market Analyst
- **Job desc:** Memantau pasokan dan permintaan komoditas, tren harga, serta arus ekspor Indonesia ke negara tujuan untuk strategi jual beli fisik maupun derivatif.
- **Data Sectors yang dipakai:** Commodity Price History, Top Export Destinations, Global Commodity Data, Total Commodity Production, Company Sales Destinations.
- **Tempat bekerja:** Trading house dan trader komoditas (Glencore, Trafigura, Vitol, Noble, Mercuria), divisi marketing perusahaan tambang, trader batu bara domestik, pembeli dari negara tujuan ekspor (China, India, Jepang, Korea).

### 22. Mining Business Development / Corporate Planning
- **Job desc:** Mencari peluang akuisisi konsesi, mengikuti lelang WIUP, memetakan kompetitor dan calon mitra, serta menyusun rencana ekspansi.
- **Data Sectors yang dipakai:** Mining Licenses (IUP/IUPK, status, tanggal kedaluwarsa), Mining License Auctions dan Detail, Resources & Reserves per provinsi, Mining Sites, Mining Company Ownership.
- **Tempat bekerja:** Perusahaan tambang. Contoh: MIND ID, Antam, Bukit Asam, AlamTri (Adaro), Bumi Resources, Indika Energy, Vale Indonesia, Merdeka Copper Gold, Amman Mineral, Harita Nickel, Timah, serta investor tambang asing.

### 23. Business Development / Sales untuk Kontraktor Tambang dan Penyedia Alat Berat
- **Job desc:** Mencari calon klien (pemilik tambang) yang butuh jasa penambangan, alat berat, bahan peledak, logistik, atau smelter; memetakan kontrak yang sudah berjalan dan yang akan habis.
- **Data Sectors yang dipakai:** Mining Contracts (relasi pemilik tambang dan kontraktor), Mining Sites (lokasi dan volume produksi), Mining Licenses, Mining Company Detail.
- **Tempat bekerja:** United Tractors / Pamapersada Nusantara, Petrosea, BUMA (Delta Dunia), Trakindo, Hexindo, Dahana, perusahaan logistik tambang dan pelayaran batu bara.

### 24. Geologist / Resource Analyst (peran komersial)
- **Job desc:** Mengevaluasi potensi sumber daya dan cadangan di suatu wilayah untuk keputusan eksplorasi dan investasi.
- **Data Sectors yang dipakai:** Resources & Reserves Index dan Detail per provinsi, Mining Site Detail (koordinat lokasi), Mining Licenses.
- **Tempat bekerja:** Perusahaan tambang, konsultan geologi dan Competent Person (KCMI/JORC), investor tambang.

### 25. Policy Analyst / Economist Sektor Energi & SDA
- **Job desc:** Menyusun kajian kebijakan hilirisasi, royalti, kuota ekspor, dan proyeksi penerimaan negara dari sektor tambang.
- **Data Sectors yang dipakai:** Total Commodity Production (tren tahunan), Top Export Destinations, Global Commodity Data, Resources & Reserves, Mining Licenses.
- **Tempat bekerja:** Kementerian ESDM, Kemenkeu (BKF), Bappenas, Kemenko Perekonomian, Kementerian Investasi/BKPM, think tank (CSIS, INDEF, IESR, Ember, CREA), lembaga donor (World Bank, ADB).

---

## E. Teknologi, Data & Produk

### 26. Data Scientist / Machine Learning Engineer (Finance)
- **Job desc:** Membangun model prediksi harga, sentiment analysis berita, clustering saham, dan deteksi anomali untuk produk investasi.
- **Data Sectors yang dipakai:** Daily Transaction, Full-Universe Close, Broker Activity, Foreign Flow, News (untuk NLP), Quarterly Financials.
- **Tempat bekerja:** Fintech investasi (Stockbit/Bibit, Ajaib, Pluang, IPOT, Bareksa, Tanamduit, Pintu), divisi data bank dan sekuritas, startup AI finance.

### 27. AI Engineer / LLM Application Developer
- **Job desc:** Membangun AI agent, chatbot riset saham, copilot analis, dan workflow multi-agent yang memanggil data keuangan secara real-time (tool use / function calling).
- **Data Sectors yang dipakai:** Seluruh endpoint lewat Sectors MCP Server, Agent Skill, dan OAuth ke Claude/ChatGPT; Screener natural language (parameter `q`). Recipes terkait: Generative AI in Python, Multi-Agent Workflows, ReAct Agents, Human-Agent Collaboration.
- **Tempat bekerja:** Fintech, divisi digital/innovation bank (BCA Digital, Jago, SeaBank, Mandiri Livin), startup AI, software house, konsultan AI.

### 28. Backend / Data Engineer (Fintech & Brokerage)
- **Job desc:** Membangun pipeline data pasar, integrasi API, penyimpanan data historis, dan menyajikan data ke aplikasi trading atau dashboard.
- **Data Sectors yang dipakai:** Endpoint bulk (Full-Universe Close, Latest Quarterly Dates Universe, Foreign Flow Universe, Corporate Actions Calendar), helper list (subsector, industry, tags).
- **Tempat bekerja:** Aplikasi sekuritas online, robo-advisor, portal berita finansial, penyedia data dan terminal keuangan.

### 29. Product Manager (Fintech Investasi)
- **Job desc:** Merancang fitur seperti stock screener, watchlist, alert corporate action, halaman profil emiten, dan fitur edukasi investor.
- **Data Sectors yang dipakai:** Screener, Company Report, Corporate Actions, News, Top Movers; untuk prototyping cepat dan validasi fitur tanpa membangun pipeline data sendiri.
- **Tempat bekerja:** Stockbit, Ajaib, Pluang, Bibit, IPOT, Bareksa, Makmur, super app dengan fitur investasi (GoTo, DANA, OVO).

### 30. Business Intelligence / Financial Data Analyst
- **Job desc:** Membangun dashboard dan laporan rutin untuk manajemen atau klien menggunakan tools no-code/low-code.
- **Data Sectors yang dipakai:** Integrasi Excel Power Query, Google Sheets, Looker Studio, n8n; IDX Market Summary, Index Daily, Subsector Report.
- **Tempat bekerja:** Divisi riset dan strategi bank, MI, sekuritas, emiten, konsultan, dan media.

---

## F. Media, Edukasi & Akademik

### 31. Financial Journalist / Data Journalist
- **Job desc:** Menulis berita pasar modal harian, laporan kinerja emiten, analisis tren sektor, dan visualisasi data untuk pembaca.
- **Data Sectors yang dipakai:** Top Movers, Most Traded, Foreign Flow, IDX Market Cap, Corporate Actions, Insider Filings, Quarterly Financials, Mining News.
- **Tempat bekerja:** Bloomberg Technoz, CNBC Indonesia, Kontan, Bisnis Indonesia, Investor Daily, IDX Channel, Katadata, Kompas, Tempo, The Jakarta Post, Reuters, Bloomberg.

### 32. Financial Content Creator / Investment Educator
- **Job desc:** Membuat konten edukasi dan analisis saham (YouTube, TikTok, Instagram, newsletter), mengadakan kelas atau webinar investasi.
- **Data Sectors yang dipakai:** Company Report, Top Companies Ranked (dividen, valuasi), Top Movers, Broker Summary, animated charts (recipes R/ggplot).
- **Tempat bekerja:** Independen/kreator, komunitas investor, platform edukasi, tim edukasi sekuritas, Sekolah Pasar Modal BEI.

### 33. Academic Researcher / Dosen / Mahasiswa Riset
- **Job desc:** Meneliti topik keuangan dan ekonomi (event study, efisiensi pasar, corporate governance, dividend policy, dampak kebijakan komoditas) untuk publikasi jurnal, tesis, atau disertasi.
- **Data Sectors yang dipakai:** Data historis harga, Quarterly Financials, Shareholders Composition, Corporate Actions, data komoditas dan tambang. (Sectors menyebut datanya sudah dipakai untuk riset akademik.)
- **Tempat bekerja:** Universitas (UI, ITB, UGM, Unair, Prasetiya Mulya, BINUS, UPH, Telkom University), lembaga riset (BRIN, LPEM FEB UI), universitas luar negeri yang meneliti pasar ASEAN.

---

## G. Regional (Singapura & Malaysia)

### 34. ASEAN / Regional Equity Analyst
- **Job desc:** Membandingkan valuasi dan kinerja emiten lintas bursa (IDX, SGX, KLSE) untuk alokasi regional.
- **Data Sectors yang dipakai:** SGX dan KLSE Company Report, SGX Screener, Top Companies (SGX/KLSE), SGX Short Sell, SGX Share Buybacks, SGX Insider Filings.
- **Tempat bekerja:** DBS, UOB Kay Hian, OCBC, Maybank Investment Bank, CGS International, RHB, CIMB; fund regional (GIC, Temasek, Khazanah, EPF/KWSP); family office di Singapura.

---

## Prioritas Segmen ICP

| Tier | Segmen | Alasan |
|---|---|---|
| **Tier 1** | Equity Research, Buy-side Analyst, Portfolio Manager, Quant, Trader | Pengguna harian, butuh data paling dalam (fundamental, broker flow, foreign flow); nilai data langsung terlihat pada keputusan investasi |
| **Tier 1** | AI Engineer, Data Scientist, Backend Engineer di fintech | API-first, cocok dengan MCP/Agent Skill; volume pemanggilan API tinggi |
| **Tier 2** | Mining & Commodity Analyst, Mining BD, Kontraktor Tambang, Commodity Trader | Data tambang (IUP, lelang, kontrak, cadangan) sulit didapat dari sumber lain; ini pembeda utama Sectors |
| **Tier 2** | IB/Valuation, Credit Analyst, Investor Relations, Corporate Development | Butuh comps dan fundamental secara rutin, tetapi frekuensinya per proyek |
| **Tier 3** | Compliance/Surveillance, Regulator, Policy Analyst | Nilai tinggi, tetapi siklus pengadaan panjang |
| **Tier 3** | Jurnalis, Content Creator, Akademisi, BI Analyst | Volume pengguna besar, harga sensitif; bagus untuk awareness dan komunitas |

## Pain Point Umum yang Diselesaikan Sectors
1. Data IDX tersebar di banyak sumber (situs IDX, PDF laporan keuangan, keterbukaan informasi) dan sulit diolah secara programatik.
2. Data broker summary dan foreign flow biasanya hanya tersedia di aplikasi trading dan tidak bisa diekspor dengan mudah.
3. Data tambang (IUP, lelang WIUP, kontrak, cadangan per provinsi) tersebar di portal ESDM Minerba dan tidak terstruktur.
4. Terminal data global (Bloomberg, Refinitiv, CapIQ) mahal dan cakupan emiten kecil-menengah Indonesia kurang dalam.
5. Belum banyak penyedia data keuangan Indonesia yang siap dipakai AI agent (MCP, OAuth ke Claude/ChatGPT, query natural language).
