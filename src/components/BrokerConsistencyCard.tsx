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
  if (e.weeklyAvg) avgLine.push(`Avg beli mingguan ${e.weeklyAvg}`);
  if (e.dailyAvg) avgLine.push(`Avg beli harian ${e.dailyAvg}`);

  return (
    <div className="flex gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex-shrink-0">
        <div className="w-7 h-7 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 text-xs font-bold">
          {c.rank}
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xl font-extrabold text-white">{e.code}</span>
          <span className="text-[11px] text-slate-400 truncate">{e.info.name}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {c.badges.map((b, i) => (
            <span
              key={i}
              className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-semibold ${BADGE_CLS[b.tone]}`}
            >
              {b.text}
            </span>
          ))}
        </div>
        {avgLine.length > 0 && (
          <div className="text-[11px] text-slate-400 font-mono">
            {avgLine.join(" · ")}
          </div>
        )}
        <div className="text-[12px] text-slate-200 leading-relaxed">
          {c.narrative}
        </div>
      </div>
    </div>
  );
}

export function BrokerConsistencyCard({
  analysis,
  merged,
}: {
  analysis: ConsistencyAnalysis;
  merged?: MergedTable | null;
}) {
  const ctx = buildCandleCtx(merged);
  const candidates = buildAccumulationCandidates(analysis, ctx);
  const symbol = analysis.weekly.symbol || analysis.daily.symbol || "saham ini";

  // Distribusi singkat
  const topDist = analysis.konsistenDist.slice(0, 5);
  const stoppedDist = analysis.stoppedDist.slice(0, 5);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5 space-y-5">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm md:text-base font-bold tracking-wider uppercase text-amber-300">
            Kandidat Terkuat yang Akumulasi {symbol}
          </h3>
        </div>
        <div className="text-[10px] text-slate-400">
          Mingguan ({analysis.weeklyRangeDays} hari, {analysis.weekly.dateStart ? `${analysis.weekly.dateStart} → ` : ""}{analysis.weekly.date}) vs harian {analysis.daily.date}
        </div>
      </div>

      {/* Candidates */}
      {candidates.length === 0 ? (
        <div className="text-xs text-slate-400 italic">Belum ada kandidat akumulasi yang terdeteksi.</div>
      ) : (
        <div className="space-y-2">
          {candidates.map((c) => <CandidateRow key={c.entry.code} c={c} />)}
        </div>
      )}

      {/* Distribusi ringkas */}
      {(topDist.length > 0 || stoppedDist.length > 0) && (
        <div className="pt-3 border-t border-white/5 space-y-2">
          {topDist.length > 0 && (
            <div className="text-[12px]">
              <span className="font-bold text-rose-300 uppercase tracking-wider text-[10px]">🟥 Jualan konsisten:</span>{" "}
              <span className="text-slate-200 font-mono">
                {topDist.map((e) => `${e.code} ${fmtIDR(e.weeklyValue)}`).join(", ")}
              </span>
            </div>
          )}
          {stoppedDist.length > 0 && (
            <div className="text-[12px]">
              <span className="font-bold text-amber-300 uppercase tracking-wider text-[10px]">📉 Jualan melemah:</span>{" "}
              <span className="text-slate-200 font-mono">
                {stoppedDist.map((e) => `${e.code} ${fmtIDR(e.weeklyValue)}`).join(", ")}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
