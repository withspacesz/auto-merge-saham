import { Building2 } from "lucide-react";
import {
  type BrokerAnalysis,
  type BrokerType,
  type EnrichedEntry,
} from "@/lib/parser-broker";

function fmtIDR(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}M`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}Jt`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}rb`;
  return `${sign}${abs.toFixed(0)}`;
}

function fmtLot(lot: number): string {
  if (lot >= 1000) return `${(lot / 1000).toFixed(1)}rb`;
  return lot.toFixed(0);
}

function typeBadgeClass(t: BrokerType): string {
  if (t === "asing") return "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40";
  if (t === "lokal") return "bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40";
  return "bg-muted text-muted-foreground ring-1 ring-border";
}

function typeLabel(t: BrokerType): string {
  if (t === "asing") return "Asing";
  if (t === "lokal") return "Lokal";
  return "?";
}

type Props = { analysis: BrokerAnalysis };

export function TopBrokerCard({ analysis }: Props) {
  const { asingEntries, lokalEntries, unknownEntries, symbol, date } = analysis;

  const all: EnrichedEntry[] = [...asingEntries, ...lokalEntries, ...unknownEntries];
  const buys = all.filter((e) => e.value > 0).sort((a, b) => b.value - a.value);
  const sells = all.filter((e) => e.value < 0).sort((a, b) => a.value - b.value);
  const totalBuy = buys.reduce((s, e) => s + e.value, 0);
  const totalSell = sells.reduce((s, e) => s + e.value, 0);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border bg-gradient-to-r from-cyan-500/5 to-transparent">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-cyan-300 tracking-wide">
            Semua Broker — Hari Terakhir
          </h3>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {symbol && (
            <span className="font-mono font-bold text-foreground">{symbol}</span>
          )}
          {symbol && date && " • "}
          {date}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 p-3">
        <BrokerList
          title="NET BUY"
          tone="green"
          entries={buys}
          totalValue={totalBuy}
        />
        <BrokerList
          title="NET SELL"
          tone="red"
          entries={sells}
          totalValue={totalSell}
        />
      </div>
    </div>
  );
}

function BrokerList({
  title,
  tone,
  entries,
  totalValue,
}: {
  title: string;
  tone: "green" | "red";
  entries: EnrichedEntry[];
  totalValue: number;
}) {
  const headerBg =
    tone === "green"
      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
      : "bg-rose-500/10 border-rose-500/30 text-rose-300";
  const borderColor =
    tone === "green" ? "border-emerald-500/30" : "border-rose-500/30";
  const valTone = tone === "green" ? "text-emerald-300" : "text-rose-300";

  return (
    <div
      className={`rounded-lg border ${borderColor} bg-muted/10 overflow-hidden flex flex-col`}
    >
      <div
        className={`flex items-center justify-between gap-2 px-3 py-1.5 border-b text-[11px] font-bold uppercase tracking-wider ${headerBg}`}
      >
        <span>
          {title} ({entries.length})
        </span>
        <span className="font-mono">{fmtIDR(totalValue)}</span>
      </div>
      {entries.length === 0 ? (
        <div className="px-3 py-4 text-[11px] text-muted-foreground text-center">
          Tidak ada data
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="grid grid-cols-[40px_56px_1fr_60px_88px] gap-2 px-3 py-1.5 bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0">
            <span>Kode</span>
            <span>Tipe</span>
            <span>Nama</span>
            <span className="text-right">Lot</span>
            <span className="text-right">Nilai</span>
          </div>
          <div className="divide-y divide-border/40 max-h-[420px] overflow-y-auto">
            {entries.map((e, i) => (
              <div
                key={e.code + i + e.side}
                className="grid grid-cols-[40px_56px_1fr_60px_88px] gap-2 px-3 py-1.5 items-center text-[12px]"
              >
                <span className="font-mono font-bold text-foreground">{e.code}</span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded text-center ${typeBadgeClass(
                    e.info.type,
                  )}`}
                >
                  {typeLabel(e.info.type)}
                </span>
                <span className="truncate text-foreground/90">{e.info.name}</span>
                <span className="text-right font-mono text-muted-foreground tabular-nums">
                  {fmtLot(e.lot)}
                </span>
                <span
                  className={`text-right font-mono font-bold tabular-nums ${valTone}`}
                >
                  {fmtIDR(e.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
