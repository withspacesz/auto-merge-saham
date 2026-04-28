import type { ConsistencyAnalysis, ConsistencyEntry } from "@/lib/parser-broker";

function fmtIDR(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}M`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}Jt`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}rb`;
  return `${sign}${abs.toFixed(0)}`;
}

type ChipTone = "akum-kuat" | "akum" | "jual" | "jual-melemah";

const CHIP_CLS: Record<ChipTone, string> = {
  "akum-kuat": "bg-emerald-500/25 text-emerald-200 border-emerald-400/60 ring-1 ring-emerald-400/30",
  "akum": "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
  "jual": "bg-rose-500/15 text-rose-300 border-rose-500/40",
  "jual-melemah": "bg-amber-500/15 text-amber-300 border-amber-500/40",
};

function Chip({ entry, tone, value }: { entry: ConsistencyEntry; tone: ChipTone; value: number }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-mono ${CHIP_CLS[tone]}`}
      title={entry.info.name}
    >
      <span className="font-bold">{entry.code}</span>
      <span className="opacity-80">{fmtIDR(value)}</span>
    </span>
  );
}

function Bucket({
  title,
  emoji,
  entries,
  tone,
  pickValue,
  emptyText,
}: {
  title: string;
  emoji: string;
  entries: ConsistencyEntry[];
  tone: ChipTone;
  pickValue: (e: ConsistencyEntry) => number;
  emptyText: string;
}) {
  const headerTone =
    tone === "jual" || tone === "jual-melemah" ? "text-rose-300" : "text-emerald-300";
  return (
    <div className="space-y-1.5">
      <div className={`text-xs font-bold uppercase tracking-wider ${headerTone}`}>
        {emoji} {title}
        <span className="ml-1.5 text-[10px] text-slate-400 font-normal normal-case tracking-normal">
          ({entries.length})
        </span>
      </div>
      {entries.length === 0 ? (
        <div className="text-[11px] text-slate-500 italic">{emptyText}</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {entries.map((e) => (
            <Chip key={`${title}-${e.code}`} entry={e} tone={tone} value={pickValue(e)} />
          ))}
        </div>
      )}
    </div>
  );
}

export function BrokerConsistencyCard({ analysis }: { analysis: ConsistencyAnalysis }) {
  const { konsistenAkum, konsistenDist, selesaiAkum, stoppedDist, weeklyRangeDays } = analysis;

  // 1. Akum Kuat: konsisten akum DAN harian >= 60% dari mingguan (akselerasi)
  // 2. Konsisten Akum: konsisten akum biasa
  const akumKuat: ConsistencyEntry[] = [];
  const konsistenAkumBiasa: ConsistencyEntry[] = [];
  for (const e of konsistenAkum) {
    const ratio = Math.abs(e.weeklyValue) > 0 ? Math.abs(e.dailyValue) / Math.abs(e.weeklyValue) : 0;
    if (weeklyRangeDays > 1 && ratio >= 0.6) akumKuat.push(e);
    else konsistenAkumBiasa.push(e);
  }

  // 3. Jualan: konsisten dist
  const jualan = konsistenDist;

  // 4. Jualan Melemah: sell mingguan tapi sudah absen di harian (stoppedDist)
  // + selesai akum sebenarnya bukan "jualan melemah" — skip selesaiAkum dari sini
  const jualanMelemah = stoppedDist;

  // Kesimpulan ringkas
  const conclusionParts: string[] = [];
  if (akumKuat.length > 0) {
    conclusionParts.push(
      `Akum kuat: ${akumKuat.slice(0, 3).map((e) => e.code).join(", ")}`,
    );
  } else if (konsistenAkumBiasa.length > 0) {
    conclusionParts.push(
      `Akum konsisten: ${konsistenAkumBiasa.slice(0, 3).map((e) => e.code).join(", ")}`,
    );
  }
  if (jualan.length > 0) {
    conclusionParts.push(
      `Jualan terkuat: ${jualan.slice(0, 2).map((e) => e.code).join(", ")}`,
    );
  }
  const conclusion = conclusionParts.length > 0
    ? conclusionParts.join(" • ")
    : "Belum ada pola dominan.";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm md:text-base font-bold text-white">
            Konsistensi Broker
          </h3>
          <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 text-[9px] font-bold uppercase tracking-wider border border-violet-500/40">
            Mingguan vs Harian
          </span>
        </div>
        <div className="text-[10px] text-slate-400">
          {analysis.weekly.symbol} • {weeklyRangeDays} hari mingguan vs harian {analysis.daily.date}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
        <Bucket
          title="Akum Kuat"
          emoji="🔥"
          entries={akumKuat}
          tone="akum-kuat"
          pickValue={(e) => e.dailyValue}
          emptyText="Belum ada akumulasi yang akselerasi di hari terakhir."
        />
        <Bucket
          title="Konsisten Akum"
          emoji="✅"
          entries={konsistenAkumBiasa}
          tone="akum"
          pickValue={(e) => e.weeklyValue}
          emptyText="Belum ada akumulator konsisten."
        />
        <Bucket
          title="Jualan"
          emoji="🟥"
          entries={jualan}
          tone="jual"
          pickValue={(e) => e.weeklyValue}
          emptyText="Tidak ada penjual konsisten."
        />
        <Bucket
          title="Jualan Melemah"
          emoji="📉"
          entries={jualanMelemah}
          tone="jual-melemah"
          pickValue={(e) => e.weeklyValue}
          emptyText="Tidak ada penjual yang berhenti hari ini."
        />
      </div>

      {selesaiAkum.length > 0 && (
        <div className="text-[11px] text-slate-400 pt-1 border-t border-white/5">
          <span className="text-slate-500">Selesai akum:</span>{" "}
          {selesaiAkum.slice(0, 5).map((e) => e.code).join(", ")}
        </div>
      )}

      <div className="rounded-lg bg-violet-500/10 border border-violet-500/30 px-3 py-2 text-xs text-violet-100">
        <span className="font-semibold text-violet-300">Inti: </span>{conclusion}
      </div>
    </div>
  );
}
