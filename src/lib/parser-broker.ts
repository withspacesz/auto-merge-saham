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

// =====================================================================
// Analisa broker activity → struktur untuk dipakai BrokerCard + SummaryCard
// =====================================================================

export type EnrichedEntry = BrokerEntry & {
  side: "buy" | "sell";
  info: BrokerInfo;
};

export type BrokerAnalysis = {
  totalBuy: number;
  totalSell: number;
  netBSA: number;
  netAsing: number;
  netLokal: number;
  netUnknown: number;
  asingEntries: EnrichedEntry[]; // sorted by abs value desc
  lokalEntries: EnrichedEntry[]; // sorted by abs value desc
  unknownEntries: EnrichedEntry[];
  topAsingBuyer?: EnrichedEntry;
  topAsingSeller?: EnrichedEntry;
  topLokalBuyer?: EnrichedEntry;
  topLokalSeller?: EnrichedEntry;
  narrative: BrokerNarrative;
  date: string;
  symbol: string;
};

export type BrokerNarrative = {
  label:
    | "ASING DRIVER"
    | "LOKAL DRIVER"
    | "DUA-DUANYA AKUM"
    | "DISTRIBUSI"
    | "CAMPURAN";
  tone: "green" | "red" | "amber" | "neutral";
  headline: string;
  detail: string;
};

function fmtIDR(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}M`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}Jt`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}rb`;
  return `${sign}${abs.toFixed(0)}`;
}

export function analyzeBrokerActivity(
  broker: BrokerActivity,
): BrokerAnalysis {
  const all: EnrichedEntry[] = [
    ...broker.buys.map((e) => ({ ...e, side: "buy" as const, info: getBrokerInfo(e.code) })),
    ...broker.sells.map((e) => ({ ...e, side: "sell" as const, info: getBrokerInfo(e.code) })),
  ];

  const totalBuy = broker.buys.reduce((s, e) => s + e.value, 0);
  const totalSell = broker.sells.reduce((s, e) => s + e.value, 0);
  const netBSA = totalBuy + totalSell;

  const sortByAbs = (arr: EnrichedEntry[]) =>
    [...arr].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  const asingEntries = sortByAbs(all.filter((e) => e.info.type === "asing"));
  const lokalEntries = sortByAbs(all.filter((e) => e.info.type === "lokal"));
  const unknownEntries = sortByAbs(all.filter((e) => e.info.type === "unknown"));

  const sumNet = (arr: EnrichedEntry[]) => arr.reduce((s, e) => s + e.value, 0);
  const netAsing = sumNet(asingEntries);
  const netLokal = sumNet(lokalEntries);
  const netUnknown = sumNet(unknownEntries);

  const buyersDesc = [...all].filter((e) => e.value > 0).sort((a, b) => b.value - a.value);
  const sellersDesc = [...all].filter((e) => e.value < 0).sort((a, b) => a.value - b.value);

  const topAsingBuyer = buyersDesc.find((e) => e.info.type === "asing");
  const topAsingSeller = sellersDesc.find((e) => e.info.type === "asing");
  const topLokalBuyer = buyersDesc.find((e) => e.info.type === "lokal");
  const topLokalSeller = sellersDesc.find((e) => e.info.type === "lokal");

  const narrative = buildNarrative({
    netBSA,
    netAsing,
    netLokal,
    topAsingBuyer,
    topAsingSeller,
    topLokalBuyer,
    topLokalSeller,
    totalBuy,
  });

  return {
    totalBuy,
    totalSell,
    netBSA,
    netAsing,
    netLokal,
    netUnknown,
    asingEntries,
    lokalEntries,
    unknownEntries,
    topAsingBuyer,
    topAsingSeller,
    topLokalBuyer,
    topLokalSeller,
    narrative,
    date: broker.date,
    symbol: broker.symbol,
  };
}

function buildNarrative(args: {
  netBSA: number;
  netAsing: number;
  netLokal: number;
  topAsingBuyer?: EnrichedEntry;
  topAsingSeller?: EnrichedEntry;
  topLokalBuyer?: EnrichedEntry;
  topLokalSeller?: EnrichedEntry;
  totalBuy: number;
}): BrokerNarrative {
  const {
    netBSA,
    netAsing,
    netLokal,
    topAsingBuyer,
    topAsingSeller,
    topLokalBuyer,
    topLokalSeller,
    totalBuy,
  } = args;

  const fmtPct = (n: number) =>
    totalBuy > 0 ? `${((Math.abs(n) / totalBuy) * 100).toFixed(0)}%` : "—";

  const parts: string[] = [];

  if (topAsingBuyer && netAsing > 0) {
    parts.push(
      `Asing dipimpin ${topAsingBuyer.code} (${topAsingBuyer.info.name}) akum ${fmtIDR(topAsingBuyer.value)} (~${fmtPct(topAsingBuyer.value)} dari total beli)`,
    );
  } else if (topAsingSeller && netAsing < 0) {
    parts.push(
      `Asing dist dipimpin ${topAsingSeller.code} (${topAsingSeller.info.name}) jual ${fmtIDR(topAsingSeller.value)}`,
    );
  } else if (topAsingBuyer || topAsingSeller) {
    parts.push("Sisi asing campur — beli & jual saling tutup");
  }

  if (topLokalBuyer && netLokal > 0) {
    parts.push(
      `lokal didorong ${topLokalBuyer.code} (${topLokalBuyer.info.name}) +${fmtIDR(topLokalBuyer.value).replace(/^\+/, "")}`,
    );
  } else if (topLokalSeller && netLokal < 0) {
    parts.push(
      `lokal dist dipimpin ${topLokalSeller.code} (${topLokalSeller.info.name}) ${fmtIDR(topLokalSeller.value)}`,
    );
  }

  let label: BrokerNarrative["label"] = "CAMPURAN";
  let tone: BrokerNarrative["tone"] = "amber";
  let headline = "Pola broker campur — belum ada driver dominan";

  if (netAsing > 0 && netLokal > 0) {
    label = "DUA-DUANYA AKUM";
    tone = "green";
    headline = "Asing & Lokal sama-sama akumulasi";
  } else if (netAsing < 0 && netLokal < 0) {
    label = "DISTRIBUSI";
    tone = "red";
    headline = "Asing & Lokal sama-sama distribusi";
  } else if (Math.abs(netAsing) > Math.abs(netLokal)) {
    label = "ASING DRIVER";
    if (netAsing > 0) {
      tone = "green";
      headline = "Asing jadi driver utama — akumulasi";
    } else {
      tone = "red";
      headline = "Asing jadi driver — distribusi";
    }
  } else if (Math.abs(netLokal) > Math.abs(netAsing)) {
    label = "LOKAL DRIVER";
    if (netLokal > 0) {
      tone = "green";
      headline = "Lokal jadi driver utama — akumulasi";
    } else {
      tone = "red";
      headline = "Lokal jadi driver — distribusi";
    }
  }

  parts.push(
    `Net Asing ${fmtIDR(netAsing)} • Net Lokal ${fmtIDR(netLokal)} • NBSA ${fmtIDR(netBSA)}`,
  );

  if (netAsing > 0 && netLokal < 0 && Math.abs(netLokal) > Math.abs(netAsing) * 0.5) {
    parts.push(
      "Pola klasik: asing serap di tengah distribusi lokal — bandar asing yang ngangkat.",
    );
  } else if (netAsing < 0 && netLokal > 0) {
    parts.push(
      "Pola klasik: asing buang ke lokal — hati-hati lokal jadi bag holder.",
    );
  }

  return { label, tone, headline, detail: parts.join(". ") + "." };
}

// =====================================================================
// Bandingkan dua snapshot Broker Activity
//   - prev = snapshot lama (mis. 24-04-2026 single day)
//   - curr = snapshot baru (mis. 24-04-2026 s.d 27-04-2026 cumulative)
// Mendeteksi: broker baru muncul akumulasi, broker berbalik
// (seller→buyer / buyer→seller), dan broker yang menambah/mengurangi posisi.
// =====================================================================

export type CompareSide = "buy" | "sell" | "absent";

export type BrokerCompareEntry = {
  code: string;
  info: BrokerInfo;
  prevSide: CompareSide;
  currSide: CompareSide;
  prevValue: number; // 0 jika absent; selalu signed (buy positif, sell negatif)
  currValue: number;
  delta: number; // currValue - prevValue (positif = lebih akum, negatif = lebih dist)
  absDelta: number; // |delta|, untuk sorting urut dampak terbesar
  prevRank?: number; // ranking di snapshot lama (1 = top)
  currRank?: number; // ranking di snapshot baru
};

export type BrokerComparison = {
  prev: BrokerActivity;
  curr: BrokerActivity;
  // === Sisi BUY ===
  newAccumulators: BrokerCompareEntry[]; // absent → buy (broker baru muncul akumulasi)
  flippedToBuy: BrokerCompareEntry[];    // sell → buy (berbalik akumulasi)
  increasedBuy: BrokerCompareEntry[];    // buy → buy, value bertambah
  decreasedBuy: BrokerCompareEntry[];    // buy → buy, value berkurang (tapi masih buy)
  exitedBuy: BrokerCompareEntry[];       // buy → absent (selesai akumulasi / take profit)
  // === Sisi SELL ===
  newDistributors: BrokerCompareEntry[]; // absent → sell (broker baru muncul distribusi)
  flippedToSell: BrokerCompareEntry[];   // buy → sell (berbalik distribusi)
  increasedSell: BrokerCompareEntry[];   // sell → sell, abs bertambah
  decreasedSell: BrokerCompareEntry[];   // sell → sell, abs berkurang
  exitedSell: BrokerCompareEntry[];      // sell → absent (selesai jual / cover)
  // === Highlight summary ===
  topNewAccum?: BrokerCompareEntry;
  topFlipBuy?: BrokerCompareEntry;
  topNewDist?: BrokerCompareEntry;
  topFlipSell?: BrokerCompareEntry;
};

function buildIndex(act: BrokerActivity): Map<string, { side: "buy" | "sell"; value: number; rank: number }> {
  const idx = new Map<string, { side: "buy" | "sell"; value: number; rank: number }>();
  for (const e of act.buys) {
    idx.set(e.code.toUpperCase(), { side: "buy", value: Math.abs(e.value), rank: e.rank });
  }
  for (const e of act.sells) {
    idx.set(e.code.toUpperCase(), { side: "sell", value: -Math.abs(e.value), rank: e.rank });
  }
  return idx;
}

export function compareBrokerActivity(
  prev: BrokerActivity,
  curr: BrokerActivity,
): BrokerComparison {
  const prevIdx = buildIndex(prev);
  const currIdx = buildIndex(curr);

  const allCodes = new Set<string>([...prevIdx.keys(), ...currIdx.keys()]);

  const newAccumulators: BrokerCompareEntry[] = [];
  const flippedToBuy: BrokerCompareEntry[] = [];
  const increasedBuy: BrokerCompareEntry[] = [];
  const decreasedBuy: BrokerCompareEntry[] = [];
  const exitedBuy: BrokerCompareEntry[] = [];
  const newDistributors: BrokerCompareEntry[] = [];
  const flippedToSell: BrokerCompareEntry[] = [];
  const increasedSell: BrokerCompareEntry[] = [];
  const decreasedSell: BrokerCompareEntry[] = [];
  const exitedSell: BrokerCompareEntry[] = [];

  for (const code of allCodes) {
    const p = prevIdx.get(code);
    const c = currIdx.get(code);
    const prevSide: CompareSide = p ? p.side : "absent";
    const currSide: CompareSide = c ? c.side : "absent";
    const prevValue = p ? p.value : 0;
    const currValue = c ? c.value : 0;
    const delta = currValue - prevValue;
    const entry: BrokerCompareEntry = {
      code,
      info: getBrokerInfo(code),
      prevSide,
      currSide,
      prevValue,
      currValue,
      delta,
      absDelta: Math.abs(delta),
      prevRank: p?.rank,
      currRank: c?.rank,
    };

    if (prevSide === "absent" && currSide === "buy") {
      newAccumulators.push(entry);
    } else if (prevSide === "sell" && currSide === "buy") {
      flippedToBuy.push(entry);
    } else if (prevSide === "buy" && currSide === "buy") {
      if (currValue > prevValue) increasedBuy.push(entry);
      else if (currValue < prevValue) decreasedBuy.push(entry);
      else increasedBuy.push(entry); // sama persis, masukkan ke "increased" saja
    } else if (prevSide === "buy" && currSide === "absent") {
      exitedBuy.push(entry);
    } else if (prevSide === "absent" && currSide === "sell") {
      newDistributors.push(entry);
    } else if (prevSide === "buy" && currSide === "sell") {
      flippedToSell.push(entry);
    } else if (prevSide === "sell" && currSide === "sell") {
      // sell→sell: kalau abs bertambah (currValue lebih negatif) = nambah dist
      if (currValue < prevValue) increasedSell.push(entry);
      else if (currValue > prevValue) decreasedSell.push(entry);
      else increasedSell.push(entry);
    } else if (prevSide === "sell" && currSide === "absent") {
      exitedSell.push(entry);
    }
  }

  // Sort masing-masing bucket berdasarkan dampak terbesar
  const sortBuyersByCurr = (arr: BrokerCompareEntry[]) =>
    arr.sort((a, b) => b.currValue - a.currValue);
  const sortSellersByCurr = (arr: BrokerCompareEntry[]) =>
    arr.sort((a, b) => a.currValue - b.currValue);
  const sortByDeltaDesc = (arr: BrokerCompareEntry[]) =>
    arr.sort((a, b) => b.delta - a.delta);
  const sortByDeltaAsc = (arr: BrokerCompareEntry[]) =>
    arr.sort((a, b) => a.delta - b.delta);

  sortBuyersByCurr(newAccumulators);
  sortBuyersByCurr(flippedToBuy);
  sortByDeltaDesc(increasedBuy);
  sortByDeltaAsc(decreasedBuy);
  sortBuyersByCurr(exitedBuy); // urut by prev value sebenarnya, tapi pakai currValue=0
  exitedBuy.sort((a, b) => b.prevValue - a.prevValue);

  sortSellersByCurr(newDistributors);
  sortSellersByCurr(flippedToSell);
  sortByDeltaAsc(increasedSell);
  sortByDeltaDesc(decreasedSell);
  exitedSell.sort((a, b) => a.prevValue - b.prevValue);

  return {
    prev,
    curr,
    newAccumulators,
    flippedToBuy,
    increasedBuy,
    decreasedBuy,
    exitedBuy,
    newDistributors,
    flippedToSell,
    increasedSell,
    decreasedSell,
    exitedSell,
    topNewAccum: newAccumulators[0],
    topFlipBuy: flippedToBuy[0],
    topNewDist: newDistributors[0],
    topFlipSell: flippedToSell[0],
  };
}
