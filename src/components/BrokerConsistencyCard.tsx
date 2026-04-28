import type { ConsistencyAnalysis, ConsistencyEntry } from "@/lib/parser-broker";
import type { MergedTable, MergedRow } from "@/lib/merger";

function fmtIDR(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}M`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}Jt`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}rb`;
  return `${sign}${abs.toFixed(0)}`;
}

function parsePriceCell(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : null;
}

type CandleCtx = {
  latestPrice: number | null;
  latestDate: string | null;
  lowestPrice: number | null;
  lowestPriceDate: string | null;
  priceTrendDesc: string; // e.g. "flat", "turun dari 805", "naik dari 720"
  pricesByDate: { date: string; price: number }[];
};

function buildCandleCtx(merged: MergedTable | null | undefined): CandleCtx {
  const empty: CandleCtx = {
    latestPrice: null,
    latestDate: null,
    lowestPrice: null,
    lowestPriceDate: null,
    priceTrendDesc: "",
    pricesByDate: [],
  };
  if (!merged) return empty;
  const dataRows: MergedRow[] = merged.rows.filter((r) => !r.__isTotal);
  if (dataRows.length === 0) return empty;
  // Find headers (case-insensitive)
  const findCol = (...names: string[]) => {
    for (const h of merged.headers) {
      const low = h.toLowerCase();
      if (names.some((n) => low.includes(n))) return h;
    }
    return null;
  };
  const dateCol = findCol("tanggal", "date", "tgl");
  const priceCol = findCol("price", "harga");
  if (!dateCol || !priceCol) return empty;

  const items = dataRows
    .map((r) => ({ date: r[dateCol] ?? "", price: parsePriceCell(r[priceCol]) }))
    .filter((x): x is { date: string; price: number } => x.price !== null && !!x.date);
  if (items.length === 0) return empty;

  // First row = latest (rows are typically sorted desc)
  const latest = items[0];
  const oldest = items[items.length - 1];
  const lowest = items.reduce((a, b) => (a.price < b.price ? a : b));

  let trendDesc = "flat";
  if (items.length >= 2) {
    const prev = items[1].price;
    if (latest.price > prev) trendDesc = `naik dari ${prev}`;
    else if (latest.price < prev) trendDesc = `turun dari ${prev}`;
    else if (oldest.price !== latest.price) {
      trendDesc = latest.price > oldest.price ? "trend naik" : "trend turun";
    }
  }

  return {
    latestPrice: latest.price,
    latestDate: latest.date,
    lowestPrice: lowest.price,
    lowestPriceDate: lowest.date,
    priceTrendDesc: trendDesc,
    pricesByDate: items,
  };
}

function shortDate(dateStr: string): string {
  // "2026-04-27" → "27/4"; "27-04-2026" → "27/4"
  if (!dateStr) return "";
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${parseInt(isoMatch[3], 10)}/${parseInt(isoMatch[2], 10)}`;
  const dmyMatch = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmyMatch) return `${parseInt(dmyMatch[1], 10)}/${parseInt(dmyMatch[2], 10)}`;
  return dateStr;
}

type BadgeTone = "amber" | "emerald" | "blue" | "rose" | "slate";

const BADGE_CLS: Record<BadgeTone, string> = {
  amber: "bg-amber-500/20 text-amber-200 border-amber-500/40",
  emerald: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
  blue: "bg-sky-500/20 text-sky-200 border-sky-500/40",
  rose: "bg-rose-500/20 text-rose-200 border-rose-500/40",
  slate: "bg-slate-500/20 text-slate-200 border-slate-500/40",
};

type Candidate = {
  entry: ConsistencyEntry;
  rank: number;
  score: number;
  badges: { text: string; tone: BadgeTone }[];
  narrative: string;
};

function buildAccumulationCandidates(
  consistency: ConsistencyAnalysis,
  ctx: CandleCtx,
): Candidate[] {
  // Pool: semua broker yang BELI di salah satu/dua periode
  const pool: ConsistencyEntry[] = [
    ...consistency.konsistenAkum,
    ...consistency.selesaiAkum,
    ...consistency.newOrFlipAkum,
  ];
  if (pool.length === 0) return [];

  const dailyShortDate = shortDate(consistency.daily.date);

  // Tentukan top mingguan & top harian (untuk badge "terbesar!")
  let topWeeklyCode: string | undefined;
  let topWeeklyVal = 0;
  let topDailyCode: string | undefined;
  let topDailyVal = 0;
  for (const e of pool) {
    if (e.weeklyValue > topWeeklyVal) {
      topWeeklyVal = e.weeklyValue;
      topWeeklyCode = e.code;
    }
    if (e.dailyValue > topDailyVal) {
      topDailyVal = e.dailyValue;
      topDailyCode = e.code;
    }
  }

  // Cari avg termurah (paling rendah di antara semua kandidat yang punya avg buy)
  let cheapestCode: string | undefined;
  let cheapestAvg = Infinity;
  for (const e of pool) {
    const a = e.weeklyValue > 0 ? e.weeklyAvg ?? Infinity : e.dailyAvg ?? Infinity;
    if (a < cheapestAvg) {
      cheapestAvg = a;
      cheapestCode = e.code;
    }
  }

  // Skoring kandidat: weekly + daily (boost), penalti SELESAI_AKUM ringan
  const scored: Candidate[] = pool.map((entry) => {
    let score = entry.weeklyValue * 1 + entry.dailyValue * 1.4;
    if (entry.label === "SELESAI_AKUM") score = entry.weeklyValue * 0.85;
    if (entry.label === "NEW_AKUM") score = entry.dailyValue * 1.2;
    if (entry.label === "FLIP_TO_AKUM") score = entry.dailyValue * 1.1 + Math.abs(entry.weeklyValue) * 0.3;
    return { entry, rank: 0, score, badges: [], narrative: "" };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 5);

  // Build badges + narrative untuk tiap kandidat
  for (let i = 0; i < top.length; i++) {
    const c = top[i];
    c.rank = i + 1;
    const e = c.entry;
    const isTopWeekly = e.code === topWeeklyCode;
    const isTopDaily = e.code === topDailyCode;
    const isCheapest = e.code === cheapestCode && cheapestAvg !== Infinity;

    // ===== BADGES =====
    if (e.weeklyValue > 0) {
      c.badges.push({
        text: `Mingguan ${fmtIDR(e.weeklyValue)}${isTopWeekly ? " — terbesar!" : ""}`,
        tone: isTopWeekly ? "amber" : "emerald",
      });
    }
    if (e.dailyValue > 0) {
      c.badges.push({
        text: `${dailyShortDate} beli ${fmtIDR(e.dailyValue)}${isTopDaily ? " — terbesar!" : ""}`,
        tone: isTopDaily ? "amber" : "blue",
      });
    } else if (e.label === "SELESAI_AKUM") {
      c.badges.push({
        text: `${dailyShortDate} tidak aktif`,
        tone: "blue",
      });
    } else if (e.label === "FLIP_TO_AKUM") {
      c.badges.push({
        text: `Reversal: jual → beli ${fmtIDR(e.dailyValue)}`,
        tone: "blue",
      });
    } else if (e.label === "NEW_AKUM") {
      c.badges.push({
        text: `${dailyShortDate} baru muncul beli ${fmtIDR(e.dailyValue)}`,
        tone: "blue",
      });
    }
    if (isCheapest) {
      const avg = e.weeklyAvg ?? e.dailyAvg;
      c.badges.push({
        text: `Avg ${avg} — termurah!`,
        tone: "amber",
      });
    }

    // ===== NARRATIVE =====
    const wAvg = e.weeklyAvg;
    const dAvg = e.dailyAvg;
    const ratio = e.weeklyValue > 0 ? e.dailyValue / e.weeklyValue : 0;
    const isAcceleration = consistency.weeklyRangeDays > 1 && ratio >= 0.6;
    const priceDesc = ctx.latestPrice !== null
      ? `harga di ${ctx.latestPrice} (${ctx.priceTrendDesc})`
      : "kondisi pasar saat ini";

    if (isCheapest && (wAvg ?? dAvg)) {
      const avg = wAvg ?? dAvg!;
      // Cari tanggal di mana harga paling dekat dengan avg ini
      const close = ctx.pricesByDate
        .map((p) => ({ ...p, diff: Math.abs(p.price - avg) }))
        .sort((a, b) => a.diff - b.diff)
        .slice(0, 2);
      const closeDesc = close.length > 0
        ? close.map((p) => `harga ${p.price} (${shortDate(p.date)})`).join(" dan ")
        : "saat harga rendah";
      const profitDesc = ctx.latestPrice !== null
        ? `kalau harga sudah di atas ${ctx.latestPrice}`
        : "kalau harga naik";
      c.narrative =
        `Beli di avg ${avg} — paling rendah dari semua broker. ` +
        `Kemungkinan besar beli saat ${closeDesc}. ` +
        `Floating profit paling besar saat ini ${profitDesc}.`;
    } else if (e.label === "SELESAI_AKUM" && isTopWeekly) {
      c.narrative =
        `Avg beli mingguan ${wAvg ?? "—"}. Beli banyak di awal minggu (${
          consistency.weekly.dateStart ? shortDate(consistency.weekly.dateStart) : ""
        }${consistency.weekly.date ? `–${shortDate(consistency.weekly.date)}` : ""}). ` +
        `Volume terbesar tapi berhenti ${dailyShortDate}. ` +
        `Kemungkinan sudah selesai fase akum dan sekarang hold. ` +
        `Ini yang paling mungkin jadi pemicu harga naik — posisi sudah dibangun, tinggal tunggu.`;
    } else if (e.label === "SELESAI_AKUM") {
      c.narrative =
        `Beli ${fmtIDR(e.weeklyValue)} sepanjang minggu di avg ${wAvg ?? "—"}, tapi ${dailyShortDate} sudah tidak aktif. ` +
        `Kemungkinan sudah selesai akum / pause sementara.`;
    } else if (e.label === "KONSISTEN_AKUM" && isAcceleration) {
      c.narrative =
        `Satu-satunya broker yang makin agresif beli justru saat ${priceDesc}. ` +
        `Tidak ada di net sell sama sekali. ` +
        `Pola ini ciri khas akumulasi institusi — beli terus diam-diam, tidak takut harga tinggi.`;
    } else if (e.label === "KONSISTEN_AKUM") {
      const avgRange = wAvg && dAvg && Math.abs(wAvg - dAvg) > 1
        ? `${Math.min(wAvg, dAvg)}-${Math.max(wAvg, dAvg)}`
        : (wAvg ?? dAvg ?? "—").toString();
      c.narrative =
        `Konsisten hadir di dua periode, beli di avg ${avgRange}. ` +
        `Tidak pernah masuk net sell list. ` +
        `Karakter slow accumulator — kecil tapi terus.`;
    } else if (e.label === "FLIP_TO_AKUM") {
      c.narrative =
        `Sebelumnya jual ${fmtIDR(e.weeklyValue)} sepanjang minggu, hari ini berbalik beli ${fmtIDR(e.dailyValue)} di avg ${dAvg ?? "—"}. ` +
        `Sinyal reversal — kemungkinan sudah selesai cut loss / mulai akum.`;
    } else if (e.label === "NEW_AKUM") {
      c.narrative =
        `Tidak masuk top mingguan, hari ini muncul beli ${fmtIDR(e.dailyValue)} di avg ${dAvg ?? "—"}. ` +
        `Broker baru masuk akumulasi — perlu konfirmasi 1-2 hari ke depan.`;
    } else {
      c.narrative = e.reason;
    }
  }

  return top;
}

function CandidateRow({ c }: { c: Candidate }) {
  const e = c.entry;
  const avgLine: string[] = [];
  if (e.weeklyAvg) avgLine.push(`Avg mingguan ${e.weeklyAvg}`);
  if (e.dailyAvg) avgLine.push(`Avg harian ${e.dailyAvg}`);

  // Warna ring peringkat: 1=gold, 2=silver, 3=bronze, 4+=slate
  const rankRing =
    c.rank === 1
      ? "bg-amber-500/25 border-amber-400/60 text-amber-200"
      : c.rank === 2
        ? "bg-slate-300/15 border-slate-300/50 text-slate-100"
        : c.rank === 3
          ? "bg-orange-700/25 border-orange-500/50 text-orange-200"
          : "bg-slate-500/15 border-slate-500/40 text-slate-300";

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] hover:bg-white/[0.04] transition-colors p-3 md:p-3.5">
      {/* Baris atas: peringkat | kode + nama | badges | avg */}
      <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
        <div
          className={`flex-shrink-0 w-9 h-9 rounded-full border flex items-center justify-center text-sm font-bold ${rankRing}`}
        >
          {c.rank}
        </div>

        <div className="flex items-baseline gap-2 min-w-0 md:w-44 flex-shrink-0">
          <span className="text-xl md:text-2xl font-extrabold text-white tracking-tight">
            {e.code}
          </span>
          <span className="text-[11px] md:text-xs text-slate-400 truncate">
            {e.info.name}
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
          {c.badges.map((b, i) => (
            <span
              key={i}
              className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] md:text-xs font-semibold whitespace-nowrap ${BADGE_CLS[b.tone]}`}
            >
              {b.text}
            </span>
          ))}
        </div>

        {avgLine.length > 0 && (
          <div className="text-[11px] md:text-xs text-slate-400 font-mono whitespace-nowrap md:text-right md:ml-auto">
            {avgLine.join(" · ")}
          </div>
        )}
      </div>

      {/* Baris bawah: narasi, indented sejajar kode (skip lebar peringkat) */}
      <div className="mt-2 md:pl-12 text-[13px] md:text-sm text-slate-200 leading-relaxed">
        {c.narrative}
      </div>
    </div>
  );
}

// ===== LAPIS 1: Controller Mingguan =====
// Identifikasi siapa yang paling "in control" sepekan terakhir.
// Skor = weeklyValue * 1 + bonus avg termurah (relatif ke median) + bonus
// kalau hari ini masih aktif beli (= konfirmasi).
type Controller = {
  entry: ConsistencyEntry;
  rank: number;
  todayStatus: "lanjut" | "pause" | "berbalik";
  todayDetail: string;
};

function buildControllers(consistency: ConsistencyAnalysis): Controller[] {
  // Pool: hanya broker yang BELI mingguan signifikan
  const pool: ConsistencyEntry[] = [
    ...consistency.konsistenAkum,
    ...consistency.selesaiAkum,
  ].filter((e) => e.weeklyValue > 0);
  if (pool.length === 0) return [];

  // Median avg utk normalisasi
  const avgs = pool
    .map((e) => e.weeklyAvg ?? e.dailyAvg)
    .filter((a): a is number => a != null);
  const medianAvg = avgs.length > 0
    ? [...avgs].sort((a, b) => a - b)[Math.floor(avgs.length / 2)]
    : 0;

  const scored = pool.map((entry) => {
    const wv = entry.weeklyValue;
    const avg = entry.weeklyAvg ?? entry.dailyAvg ?? 0;
    // Bonus avg murah: makin di bawah median, makin tinggi
    const avgBonus = medianAvg > 0 && avg > 0
      ? wv * Math.max(0, (medianAvg - avg) / medianAvg) * 0.5
      : 0;
    // Bonus konfirmasi harian
    const dailyBonus = entry.dailyValue > 0 ? wv * 0.3 : 0;
    const score = wv + avgBonus + dailyBonus;
    return { entry, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 3);

  return top.map((s, i) => {
    const e = s.entry;
    let status: Controller["todayStatus"];
    let detail: string;
    if (e.dailyValue > 0) {
      status = "lanjut";
      detail = `Lanjut beli hari ini ${fmtIDR(e.dailyValue)}${e.dailyAvg ? ` di avg ${e.dailyAvg}` : ""} — konfirmasi akumulasi berlanjut.`;
    } else if (e.dailyValue === 0) {
      status = "pause";
      detail = `Tidak aktif hari ini. Posisi mingguan ${fmtIDR(e.weeklyValue)} sudah dibangun — kemungkinan hold / pause sementara.`;
    } else {
      status = "berbalik";
      detail = `🚨 Berbalik jual hari ini ${fmtIDR(e.dailyValue)}${e.dailyAvg ? ` di avg ${e.dailyAvg}` : ""} — waspada, controller utama mulai keluar.`;
    }
    return { entry: e, rank: i + 1, todayStatus: status, todayDetail: detail };
  });
}

function ControllerRow({ c }: { c: Controller }) {
  const e = c.entry;
  const statusCls =
    c.todayStatus === "lanjut"
      ? "bg-emerald-500/20 text-emerald-200 border-emerald-500/40"
      : c.todayStatus === "pause"
        ? "bg-amber-500/20 text-amber-200 border-amber-500/40"
        : "bg-rose-500/25 text-rose-200 border-rose-500/50";
  const statusIcon =
    c.todayStatus === "lanjut" ? "✅" : c.todayStatus === "pause" ? "⏸" : "🚨";
  const statusLabel =
    c.todayStatus === "lanjut"
      ? "Lanjut akum"
      : c.todayStatus === "pause"
        ? "Pause / hold"
        : "Berbalik jual";

  const rankRing =
    c.rank === 1
      ? "bg-emerald-500/25 border-emerald-400/60 text-emerald-200"
      : c.rank === 2
        ? "bg-emerald-500/15 border-emerald-400/40 text-emerald-200"
        : "bg-emerald-500/10 border-emerald-400/30 text-emerald-300";

  return (
    <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04] p-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full border flex items-center justify-center text-sm font-bold ${rankRing}`}
        >
          {c.rank}
        </div>
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-xl font-extrabold text-white tracking-tight">{e.code}</span>
          <span className="text-[11px] md:text-xs text-slate-400 truncate max-w-[180px]">{e.info.name}</span>
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded border text-[11px] md:text-xs font-semibold bg-emerald-500/20 text-emerald-200 border-emerald-500/40 whitespace-nowrap">
          Mingguan {fmtIDR(e.weeklyValue)}
        </span>
        {e.weeklyAvg && (
          <span className="text-[11px] md:text-xs text-slate-400 font-mono whitespace-nowrap">
            avg {e.weeklyAvg}
          </span>
        )}
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] md:text-xs font-semibold whitespace-nowrap ml-auto ${statusCls}`}
        >
          {statusIcon} {statusLabel}
        </span>
      </div>
      <div className="mt-2 md:pl-11 text-[13px] md:text-sm text-slate-200 leading-relaxed">
        {c.todayDetail}
      </div>
    </div>
  );
}

// ===== Distributor Terbesar (highlight bahaya) =====
type Distributor = {
  entry: ConsistencyEntry;
  rank: number;
  severity: "berat" | "sedang" | "ringan";
  detail: string;
};

function buildTopDistributors(consistency: ConsistencyAnalysis): Distributor[] {
  // Pool: distributor yang JUAL mingguan (weeklyValue < 0 atau label dist)
  const pool: ConsistencyEntry[] = [
    ...consistency.konsistenDist,
    ...consistency.flipWarning,
    ...consistency.newOrFreshDist,
  ].filter((e) => e.weeklyValue < 0);
  if (pool.length === 0) return [];

  // Sort by absolute weekly value (paling besar dulu)
  const sorted = [...pool].sort((a, b) => Math.abs(b.weeklyValue) - Math.abs(a.weeklyValue));
  const top = sorted.slice(0, 3);
  const biggest = Math.abs(top[0].weeklyValue);

  return top.map((e, i) => {
    const abs = Math.abs(e.weeklyValue);
    // Severity relatif ke distributor terbesar
    let severity: Distributor["severity"];
    if (i === 0 || abs >= biggest * 0.7) severity = "berat";
    else if (abs >= biggest * 0.35) severity = "sedang";
    else severity = "ringan";

    let detail: string;
    if (e.dailyValue < 0) {
      detail = `Masih aktif jual hari ini ${fmtIDR(e.dailyValue)}${e.dailyAvg ? ` di avg ${e.dailyAvg}` : ""} — tekanan jual belum berhenti, akumulasi bisa terus diserap tanpa harga naik.`;
    } else if (e.dailyValue === 0) {
      detail = `Hari ini tidak aktif — pantau besok, kalau muncul lagi tekanan jual lanjut. Selama belum berhenti total, harga sulit lepas.`;
    } else {
      detail = `Hari ini berbalik beli ${fmtIDR(e.dailyValue)} — sinyal awal distributor mulai berhenti, perhatikan beberapa hari ke depan.`;
    }
    return { entry: e, rank: i + 1, severity, detail };
  });
}

function DistributorRow({ d }: { d: Distributor }) {
  const e = d.entry;
  const sevCls =
    d.severity === "berat"
      ? "bg-rose-500/25 text-rose-200 border-rose-500/50"
      : d.severity === "sedang"
        ? "bg-rose-500/15 text-rose-200 border-rose-500/35"
        : "bg-rose-500/10 text-rose-300 border-rose-500/25";
  const sevLabel = d.severity === "berat" ? "BAHAYA" : d.severity === "sedang" ? "SEDANG" : "RINGAN";
  const dailyTone =
    e.dailyValue < 0
      ? "bg-rose-500/20 text-rose-200 border-rose-500/40"
      : e.dailyValue === 0
        ? "bg-slate-500/20 text-slate-300 border-slate-500/40"
        : "bg-emerald-500/20 text-emerald-200 border-emerald-500/40";
  const dailyText =
    e.dailyValue < 0
      ? `Hari ini jual ${fmtIDR(e.dailyValue)}`
      : e.dailyValue === 0
        ? "Hari ini tidak aktif"
        : `Hari ini balik beli ${fmtIDR(e.dailyValue)}`;

  return (
    <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.04] p-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-rose-500/20 border border-rose-500/50 flex items-center justify-center text-rose-200 text-sm font-bold">
          {d.rank}
        </div>
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-xl font-extrabold text-white tracking-tight">{e.code}</span>
          <span className="text-[11px] md:text-xs text-slate-400 truncate max-w-[180px]">{e.info.name}</span>
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] md:text-xs font-bold uppercase tracking-wider whitespace-nowrap ${sevCls}`}>
          {sevLabel}
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded border text-[11px] md:text-xs font-semibold bg-rose-500/20 text-rose-200 border-rose-500/40 whitespace-nowrap">
          Mingguan {fmtIDR(e.weeklyValue)}
        </span>
        {e.weeklyAvg && (
          <span className="text-[11px] md:text-xs text-slate-400 font-mono whitespace-nowrap">
            avg {e.weeklyAvg}
          </span>
        )}
        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] md:text-xs font-semibold whitespace-nowrap ml-auto ${dailyTone}`}>
          {dailyText}
        </span>
      </div>
      <div className="mt-2 md:pl-11 text-[13px] md:text-sm text-slate-200 leading-relaxed">
        {d.detail}
      </div>
    </div>
  );
}

function SectionHeader({
  badge,
  title,
  subtitle,
  tone,
}: {
  badge: string;
  title: string;
  subtitle?: string;
  tone: "emerald" | "rose" | "amber";
}) {
  const cls =
    tone === "emerald"
      ? "text-emerald-300 border-emerald-500/30"
      : tone === "rose"
        ? "text-rose-300 border-rose-500/30"
        : "text-amber-300 border-amber-500/30";
  return (
    <div className={`flex items-baseline gap-2 flex-wrap border-l-2 pl-3 ${cls}`}>
      <span className={`text-[10px] md:text-[11px] font-bold uppercase tracking-widest ${cls}`}>
        {badge}
      </span>
      <h4 className="text-sm md:text-base font-bold text-foreground">{title}</h4>
      {subtitle && (
        <span className="text-[11px] md:text-xs text-muted-foreground">— {subtitle}</span>
      )}
    </div>
  );
}

export function BrokerConsistencyCard({
  analysis,
  merged,
  symbol: symbolProp,
}: {
  analysis: ConsistencyAnalysis;
  merged?: MergedTable | null;
  symbol?: string;
}) {
  const ctx = buildCandleCtx(merged);
  const candidates = buildAccumulationCandidates(analysis, ctx);
  // Prioritas: prop dari halaman (auto-detect dari /data) > simbol dari teks broker
  const symbol =
    (symbolProp && symbolProp.trim()) ||
    analysis.weekly.symbol ||
    analysis.daily.symbol ||
    "saham ini";

  const controllers = buildControllers(analysis);
  const distributors = buildTopDistributors(analysis);

  // Footer: jualan melemah (yang sudah berhenti / kemungkinan distribusi selesai)
  const stoppedDist = analysis.stoppedDist.slice(0, 6);
  // Codes yang sudah dipromosikan ke section utama (jangan duplikasi di footer)
  const promotedCodes = new Set(distributors.map((d) => d.entry.code));
  const remainingDist = analysis.konsistenDist
    .filter((e) => !promotedCodes.has(e.code))
    .slice(0, 6);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border bg-gradient-to-r from-amber-500/5 to-transparent">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-amber-400">🏆</span>
          <h3 className="text-sm font-semibold text-amber-300 tracking-wide truncate">
            Analisa Bandar {symbol} — Controller, Konfirmasi, Distributor
          </h3>
        </div>
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
          Mingguan {analysis.weeklyRangeDays}h
          {analysis.weekly.dateStart ? ` (${analysis.weekly.dateStart} → ${analysis.weekly.date})` : ` (${analysis.weekly.date})`}
          {" • "}
          Harian {analysis.daily.date}
        </span>
      </div>

      <div className="p-3 space-y-4">
        {/* LAPIS 1 + 2: Controller mingguan dengan konfirmasi harian */}
        {controllers.length > 0 && (
          <section className="space-y-2">
            <SectionHeader
              badge="Lapis 1 + 2"
              title={`Controller Mingguan & Konfirmasi Hari Ini`}
              subtitle="siapa yang in control + apa yang mereka lakukan harian"
              tone="emerald"
            />
            <div className="flex flex-col gap-2">
              {controllers.map((c) => <ControllerRow key={c.entry.code} c={c} />)}
            </div>
          </section>
        )}

        {/* Kandidat Terkuat (leaderboard detail) */}
        {candidates.length > 0 && (
          <section className="space-y-2">
            <SectionHeader
              badge="Kandidat"
              title={`Kandidat Terkuat yang Akumulasi ${symbol}`}
              subtitle="pool lengkap broker yang lagi serap, dengan narasi per broker"
              tone="amber"
            />
            <div className="flex flex-col gap-2">
              {candidates.map((c) => <CandidateRow key={c.entry.code} c={c} />)}
            </div>
          </section>
        )}

        {/* Distributor Terbesar — highlight bahaya */}
        {distributors.length > 0 && (
          <section className="space-y-2">
            <SectionHeader
              badge="Bahaya"
              title="Distributor Terbesar"
              subtitle="kalau belum berhenti, akumulasi bisa terus diserap tanpa harga naik"
              tone="rose"
            />
            <div className="flex flex-col gap-2">
              {distributors.map((d) => <DistributorRow key={d.entry.code} d={d} />)}
            </div>
          </section>
        )}

        {/* Footer ringkas */}
        {(remainingDist.length > 0 || stoppedDist.length > 0) && (
          <div className="pt-3 border-t border-border/60 space-y-1.5">
            {remainingDist.length > 0 && (
              <div className="text-[12px] md:text-[13px]">
                <span className="font-bold text-rose-300/80 uppercase tracking-wider text-[10px] md:text-[11px]">
                  🟥 Distributor lain:
                </span>{" "}
                <span className="text-foreground/80 font-mono">
                  {remainingDist.map((e) => `${e.code} ${fmtIDR(e.weeklyValue)}`).join(", ")}
                </span>
              </div>
            )}
            {stoppedDist.length > 0 && (
              <div className="text-[12px] md:text-[13px]">
                <span className="font-bold text-amber-300 uppercase tracking-wider text-[10px] md:text-[11px]">
                  📉 Jualan melemah:
                </span>{" "}
                <span className="text-foreground/90 font-mono">
                  {stoppedDist.map((e) => `${e.code} ${fmtIDR(e.weeklyValue)}`).join(", ")}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {controllers.length === 0 && candidates.length === 0 && distributors.length === 0 && (
          <div className="text-xs text-muted-foreground italic px-1 py-2">
            Belum ada pola controller / akumulasi / distributor yang terdeteksi.
          </div>
        )}
      </div>
    </div>
  );
}
