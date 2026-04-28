import { useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  GitCompareArrows,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserMinus,
  UserPlus,
} from "lucide-react";
import {
  type BrokerComparison,
  type BrokerCompareEntry,
  type BrokerType,
} from "@/lib/parser-broker";

function fmtIDR(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}M`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}Jt`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}rb`;
  return `${sign}${abs.toFixed(0)}`;
}

function signedClass(n: number): string {
  if (n > 0) return "text-emerald-300";
  if (n < 0) return "text-rose-300";
  return "text-muted-foreground";
}

function ColoredIDR({ n, bold = true }: { n: number; bold?: boolean }) {
  return (
    <span className={`${signedClass(n)} ${bold ? "font-semibold" : ""}`}>
      {fmtIDR(n)}
    </span>
  );
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

type Props = { comparison: BrokerComparison };

export function BrokerCompareCard({ comparison }: Props) {
  const {
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
  } = comparison;

  const totalSignals =
    newAccumulators.length +
    flippedToBuy.length +
    increasedBuy.length +
    newDistributors.length +
    flippedToSell.length +
    increasedSell.length;

  const leftPrimary = [
    { entries: newAccumulators, key: "newBuy" },
    { entries: flippedToBuy, key: "flipBuy" },
    { entries: increasedBuy, key: "incBuy" },
  ].filter((b) => b.entries.length > 0);
  const rightPrimary = [
    { entries: newDistributors, key: "newSell" },
    { entries: flippedToSell, key: "flipSell" },
    { entries: increasedSell, key: "incSell" },
  ].filter((b) => b.entries.length > 0);

  const leftSecondary = [
    { entries: decreasedBuy, key: "decBuy" },
    { entries: exitedBuy, key: "exitBuy" },
  ].filter((b) => b.entries.length > 0);
  const rightSecondary = [
    { entries: decreasedSell, key: "decSell" },
    { entries: exitedSell, key: "exitSell" },
  ].filter((b) => b.entries.length > 0);

  const hasPrimary = leftPrimary.length > 0 || rightPrimary.length > 0;
  const hasSecondary = leftSecondary.length > 0 || rightSecondary.length > 0;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-gradient-to-r from-amber-500/5 via-emerald-500/5 to-rose-500/5">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4 text-amber-300" />
          <h3 className="text-sm font-semibold text-amber-200 tracking-wide">
            Bandingkan Broker — Sinyal Pergeseran
          </h3>
        </div>
        <span className="text-[11px] text-muted-foreground font-mono">
          {prev.date || "snapshot lama"}{" "}
          <ArrowRight className="inline h-3 w-3 mx-1" />{" "}
          {curr.date || "snapshot baru"}
        </span>
      </div>

      <NarrativeBanner comparison={comparison} totalSignals={totalSignals} />

      {hasPrimary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border">
          {/* KOLOM KIRI — semua AKUMULASI */}
          <div className="flex flex-col divide-y divide-border bg-card">
            {newAccumulators.length > 0 && (
              <BucketSection
                title="Mulai Akumulasi"
                subtitle="Broker baru muncul di NET BUY (sebelumnya tidak ada)"
                tone="emerald"
                icon={<Sparkles className="h-4 w-4" />}
                entries={newAccumulators}
                variant="newBuy"
                defaultExpanded
              />
            )}
            {flippedToBuy.length > 0 && (
              <BucketSection
                title="Berbalik Akum (SELL → BUY)"
                subtitle="Sebelumnya jualan, sekarang malah memborong"
                tone="emerald"
                icon={<TrendingUp className="h-4 w-4" />}
                entries={flippedToBuy}
                variant="flipBuy"
                defaultExpanded
              />
            )}
            {increasedBuy.length > 0 && (
              <BucketSection
                title="Tambah Akumulasi"
                subtitle="Broker buy → buy dengan posisi membesar"
                tone="emerald-soft"
                icon={<TrendingUp className="h-4 w-4" />}
                entries={increasedBuy}
                variant="increasedBuy"
                defaultExpanded
              />
            )}
          </div>

          {/* KOLOM KANAN — semua DISTRIBUSI */}
          <div className="flex flex-col divide-y divide-border bg-card">
            {newDistributors.length > 0 && (
              <BucketSection
                title="Mulai Distribusi"
                subtitle="Broker baru muncul di NET SELL (sebelumnya tidak ada)"
                tone="rose"
                icon={<UserPlus className="h-4 w-4" />}
                entries={newDistributors}
                variant="newSell"
              />
            )}
            {flippedToSell.length > 0 && (
              <BucketSection
                title="Berbalik Dist (BUY → SELL)"
                subtitle="Sebelumnya borong, sekarang malah jualan"
                tone="rose"
                icon={<TrendingDown className="h-4 w-4" />}
                entries={flippedToSell}
                variant="flipSell"
              />
            )}
            {increasedSell.length > 0 && (
              <BucketSection
                title="Tambah Distribusi"
                subtitle="Broker sell → sell dengan posisi jual membesar"
                tone="rose-soft"
                icon={<TrendingDown className="h-4 w-4" />}
                entries={increasedSell}
                variant="increasedSell"
              />
            )}
          </div>
        </div>
      )}

      {hasSecondary && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border border-t border-border">
          {/* KIRI — penurunan / selesai dari sisi AKUM */}
          <div className="flex flex-col divide-y divide-border bg-card">
            {decreasedBuy.length > 0 && (
              <BucketSection
                title="Akum Berkurang"
                subtitle="Masih buy tapi lot/value-nya menyusut"
                tone="muted"
                icon={<TrendingDown className="h-4 w-4" />}
                entries={decreasedBuy}
                variant="decreasedBuy"
              />
            )}
            {exitedBuy.length > 0 && (
              <BucketSection
                title="Selesai Akumulasi"
                subtitle="Sebelumnya buy, sekarang hilang dari Top 10"
                tone="muted"
                icon={<UserMinus className="h-4 w-4" />}
                entries={exitedBuy}
                variant="exitedBuy"
              />
            )}
          </div>

          {/* KANAN — penurunan / selesai dari sisi DIST */}
          <div className="flex flex-col divide-y divide-border bg-card">
            {decreasedSell.length > 0 && (
              <BucketSection
                title="Dist Berkurang"
                subtitle="Masih sell tapi lot/value-nya menyusut"
                tone="muted"
                icon={<TrendingUp className="h-4 w-4" />}
                entries={decreasedSell}
                variant="decreasedSell"
              />
            )}
            {exitedSell.length > 0 && (
              <BucketSection
                title="Selesai Distribusi"
                subtitle="Sebelumnya sell, sekarang hilang dari Top 10"
                tone="muted"
                icon={<UserMinus className="h-4 w-4" />}
                entries={exitedSell}
                variant="exitedSell"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NarrativeBanner({
  comparison,
  totalSignals,
}: {
  comparison: BrokerComparison;
  totalSignals: number;
}) {
  const fmtNames = (arr: BrokerCompareEntry[], n = 3) =>
    arr.slice(0, n).map((e) => e.code).join(", ");

  const lines: React.ReactNode[] = [];

  if (comparison.flippedToBuy.length > 0) {
    const top = comparison.flippedToBuy[0];
    lines.push(
      <>
        <span className="text-emerald-300 font-semibold">
          {comparison.flippedToBuy.length} broker BERBALIK akum
        </span>{" "}
        (sebelumnya jual, sekarang borong): {fmtNames(comparison.flippedToBuy)}
        {comparison.flippedToBuy.length > 3 ? ", ..." : ""}. Top:{" "}
        <span className="text-foreground font-semibold">{top.code}</span> ({top.info.name}){" "}
        <ColoredIDR n={top.prevValue} /> <ArrowRight className="inline h-3 w-3 mx-0.5 text-amber-300" />{" "}
        <ColoredIDR n={top.currValue} />.
      </>,
    );
  }
  if (comparison.newAccumulators.length > 0) {
    const top = comparison.newAccumulators[0];
    lines.push(
      <>
        <span className="text-emerald-300 font-semibold">
          {comparison.newAccumulators.length} broker BARU MUNCUL akumulasi
        </span>
        : {fmtNames(comparison.newAccumulators)}
        {comparison.newAccumulators.length > 3 ? ", ..." : ""}. Top:{" "}
        <span className="text-foreground font-semibold">{top.code}</span> ({top.info.name}){" "}
        <ColoredIDR n={top.currValue} />.
      </>,
    );
  }
  if (comparison.flippedToSell.length > 0) {
    const top = comparison.flippedToSell[0];
    lines.push(
      <>
        <span className="text-rose-300 font-semibold">
          {comparison.flippedToSell.length} broker BERBALIK dist
        </span>{" "}
        (sebelumnya borong, sekarang jual): {fmtNames(comparison.flippedToSell)}
        {comparison.flippedToSell.length > 3 ? ", ..." : ""}. Top:{" "}
        <span className="text-foreground font-semibold">{top.code}</span> ({top.info.name}){" "}
        <ColoredIDR n={top.prevValue} /> <ArrowRight className="inline h-3 w-3 mx-0.5 text-amber-300" />{" "}
        <ColoredIDR n={top.currValue} />.
      </>,
    );
  }
  if (comparison.newDistributors.length > 0) {
    const top = comparison.newDistributors[0];
    lines.push(
      <>
        <span className="text-rose-300 font-semibold">
          {comparison.newDistributors.length} broker BARU MUNCUL distribusi
        </span>
        : {fmtNames(comparison.newDistributors)}
        {comparison.newDistributors.length > 3 ? ", ..." : ""}. Top:{" "}
        <span className="text-foreground font-semibold">{top.code}</span> ({top.info.name}){" "}
        <ColoredIDR n={top.currValue} />.
      </>,
    );
  }

  if (totalSignals === 0) {
    lines.push(
      <span className="italic">
        Tidak ada pergeseran berarti antara dua snapshot — komposisi broker relatif sama.
      </span>,
    );
  }

  return (
    <div className="px-4 py-3 border-b border-border bg-muted/15 space-y-1.5">
      {lines.map((line, i) => (
        <p key={i} className="text-[12px] leading-relaxed text-muted-foreground">
          <span className="text-amber-300/80">▸</span> {line}
        </p>
      ))}
    </div>
  );
}

type Variant =
  | "newBuy"
  | "flipBuy"
  | "increasedBuy"
  | "decreasedBuy"
  | "exitedBuy"
  | "newSell"
  | "flipSell"
  | "increasedSell"
  | "decreasedSell"
  | "exitedSell";

function isBuySide(variant: Variant): boolean {
  return variant.endsWith("Buy");
}

function getColumnLabel(variant: Variant): React.ReactNode {
  if (variant === "newBuy" || variant === "newSell") {
    return (
      <>
        <span className="text-foreground/70">Posisi Sekarang</span>
      </>
    );
  }
  if (variant === "exitedBuy" || variant === "exitedSell") {
    return (
      <>
        <span className="text-foreground/70">Posisi Sebelumnya</span>
      </>
    );
  }
  // flip & increased/decreased: prev → curr (Δ delta)
  return (
    <>
      <span className="text-foreground/70">Sebelumnya</span>
      <span className="mx-1 text-amber-300/80">→</span>
      <span className="text-foreground/70">Sekarang</span>
      <span className="ml-1 text-amber-300/80">(Δ Perubahan)</span>
    </>
  );
}

function BucketSection({
  title,
  subtitle,
  tone,
  icon,
  entries,
  variant,
  defaultExpanded = false,
}: {
  title: string;
  subtitle: string;
  tone: "emerald" | "emerald-soft" | "rose" | "rose-soft" | "muted";
  icon: React.ReactNode;
  entries: BrokerCompareEntry[];
  variant: Variant;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const headerColor =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "emerald-soft"
        ? "text-emerald-400/80"
        : tone === "rose"
          ? "text-rose-300"
          : tone === "rose-soft"
            ? "text-rose-400/80"
            : "text-muted-foreground";

  const headerBg =
    tone === "emerald"
      ? "bg-emerald-500/10 border-emerald-500/40 hover:bg-emerald-500/15"
      : tone === "emerald-soft"
        ? "bg-emerald-500/5 border-emerald-500/25 hover:bg-emerald-500/10"
        : tone === "rose"
          ? "bg-rose-500/10 border-rose-500/40 hover:bg-rose-500/15"
          : tone === "rose-soft"
            ? "bg-rose-500/5 border-rose-500/25 hover:bg-rose-500/10"
            : "bg-muted/20 border-border hover:bg-muted/30";

  const codeColor = isBuySide(variant) ? "text-emerald-300" : "text-rose-300";
  const codeRing = isBuySide(variant)
    ? "ring-emerald-500/30"
    : "ring-rose-500/30";

  return (
    <div className="bg-card">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className={`group w-full flex items-start gap-2.5 px-3 py-2.5 border-l-2 ${headerBg} transition-colors text-left`}
      >
        <span className={`${headerColor} mt-0.5 shrink-0`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-[12px] font-semibold uppercase tracking-wide ${headerColor}`}
            >
              {title}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              ({entries.length})
            </span>
          </div>
          {expanded ? (
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {subtitle}
            </div>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {entries.map((e) => (
                <span
                  key={e.code}
                  title={`${e.code} — ${e.info.name}`}
                  className={`inline-block font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-background/50 ring-1 ${codeRing} ${codeColor}`}
                >
                  {e.code}
                </span>
              ))}
            </div>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 mt-0.5 shrink-0 text-muted-foreground/70 transition-transform duration-200 ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <>
          {/* Sub-judul kolom: jelaskan arti angka di kolom kanan */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/60 bg-muted/10">
            <span className="shrink-0 inline-block min-w-[2.5rem] text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60">
              Kode
            </span>
            <span className="shrink-0 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60">
              Tipe
            </span>
            <span className="min-w-0 flex-1 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60">
              Nama Broker
            </span>
            <span className="shrink-0 text-[9px] font-mono uppercase tracking-wider">
              {getColumnLabel(variant)}
            </span>
          </div>

          <ul className="divide-y divide-border/60">
            {entries.map((e) => (
              <CompareRow key={e.code} entry={e} variant={variant} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function CompareRow({
  entry,
  variant,
}: {
  entry: BrokerCompareEntry;
  variant: Variant;
}) {
  const codeColor = isBuySide(variant) ? "text-emerald-300" : "text-rose-300";

  let valueLine: React.ReactNode;
  if (variant === "newBuy" || variant === "newSell") {
    valueLine = (
      <span className="font-mono text-[11px] text-muted-foreground">
        baru muncul → <ColoredIDR n={entry.currValue} />
      </span>
    );
  } else if (variant === "flipBuy" || variant === "flipSell") {
    valueLine = (
      <span className="font-mono text-[11px] text-muted-foreground">
        <ColoredIDR n={entry.prevValue} />{" "}
        <ArrowRight className="inline h-3 w-3 mx-0.5 text-amber-300" />{" "}
        <ColoredIDR n={entry.currValue} />
        <span className="ml-2 text-amber-300/80">
          (Δ <ColoredIDR n={entry.delta} bold={false} />)
        </span>
      </span>
    );
  } else if (variant === "exitedBuy" || variant === "exitedSell") {
    valueLine = (
      <span className="font-mono text-[11px] text-muted-foreground">
        sebelumnya <ColoredIDR n={entry.prevValue} /> → hilang dari Top 10
      </span>
    );
  } else {
    // increased / decreased same-side
    valueLine = (
      <span className="font-mono text-[11px] text-muted-foreground">
        <ColoredIDR n={entry.prevValue} />{" "}
        <ArrowRight className="inline h-3 w-3 mx-0.5 text-muted-foreground" />{" "}
        <ColoredIDR n={entry.currValue} />
        <span className="ml-2 text-muted-foreground/70">
          (Δ <ColoredIDR n={entry.delta} bold={false} />)
        </span>
      </span>
    );
  }

  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <span
        className={`shrink-0 inline-flex items-center justify-center min-w-[2.5rem] px-1.5 py-0.5 rounded font-mono text-[11px] font-bold ${codeColor} bg-background/40 ring-1 ring-border`}
      >
        {entry.code}
      </span>
      <span
        className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded ${typeBadgeClass(entry.info.type)}`}
        title={typeLabel(entry.info.type)}
      >
        {typeLabel(entry.info.type)}
      </span>
      <span className="min-w-0 flex-1 text-[11px] text-foreground/90 truncate" title={entry.info.name}>
        {entry.info.name}
      </span>
      <span className="shrink-0">{valueLine}</span>
    </li>
  );
}
