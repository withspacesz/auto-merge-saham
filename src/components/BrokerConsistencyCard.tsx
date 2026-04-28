import type { ConsistencyAnalysis, ConsistencyEntry, ConsistencyLabel } from "@/lib/parser-broker";

function fmtIDR(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}M`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}Jt`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}rb`;
  return `${sign}${abs.toFixed(0)}`;
}

const LABEL_BADGE: Record<ConsistencyLabel, { text: string; cls: string }> = {
  KONSISTEN_AKUM: { text: "Konsisten", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  FLIP_TO_AKUM: { text: "Flip → Beli", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" },
  NEW_AKUM: { text: "Baru Masuk", cls: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30" },
  FLIP_TO_DIST: { text: "Flip → Jual", cls: "bg-amber-500/20 text-amber-300 border-amber-500/40" },
  SELESAI_AKUM: { text: "Selesai Akum", cls: "bg-slate-500/20 text-slate-300 border-slate-500/40" },
  KONSISTEN_DIST: { text: "Seller Konsisten", cls: "bg-rose-500/20 text-rose-300 border-rose-500/40" },
  NEW_DIST: { text: "Seller Baru", cls: "bg-rose-500/15 text-rose-200 border-rose-500/30" },
  STOPPED_DIST: { text: "Selesai Jual", cls: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
};

function Row({ entry, side }: { entry: ConsistencyEntry; side: "buy" | "sell" | "neutral" }) {
  const badge = LABEL_BADGE[entry.label];
  const big = entry.label === "KONSISTEN_DIST" || entry.label === "FLIP_TO_DIST"
    ? entry.weeklyValue !== 0 ? entry.weeklyValue : entry.dailyValue
    : entry.weeklyValue !== 0 ? entry.weeklyValue : entry.dailyValue;
  const tone =
    side === "buy" ? "text-emerald-300" :
    side === "sell" ? "text-rose-300" :
    "text-slate-200";
  const barTone =
    side === "buy" ? "bg-emerald-500/70" :
    side === "sell" ? "bg-rose-500/70" :
    "bg-slate-500/60";

  // Bar relative width based on impactScore — caller sets via prop, but here we just render
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm">{entry.code}</span>
            <span className="text-[11px] text-slate-400 truncate">{entry.info.name}</span>
            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wider ${badge.cls}`}>
              {badge.text}
            </span>
          </div>
        </div>
        <div className={`text-sm font-mono font-bold ${tone} whitespace-nowrap`}>
          {fmtIDR(big)}
        </div>
      </div>
      <div className="text-[11px] text-slate-300 leading-snug">{entry.reason}</div>
      <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
        <span>Mingguan: {entry.weeklyValue !== 0 ? fmtIDR(entry.weeklyValue) : "—"}</span>
        <span>Harian: {entry.dailyValue !== 0 ? fmtIDR(entry.dailyValue) : "—"}</span>
        {entry.dailyAvg && <span>Avg D: {entry.dailyAvg}</span>}
      </div>
      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
        <div className={`h-full ${barTone}`} style={{ width: `100%` }} />
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  entries,
  side,
  emptyText,
  limit = 5,
}: {
  title: string;
  subtitle?: string;
  entries: ConsistencyEntry[];
  side: "buy" | "sell" | "neutral";
  emptyText?: string;
  limit?: number;
}) {
  if (entries.length === 0 && !emptyText) return null;
  const headerTone =
    side === "buy" ? "text-emerald-300" :
    side === "sell" ? "text-rose-300" :
    "text-slate-300";
  return (
    <div className="space-y-2">
      <div>
        <div className={`text-xs font-bold uppercase tracking-wider ${headerTone}`}>{title}</div>
        {subtitle && <div className="text-[11px] text-slate-400">{subtitle}</div>}
      </div>
      {entries.length === 0 ? (
        <div className="text-xs text-slate-500 italic">{emptyText}</div>
      ) : (
        <div className="space-y-2">
          {entries.slice(0, limit).map((e) => <Row key={`${title}-${e.code}`} entry={e} side={side} />)}
        </div>
      )}
    </div>
  );
}

export function BrokerConsistencyCard({ analysis }: { analysis: ConsistencyAnalysis }) {
  const { weekly, daily, weeklyRangeDays, konsistenAkum, newOrFlipAkum, selesaiAkum, flipWarning, konsistenDist, newOrFreshDist, conclusion } = analysis;

  const totalWeeklyBuy = weekly.buys.reduce((s, e) => s + e.value, 0);
  const totalWeeklySell = weekly.sells.reduce((s, e) => s + e.value, 0);
  const netWeekly = totalWeeklyBuy + totalWeeklySell;

  const totalDailyBuy = daily.buys.reduce((s, e) => s + e.value, 0);
  const totalDailySell = daily.sells.reduce((s, e) => s + e.value, 0);
  const netDaily = totalDailyBuy + totalDailySell;

  const dateLabel = (act: typeof weekly) =>
    act.dateStart && act.dateStart !== act.date
      ? `${act.dateStart} → ${act.date}`
      : act.date;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5 space-y-5">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base md:text-lg font-bold text-white">
            Analisa Konsistensi Broker
          </h3>
          <span className="px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 text-[10px] font-bold uppercase tracking-wider border border-violet-500/40">
            Mingguan vs Harian
          </span>
        </div>
        <div className="text-[11px] text-slate-400">
          {weekly.symbol} • Mingguan ({weeklyRangeDays} hari, {dateLabel(weekly)}) dibandingkan harian ({dateLabel(daily)})
        </div>
      </div>

      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Net Mingguan</div>
          <div className={`text-sm font-mono font-bold ${netWeekly > 0 ? "text-emerald-300" : netWeekly < 0 ? "text-rose-300" : "text-slate-300"}`}>
            {fmtIDR(netWeekly)}
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Net Harian</div>
          <div className={`text-sm font-mono font-bold ${netDaily > 0 ? "text-emerald-300" : netDaily < 0 ? "text-rose-300" : "text-slate-300"}`}>
            {fmtIDR(netDaily)}
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Akumulator Konsisten</div>
          <div className="text-sm font-mono font-bold text-emerald-300">
            {konsistenAkum.length} broker
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-slate-400">Flip / Risiko</div>
          <div className="text-sm font-mono font-bold text-amber-300">
            {flipWarning.length + konsistenDist.length} broker
          </div>
        </div>
      </div>

      {/* Sections */}
      <Section
        title="Akumulator Konsisten"
        subtitle="Beli di periode mingguan & masih beli di hari terakhir"
        entries={konsistenAkum}
        side="buy"
        emptyText="Tidak ada broker yang konsisten akumulasi di kedua periode."
        limit={5}
      />

      {newOrFlipAkum.length > 0 && (
        <Section
          title="Akum Baru / Reversal"
          subtitle="Baru muncul beli hari ini, atau berbalik dari jual ke beli"
          entries={newOrFlipAkum}
          side="buy"
          limit={4}
        />
      )}

      {flipWarning.length > 0 && (
        <Section
          title="Waspada — Flip ke Distribusi"
          subtitle="Sempat akum mingguan, hari ini berbalik jadi top sell"
          entries={flipWarning}
          side="sell"
          limit={4}
        />
      )}

      {selesaiAkum.length > 0 && (
        <Section
          title="Kemungkinan Selesai Akum"
          subtitle="Akum besar mingguan, tapi hari ini absen — fase akum mungkin sudah selesai"
          entries={selesaiAkum.slice(0, 3)}
          side="neutral"
          limit={3}
        />
      )}

      <Section
        title="Distributor Konsisten"
        subtitle="Jual di mingguan & masih jual di hari terakhir"
        entries={konsistenDist}
        side="sell"
        emptyText="Tidak ada distributor konsisten di kedua periode."
        limit={5}
      />

      {newOrFreshDist.length > 0 && (
        <Section
          title="Seller Baru Hari Ini"
          subtitle="Tidak masuk top mingguan, hari ini langsung muncul jual"
          entries={newOrFreshDist}
          side="sell"
          limit={3}
        />
      )}

      {/* Conclusion */}
      <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 space-y-1.5">
        <div className="text-[10px] uppercase tracking-wider text-violet-300 font-bold">
          Kesimpulan
        </div>
        <div className="text-sm text-violet-50 leading-relaxed">
          {conclusion}
        </div>
      </div>
    </div>
  );
}
