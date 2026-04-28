// Parser untuk format Broker Summary dari Telegram bot @chart_saham_bot
// Format dua kolom: NET BUY (kiri) dan NET SELL (kanan)

export type BrokerEntry = {
  rank: number;
  code: string;
  value: number; // dalam Rupiah; positif untuk buy, negatif untuk sell
  lot: number; // dalam lot (1 lot = 100 lembar) atau thousand-lot
  freq: number; // jumlah transaksi
  avg: number; // harga rata-rata
};

export type BrokerActivity = {
  symbol: string;
  date: string; // YYYY-MM-DD dari header
  buys: BrokerEntry[]; // sorted by abs value desc
  sells: BrokerEntry[]; // sorted by abs value desc
};

const SUFFIX: Record<string, number> = { rb: 1e3, jt: 1e6, m: 1e9 };

function parseAmount(s: string): number {
  if (!s) return 0;
  const cleaned = s.trim();
  const m = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*(Jt|jt|rb|Rb|M|m)?$/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const suf = (m[2] || "").toLowerCase();
  return n * (SUFFIX[suf] ?? 1);
}

export function parseBrokerActivity(text: string): BrokerActivity | null {
  if (!text || !text.trim()) return null;

  const symMatch = text.match(/Broker Summary\s+([A-Z]{2,6})/i);
  // Date format: "Tanggal 2026-04-24 s.d 2026-04-24" → ambil tanggal kedua kalau ada
  const dateMatch =
    text.match(/Tanggal\s+\d{4}-\d{2}-\d{2}\s+s\.?d\.?\s+(\d{4}-\d{2}-\d{2})/i) ||
    text.match(/Tanggal\s+(\d{4}-\d{2}-\d{2})/i);

  const buys: BrokerEntry[] = [];
  const sells: BrokerEntry[] = [];

  // Setiap data row punya pola: NO. CODE VAL LOT FREQ AVG (×2 di satu baris)
  const rowPattern =
    /(\d+)\.\s+([A-Z]{1,4})\s+(-?\d[\d.]*\s*(?:Jt|jt|rb|Rb|M|m)?)\s+(-?\d[\d.]*\s*(?:rb|Rb|Jt|jt|M|m)?)\s+(\d[\d.]*\s*(?:rb|Rb|Jt|jt|M|m)?)\s+(\d[\d.]*)/g;

  const lines = text.split("\n");
  for (const line of lines) {
    if (!/^\s*\d+\.\s+[A-Z]/.test(line)) continue;
    const matches = [...line.matchAll(rowPattern)];
    matches.forEach((m, idx) => {
      const entry: BrokerEntry = {
        rank: parseInt(m[1], 10),
        code: m[2].toUpperCase(),
        value: parseAmount(m[3]),
        lot: parseAmount(m[4]),
        freq: parseAmount(m[5]),
        avg: parseFloat(m[6]),
      };
      // index 0 = sisi kiri (BUY), index 1 = sisi kanan (SELL)
      if (idx === 0) {
        // Pastikan value buy positif
        if (entry.value < 0) entry.value = Math.abs(entry.value);
        buys.push(entry);
      } else if (idx === 1) {
        // Pastikan value sell negatif
        if (entry.value > 0) entry.value = -Math.abs(entry.value);
        sells.push(entry);
      }
    });
  }

  if (buys.length === 0 && sells.length === 0) return null;

  buys.sort((a, b) => b.value - a.value);
  sells.sort((a, b) => a.value - b.value);

  return {
    symbol: symMatch ? symMatch[1].toUpperCase() : "",
    date: dateMatch ? dateMatch[1] : "",
    buys,
    sells,
  };
}

// =====================================================================
// Mapping kode broker IDX → nama + tipe (Asing / Lokal)
// =====================================================================
export type BrokerType = "asing" | "lokal" | "unknown";

export type BrokerInfo = { name: string; type: BrokerType };

export const BROKERS: Record<string, BrokerInfo> = {
  AF: { name: "Harita Kencana Sekuritas", type: "lokal" },
  AG: { name: "Kiwoom Sekuritas Indonesia", type: "asing" },
  AH: { name: "Erdikha Elit Sekuritas", type: "lokal" },
  AI: { name: "UOB Kay Hian Sekuritas", type: "asing" },
  AK: { name: "UBS Sekuritas Indonesia", type: "asing" },
  AN: { name: "BNC Sekuritas", type: "lokal" },
  AO: { name: "Erdikha Elit Sekuritas", type: "lokal" },
  AP: { name: "Pacific Sekuritas Indonesia", type: "lokal" },
  AR: { name: "Binaartha Sekuritas", type: "lokal" },
  AT: { name: "Phintraco Sekuritas", type: "lokal" },
  AZ: { name: "Sucorinvest Sekuritas", type: "lokal" },
  BK: { name: "JP Morgan Sekuritas", type: "asing" },
  BQ: { name: "Danpac Sekuritas", type: "lokal" },
  BR: { name: "Trust Sekuritas", type: "lokal" },
  BS: { name: "Equity Sekuritas Indonesia", type: "lokal" },
  BZ: { name: "Batavia Prosperindo Sekuritas", type: "lokal" },
  CC: { name: "Mandiri Sekuritas", type: "lokal" },
  CD: { name: "Mega Capital Sekuritas", type: "lokal" },
  CG: { name: "Citigroup Sekuritas Indonesia", type: "asing" },
  CP: { name: "Valbury Asia Securities", type: "lokal" },
  CS: { name: "Credit Suisse Sekuritas", type: "asing" },
  DB: { name: "Deutsche Securities Indonesia", type: "asing" },
  DD: { name: "Sinarmas Sekuritas", type: "lokal" },
  DH: { name: "Sinarmas Sekuritas", type: "lokal" },
  DR: { name: "OSK Indonesia", type: "asing" },
  DU: { name: "KAF Sekuritas Indonesia", type: "asing" },
  DX: { name: "Bahana Sekuritas", type: "lokal" },
  EL: { name: "Evergreen Sekuritas", type: "lokal" },
  EP: { name: "MNC Sekuritas", type: "lokal" },
  ES: { name: "Maybank Sekuritas", type: "asing" },
  FO: { name: "Forte Global Sekuritas", type: "lokal" },
  FS: { name: "Yuanta Sekuritas Indonesia", type: "asing" },
  FZ: { name: "Waterfront Sekuritas Indonesia", type: "lokal" },
  GA: { name: "Equator Securities", type: "lokal" },
  GR: { name: "Panin Sekuritas", type: "lokal" },
  GW: { name: "Aldiracita Corpotama", type: "lokal" },
  HD: { name: "Hortus Danavest", type: "lokal" },
  HG: { name: "RHB Sekuritas Indonesia", type: "asing" },
  HP: { name: "Henan Putihrai Sekuritas", type: "lokal" },
  ID: { name: "Anugerah Securindo Indah", type: "lokal" },
  IF: { name: "Samuel Sekuritas Indonesia", type: "lokal" },
  II: { name: "Danatama Makmur Sekuritas", type: "lokal" },
  IN: { name: "Investindo Nusantara Sekuritas", type: "lokal" },
  IP: { name: "MNC Sekuritas", type: "lokal" },
  IT: { name: "Inti Teladan Arthamas", type: "lokal" },
  IU: { name: "Inti Teladan Arthamas", type: "lokal" },
  KI: { name: "Ciptadana Sekuritas", type: "lokal" },
  KK: { name: "Phillip Sekuritas Indonesia", type: "asing" },
  KS: { name: "Kresna Sekuritas", type: "lokal" },
  KW: { name: "Madani Securities", type: "lokal" },
  KZ: { name: "CLSA Sekuritas Indonesia", type: "asing" },
  LG: { name: "Trimegah Sekuritas Indonesia", type: "lokal" },
  LH: { name: "NobleHouse Indonesia", type: "lokal" },
  LS: { name: "Reliance Sekuritas", type: "lokal" },
  MG: { name: "Semesta Indovest", type: "lokal" },
  ML: { name: "Merrill Lynch Sekuritas", type: "asing" },
  MS: { name: "Morgan Stanley Sekuritas", type: "asing" },
  MU: { name: "Minna Padi Investama", type: "lokal" },
  NI: { name: "BNP Paribas Sekuritas", type: "asing" },
  OD: { name: "BNI Sekuritas", type: "lokal" },
  OK: { name: "Net Sekuritas", type: "lokal" },
  PC: { name: "Bumiputera Sekuritas", type: "lokal" },
  PD: { name: "Indo Premier Sekuritas", type: "lokal" },
  PG: { name: "Panca Global Securities", type: "lokal" },
  PI: { name: "Panin Sekuritas", type: "lokal" },
  PO: { name: "Pilarmas Investindo Sekuritas", type: "lokal" },
  PP: { name: "Provident Securities", type: "lokal" },
  PS: { name: "Paramitra Alfa Sekuritas", type: "lokal" },
  QA: { name: "Pacific Capital Investment", type: "lokal" },
  RB: { name: "Sucor Sekuritas", type: "lokal" },
  RF: { name: "Trimegah Sekuritas", type: "lokal" },
  RG: { name: "Profindo International Securities", type: "lokal" },
  RO: { name: "Onix Capital Sekuritas", type: "lokal" },
  RX: { name: "Macquarie Sekuritas Indonesia", type: "asing" },
  SA: { name: "Surya Fajar Sekuritas", type: "lokal" },
  SC: { name: "Trimegah Sekuritas", type: "lokal" },
  SH: { name: "Artha Sekuritas Indonesia", type: "lokal" },
  SQ: { name: "BNP Paribas Sekuritas", type: "asing" },
  SS: { name: "AsiaSekuritas Indonesia", type: "lokal" },
  TF: { name: "Universal Broker Indonesia", type: "lokal" },
  TP: { name: "Sinarmas Sekuritas", type: "lokal" },
  TS: { name: "Trust Sekuritas", type: "lokal" },
  XA: { name: "RHB Sekuritas Indonesia", type: "asing" },
  XC: { name: "OCBC Sekuritas Indonesia", type: "asing" },
  XL: { name: "Mahanusa Capital", type: "lokal" },
  YB: { name: "Sucor Sekuritas", type: "lokal" },
  YJ: { name: "Lautandhana Sekurindo", type: "lokal" },
  YO: { name: "Amantara Securities", type: "lokal" },
  YP: { name: "Mirae Asset Sekuritas Indonesia", type: "asing" },
  YU: { name: "CGS-CIMB Sekuritas Indonesia", type: "asing" },
  ZP: { name: "Maybank Sekuritas Indonesia", type: "asing" },
  ZR: { name: "Sucor Sekuritas", type: "lokal" },
};

export function getBrokerInfo(code: string): BrokerInfo {
  const c = code.toUpperCase();
  return BROKERS[c] ?? { name: c, type: "unknown" };
}
