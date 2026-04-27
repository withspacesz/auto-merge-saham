import { TrendingUp, TrendingDown, Activity, Sparkles, Users, Globe2, Wallet, Target, AlertTriangle } from "lucide-react";
import type { MergedTable } from "@/lib/merger";

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

type Props = { merged: MergedTable };

export function SummaryCard({ merged }: Props) {
  const data = merged.rows.filter((r) => !r.__isTotal);
  if (data.length === 0) return null;

  let totalNbsa = 0;
  let nbsaSeen = false;
  let totalMf = 0;
  let mfSeen = false;
  let totalValue = 0;
  let valueSeen = false;
  let avpSum = 0;
  let avpCount = 0;
  let avpMin = Infinity;
  let avpMax = -Infinity;

  // Harga & data candle terbaru (baris pertama, karena rows sudah disort desc by date)
  const latestRow = data[0];
  const latestPrice = parseVal(latestRow?.["Price"] ?? "");
  const latestValue = parseVal(latestRow?.["Value"] ?? "");
  const latestTx = parseVal(latestRow?.["Tx"] ?? "");
  const latestDate = latestRow?.Tanggal ?? "";

  for (const r of data) {
    const nbsa = parseVal(r["NBSA"] ?? "");
    if (nbsa !== null) {
      totalNbsa += nbsa;
      nbsaSeen = true;
    }
    const mf = parseVal(r["MF +/-"] ?? "");
    if (mf !== null) {
      totalMf += mf;
      mfSeen = true;
    }
    const val = parseVal(r["Value"] ?? "");
    if (val !== null) {
      totalValue += val;
      valueSeen = true;
    }
    const ap = parseVal(r["Avp P"] ?? "");
    if (ap !== null) {
      avpSum += ap;
      avpCount++;
      if (ap < avpMin) avpMin = ap;
      if (ap > avpMax) avpMax = ap;
    }
  }

  // Prefer TOTAL row's Avp P (already averaged in /rcm), fallback to computed
  const totalRow = merged.rows.find((r) => r.__isTotal);
  const totalAvp = totalRow ? parseVal(totalRow["Avp P"] ?? "") : null;

  // Prefer TOTAL row's Value (from /data Telegram TOTAL line), fallback to
  // sum of daily Values across candles. This keeps Total Value consistent
  // with what user sees in the source /data message.
  const totalValueFromRow = totalRow ? parseVal(totalRow["Value"] ?? "") : null;
  if (totalValueFromRow !== null) {
    totalValue = totalValueFromRow;
    valueSeen = true;
  }
  const avgPrice =
    totalAvp !== null
      ? totalAvp
      : avpCount > 0
        ? avpSum / avpCount
        : null;

  // Prefer TOTAL row's Clean M. (the displayed total like "200.57Jt"),
  // fallback to summing daily values
  const totalCleanFromRow = totalRow ? parseVal(totalRow["Clean M."] ?? "") : null;
  let dailyCleanSum = 0;
  let dailyCleanCount = 0;
  for (const r of data) {
    const cm = parseVal(r["Clean M."] ?? "");
    if (cm !== null) {
      dailyCleanSum += cm;
      dailyCleanCount++;
    }
  }
  const totalClean =
    totalCleanFromRow !== null
      ? totalCleanFromRow
      : dailyCleanCount > 0
        ? dailyCleanSum
        : null;

  const days = data.length;

  // Ambang batas adaptif: 5% dari Total Value (likuiditas total periode).
  // Kalau Total Value tidak tersedia, fallback ke aturan lama (zero-cross
  // untuk NBSA, ±1M untuk MF).
  const PCT = 0.05;
  const dynamicThreshold = valueSeen && totalValue > 0 ? totalValue * PCT : null;
  const nbsaThreshold = dynamicThreshold ?? 0;
  const mfThreshold = dynamicThreshold ?? 1e9;
  const pctLabel = `${(PCT * 100).toFixed(0)}% Value`;

  const pctOf = (n: number): string =>
    valueSeen && totalValue > 0
      ? `${((Math.abs(n) / totalValue) * 100).toFixed(2)}%`
      : "—";

  const asingStatus: { label: string; tone: Tone; sub: string } = nbsaSeen
    ? totalNbsa > nbsaThreshold
      ? {
          label: "Bandar Asing KUAT",
          tone: "green",
          sub: dynamicThreshold !== null
            ? `Net Buy ${fmtIDR(totalNbsa)} (${pctOf(totalNbsa)} Value) — asing akumulasi`
            : `Net Buy ${fmtIDR(totalNbsa)} — asing akumulasi`,
        }
      : totalNbsa < -nbsaThreshold
        ? {
            label: "Bandar Asing LEMAH",
            tone: "red",
            sub: dynamicThreshold !== null
              ? `Net Sell ${fmtIDR(totalNbsa)} (${pctOf(totalNbsa)} Value) — asing lebih banyak jual`
              : `Net Sell ${fmtIDR(totalNbsa)} — asing lebih banyak jual`,
          }
        : {
            label: "Bandar Asing NETRAL",
            tone: "neutral",
            sub: dynamicThreshold !== null
              ? `${fmtIDR(totalNbsa)} (${pctOf(totalNbsa)} Value) — di bawah ambang ±${pctLabel}`
              : "Beli ≈ Jual",
          }
    : { label: "Data NBSA tidak ada", tone: "neutral", sub: "—" };

  const lokalStatus: { label: string; tone: Tone; sub: string } = mfSeen
    ? totalMf > mfThreshold
      ? {
          label: "Bandar Lokal MENGUASAI",
          tone: "green",
          sub: dynamicThreshold !== null
            ? `MF ${fmtIDR(totalMf)} (${pctOf(totalMf)} Value) — lokal dominan beli`
            : `MF ${fmtIDR(totalMf)} (> +1M) — lokal dominan beli`,
        }
      : totalMf < -mfThreshold
        ? {
            label: "Bandar Lokal LEMAH",
            tone: "red",
            sub: dynamicThreshold !== null
              ? `MF ${fmtIDR(totalMf)} (${pctOf(totalMf)} Value) — lokal dominan jual`
              : `MF ${fmtIDR(totalMf)} (< -1M) — lokal dominan jual`,
          }
        : {
            label: "Bandar Lokal NETRAL",
            tone: "neutral",
            sub: dynamicThreshold !== null
              ? `MF ${fmtIDR(totalMf)} (${pctOf(totalMf)} Value) — di bawah ambang ±${pctLabel}`
              : `MF ${fmtIDR(totalMf)} — di bawah ambang ±1M`,
          }
    : { label: "Data MF tidak ada", tone: "neutral", sub: "—" };

  // ===== Role: DRIVER vs FOLLOWER =====
  // Sisi dengan |Net Flow| lebih besar (dan di atas ambang) = DRIVER
  // Sisi lain searah (sama-sama beli atau sama-sama jual) = FOLLOWER
  // Sisi lain berlawanan arah / netral = tidak ada badge tambahan
  type Role = "driver" | "follower" | null;
  let asingRole: Role = null;
  let lokalRole: Role = null;
  if (nbsaSeen && mfSeen) {
    const absNbsa = Math.abs(totalNbsa);
    const absMf = Math.abs(totalMf);
    const nbsaActive = absNbsa >= nbsaThreshold && totalNbsa !== 0;
    const mfActive = absMf >= mfThreshold && totalMf !== 0;
    if (nbsaActive || mfActive) {
      if (absMf > absNbsa) {
        lokalRole = "driver";
        if (totalNbsa !== 0 && Math.sign(totalNbsa) === Math.sign(totalMf)) {
          asingRole = "follower";
        }
      } else if (absNbsa > absMf) {
        asingRole = "driver";
        if (totalMf !== 0 && Math.sign(totalMf) === Math.sign(totalNbsa)) {
          lokalRole = "follower";
        }
      }
    }
  }

  // ===== Perbandingan harga sekarang vs rata-rata akumulasi bandar =====
  // Logic: kalau harga sekarang dekat / di bawah rata-rata bandar = harga OK,
  // karena artinya kita bisa beli di harga yang sama atau lebih murah dari bandar.
  type PriceVerdict = {
    label: string;
    tone: Tone;
    diffPct: number | null;
    sub: string;
  };
  const priceVerdict: PriceVerdict = (() => {
    if (avgPrice === null || latestPrice === null) {
      return { label: "—", tone: "neutral", diffPct: null, sub: "Data harga tidak lengkap" };
    }
    const diffPct = ((latestPrice - avgPrice) / avgPrice) * 100;
    const sign = diffPct >= 0 ? "+" : "";
    const fmtPct = `${sign}${diffPct.toFixed(2)}%`;
    if (diffPct <= -3) {
      return {
        label: "DISKON",
        tone: "green",
        diffPct,
        sub: `Harga terakhir ${latestPrice.toLocaleString("id-ID")} • ${fmtPct} dari rata-rata bandar — di bawah harga akumulasi`,
      };
    }
    if (diffPct <= 3) {
      return {
        label: "OK",
        tone: "green",
        diffPct,
        sub: `Harga terakhir ${latestPrice.toLocaleString("id-ID")} • ${fmtPct} dari rata-rata bandar — masih sejajar`,
      };
    }
    if (diffPct <= 10) {
      return {
        label: "WAJAR",
        tone: "amber",
        diffPct,
        sub: `Harga terakhir ${latestPrice.toLocaleString("id-ID")} • ${fmtPct} dari rata-rata bandar — sedikit di atas`,
      };
    }
    return {
      label: "MAHAL",
      tone: "red",
      diffPct,
      sub: `Harga terakhir ${latestPrice.toLocaleString("id-ID")} • ${fmtPct} dari rata-rata bandar — sudah jauh di atas`,
    };
  })();

  // ===== Marking Detector — hari terakhir =====
  // Hitung rata-rata nilai per transaksi (Value / Tx) di hari terakhir,
  // dan persentasenya terhadap total Value harian itu (= 1/Tx*100).
  // Persentase tinggi = 1 transaksi membawa porsi besar = indikasi marking
  // / pemain besar masuk sekaligus.
  type MarkingStat = {
    avgPerTx: number;
    pct: number;
    txCount: number;
    label: string;
    tone: Tone;
    note: string;
  };
  const markingStat: MarkingStat | null =
    latestValue !== null && latestTx !== null && latestTx > 0
      ? (() => {
          const avgPerTx = latestValue / latestTx;
          const pct = (avgPerTx / latestValue) * 100;
          if (pct >= 25) {
            return {
              avgPerTx,
              pct,
              txCount: latestTx,
              label: "MARKING",
              tone: "amber" as Tone,
              note: "1 transaksi mendominasi — bisa pemain besar baru / marking harga",
            };
          }
          if (pct >= 10) {
            return {
              avgPerTx,
              pct,
              txCount: latestTx,
              label: "PEMAIN BESAR",
              tone: "amber" as Tone,
              note: "Beberapa lot besar aktif — bukan murni retail",
            };
          }
          if (pct >= 2) {
            return {
              avgPerTx,
              pct,
              txCount: latestTx,
              label: "WAJAR",
              tone: "green" as Tone,
              note: "Trading terdistribusi normal",
            };
          }
          return {
            avgPerTx,
            pct,
            txCount: latestTx,
            label: "RETAIL",
            tone: "neutral" as Tone,
            note: "Broad-based — banyak pemain kecil",
          };
        })()
      : null;

  // ===== Tren Frekuensi (Tx hari terakhir vs rata-rata 2 hari sebelumnya) =====
  // Bandingkan jumlah transaksi (Tx = "freq") hari terakhir dengan rata-rata
  // 2 candle sebelumnya. Naik >=10% = Meningkat, turun >=10% = Menurun, sisanya Flat.
  let freqTrend:
    | { label: "Meningkat" | "Menurun" | "Flat"; tone: Tone; ratio: number; latest: number; prevAvg: number }
    | null = null;
  if (data.length >= 3 && latestTx !== null && latestTx > 0) {
    const prev1Tx = parseVal(data[1]?.["Tx"] ?? "");
    const prev2Tx = parseVal(data[2]?.["Tx"] ?? "");
    if (prev1Tx !== null && prev2Tx !== null && prev1Tx > 0 && prev2Tx > 0) {
      const prevAvg = (prev1Tx + prev2Tx) / 2;
      const ratio = latestTx / prevAvg;
      if (ratio >= 1.1) freqTrend = { label: "Meningkat", tone: "green", ratio, latest: latestTx, prevAvg };
      else if (ratio <= 0.9) freqTrend = { label: "Menurun", tone: "red", ratio, latest: latestTx, prevAvg };
      else freqTrend = { label: "Flat", tone: "neutral", ratio, latest: latestTx, prevAvg };
    }
  }

  // ===== Rekomendasi gabungan: AKUMULASI / TAHAN / KURANGI =====
  // Skor gabungan (Asing = "smart money", bobot lebih besar dari lokal):
  //   - Asing (NBSA)        : +3 / 0 / -3   ← smart money, prioritas utama
  //   - Lokal (MF)          : +2 / 0 / -2
  //   - Clean Money (RCM)   : +2 / 0 / -2
  //   - Harga vs Avg Bandar : +1 / 0 / -1
  //   - Freq vs 2 hari lalu : +1 / 0 / -1
  //   - Divergensi A vs L   : +2 (Asing buy + Lokal sell = Bandar Asing serap)
  //                         : -2 (Asing sell + Lokal buy = Asing distribusi ke lokal)
  // Range: -11 .. +11
  let score = 0;
  const reasons: Array<{ text: string; tone: Tone }> = [];

  if (asingStatus.tone === "green") {
    score += 3;
    reasons.push({ text: "Asing net buy", tone: "green" });
  } else if (asingStatus.tone === "red") {
    score -= 3;
    reasons.push({ text: "Asing net sell", tone: "red" });
  } else {
    reasons.push({ text: "Asing netral", tone: "neutral" });
  }

  if (lokalStatus.tone === "green") {
    score += 2;
    reasons.push({ text: "Lokal akumulasi", tone: "green" });
  } else if (lokalStatus.tone === "red") {
    score -= 2;
    reasons.push({ text: "Lokal distribusi", tone: "red" });
  } else {
    reasons.push({ text: "Lokal netral", tone: "neutral" });
  }

  // Pola Bandar Asing detected: Asing serap saham yang dilepas Lokal.
  // Pola klasik smart money — biasanya bullish setup karena asing
  // mengakumulasi dari distribusi retail/lokal.
  let bandarAsingDetected = false;
  let asingDistribusiDetected = false;
  if (asingStatus.tone === "green" && lokalStatus.tone === "red") {
    score += 2;
    bandarAsingDetected = true;
    reasons.push({
      text: "🎯 Bandar Asing detected (asing serap, lokal lepas)",
      tone: "green",
    });
  } else if (asingStatus.tone === "red" && lokalStatus.tone === "green") {
    score -= 2;
    asingDistribusiDetected = true;
    reasons.push({
      text: "🚨 Asing distribusi ke lokal (smart money keluar)",
      tone: "red",
    });
  }

  if (totalClean !== null) {
    if (totalClean > 0) {
      score += 2;
      reasons.push({ text: "Clean Money positif", tone: "green" });
    } else if (totalClean < 0) {
      score -= 2;
      reasons.push({ text: "Clean Money negatif", tone: "red" });
    } else {
      reasons.push({ text: "Clean Money netral", tone: "neutral" });
    }
  }

  if (priceVerdict.diffPct !== null) {
    if (priceVerdict.tone === "green") {
      score += 1;
      reasons.push({ text: `Harga ${priceVerdict.label.toLowerCase()}`, tone: "green" });
    } else if (priceVerdict.tone === "red") {
      score -= 1;
      reasons.push({ text: "Harga sudah mahal", tone: "red" });
    }
  }

  if (freqTrend) {
    const pct = ((freqTrend.ratio - 1) * 100).toFixed(0);
    const sign = freqTrend.ratio >= 1 ? "+" : "";
    if (freqTrend.tone === "green") {
      score += 1;
      reasons.push({
        text: `↑ Freq Meningkat (${sign}${pct}% vs 2 hari lalu)`,
        tone: "green",
      });
    } else if (freqTrend.tone === "red") {
      score -= 1;
      reasons.push({
        text: `↓ Freq Menurun (${sign}${pct}% vs 2 hari lalu)`,
        tone: "red",
      });
    } else {
      reasons.push({
        text: `→ Freq Flat (${sign}${pct}% vs 2 hari lalu)`,
        tone: "amber",
      });
    }
  }

  type Recommendation = {
    label: "AKUMULASI" | "TAHAN" | "KURANGI";
    tone: Tone;
    headline: string;
    detail: string;
  };
  const recommendation: Recommendation =
    score >= 3
      ? {
          label: "AKUMULASI",
          tone: "green",
          headline: bandarAsingDetected
            ? "Sinyal beli — Bandar Asing serap saham dari lokal"
            : "Sinyal beli — bandar sedang akumulasi",
          detail: bandarAsingDetected
            ? "Asing (smart money) sedang akumulasi sementara lokal melepas — pola klasik bandar asing masuk. Pertimbangkan beli bertahap, ikuti arah asing."
            : "Beberapa indikator menunjukkan tekanan beli kuat. Pertimbangkan beli bertahap (cicil), jangan all-in sekaligus.",
        }
      : score <= -3
        ? {
            label: "KURANGI",
            tone: "red",
            headline: asingDistribusiDetected
              ? "Sinyal jual — Asing distribusi ke lokal"
              : "Sinyal jual — bandar sedang distribusi",
            detail: asingDistribusiDetected
              ? "Asing (smart money) keluar sementara lokal serap — biasanya retail jadi bag holder. Pertimbangkan kurangi posisi sebelum harga turun."
              : "Bandar terlihat melepas saham. Pertimbangkan kurangi posisi atau setidaknya tidak menambah baru.",
          }
        : {
            label: "TAHAN",
            tone: "amber",
            headline: bandarAsingDetected
              ? "Sinyal campuran — tapi Asing mulai serap"
              : asingDistribusiDetected
                ? "Sinyal campuran — Asing mulai keluar"
                : "Sinyal campuran — belum jelas",
            detail: bandarAsingDetected
              ? "Asing akumulasi tapi sinyal lain belum kompak. Pantau ketat — kalau Clean Money & harga ikut menguat, bisa jadi awal akumulasi besar."
              : asingDistribusiDetected
                ? "Asing sudah mulai keluar walau sinyal lain belum kompak. Hati-hati, jangan buru-buru tambah posisi."
                : "Indikator belum kompak. Tahan posisi yang ada, tunggu konfirmasi arah lebih jelas sebelum aksi.",
          };

  // Avg Price tone follows Clean Money sign (price itself isn't +/-)
  const avgPriceTone: Tone =
    totalClean !== null
      ? totalClean > 0
        ? "green"
        : totalClean < 0
          ? "red"
          : "neutral"
      : "neutral";
  const totalCleanTone: Tone =
    totalClean !== null
      ? totalClean > 0
        ? "green"
        : totalClean < 0
          ? "red"
          : "neutral"
      : "neutral";

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-gradient-to-r from-amber-500/5 to-transparent">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-amber-300 tracking-wide">
            Ringkasan & Analisa Bandar
          </h3>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {days} candle
          {dynamicThreshold !== null
            ? ` • ambang ±${fmtIDR(dynamicThreshold).replace(/^\+/, "")} (${pctLabel})`
            : " • ambang fallback ±1M"}
        </span>
      </div>

      <div className="px-4 pt-4">
        <RecommendationBanner
          recommendation={recommendation}
          score={score}
          reasons={reasons}
        />
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <StatusCard
          icon={<Globe2 className="h-4 w-4" />}
          title="Status Asing (NBSA)"
          status={asingStatus}
          metricLabel="Net Buy/Sell Asing"
          metricValue={nbsaSeen ? fmtIDR(totalNbsa) : "—"}
          role={asingRole}
        />
        <StatusCard
          icon={<Users className="h-4 w-4" />}
          title="Status Lokal (Money Flow)"
          status={lokalStatus}
          metricLabel="Net Money Flow"
          metricValue={mfSeen ? fmtIDR(totalMf) : "—"}
          role={lokalRole}
        />
      </div>

      <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <MiniStat
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="Avg Price Bandar"
          value={
            avgPrice !== null
              ? avgPrice.toLocaleString("id-ID", {
                  maximumFractionDigits: 0,
                })
              : "—"
          }
          tone={priceVerdict.diffPct !== null ? priceVerdict.tone : avgPriceTone}
          badge={priceVerdict.diffPct !== null ? priceVerdict.label : undefined}
          sub={
            priceVerdict.diffPct !== null
              ? priceVerdict.sub
              : avpCount > 0
                ? `Range ${avpMin.toLocaleString("id-ID", { maximumFractionDigits: 0 })} – ${avpMax.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`
                : "Data RCM tidak ada"
          }
        />
        <MiniStat
          icon={
            (totalClean ?? 0) >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )
          }
          label="Total Clean Money"
          value={totalClean !== null ? fmtIDR(totalClean) : "—"}
          tone={totalCleanTone}
          sub={
            totalClean === null
              ? "Data RCM tidak ada"
              : totalClean > 0
                ? "Akumulasi bersih (positif)"
                : totalClean < 0
                  ? "Distribusi bersih (negatif)"
                  : "Netral"
          }
        />
        <MiniStat
          icon={<Wallet className="h-3.5 w-3.5" />}
          label={`Total Value${latestDate ? ` • ${latestDate}` : ""}`}
          value={valueSeen ? fmtIDR(totalValue).replace(/^\+/, "") : "—"}
          tone={markingStat ? markingStat.tone : "neutral"}
          badge={markingStat ? markingStat.label : undefined}
          sub={
            markingStat && latestValue !== null
              ? `${markingStat.txCount.toFixed(0)} trx • ${markingStat.pct.toFixed(2)}% dari Value harian ${fmtIDR(latestValue).replace(/^\+/, "")} — ${markingStat.note} — ${markingStat.label.toLowerCase()} detected`
              : `${days} candle`
          }
        />
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
            <div className="text-[11px] text-muted-foreground">
              {metricLabel}
            </div>
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

function MiniStat({
  icon,
  label,
  value,
  tone,
  sub,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: Tone;
  sub?: string;
  badge?: string;
}) {
  return (
    <div className={`rounded-lg border p-3 ${TONE_BG[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground uppercase tracking-wider">
          {icon}
          <span>{label}</span>
        </div>
        {badge && (
          <span
            className={`text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded uppercase ${TONE_BADGE[tone]}`}
          >
            {badge}
          </span>
        )}
      </div>
      <div className={`text-lg font-bold font-mono mt-1 ${TONE_TEXT[tone]}`}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{sub}</div>}
    </div>
  );
}

function RecommendationBanner({
  recommendation,
  score,
  reasons,
}: {
  recommendation: {
    label: "AKUMULASI" | "TAHAN" | "KURANGI";
    tone: Tone;
    headline: string;
    detail: string;
  };
  score: number;
  reasons: Array<{ text: string; tone: Tone }>;
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
            <span className="text-[10px] text-muted-foreground font-mono">
              skor {scoreSign}
              {score}
            </span>
          </div>
          <div className={`text-sm font-semibold mt-1 ${TONE_TEXT[tone]}`}>
            {headline}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
            {detail}
          </p>
          {reasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {reasons.map((r) => (
                <span
                  key={r.text}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${TONE_BADGE[r.tone]}`}
                >
                  {r.text}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
