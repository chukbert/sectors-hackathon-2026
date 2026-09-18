// lib/decider.ts — bantahan wajib per verdict (gate confidence dijalankan di orchestrator/finalize).

export function bantah(verdict: string): string {
  const map: Record<string, string> = {
    distribusi: "Bantahan: bisa jadi rotasi sektoral biasa — cek foreign-flow 90hr sebelum vonis.",
    "tak-didukung": "Bantahan: volume turun bisa karena libur/aksi korporasi — cek kalender ex-date.",
    campuran: "Bantahan: sinyal campuran sering jadi sideways — tunggu konfirmasi volume.",
    "indikasi-trap": "Bantahan: yield tinggi bisa valid bila FCF pulih — cek quarterly terbaru.",
  };
  return map[verdict] ?? "Bantahan: data EOD, bukan realtime — keputusan final tetap di tanganmu.";
}
