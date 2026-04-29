// Logic murni rekomendasi & analisa bandar.
// Diekstrak dari SummaryCard agar bisa dipakai oleh komponen UI dan
// pengirim pesan Telegram (output yang sama persis di kedua tempat).

import type { MergedTable, MergedRow } from "./merger";
import type { BrokerAnalysis } from "./parser-broker";

const SUFFIX_MULT: Record<string, number> = { rb: 1e3, jt: 1e6, m: 1e9 };

export function parseVal(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/[^\d+\-.MJjRrBbtT]/g, "")
    .trim();
  const m = cleaned.match(/^([+-]?\d+(?:\.\d+)?)\s*(Rb|Jt|M)?$/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  const suf = (m[2] || "").toLowerCase();
  return suf ? num * (SUFFIX_MULT[suf] ?? 1) : num;
}

export function parsePct(raw: string): number | null {
  if (!raw) return null;
  const m = raw.replace(/[^\d+\-.]/g, "").match(/^([+-]?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return parseFloat(m[1]);
}

export function fmtIDR(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}M`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}Jt`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(2)}Rb`;
  return `${sign}${abs.toFixed(0)}`;
}

export type Tone = "green" | "red" | "neutral" | "amber";

export function ketScore(ket: string | undefined): number {
  if (!ket) return 0;
  const k = ket.toLowerCase().trim();
  if (k.includes("massive accum")) return 5;
  if (k.includes("big accum")) return 4;
  if (k.includes("normal accum")) return 3;
  if (k.includes("small accum")) return 2;
  if (k.includes("massive dist")) return -5;
  if (k.includes("big dist")) return -4;
  if (k.includes("normal dist")) return -3;
  if (k.includes("small dist")) return -2;
  return 0;
}

export function ketTone(score: number): Tone {
  if (score >= 2) return "green";
  if (score <= -2) return "red";
  return "neutral";
}

export function normalizeMergedDate(s: string): string {
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
}

export type DayInfo = {
  date: string;
  price: number | null;
  gain: number | null;
  freq: number | null;
  nbsa: number | null;
  mf: number | null;
  value: number | null;
  ketNbsa: string;
  ketMf: string;
  asingScore: number;
  lokalScore: number;
  tx: number | null;
  avp: number | null;
  smart: number | null;
  bad: number | null;
  clean: number | null;
  rcv: number | null;
};

export function analyzeDay(r: MergedRow): DayInfo {
  const ketNbsa = (r["Ket NBSA"] ?? "").trim();
  const ketMf = (r["Ket MF"] ?? "").trim();
  return {
    date: r["Tanggal"] ?? "",
    price: parseVal(r["Price"] ?? ""),
    gain: parsePct(r["Gain"] ?? ""),
    freq: parseVal(r["Freq"] ?? ""),
    nbsa: parseVal(r["NBSA"] ?? ""),
    mf: parseVal(r["MF +/-"] ?? ""),
    value: parseVal(r["Value"] ?? ""),
    ketNbsa,
    ketMf,
    asingScore: ketScore(ketNbsa),
    lokalScore: ketScore(ketMf),
    tx: parseVal(r["Tx"] ?? ""),
    avp: parseVal(r["Avp P"] ?? ""),
    smart: parseVal(r["Smart M."] ?? ""),
    bad: parseVal(r["Bad M."] ?? ""),
    clean: parseVal(r["Clean M."] ?? ""),
    rcv: parseVal(r["RCV"] ?? ""),
  };
}

export type Pattern = { label: string; tone: Tone; desc: string };
export type Reason = { text: string; tone: Tone };
export type Recommendation = {
  label: "AKUMULASI" | "TAHAN" | "KURANGI";
  tone: Tone;
  headline: string;
  detail: string;
};
export type StatusInfo = { label: string; tone: Tone; sub: string };

export type GroundTruth = {
  asingDir: 1 | 0 | -1;
  lokalDir: 1 | 0 | -1;
  nbsa: number | null;
  mf: number | null;
  ketNbsa: string;
  ketMf: string;
};

export type BrokerInsight = {
  date: string;
  verdictPrefix: string;
  verdictTone: Tone;
  insight: string;
};

export type RecommendationResult = {
  days: DayInfo[];
  latest: DayInfo;
  prev: DayInfo | null;
  periodLabel: string;
  totalNbsa: number;
  totalMf: number;
  totalValue: number;
  nbsaSeen: boolean;
  mfSeen: boolean;
  valueSeen: boolean;
  pctLabel: string;
  pctOf: (n: number) => string;
  asingStatus: StatusInfo;
  lokalStatus: StatusInfo;
  patterns: Pattern[];
  freqTrend: Pattern | null;
  recommendation: Recommendation;
  score: number;
  reasons: Reason[];
  reasonsTopFour: Reason[];
  groundTruth: GroundTruth;
  brokerInsight: BrokerInsight | null;
};

// Insight 1 kalimat menyebut nama broker dominan (mirror SummaryCard).
export function buildBrokerInsight(args: {
  netAsing: number;
  netLokal: number;
  topAsingBuyer?: { code: string; value: number; info: { name: string } };
  topAsingSeller?: { code: string; value: number; info: { name: string } };
  topLokalBuyer?: { code: string; value: number; info: { name: string } };
  topLokalSeller?: { code: string; value: number; info: { name: string } };
  totalBuy: number;
  asingDirOverride?: number;
  lokalDirOverride?: number;
}): string {
  const {
    netAsing, netLokal,
    topAsingBuyer, topAsingSeller, topLokalBuyer, topLokalSeller,
    totalBuy, asingDirOverride, lokalDirOverride,
  } = args;
  const fmtAbs = (n: number) => fmtIDR(Math.abs(n)).replace(/^[+-]/, "");
  const pct = (n: number) =>
    totalBuy > 0 ? ` (~${((Math.abs(n) / totalBuy) * 100).toFixed(0)}% beli)` : "";
  const aDir = asingDirOverride !== undefined && asingDirOverride !== 0
    ? asingDirOverride
    : netAsing > 0 ? 1 : netAsing < 0 ? -1 : 0;
  const lDir = lokalDirOverride !== undefined && lokalDirOverride !== 0
    ? lokalDirOverride
    : netLokal > 0 ? 1 : netLokal < 0 ? -1 : 0;

  if (aDir > 0 && lDir < 0) {
    const a = topAsingBuyer
      ? `${topAsingBuyer.code} (${topAsingBuyer.info.name}) +${fmtAbs(topAsingBuyer.value)}${pct(topAsingBuyer.value)}`
      : "asing";
    const l = topLokalSeller
      ? `${topLokalSeller.code} (${topLokalSeller.info.name}) -${fmtAbs(topLokalSeller.value)}`
      : "lokal";
    return `${a} serap di tengah distribusi lokal ${l} — pola klasik bandar asing yang ngangkat.`;
  }
  if (aDir < 0 && lDir > 0) {
    const a = topAsingSeller
      ? `${topAsingSeller.code} (${topAsingSeller.info.name}) -${fmtAbs(topAsingSeller.value)}`
      : "asing";
    const l = topLokalBuyer
      ? `${topLokalBuyer.code} (${topLokalBuyer.info.name}) +${fmtAbs(topLokalBuyer.value)}`
      : "lokal";
    return `${a} buang ke ${l} — hati-hati lokal jadi bag holder.`;
  }
  if (aDir > 0 && lDir > 0) {
    const a = topAsingBuyer
      ? `${topAsingBuyer.code} (${topAsingBuyer.info.name}) +${fmtAbs(topAsingBuyer.value)}${pct(topAsingBuyer.value)}`
      : null;
    const l = topLokalBuyer
      ? `${topLokalBuyer.code} (${topLokalBuyer.info.name}) +${fmtAbs(topLokalBuyer.value)}${pct(topLokalBuyer.value)}`
      : null;
    if (a && l) return `${a} dari sisi asing & ${l} dari sisi lokal — dua-duanya akumulasi, tekanan beli kompak dari dua sisi.`;
    if (a || l) return `${a ?? l} memimpin akumulasi — asing & lokal searah, tekanan beli kompak dari dua sisi.`;
    return `Asing & lokal sama-sama akumulasi — tekanan beli kompak dari dua sisi.`;
  }
  if (aDir < 0 && lDir < 0) {
    const a = topAsingSeller
      ? `${topAsingSeller.code} (${topAsingSeller.info.name}) -${fmtAbs(topAsingSeller.value)}`
      : null;
    const l = topLokalSeller
      ? `${topLokalSeller.code} (${topLokalSeller.info.name}) -${fmtAbs(topLokalSeller.value)}`
      : null;
    if (a && l) return `${a} dari sisi asing & ${l} dari sisi lokal — dua-duanya distribusi, tekanan jual kuat dari dua sisi, risiko lanjut turun.`;
    if (a || l) return `${a ?? l} memimpin distribusi — asing & lokal searah jual, risiko lanjut turun.`;
    return `Asing & lokal sama-sama distribusi — tekanan jual kuat, risiko lanjut turun.`;
  }
  if (aDir > 0 && lDir === 0) {
    const a = topAsingBuyer
      ? `${topAsingBuyer.code} (${topAsingBuyer.info.name}) +${fmtAbs(topAsingBuyer.value)}${pct(topAsingBuyer.value)}`
      : "asing";
    return `${a} memimpin akumulasi sementara lokal cenderung netral — driver utama dari sisi asing.`;
  }
  if (aDir < 0 && lDir === 0) {
    const a = topAsingSeller
      ? `${topAsingSeller.code} (${topAsingSeller.info.name}) -${fmtAbs(topAsingSeller.value)}`
      : "asing";
    return `${a} memimpin distribusi sementara lokal cenderung netral — tekanan jual datang dari sisi asing.`;
  }
  if (lDir > 0 && aDir === 0) {
    const l = topLokalBuyer
      ? `${topLokalBuyer.code} (${topLokalBuyer.info.name}) +${fmtAbs(topLokalBuyer.value)}${pct(topLokalBuyer.value)}`
      : "lokal";
    return `${l} memimpin akumulasi sementara asing cenderung netral — driver utama dari sisi lokal.`;
  }
  if (lDir < 0 && aDir === 0) {
    const l = topLokalSeller
      ? `${topLokalSeller.code} (${topLokalSeller.info.name}) -${fmtAbs(topLokalSeller.value)}`
      : "lokal";
    return `${l} memimpin distribusi sementara asing cenderung netral — tekanan jual datang dari sisi lokal.`;
  }
  const topBuy = topAsingBuyer ?? topLokalBuyer;
  const topSell = topAsingSeller ?? topLokalSeller;
  if (topBuy && topSell) {
    return `${topBuy.code} (${topBuy.info.name}) +${fmtAbs(topBuy.value)} ditutup ${topSell.code} (${topSell.info.name}) -${fmtAbs(topSell.value)} — beli & jual saling tutup, belum ada driver dominan.`;
  }
  return `Beli & jual saling tutup — belum ada driver dominan dari sisi broker.`;
}

// =====================================================================
// Main: hitung rekomendasi lengkap (sama persis dgn yg dipakai SummaryCard).
// =====================================================================
export function computeRecommendation(
  merged: MergedTable,
  brokerAnalysis?: BrokerAnalysis | null,
): RecommendationResult | null {
  const allData = merged.rows.filter((r) => !r.__isTotal);
  if (allData.length === 0) return null;

  const data = allData.slice(0, 3);
  const days = data.map(analyzeDay);
  const latest = days[0];
  const prev = days[1] ?? null;
  const prev2 = days[2] ?? null;

  let totalNbsa = 0, totalMf = 0, totalValue = 0;
  let nbsaSeen = false, mfSeen = false, valueSeen = false;
  for (const d of days) {
    if (d.nbsa !== null) { totalNbsa += d.nbsa; nbsaSeen = true; }
    if (d.mf !== null) { totalMf += d.mf; mfSeen = true; }
    if (d.value !== null) { totalValue += d.value; valueSeen = true; }
  }

  const periodLabel = (() => {
    if (days.length === 0) return "—";
    if (days.length === 1) return latest.date;
    const oldest = days[days.length - 1].date;
    return `${oldest} → ${latest.date}`;
  })();

  const PCT = 0.05;
  const dynamicThreshold = valueSeen && totalValue > 0 ? totalValue * PCT : null;
  const nbsaThreshold = dynamicThreshold ?? 0;
  const mfThreshold = dynamicThreshold ?? 1e9;
  const pctLabel = `${(PCT * 100).toFixed(0)}% Value`;
  const pctOf = (n: number): string =>
    valueSeen && totalValue > 0
      ? `${((Math.abs(n) / totalValue) * 100).toFixed(2)}%`
      : "—";

  const asingStatus: StatusInfo = nbsaSeen
    ? totalNbsa > nbsaThreshold
      ? { label: "Asing AKUMULASI", tone: "green", sub: `Net Buy ${fmtIDR(totalNbsa)} (${pctOf(totalNbsa)} Value 3hr) — asing serap saham` }
      : totalNbsa < -nbsaThreshold
        ? { label: "Asing DISTRIBUSI", tone: "red", sub: `Net Sell ${fmtIDR(totalNbsa)} (${pctOf(totalNbsa)} Value 3hr) — asing lebih banyak jual` }
        : { label: "Asing NETRAL", tone: "neutral", sub: `${fmtIDR(totalNbsa)} (${pctOf(totalNbsa)} Value 3hr) — di bawah ambang ±${pctLabel}` }
    : { label: "Data NBSA tidak ada", tone: "neutral", sub: "—" };

  const lokalStatus: StatusInfo = mfSeen
    ? totalMf > mfThreshold
      ? { label: "Lokal AKUMULASI", tone: "green", sub: `MF ${fmtIDR(totalMf)} (${pctOf(totalMf)} Value 3hr) — lokal dominan beli` }
      : totalMf < -mfThreshold
        ? { label: "Lokal DISTRIBUSI", tone: "red", sub: `MF ${fmtIDR(totalMf)} (${pctOf(totalMf)} Value 3hr) — lokal dominan jual` }
        : { label: "Lokal NETRAL", tone: "neutral", sub: `MF ${fmtIDR(totalMf)} (${pctOf(totalMf)} Value 3hr) — di bawah ambang ±${pctLabel}` }
    : { label: "Data MF tidak ada", tone: "neutral", sub: "—" };

  // ===== Pattern detection (semua pola lintas-hari) =====
  const patterns: Pattern[] = [];
  if (prev && latest.asingScore >= 2 && prev.asingScore <= -2 && latest.nbsa !== null && latest.nbsa > 0) {
    patterns.push({ label: "🔄 Asing kembali akumulasi", tone: "green",
      desc: `Hari terakhir asing balik masuk (${latest.ketNbsa}, NBSA ${fmtIDR(latest.nbsa)}) setelah ${prev.date} distribusi (${prev.ketNbsa}). Sinyal awal driver baru — asing biasanya akum saat ritel sudah panic.` });
  } else if (prev && latest.asingScore >= 2 && latest.gain !== null && latest.gain < -2) {
    patterns.push({ label: "💪 Asing serap saat ritel panic", tone: "green",
      desc: `Harga turun ${latest.gain.toFixed(2)}% tapi asing tetap akum (${latest.ketNbsa}, ${fmtIDR(latest.nbsa ?? 0)}). Asing tidak takut koreksi.` });
  }
  if (latest.asingScore > 0 && latest.lokalScore < 0) {
    patterns.push({ label: "🎯 Bandar Asing serap", tone: "green",
      desc: `Asing serap (${latest.ketNbsa}) sementara lokal lepas (${latest.ketMf}) — pola klasik smart money masuk dari distribusi ritel.` });
  }
  if (latest.asingScore < 0 && latest.lokalScore > 0) {
    patterns.push({ label: "🚨 Asing distribusi ke lokal", tone: "red",
      desc: `Asing keluar (${latest.ketNbsa}) sementara lokal masuk (${latest.ketMf}) — biasanya retail jadi bag holder. Hati-hati.` });
  }
  if (latest.asingScore <= -2 && latest.lokalScore <= -2) {
    patterns.push({ label: "🚨 Distribusi serentak", tone: "red",
      desc: `Asing & lokal sama-sama lepas (${latest.ketNbsa} & ${latest.ketMf}). Tekanan jual tinggi — kemungkinan harga lanjut turun.` });
  }
  if (prev && prev.asingScore >= 2 && latest.lokalScore >= 2 && latest.asingScore <= 1) {
    patterns.push({ label: "👥 Lokal follow Asing", tone: "green",
      desc: `Lokal mulai ikut beli (${latest.ketMf}) setelah asing akum di ${prev.date} (${prev.ketNbsa}). Pola lokal mengejar — biasanya harga tetap jalan naik.` });
  }
  if (latest.asingScore === 0 && latest.lokalScore === 0 && latest.nbsa !== null && latest.nbsa > 0 && latest.gain !== null && Math.abs(latest.gain) < 2) {
    patterns.push({ label: "🛡️ Jaga harga", tone: "amber",
      desc: `Ket NBSA & Ket MF netral, NBSA tipis +${fmtIDR(latest.nbsa).replace(/^\+/, "")}, harga stabil ${latest.gain >= 0 ? "+" : ""}${latest.gain.toFixed(2)}% — sedikit yang keluar, ada yang jaga harga.` });
  }
  if (latest.smart !== null && latest.smart > 0) {
    patterns.push({ label: "💎 Smart Money aktif", tone: "green",
      desc: `Smart Money +${fmtIDR(latest.smart).replace(/^\+/, "")} di hari terakhir — ada akumulasi besar terdeteksi.` });
  } else if (latest.smart !== null && latest.smart === 0 && latest.asingScore >= 2) {
    patterns.push({ label: "⏳ Akumulasi tahap awal", tone: "amber",
      desc: `Asing akum (${latest.ketNbsa}) tapi Smart Money belum aktif — biasanya langkah awal sebelum smart money besar masuk.` });
  }
  if (latest.clean !== null && latest.clean > 0 && latest.rcv !== null && latest.rcv > 0) {
    patterns.push({ label: "✅ Clean Money + RCV positif", tone: "green",
      desc: `Clean Money +${fmtIDR(latest.clean).replace(/^\+/, "")} & RCV +${latest.rcv.toFixed(0)} — akumulasi bersih jelas.` });
  } else if (latest.clean !== null && latest.clean < 0 && latest.rcv !== null && latest.rcv < -50) {
    patterns.push({ label: "⚠️ Clean Money + RCV negatif", tone: "red",
      desc: `Clean Money ${fmtIDR(latest.clean)} & RCV ${latest.rcv.toFixed(0)} — distribusi bersih kuat.` });
  }
  let freqTrend: Pattern | null = null;
  if (latest.tx !== null && latest.tx > 0 && prev?.tx && prev2?.tx) {
    const prevAvg = (prev.tx + prev2.tx) / 2;
    const ratio = latest.tx / prevAvg;
    const pctNum = ((ratio - 1) * 100).toFixed(0);
    const sign = ratio >= 1 ? "+" : "";
    if (ratio >= 1.2) {
      freqTrend = { label: "↑ Aktivitas Meningkat", tone: "green",
        desc: `Tx hari terakhir ${latest.tx.toFixed(0)}x vs rata-rata 2 hari ${prevAvg.toFixed(1)}x (${sign}${pctNum}%) — minat pasar naik.` };
    } else if (ratio <= 0.8) {
      freqTrend = { label: "↓ Aktivitas Menurun", tone: "red",
        desc: `Tx hari terakhir ${latest.tx.toFixed(0)}x vs rata-rata 2 hari ${prevAvg.toFixed(1)}x (${sign}${pctNum}%) — minat pasar turun.` };
    }
  }
  if (freqTrend) patterns.push(freqTrend);

  // ===== Skoring =====
  let score = 0;
  const reasons: Reason[] = [];
  score += latest.asingScore * 1.2;
  score += latest.lokalScore * 0.8;
  if (latest.smart !== null && latest.smart > 0) {
    score += 1.5;
    reasons.push({ text: `Smart Money aktif (+${fmtIDR(latest.smart).replace(/^\+/, "")})`, tone: "green" });
  }
  if (latest.clean !== null) {
    if (latest.clean > 0) { score += 1; reasons.push({ text: "Clean Money positif", tone: "green" }); }
    else if (latest.clean < 0) { score -= 1; reasons.push({ text: "Clean Money negatif", tone: "red" }); }
  }
  if (latest.rcv !== null) {
    if (latest.rcv > 20) score += 0.5;
    else if (latest.rcv < -50) {
      score -= 0.5;
      reasons.push({ text: `RCV minus (${latest.rcv.toFixed(0)})`, tone: "red" });
    }
  }
  if (prev) {
    score += prev.asingScore * 0.4;
    score += prev.lokalScore * 0.2;
  }
  let bandarAsingDetected = false;
  let asingDistribusiDetected = false;
  let asingComebackDetected = false;
  let jagaHargaDetected = false;
  for (const p of patterns) {
    if (p.label.includes("kembali akumulasi") || p.label.includes("serap saat ritel panic")) {
      score += 3; asingComebackDetected = true; reasons.push({ text: p.label, tone: "green" });
    } else if (p.label.includes("Bandar Asing serap")) {
      score += 2; bandarAsingDetected = true; reasons.push({ text: p.label, tone: "green" });
    } else if (p.label.includes("Asing distribusi ke lokal")) {
      score -= 3; asingDistribusiDetected = true; reasons.push({ text: p.label, tone: "red" });
    } else if (p.label.includes("Distribusi serentak")) {
      score -= 2; reasons.push({ text: p.label, tone: "red" });
    } else if (p.label.includes("Lokal follow")) {
      score += 1; reasons.push({ text: p.label, tone: "green" });
    } else if (p.label.includes("Jaga harga")) {
      score += 0.5; jagaHargaDetected = true; reasons.push({ text: p.label, tone: "amber" });
    } else if (p.label.includes("Akumulasi tahap awal")) {
      score += 1; reasons.push({ text: p.label, tone: "amber" });
    }
  }
  const hasAsingPattern = reasons.some((r) => /Asing|Bandar|Distribusi|Akumulasi/i.test(r.text));
  const hasLokalPattern = reasons.some((r) => /Lokal|Jaga harga|Distribusi serentak/i.test(r.text));
  if (latest.asingScore !== 0 && !hasAsingPattern) {
    reasons.push({ text: `Asing ${latest.ketNbsa}`, tone: ketTone(latest.asingScore) });
  }
  if (latest.lokalScore !== 0 && !hasLokalPattern) {
    reasons.push({ text: `Lokal ${latest.ketMf}`, tone: ketTone(latest.lokalScore) });
  }

  // ===== Driver chip dari broker analysis =====
  const brokerDayInfo: DayInfo | null = (() => {
    if (!brokerAnalysis) return null;
    const target = brokerAnalysis.date;
    const found = days.find((d) => normalizeMergedDate(d.date) === target);
    return found ?? latest;
  })();
  const groundTruthAsingDir: 1 | 0 | -1 = brokerDayInfo?.nbsa != null
    ? brokerDayInfo.nbsa > 0 ? 1 : brokerDayInfo.nbsa < 0 ? -1 : 0
    : 0;
  const groundTruthLokalDir: 1 | 0 | -1 = brokerDayInfo?.mf != null
    ? brokerDayInfo.mf > 0 ? 1 : brokerDayInfo.mf < 0 ? -1 : 0
    : 0;

  if (brokerAnalysis) {
    const { narrative, netAsing, netLokal } = brokerAnalysis;
    const dirAkum = (n: number): "AKUM" | "DIST" | null => n > 0 ? "AKUM" : n < 0 ? "DIST" : null;
    const asingDirSign = groundTruthAsingDir !== 0 ? groundTruthAsingDir : netAsing > 0 ? 1 : netAsing < 0 ? -1 : 0;
    const lokalDirSign = groundTruthLokalDir !== 0 ? groundTruthLokalDir : netLokal > 0 ? 1 : netLokal < 0 ? -1 : 0;
    const dirFromSign = (s: number): "AKUM" | "DIST" | null => s > 0 ? "AKUM" : s < 0 ? "DIST" : null;
    let driverText: string | null = null;
    let driverTone: Tone = "neutral";
    switch (narrative.label) {
      case "ASING DRIVER": {
        const dir = dirFromSign(asingDirSign) ?? dirAkum(netAsing);
        if (dir) { driverText = `Asing Driver ${dir}`; driverTone = dir === "AKUM" ? "green" : "red"; }
        break;
      }
      case "LOKAL DRIVER": {
        const dir = dirFromSign(lokalDirSign) ?? dirAkum(netLokal);
        if (dir) { driverText = `Lokal Driver ${dir}`; driverTone = dir === "AKUM" ? "green" : "red"; }
        break;
      }
      case "DUA-DUANYA AKUM":
        if (asingDirSign < 0 && lokalDirSign < 0) { driverText = "Asing+Lokal DIST"; driverTone = "red"; }
        else if (asingDirSign < 0 || lokalDirSign < 0) { driverText = "Broker Campuran"; driverTone = "amber"; }
        else { driverText = "Asing+Lokal AKUM"; driverTone = "green"; }
        break;
      case "DISTRIBUSI":
        if (asingDirSign > 0 && lokalDirSign > 0) { driverText = "Asing+Lokal AKUM"; driverTone = "green"; }
        else if (asingDirSign > 0 || lokalDirSign > 0) { driverText = "Broker Campuran"; driverTone = "amber"; }
        else { driverText = "Asing+Lokal DIST"; driverTone = "red"; }
        break;
      case "CAMPURAN":
        driverText = "Broker Campuran"; driverTone = "amber";
        break;
    }
    if (driverText) reasons.unshift({ text: driverText, tone: driverTone });
  }

  const reasonsTopFour = reasons.slice(0, 4);

  // ===== Rekomendasi final =====
  let recommendation: Recommendation;
  if (asingComebackDetected) {
    recommendation = {
      label: score >= 2 ? "AKUMULASI" : "TAHAN",
      tone: score >= 2 ? "green" : "amber",
      headline: "Asing kembali masuk — sinyal awal driver baru",
      detail: `Asing balik akumulasi (${latest.ketNbsa}, NBSA ${fmtIDR(latest.nbsa ?? 0)}) ${latest.gain !== null && latest.gain < 0 ? `saat harga turun ${latest.gain.toFixed(2)}% — ritel panic, asing serap` : "setelah distribusi sebelumnya"}. Smart Money mungkin belum muncul karena ini langkah awal — biasanya tahap berikutnya smart money besar baru masuk. Beli bertahap, ikuti arah asing.`,
    };
  } else if (bandarAsingDetected && score >= 2) {
    recommendation = {
      label: "AKUMULASI", tone: "green",
      headline: "Bandar Asing serap — sinyal beli kuat",
      detail: `Asing (smart money) sedang akumulasi sementara lokal melepas. Pola klasik bandar asing masuk dari distribusi ritel. Pertimbangkan beli bertahap, ikuti arah asing.`,
    };
  } else if (asingDistribusiDetected) {
    recommendation = {
      label: "KURANGI", tone: "red",
      headline: "Asing distribusi ke lokal — kurangi posisi",
      detail: `Asing keluar sementara lokal serap — biasanya retail jadi bag holder. Pertimbangkan kurangi posisi sebelum harga turun lebih dalam.`,
    };
  } else if (score >= 3) {
    recommendation = {
      label: "AKUMULASI", tone: "green",
      headline: "Sinyal beli — bandar sedang akumulasi",
      detail: `Beberapa indikator menunjukkan tekanan beli kuat di 3 hari terakhir. Pertimbangkan beli bertahap (cicil), jangan all-in sekaligus.`,
    };
  } else if (score <= -3) {
    recommendation = {
      label: "KURANGI", tone: "red",
      headline: "Sinyal jual — bandar sedang distribusi",
      detail: `Bandar terlihat melepas saham di 3 hari terakhir. Pertimbangkan kurangi posisi atau setidaknya tidak menambah baru.`,
    };
  } else if (jagaHargaDetected) {
    recommendation = {
      label: "TAHAN", tone: "amber",
      headline: "Sedang dijaga — belum ada arah jelas",
      detail: `Asing & lokal Ket netral, harga stabil — sedikit yang keluar, ada yang jaga harga. Tunggu konfirmasi arah berikutnya sebelum aksi.`,
    };
  } else {
    recommendation = {
      label: "TAHAN", tone: "amber",
      headline: "Sinyal campuran — belum jelas",
      detail: `Indikator 3 hari terakhir belum kompak. Tahan posisi yang ada, tunggu konfirmasi arah lebih jelas sebelum aksi.`,
    };
  }

  // ===== Konfirmasi Broker (BandarConclusion + buildBrokerInsight) =====
  let brokerInsight: BrokerInsight | null = null;
  if (brokerAnalysis) {
    const { netAsing, netLokal, date, topAsingBuyer, topAsingSeller, topLokalBuyer, topLokalSeller, totalBuy } = brokerAnalysis;
    const asingDir: number = groundTruthAsingDir !== 0
      ? groundTruthAsingDir
      : netAsing > 0 ? 1 : netAsing < 0 ? -1 : 0;
    const lokalDir: number = groundTruthLokalDir !== 0
      ? groundTruthLokalDir
      : netLokal > 0 ? 1 : netLokal < 0 ? -1 : 0;
    const insight = buildBrokerInsight({
      netAsing, netLokal,
      topAsingBuyer, topAsingSeller, topLokalBuyer, topLokalSeller,
      totalBuy,
      asingDirOverride: asingDir,
      lokalDirOverride: lokalDir,
    });
    const effTone: Tone =
      asingDir > 0 && lokalDir >= 0 ? "green"
      : asingDir < 0 && lokalDir <= 0 ? "red"
      : asingDir > 0 && lokalDir < 0 ? "green"
      : asingDir < 0 && lokalDir > 0 ? "red"
      : asingDir > 0 ? "green"
      : asingDir < 0 ? "red"
      : "neutral";
    const sejalan = (recommendation.tone === "green" && effTone === "green") || (recommendation.tone === "red" && effTone === "red");
    const bertentangan = (recommendation.tone === "green" && effTone === "red") || (recommendation.tone === "red" && effTone === "green");
    const arah =
      recommendation.label === "AKUMULASI" ? "sinyal beli"
      : recommendation.label === "KURANGI" ? "sinyal jual"
      : "sinyal tahan";
    const verdictPrefix = sejalan
      ? `Searah dengan ${arah}:`
      : bertentangan
        ? `Berlawanan — perhatikan sebelum eksekusi:`
        : `Konteks broker hari terakhir:`;
    const verdictTone: Tone = sejalan ? effTone : bertentangan ? "amber" : "neutral";
    brokerInsight = { date, verdictPrefix, verdictTone, insight };
  }

  return {
    days, latest, prev,
    periodLabel,
    totalNbsa, totalMf, totalValue,
    nbsaSeen, mfSeen, valueSeen,
    pctLabel, pctOf,
    asingStatus, lokalStatus,
    patterns, freqTrend,
    recommendation, score, reasons, reasonsTopFour,
    groundTruth: {
      asingDir: groundTruthAsingDir,
      lokalDir: groundTruthLokalDir,
      nbsa: brokerDayInfo?.nbsa ?? null,
      mf: brokerDayInfo?.mf ?? null,
      ketNbsa: brokerDayInfo?.ketNbsa ?? "",
      ketMf: brokerDayInfo?.ketMf ?? "",
    },
    brokerInsight,
  };
}
