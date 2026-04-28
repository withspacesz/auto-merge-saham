import { useState } from "react";
import { Building2, ChevronDown } from "lucide-react";
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

function typeLabel(t: BrokerType): string {
  if (t === "asing") return "Asing";
  if (t === "lokal") return "Lokal";
  return "?";
}

function typeBadgeClass(t: BrokerType): string {
  if (t === "asing")
    return "bg-cyan-500/20 text-cyan-200 ring-1 ring-cyan-500/40";
  if (t === "lokal")
    return "bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40";
  return "bg-muted text-muted-foreground ring-1 ring-border";
}

type Props = { analysis: BrokerAnalysis };

export function BrokerCard({ analysis }: Props) {
  const { asingEntries, lokalEntries, unknownEntries, netAsing, netLokal, netUnknown, symbol, date } =
    analysis;

  // Skala bar: pakai max abs dalam grup masing-masing supaya tetap proporsional dalam grup
  const maxAbsAsing = Math.max(...asingEntries.map((e) => Math.abs(e.value)), 1);
  const maxAbsLokal = Math.max(...lokalEntries.map((e) => Math.abs(e.value)), 1);
  const maxAbsUnknown = Math.max(...unknownEntries.map((e) => Math.abs(e.value)), 1);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border bg-gradient-to-r from-cyan-500/5 to-transparent">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-cyan-300 tracking-wide">
            Detail Broker Hari Terakhir
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

      <div className="p-3 space-y-2">
        <BrokerGroup
          title="Broker Asing"
          type="asing"
          entries={asingEntries}
          netTotal={netAsing}
          maxAbs={maxAbsAsing}
          defaultOpen
        />
        <BrokerGroup
          title="Broker Lokal"
          type="lokal"
          entries={lokalEntries}
          netTotal={netLokal}
          maxAbs={maxAbsLokal}
          defaultOpen
        />
        {unknownEntries.length > 0 && (
          <BrokerGroup
            title="Broker Belum Dikenali"
            type="unknown"
            entries={unknownEntries}
            netTotal={netUnknown}
            maxAbs={maxAbsUnknown}
            defaultOpen={false}
          />
        )}
      </div>
    </div>
  );
}

function BrokerGroup({
  title,
  type,
  entries,
  netTotal,
  maxAbs,
  defaultOpen,
}: {
  title: string;
  type: BrokerType;
  entries: EnrichedEntry[];
  netTotal: number;
  maxAbs: number;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const status =
    netTotal > 0 ? "Akumulasi" : netTotal < 0 ? "Distribusi" : "Seimbang";
  const netTone =
    netTotal > 0
      ? "text-emerald-300"
      : netTotal < 0
        ? "text-rose-300"
        : "text-muted-foreground";
  const statusBadge =
    netTotal > 0
      ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40"
      : netTotal < 0
        ? "bg-rose-500/20 text-rose-300 ring-1 ring-rose-500/40"
        : "bg-muted text-muted-foreground ring-1 ring-border";

  if (entries.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/10 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/20 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform shrink-0 ${
              open ? "" : "-rotate-90"
            }`}
          />
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${typeBadgeClass(type)}`}
          >
            {typeLabel(type)}
          </span>
          <span className="text-sm font-semibold text-foreground truncate">
            {title}
          </span>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {entries.length} broker
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${statusBadge}`}
          >
            {status}
          </span>
          <span className={`text-sm font-bold font-mono tabular-nums ${netTone}`}>
            {fmtIDR(netTotal)}
          </span>
        </div>
      </button>

      {open && (
        <div className="border-t border-border/60">
          <div className="grid grid-cols-[40px_1fr_70px_90px] gap-2 px-3 py-1.5 border-b border-border/60 bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Kode</span>
            <span>Nama</span>
            <span className="text-right">Lot</span>
            <span className="text-right">Nilai</span>
          </div>
          <div className="divide-y divide-border/40">
            {entries.map((e, i) => (
              <BrokerRow key={e.code + i + e.side} entry={e} maxAbs={maxAbs} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BrokerRow({
  entry,
  maxAbs,
}: {
  entry: EnrichedEntry;
  maxAbs: number;
}) {
  const isPos = entry.value > 0;
  const valTone = isPos ? "text-emerald-300" : "text-rose-300";
  const barWidth = (Math.abs(entry.value) / maxAbs) * 100;
  return (
    <div className="grid grid-cols-[40px_1fr_70px_90px] gap-2 px-3 py-1.5 items-center text-[11px] hover:bg-muted/20">
      <span className="font-mono font-bold text-foreground">{entry.code}</span>
      <div className="min-w-0 relative">
        <span className="block truncate text-foreground/90 relative z-10">
          {entry.info.name}
        </span>
        <div
          className={`absolute left-0 top-1/2 -translate-y-1/2 h-1 rounded-full ${
            isPos ? "bg-emerald-500/30" : "bg-rose-500/30"
          }`}
          style={{ width: `${barWidth}%`, bottom: 0 }}
        />
      </div>
      <span className="text-right font-mono text-muted-foreground tabular-nums">
        {entry.lot >= 1000
          ? `${(entry.lot / 1000).toFixed(1)}rb`
          : entry.lot.toFixed(0)}
      </span>
      <span className={`text-right font-mono font-bold tabular-nums ${valTone}`}>
        {fmtIDR(entry.value)}
      </span>
    </div>
  );
}
