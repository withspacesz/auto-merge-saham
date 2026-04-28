import { Activity, Users, Globe2, Target, Calendar, Building2 } from "lucide-react";
import type { MergedTable, MergedRow } from "@/lib/merger";
import type { BrokerAnalysis } from "@/lib/parser-broker";

const SUFFIX_MULT: Record<string, number> = { rb: 1e3, jt: 1e6, m: 1e9 };

function parseVal(raw: string): number | null {
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

function parsePct(raw: string): number | null {
  if (!raw) return null;
  const m = raw.replace(/[^\d+\-.]/g, "").match(/^([+-]?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  return parseFloat(m[1]);
}

function fmtIDR(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}M`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}Jt`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(2)}Rb`;
  return `${sign}${abs.toFixed(0)}`;
}

type Tone = "green" | "red" | "neutral" | "amber";

const TONE_BG: Record<Tone, string> = {
  green: "bg-emerald-500/10 border-emerald-500/30",
  red: "bg-rose-500/10 border-rose-500/30",
  amber: "bg-amber-500/10 border-amber-500/30",
  neutral: "bg-muted/20 border-border",
};

const TONE_TEXT: Record<Tone, string> = {
  green: "text-emerald-300",
  red: "text-rose-300",
  amber: "text-amber-300",
  neutral: "text-foreground",
};

const TONE_BADGE: Record<Tone, string> = {
  green: "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40",
  red: "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40",
  amber: "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40",
  neutral: "bg-muted text-muted-foreground ring-1 ring-border",
};

// ===== Klasifikasi label Ket NBSA / Ket MF jadi skor numerik =====
// Massive Accum > Big > Normal > Small > Netral > Small Dist > ... > Massive Dist
function ketScore(ket: string | undefined): number {
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
  return 0; // Netral, Nihil, atau lainnya
}

function ketTone(score: number): Tone {
  if (score >= 2) return "green";
  if (score <= -2) return "red";
  return "neutral";
}

// Tabel merged biasanya pakai format "DD-MM-YYYY", broker analysis pakai
// "YYYY-MM-DD". Normalisasi ke YYYY-MM-DD untuk pencocokan.
function normalizeMergedDate(s: string): string {
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return s;
}

type DayInfo = {
  date: string;
  price: number | null;
  gain: number | null; // %
  freq: number | null;
  nbsa: number | null;
  mf: number | null;
  value: number | null;
  ketNbsa: string;
  ketMf: string;
  asingScore: number; // -5..+5 (dari Ket NBSA)
  lokalScore: number; // -5..+5 (dari Ket MF)
  tx: number | null;
  avp: number | null;
  smart: number | null;
  bad: number | null;
  clean: number | null;
  rcv: number | null;
};

function analyzeDay(r: MergedRow): DayInfo {
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

type Props = { merged: MergedTable; brokerAnalysis?: BrokerAnalysis | null };

export function SummaryCard({ merged, brokerAnalysis }: Props) {
  const allData = merged.rows.filter((r) => !r.__isTotal);
  if (allData.length === 0) return null;

  // Ambil 3 hari terakhir untuk analisa (rows sudah disort desc by date,
  // jadi index 0 = hari terbaru). Kalau data < 3 hari, pakai semua yang ada.
  const data = allData.slice(0, 3);
  const days = data.map(analyzeDay); // index 0 = terbaru, index akhir = paling lama
  const latest = days[0];
  const prev = days[1] ?? null;
  const prev2 = days[2] ?? null;

  // ===== Akumulasi 3 hari =====
  let totalNbsa = 0;
  let nbsaSeen = false;
  let totalMf = 0;
  let mfSeen = false;
  let totalValue = 0;
  let valueSeen = false;
  for (const d of days) {
    if (d.nbsa !== null) {
      totalNbsa += d.nbsa;
      nbsaSeen = true;
    }
    if (d.mf !== null) {
      totalMf += d.mf;
      mfSeen = true;
    }
    if (d.value !== null) {
      totalValue += d.value;
      valueSeen = true;
    }
  }

  const periodLabel = (() => {
    if (days.length === 0) return "—";
    if (days.length === 1) return latest.date;
    const oldest = days[days.length - 1].date;
    return `${oldest} → ${latest.date}`;
  })();

  // Ambang adaptif: 5% dari total Value 3 hari
  const PCT = 0.05;
  const dynamicThreshold = valueSeen && totalValue > 0 ? totalValue * PCT : null;
  const nbsaThreshold = dynamicThreshold ?? 0;
  const mfThreshold = dynamicThreshold ?? 1e9;
  const pctLabel = `${(PCT * 100).toFixed(0)}% Value`;

  const pctOf = (n: number): string =>
    valueSeen && totalValue > 0
      ? `${((Math.abs(n) / totalValue) * 100).toFixed(2)}%`
      : "—";

  // ===== Status Asing & Lokal (3 hari) =====
  const asingStatus: { label: string; tone: Tone; sub: string } = nbsaSeen
    ? totalNbsa > nbsaThreshold
      ? {
          label: "Asing AKUMULASI",
          tone: "green",
          sub: `Net Buy ${fmtIDR(totalNbsa)} (${pctOf(totalNbsa)} Value 3hr) — asing serap saham`,
        }
      : totalNbsa < -nbsaThreshold
        ? {
            label: "Asing DISTRIBUSI",
            tone: "red",
            sub: `Net Sell ${fmtIDR(totalNbsa)} (${pctOf(totalNbsa)} Value 3hr) — asing lebih banyak jual`,
          }
        : {
            label: "Asing NETRAL",
            tone: "neutral",
            sub: `${fmtIDR(totalNbsa)} (${pctOf(totalNbsa)} Value 3hr) — di bawah ambang ±${pctLabel}`,
          }
    : { label: "Data NBSA tidak ada", tone: "neutral", sub: "—" };

  const lokalStatus: { label: string; tone: Tone; sub: string } = mfSeen
    ? totalMf > mfThreshold
      ? {
          label: "Lokal AKUMULASI",
          tone: "green",
          sub: `MF ${fmtIDR(totalMf)} (${pctOf(totalMf)} Value 3hr) — lokal dominan beli`,
        }
      : totalMf < -mfThreshold
        ? {
            label: "Lokal DISTRIBUSI",
            tone: "red",
            sub: `MF ${fmtIDR(totalMf)} (${pctOf(totalMf)} Value 3hr) — lokal dominan jual`,
          }
        : {
            label: "Lokal NETRAL",
            tone: "neutral",
            sub: `MF ${fmtIDR(totalMf)} (${pctOf(totalMf)} Value 3hr) — di bawah ambang ±${pctLabel}`,
          }
    : { label: "Data MF tidak ada", tone: "neutral", sub: "—" };

  // ===== Driver vs Follower (sisi yang lebih dominan di hari terakhir) =====
  type Role = "driver" | "follower" | null;
  let asingRole: Role = null;
  let lokalRole: Role = null;
  if (latest.nbsa !== null && latest.mf !== null) {
    const absA = Math.abs(latest.nbsa);
    const absL = Math.abs(latest.mf);
    const absKetA = Math.abs(latest.asingScore);
    const absKetL = Math.abs(latest.lokalScore);
    // Pakai gabungan: pemenang adalah yang skor Ket-nya lebih tinggi,
    // atau (kalau Ket sama) yang nominal NBSA/MF-nya lebih besar.
    const asingDominan = absKetA > absKetL || (absKetA === absKetL && absA > absL);
    const lokalDominan = absKetL > absKetA || (absKetL === absKetA && absL > absA);
    if (asingDominan && (latest.asingScore !== 0 || latest.nbsa !== 0)) {
      asingRole = "driver";
      if (
        latest.lokalScore !== 0 &&
        Math.sign(latest.lokalScore) === Math.sign(latest.asingScore)
      ) {
        lokalRole = "follower";
      }
    } else if (lokalDominan && (latest.lokalScore !== 0 || latest.mf !== 0)) {
      lokalRole = "driver";
      if (
        latest.asingScore !== 0 &&
        Math.sign(latest.asingScore) === Math.sign(latest.lokalScore)
      ) {
        asingRole = "follower";
      }
    }
  }

  // ===== Deteksi pola lintas-hari =====
  type Pattern = { label: string; tone: Tone; desc: string };
  const patterns: Pattern[] = [];

  // 1. Asing kembali akumulasi setelah distribusi (reversal)
  // Hari terakhir asing buy/akum, hari sebelumnya asing distribusi
  if (
    prev &&
    latest.asingScore >= 2 &&
    prev.asingScore <= -2 &&
    latest.nbsa !== null &&
    latest.nbsa > 0
  ) {
    patterns.push({
      label: "🔄 Asing kembali akumulasi",
      tone: "green",
      desc: `Hari terakhir asing balik masuk (${latest.ketNbsa}, NBSA ${fmtIDR(latest.nbsa)}) setelah ${prev.date} distribusi (${prev.ketNbsa}). Sinyal awal driver baru — asing biasanya akum saat ritel sudah panic.`,
    });
  } else if (
    prev &&
    latest.asingScore >= 2 &&
    latest.gain !== null &&
    latest.gain < -2
  ) {
    // Asing akum saat harga turun >2% (serap saat ritel panic)
    patterns.push({
      label: "💪 Asing serap saat ritel panic",
      tone: "green",
      desc: `Harga turun ${latest.gain.toFixed(2)}% tapi asing tetap akum (${latest.ketNbsa}, ${fmtIDR(latest.nbsa ?? 0)}). Asing tidak takut koreksi.`,
    });
  }

  // 2. Bandar asing serap (asing buy + lokal sell)
  if (latest.asingScore > 0 && latest.lokalScore < 0) {
    patterns.push({
      label: "🎯 Bandar Asing serap",
      tone: "green",
      desc: `Asing serap (${latest.ketNbsa}) sementara lokal lepas (${latest.ketMf}) — pola klasik smart money masuk dari distribusi ritel.`,
    });
  }

  // 3. Asing distribusi ke lokal (asing sell + lokal buy)
  if (latest.asingScore < 0 && latest.lokalScore > 0) {
    patterns.push({
      label: "🚨 Asing distribusi ke lokal",
      tone: "red",
      desc: `Asing keluar (${latest.ketNbsa}) sementara lokal masuk (${latest.ketMf}) — biasanya retail jadi bag holder. Hati-hati.`,
    });
  }

  // 4. Distribusi serentak (asing & lokal sama-sama jual besar)
  if (latest.asingScore <= -2 && latest.lokalScore <= -2) {
    patterns.push({
      label: "🚨 Distribusi serentak",
      tone: "red",
      desc: `Asing & lokal sama-sama lepas (${latest.ketNbsa} & ${latest.ketMf}). Tekanan jual tinggi — kemungkinan harga lanjut turun.`,
    });
  }

  // 5. Lokal follow asing (asing kemarin akum, hari ini lokal akum)
  if (
    prev &&
    prev.asingScore >= 2 &&
    latest.lokalScore >= 2 &&
    latest.asingScore <= 1
  ) {
    patterns.push({
      label: "👥 Lokal follow Asing",
      tone: "green",
      desc: `Lokal mulai ikut beli (${latest.ketMf}) setelah asing akum di ${prev.date} (${prev.ketNbsa}). Pola lokal mengejar — biasanya harga tetap jalan naik.`,
    });
  }

  // 6. Jaga harga (asing & lokal Ket netral, NBSA tipis positif, harga stabil)
  if (
    latest.asingScore === 0 &&
    latest.lokalScore === 0 &&
    latest.nbsa !== null &&
    latest.nbsa > 0 &&
    latest.gain !== null &&
    Math.abs(latest.gain) < 2
  ) {
    patterns.push({
      label: "🛡️ Jaga harga",
      tone: "amber",
      desc: `Ket NBSA & Ket MF netral, NBSA tipis +${fmtIDR(latest.nbsa).replace(/^\+/, "")}, harga stabil ${latest.gain >= 0 ? "+" : ""}${latest.gain.toFixed(2)}% — sedikit yang keluar, ada yang jaga harga.`,
    });
  }

  // 7. Smart money aktif (Smart M > 0 di hari terakhir)
  if (latest.smart !== null && latest.smart > 0) {
    patterns.push({
      label: "💎 Smart Money aktif",
      tone: "green",
      desc: `Smart Money +${fmtIDR(latest.smart).replace(/^\+/, "")} di hari terakhir — ada akumulasi besar terdeteksi.`,
    });
  } else if (
    latest.smart !== null &&
    latest.smart === 0 &&
    latest.asingScore >= 2
  ) {
    // Asing akum tapi smart money belum muncul = langkah awal
    patterns.push({
      label: "⏳ Akumulasi tahap awal",
      tone: "amber",
      desc: `Asing akum (${latest.ketNbsa}) tapi Smart Money belum aktif — biasanya langkah awal sebelum smart money besar masuk.`,
    });
  }

  // 8. Clean Money & RCV positif di hari terakhir
  if (
    latest.clean !== null &&
    latest.clean > 0 &&
    latest.rcv !== null &&
    latest.rcv > 0
  ) {
    patterns.push({
      label: "✅ Clean Money + RCV positif",
      tone: "green",
      desc: `Clean Money +${fmtIDR(latest.clean).replace(/^\+/, "")} & RCV +${latest.rcv.toFixed(0)} — akumulasi bersih jelas.`,
    });
  } else if (
    latest.clean !== null &&
    latest.clean < 0 &&
    latest.rcv !== null &&
    latest.rcv < -50
  ) {
    patterns.push({
      label: "⚠️ Clean Money + RCV negatif",
      tone: "red",
      desc: `Clean Money ${fmtIDR(latest.clean)} & RCV ${latest.rcv.toFixed(0)} — distribusi bersih kuat.`,
    });
  }

  // 9. Tren Freq / Tx 3 hari (latest vs avg 2 hari sebelumnya)
  let freqTrend: { label: string; tone: Tone; desc: string } | null = null;
  if (latest.tx !== null && latest.tx > 0 && prev?.tx && prev2?.tx) {
    const prevAvg = (prev.tx + prev2.tx) / 2;
    const ratio = latest.tx / prevAvg;
    const pct = ((ratio - 1) * 100).toFixed(0);
    const sign = ratio >= 1 ? "+" : "";
    if (ratio >= 1.2) {
      freqTrend = {
        label: "↑ Aktivitas Meningkat",
        tone: "green",
        desc: `Tx hari terakhir ${latest.tx.toFixed(0)}x vs rata-rata 2 hari ${prevAvg.toFixed(1)}x (${sign}${pct}%) — minat pasar naik.`,
      };
    } else if (ratio <= 0.8) {
      freqTrend = {
        label: "↓ Aktivitas Menurun",
        tone: "red",
        desc: `Tx hari terakhir ${latest.tx.toFixed(0)}x vs rata-rata 2 hari ${prevAvg.toFixed(1)}x (${sign}${pct}%) — minat pasar turun.`,
      };
    }
  }
  if (freqTrend) patterns.push(freqTrend);

  // ===== Skoring rekomendasi (3 hari, bobot tertimbang) =====
  // Hari terakhir bobot terbesar; pola lintas-hari beri tambahan/kurangan.
  let score = 0;
  const reasons: Array<{ text: string; tone: Tone }> = [];

  // Hari terakhir — Ket NBSA & Ket MF (bobot besar)
  score += latest.asingScore * 1.2; // Asing = smart money, bobot lebih besar
  score += latest.lokalScore * 0.8;

  // Smart Money & Clean & RCV hari terakhir
  if (latest.smart !== null && latest.smart > 0) {
    score += 1.5;
    reasons.push({ text: `Smart Money aktif (+${fmtIDR(latest.smart).replace(/^\+/, "")})`, tone: "green" });
  }
  if (latest.clean !== null) {
    if (latest.clean > 0) {
      score += 1;
      reasons.push({ text: "Clean Money positif", tone: "green" });
    } else if (latest.clean < 0) {
      score -= 1;
      reasons.push({ text: "Clean Money negatif", tone: "red" });
    }
  }
  if (latest.rcv !== null) {
    if (latest.rcv > 20) {
      score += 0.5;
    } else if (latest.rcv < -50) {
      score -= 0.5;
      reasons.push({ text: `RCV minus (${latest.rcv.toFixed(0)})`, tone: "red" });
    }
  }

  // Hari sebelumnya (bobot lebih kecil) untuk konteks
  if (prev) {
    score += prev.asingScore * 0.4;
    score += prev.lokalScore * 0.2;
  }

  // Pattern bonus
  let bandarAsingDetected = false;
  let asingDistribusiDetected = false;
  let asingComebackDetected = false;
  let jagaHargaDetected = false;

  for (const p of patterns) {
    if (p.label.includes("kembali akumulasi") || p.label.includes("serap saat ritel panic")) {
      score += 3;
      asingComebackDetected = true;
      reasons.push({ text: p.label, tone: "green" });
    } else if (p.label.includes("Bandar Asing serap")) {
      score += 2;
      bandarAsingDetected = true;
      reasons.push({ text: p.label, tone: "green" });
    } else if (p.label.includes("Asing distribusi ke lokal")) {
      score -= 3;
      asingDistribusiDetected = true;
      reasons.push({ text: p.label, tone: "red" });
    } else if (p.label.includes("Distribusi serentak")) {
      score -= 2;
      reasons.push({ text: p.label, tone: "red" });
    } else if (p.label.includes("Lokal follow")) {
      score += 1;
      reasons.push({ text: p.label, tone: "green" });
    } else if (p.label.includes("Jaga harga")) {
      score += 0.5;
      jagaHargaDetected = true;
      reasons.push({ text: p.label, tone: "amber" });
    } else if (p.label.includes("Akumulasi tahap awal")) {
      score += 1;
      reasons.push({ text: p.label, tone: "amber" });
    }
  }

  // Ket asing/lokal hari terakhir hanya ditampilkan kalau belum tertutup
  // pattern lain — biar chip tidak overload (max 4 chip total).
  const hasAsingPattern = reasons.some((r) =>
    /Asing|Bandar|Distribusi|Akumulasi/i.test(r.text),
  );
  const hasLokalPattern = reasons.some((r) =>
    /Lokal|Jaga harga|Distribusi serentak/i.test(r.text),
  );
  if (latest.asingScore !== 0 && !hasAsingPattern) {
    reasons.push({
      text: `Asing ${latest.ketNbsa}`,
      tone: ketTone(latest.asingScore),
    });
  }
  if (latest.lokalScore !== 0 && !hasLokalPattern) {
    reasons.push({
      text: `Lokal ${latest.ketMf}`,
      tone: ketTone(latest.lokalScore),
    });
  }

  // Driver chip — selalu di paling depan supaya user langsung lihat
  // siapa yg jadi driver hari terakhir + arahnya AKUM/DIST.
  // Cari hari di tabel merged yang tanggalnya = tanggal broker analysis
  // (broker hanya punya top-10, NBSA/MF di tabel adalah total pasar penuh
  // → dipakai sebagai ground truth arah asing/lokal).
  const brokerDayInfo: DayInfo | null = (() => {
    if (!brokerAnalysis) return null;
    const target = brokerAnalysis.date; // "YYYY-MM-DD"
    const found = days.find(
      (d) => normalizeMergedDate(d.date) === target,
    );
    return found ?? latest;
  })();
  const groundTruthAsingDir: 1 | 0 | -1 = brokerDayInfo?.nbsa != null
    ? brokerDayInfo.nbsa > 0
      ? 1
      : brokerDayInfo.nbsa < 0
        ? -1
        : 0
    : 0;
  const groundTruthLokalDir: 1 | 0 | -1 = brokerDayInfo?.mf != null
    ? brokerDayInfo.mf > 0
      ? 1
      : brokerDayInfo.mf < 0
        ? -1
        : 0
    : 0;

  if (brokerAnalysis) {
    const { narrative, netAsing, netLokal } = brokerAnalysis;
    const dirAkum = (n: number): "AKUM" | "DIST" | null =>
      n > 0 ? "AKUM" : n < 0 ? "DIST" : null;
    // Pakai NBSA/MF aktual dari tabel sebagai sumber kebenaran arah,
    // baru fallback ke net broker top-10 kalau ground truth nol.
    const asingDirSign = groundTruthAsingDir !== 0
      ? groundTruthAsingDir
      : netAsing > 0
        ? 1
        : netAsing < 0
          ? -1
          : 0;
    const lokalDirSign = groundTruthLokalDir !== 0
      ? groundTruthLokalDir
      : netLokal > 0
        ? 1
        : netLokal < 0
          ? -1
          : 0;
    const dirFromSign = (s: number): "AKUM" | "DIST" | null =>
      s > 0 ? "AKUM" : s < 0 ? "DIST" : null;
    let driverText: string | null = null;
    let driverTone: Tone = "neutral";
    switch (narrative.label) {
      case "ASING DRIVER": {
        const dir = dirFromSign(asingDirSign) ?? dirAkum(netAsing);
        if (dir) {
          driverText = `Asing Driver ${dir}`;
          driverTone = dir === "AKUM" ? "green" : "red";
        }
        break;
      }
      case "LOKAL DRIVER": {
        const dir = dirFromSign(lokalDirSign) ?? dirAkum(netLokal);
        if (dir) {
          driverText = `Lokal Driver ${dir}`;
          driverTone = dir === "AKUM" ? "green" : "red";
        }
        break;
      }
      case "DUA-DUANYA AKUM":
        // Hormati ground truth: kalau salah satunya sebenarnya distribusi,
        // jangan klaim dua-duanya akumulasi.
        if (asingDirSign < 0 && lokalDirSign < 0) {
          driverText = "Asing+Lokal DIST";
          driverTone = "red";
        } else if (asingDirSign < 0 || lokalDirSign < 0) {
          driverText = "Broker Campuran";
          driverTone = "amber";
        } else {
          driverText = "Asing+Lokal AKUM";
          driverTone = "green";
        }
        break;
      case "DISTRIBUSI":
        if (asingDirSign > 0 && lokalDirSign > 0) {
          driverText = "Asing+Lokal AKUM";
          driverTone = "green";
        } else if (asingDirSign > 0 || lokalDirSign > 0) {
          driverText = "Broker Campuran";
          driverTone = "amber";
        } else {
          driverText = "Asing+Lokal DIST";
          driverTone = "red";
        }
        break;
      case "CAMPURAN":
        driverText = "Broker Campuran";
        driverTone = "amber";
        break;
    }
    if (driverText) {
      reasons.unshift({ text: driverText, tone: driverTone });
    }
  }

  // Cap di 4 chip terpenting — sisanya disimpan tapi tidak ditampilkan.
  const reasonsTopFour = reasons.slice(0, 4);

  // ===== Rekomendasi =====
  type Recommendation = {
    label: "AKUMULASI" | "TAHAN" | "KURANGI";
    tone: Tone;
    headline: string;
    detail: string;
  };

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
      label: "AKUMULASI",
      tone: "green",
      headline: "Bandar Asing serap — sinyal beli kuat",
      detail: `Asing (smart money) sedang akumulasi sementara lokal melepas. Pola klasik bandar asing masuk dari distribusi ritel. Pertimbangkan beli bertahap, ikuti arah asing.`,
    };
  } else if (asingDistribusiDetected) {
    recommendation = {
      label: "KURANGI",
      tone: "red",
      headline: "Asing distribusi ke lokal — kurangi posisi",
      detail: `Asing keluar sementara lokal serap — biasanya retail jadi bag holder. Pertimbangkan kurangi posisi sebelum harga turun lebih dalam.`,
    };
  } else if (score >= 3) {
    recommendation = {
      label: "AKUMULASI",
      tone: "green",
      headline: "Sinyal beli — bandar sedang akumulasi",
      detail: `Beberapa indikator menunjukkan tekanan beli kuat di 3 hari terakhir. Pertimbangkan beli bertahap (cicil), jangan all-in sekaligus.`,
    };
  } else if (score <= -3) {
    recommendation = {
      label: "KURANGI",
      tone: "red",
      headline: "Sinyal jual — bandar sedang distribusi",
      detail: `Bandar terlihat melepas saham di 3 hari terakhir. Pertimbangkan kurangi posisi atau setidaknya tidak menambah baru.`,
    };
  } else if (jagaHargaDetected) {
    recommendation = {
      label: "TAHAN",
      tone: "amber",
      headline: "Sedang dijaga — belum ada arah jelas",
      detail: `Asing & lokal Ket netral, harga stabil — sedikit yang keluar, ada yang jaga harga. Tunggu konfirmasi arah berikutnya sebelum aksi.`,
    };
  } else {
    recommendation = {
      label: "TAHAN",
      tone: "amber",
      headline: "Sinyal campuran — belum jelas",
      detail: `Indikator 3 hari terakhir belum kompak. Tahan posisi yang ada, tunggu konfirmasi arah lebih jelas sebelum aksi.`,
    };
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border bg-gradient-to-r from-amber-500/5 to-transparent">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-amber-300 tracking-wide">
            Ringkasan & Analisa Bandar
          </h3>
        </div>
        <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Calendar className="h-3 w-3" />
          {days.length} hari terakhir • {periodLabel}
        </span>
      </div>

      <div className="p-3 space-y-2">
        <RecommendationBanner
          recommendation={recommendation}
          score={score}
          reasons={reasonsTopFour}
          brokerAnalysis={brokerAnalysis}
          groundTruth={{
            asingDir: groundTruthAsingDir,
            lokalDir: groundTruthLokalDir,
            nbsa: brokerDayInfo?.nbsa ?? null,
            mf: brokerDayInfo?.mf ?? null,
            ketNbsa: brokerDayInfo?.ketNbsa ?? "",
            ketMf: brokerDayInfo?.ketMf ?? "",
          }}
        />
      </div>

      <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* Timeline 3 hari (kiri) */}
        {days.length >= 1 && (
          <div className="rounded-lg border border-border bg-muted/10 p-2">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 px-0.5">
              Timeline {days.length} hari · paling lama → terbaru
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[...days].reverse().map((d, i) => (
                <DayCard
                  key={d.date + i}
                  day={d}
                  isLatest={i === days.length - 1}
                />
              ))}
            </div>
          </div>
        )}

        {/* Status Asing & Lokal (kanan) */}
        <div className="grid grid-cols-1 gap-2">
          <StatusCard
            icon={<Globe2 className="h-3.5 w-3.5" />}
            title="Status Asing (NBSA)"
            status={asingStatus}
            metricLabel="Net Buy/Sell Asing 3hr"
            metricValue={nbsaSeen ? fmtIDR(totalNbsa) : "—"}
            role={asingRole}
          />
          <StatusCard
            icon={<Users className="h-3.5 w-3.5" />}
            title="Status Lokal (Money Flow)"
            status={lokalStatus}
            metricLabel="Net Money Flow 3hr"
            metricValue={mfSeen ? fmtIDR(totalMf) : "—"}
            role={lokalRole}
          />
        </div>
      </div>
    </div>
  );

  function StatusCard({
    icon,
    title,
    status,
    metricLabel,
    metricValue,
    role,
  }: {
    icon: React.ReactNode;
    title: string;
    status: { label: string; tone: Tone; sub: string };
    metricLabel: string;
    metricValue: string;
    role?: "driver" | "follower" | null;
  }) {
    const roleBadgeClass =
      role === "driver"
        ? "bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/50"
        : role === "follower"
          ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/40"
          : "";
    const roleIcon = role === "driver" ? "🎯 " : role === "follower" ? "↳ " : "";
    return (
      <div className={`rounded-lg border p-3.5 ${TONE_BG[status.tone]}`}>
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider">
            {icon}
            <span>{title}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {role && (
              <span
                className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded uppercase ${roleBadgeClass}`}
              >
                {roleIcon}
                {role}
              </span>
            )}
            <span
              className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded uppercase ${TONE_BADGE[status.tone]}`}
            >
              {status.label}
            </span>
          </div>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <div className="text-[11px] text-muted-foreground">{metricLabel}</div>
            <div
              className={`text-xl font-bold font-mono ${TONE_TEXT[status.tone]}`}
            >
              {metricValue}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground text-right max-w-[55%] leading-snug">
            {status.sub}
          </p>
        </div>
      </div>
    );
  }
}

function DayCard({ day, isLatest }: { day: DayInfo; isLatest: boolean }) {
  // Klasifikasi singkat per hari
  const a = day.asingScore;
  const l = day.lokalScore;
  let summary = "";
  let tone: Tone = "neutral";

  if (a >= 2 && l <= -2) {
    summary = "Asing serap, lokal lepas";
    tone = "green";
  } else if (a <= -2 && l >= 2) {
    summary = "Asing dist ke lokal";
    tone = "red";
  } else if (a >= 2 && l >= 2) {
    summary = "Akumulasi serentak";
    tone = "green";
  } else if (a <= -2 && l <= -2) {
    summary = "Distribusi serentak";
    tone = "red";
  } else if (a >= 2) {
    summary = "Asing akum";
    tone = "green";
  } else if (a <= -2) {
    summary = "Asing dist";
    tone = "red";
  } else if (l >= 2) {
    summary = "Lokal akum";
    tone = "green";
  } else if (l <= -2) {
    summary = "Lokal dist";
    tone = "red";
  } else if (day.nbsa !== null && day.nbsa > 0 && (day.gain ?? 0) >= -1) {
    summary = "Netral, ada yang jaga";
    tone = "amber";
  } else {
    summary = "Netral";
    tone = "neutral";
  }

  const gainStr =
    day.gain !== null
      ? `${day.gain >= 0 ? "+" : ""}${day.gain.toFixed(2)}%`
      : "—";
  const gainTone: Tone =
    day.gain === null
      ? "neutral"
      : day.gain > 0
        ? "green"
        : day.gain < 0
          ? "red"
          : "neutral";

  const nbsaTone =
    (day.nbsa ?? 0) > 0
      ? "text-emerald-300"
      : (day.nbsa ?? 0) < 0
        ? "text-rose-300"
        : "text-muted-foreground";
  const mfTone =
    (day.mf ?? 0) > 0
      ? "text-emerald-300"
      : (day.mf ?? 0) < 0
        ? "text-rose-300"
        : "text-muted-foreground";

  return (
    <div
      className={`rounded-md border p-1.5 ${TONE_BG[tone]} ${isLatest ? "ring-2 ring-amber-400/40" : ""}`}
    >
      <div className="flex items-center justify-between gap-1 mb-1">
        <div className="text-[10px] font-bold text-foreground truncate">
          {day.date}
        </div>
        <span className={`text-[10px] font-mono font-bold ${TONE_TEXT[gainTone]}`}>
          {gainStr}
        </span>
      </div>
      {isLatest && (
        <div className="mb-1">
          <span className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40">
            Terbaru
          </span>
        </div>
      )}
      <div className={`text-[10.5px] font-semibold mb-1 leading-tight ${TONE_TEXT[tone]}`}>
        {summary}
      </div>
      <div className="space-y-0.5 text-[10px] leading-tight">
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-muted-foreground shrink-0">NBSA</span>
          <span className={`font-mono text-right truncate ${nbsaTone}`}>
            {day.nbsa !== null ? fmtIDR(day.nbsa) : "—"}
          </span>
        </div>
        {day.ketNbsa && (
          <div
            className={`text-right text-[9.5px] truncate ${TONE_TEXT[ketTone(day.asingScore)]}`}
          >
            {day.ketNbsa}
          </div>
        )}
        <div className="flex items-baseline justify-between gap-1 pt-0.5">
          <span className="text-muted-foreground shrink-0">MF</span>
          <span className={`font-mono text-right truncate ${mfTone}`}>
            {day.mf !== null ? fmtIDR(day.mf) : "—"}
          </span>
        </div>
        {day.ketMf && (
          <div
            className={`text-right text-[9.5px] truncate ${TONE_TEXT[ketTone(day.lokalScore)]}`}
          >
            {day.ketMf}
          </div>
        )}
      </div>
    </div>
  );
}

function RecommendationBanner({
  recommendation,
  score,
  reasons,
  brokerAnalysis,
  groundTruth,
}: {
  recommendation: {
    label: "AKUMULASI" | "TAHAN" | "KURANGI";
    tone: Tone;
    headline: string;
    detail: string;
  };
  score: number;
  reasons: Array<{ text: string; tone: Tone }>;
  brokerAnalysis?: BrokerAnalysis | null;
  groundTruth?: {
    asingDir: 1 | 0 | -1;
    lokalDir: 1 | 0 | -1;
    nbsa: number | null;
    mf: number | null;
    ketNbsa: string;
    ketMf: string;
  };
}) {
  const { label, tone, headline, detail } = recommendation;
  const scoreSign = score > 0 ? "+" : "";
  return (
    <div
      className={`rounded-lg border p-4 ${TONE_BG[tone]} ring-1 ring-inset ${
        tone === "green"
          ? "ring-emerald-500/30"
          : tone === "red"
            ? "ring-rose-500/30"
            : "ring-amber-500/30"
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${TONE_BADGE[tone]}`}
        >
          <Target className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Rekomendasi
            </span>
            <span
              className={`text-sm font-extrabold tracking-wider px-2 py-0.5 rounded uppercase ${TONE_BADGE[tone]}`}
            >
              {label}
            </span>
            <span className="text-[10px] text-muted-foreground">
              skor {scoreSign}
              {score.toFixed(1)}
            </span>
          </div>
          <div className={`text-sm md:text-base font-bold mt-1 ${TONE_TEXT[tone]}`}>
            {headline}
          </div>
          <p className="text-[11px] md:text-xs text-muted-foreground mt-1 leading-relaxed max-w-[680px]">
            {detail}
          </p>
          {reasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {reasons.map((r, i) => (
                <span
                  key={i}
                  className={`text-[10px] px-2 py-0.5 rounded ${TONE_BADGE[r.tone]}`}
                >
                  {r.text}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {brokerAnalysis && (
        <BandarConclusion
          analysis={brokerAnalysis}
          recommendationTone={tone}
          recommendationLabel={label}
          groundTruth={
            groundTruth ?? {
              asingDir: 0,
              lokalDir: 0,
              nbsa: null,
              mf: null,
              ketNbsa: "",
              ketMf: "",
            }
          }
        />
      )}
    </div>
  );
}

function BandarConclusion({
  analysis,
  recommendationTone,
  recommendationLabel,
  groundTruth,
}: {
  analysis: BrokerAnalysis;
  recommendationTone: Tone;
  recommendationLabel: "AKUMULASI" | "TAHAN" | "KURANGI";
  groundTruth?: {
    asingDir: 1 | 0 | -1;
    lokalDir: 1 | 0 | -1;
    nbsa: number | null;
    mf: number | null;
    ketNbsa: string;
    ketMf: string;
  };
}) {
  const {
    netAsing,
    netLokal,
    date,
    topAsingBuyer,
    topAsingSeller,
    topLokalBuyer,
    topLokalSeller,
    totalBuy,
  } = analysis;

  // Pakai NBSA/MF aktual dari tabel sebagai sumber kebenaran arah.
  // Broker hanya punya top-10 jadi totalnya bisa menyesatkan.
  const asingDir: number = groundTruth && groundTruth.asingDir !== 0
    ? groundTruth.asingDir
    : netAsing > 0 ? 1 : netAsing < 0 ? -1 : 0;
  const lokalDir: number = groundTruth && groundTruth.lokalDir !== 0
    ? groundTruth.lokalDir
    : netLokal > 0 ? 1 : netLokal < 0 ? -1 : 0;

  // Insight ringkas (1 kalimat) yang nyebut nama broker dominan.
  const insight = buildBrokerInsight({
    netAsing,
    netLokal,
    topAsingBuyer,
    topAsingSeller,
    topLokalBuyer,
    topLokalSeller,
    totalBuy,
    asingDirOverride: asingDir,
    lokalDirOverride: lokalDir,
  });

  // Tone efektif berdasarkan ground truth.
  const effTone: Tone =
    asingDir > 0 && lokalDir >= 0
      ? "green"
      : asingDir < 0 && lokalDir <= 0
        ? "red"
        : asingDir > 0 && lokalDir < 0
          ? "green" // bandar asing serap
          : asingDir < 0 && lokalDir > 0
            ? "red" // bag holder warning
            : asingDir > 0
              ? "green"
              : asingDir < 0
                ? "red"
                : "neutral";

  // Verdict prefix yg menyambung ke rekomendasi di atas — bukan kalimat berdiri sendiri.
  const sejalan =
    (recommendationTone === "green" && effTone === "green") ||
    (recommendationTone === "red" && effTone === "red");
  const bertentangan =
    (recommendationTone === "green" && effTone === "red") ||
    (recommendationTone === "red" && effTone === "green");
  const arah =
    recommendationLabel === "AKUMULASI"
      ? "sinyal beli"
      : recommendationLabel === "KURANGI"
        ? "sinyal jual"
        : "sinyal tahan";
  const verdictPrefix = sejalan
    ? `Searah dengan ${arah}:`
    : bertentangan
      ? `Berlawanan — perhatikan sebelum eksekusi:`
      : `Konteks broker hari terakhir:`;
  const verdictTone: Tone = sejalan ? effTone : bertentangan ? "amber" : "neutral";

  return (
    <div className="mt-3 pt-3 border-t border-border/60 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Building2 className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Konfirmasi Broker · {date}
        </span>
      </div>

      <p className="text-[11px] md:text-xs text-foreground/90 leading-relaxed max-w-[680px]">
        <span className={`font-semibold ${TONE_TEXT[verdictTone]}`}>
          {verdictPrefix}
        </span>{" "}
        {insight}
      </p>
    </div>
  );
}

function buildBrokerInsight({
  netAsing,
  netLokal,
  topAsingBuyer,
  topAsingSeller,
  topLokalBuyer,
  topLokalSeller,
  totalBuy,
  asingDirOverride,
  lokalDirOverride,
}: {
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
  const fmtAbs = (n: number) => fmtIDR(Math.abs(n)).replace(/^[+-]/, "");
  const pct = (n: number) =>
    totalBuy > 0 ? ` (~${((Math.abs(n) / totalBuy) * 100).toFixed(0)}% beli)` : "";

  // Pakai arah dari ground truth (NBSA/MF aktual) kalau ada,
  // jatuh ke net broker top-10 kalau tidak.
  const aDir = asingDirOverride !== undefined && asingDirOverride !== 0
    ? asingDirOverride
    : netAsing > 0 ? 1 : netAsing < 0 ? -1 : 0;
  const lDir = lokalDirOverride !== undefined && lokalDirOverride !== 0
    ? lokalDirOverride
    : netLokal > 0 ? 1 : netLokal < 0 ? -1 : 0;

  // Asing serap, lokal lepas — pola bandar asing
  if (aDir > 0 && lDir < 0) {
    const a = topAsingBuyer
      ? `${topAsingBuyer.code} (${topAsingBuyer.info.name}) +${fmtAbs(topAsingBuyer.value)}${pct(topAsingBuyer.value)}`
      : "asing";
    const l = topLokalSeller
      ? `${topLokalSeller.code} (${topLokalSeller.info.name}) -${fmtAbs(topLokalSeller.value)}`
      : "lokal";
    return `${a} serap di tengah distribusi lokal ${l} — pola klasik bandar asing yang ngangkat.`;
  }
  // Asing dist, lokal serap — bag holder warning
  if (aDir < 0 && lDir > 0) {
    const a = topAsingSeller
      ? `${topAsingSeller.code} (${topAsingSeller.info.name}) -${fmtAbs(topAsingSeller.value)}`
      : "asing";
    const l = topLokalBuyer
      ? `${topLokalBuyer.code} (${topLokalBuyer.info.name}) +${fmtAbs(topLokalBuyer.value)}`
      : "lokal";
    return `${a} buang ke ${l} — hati-hati lokal jadi bag holder.`;
  }
  // Sama-sama akum
  if (aDir > 0 && lDir > 0) {
    const a = topAsingBuyer
      ? `${topAsingBuyer.code} (${topAsingBuyer.info.name}) +${fmtAbs(topAsingBuyer.value)}${pct(topAsingBuyer.value)}`
      : null;
    const l = topLokalBuyer
      ? `${topLokalBuyer.code} (${topLokalBuyer.info.name}) +${fmtAbs(topLokalBuyer.value)}${pct(topLokalBuyer.value)}`
      : null;
    if (a && l) {
      return `${a} dari sisi asing & ${l} dari sisi lokal — dua-duanya akumulasi, tekanan beli kompak dari dua sisi.`;
    }
    if (a || l) {
      return `${a ?? l} memimpin akumulasi — asing & lokal searah, tekanan beli kompak dari dua sisi.`;
    }
    return `Asing & lokal sama-sama akumulasi — tekanan beli kompak dari dua sisi.`;
  }
  // Sama-sama dist
  if (aDir < 0 && lDir < 0) {
    const a = topAsingSeller
      ? `${topAsingSeller.code} (${topAsingSeller.info.name}) -${fmtAbs(topAsingSeller.value)}`
      : null;
    const l = topLokalSeller
      ? `${topLokalSeller.code} (${topLokalSeller.info.name}) -${fmtAbs(topLokalSeller.value)}`
      : null;
    if (a && l) {
      return `${a} dari sisi asing & ${l} dari sisi lokal — dua-duanya distribusi, tekanan jual kuat dari dua sisi, risiko lanjut turun.`;
    }
    if (a || l) {
      return `${a ?? l} memimpin distribusi — asing & lokal searah jual, risiko lanjut turun.`;
    }
    return `Asing & lokal sama-sama distribusi — tekanan jual kuat, risiko lanjut turun.`;
  }
  // Hanya satu sisi yang punya arah jelas (yang lain netral).
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

  // Mixed/neutral total
  const topBuy = topAsingBuyer ?? topLokalBuyer;
  const topSell = topAsingSeller ?? topLokalSeller;
  if (topBuy && topSell) {
    return `${topBuy.code} (${topBuy.info.name}) +${fmtAbs(topBuy.value)} ditutup ${topSell.code} (${topSell.info.name}) -${fmtAbs(topSell.value)} — beli & jual saling tutup, belum ada driver dominan.`;
  }
  return `Beli & jual saling tutup — belum ada driver dominan dari sisi broker.`;
}
