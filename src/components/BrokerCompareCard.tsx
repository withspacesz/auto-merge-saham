import { ArrowRight, GitCompareArrows, Sparkles, TrendingDown, TrendingUp, UserMinus, UserPlus } from "lucide-react";
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

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-border bg-gradient-to-r from-amber-500/5 via-emerald-500/5 to-rose-500/5">
        <div className="flex items-center gap-2">
          <GitCompareArrows className="h-4 w-4 text-amber-300" />
          <h3 className="text-sm font-semibold text-amber-200 tracking-wide">
            Bandingkan Broker — Sinyal Pergeseran
          </h3>
        </div>
        <span className="text-[11px] text-muted-foreground font-mono">
          {prev.date || "snapshot lama"} <ArrowRight className="inline h-3 w-3 mx-1" /> {curr.date || "snapshot baru"}
        </span>
      </div>

      <NarrativeBanner comparison={comparison} totalSignals={totalSignals} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border">
        <BucketSection
          title="Mulai Akumulasi"
          subtitle="Broker baru muncul di NET BUY (sebelumnya tidak ada)"
          tone="emerald"
          icon={<Sparkles className="h-4 w-4" />}
          entries={newAccumulators}
          variant="newBuy"
        />
        <BucketSection
          title="Berbalik Akum (SELL → BUY)"
          subtitle="Sebelumnya jualan, sekarang malah memborong — sinyal kuat mulai akumulasi"
          tone="emerald"
          icon={<TrendingUp className="h-4 w-4" />}
          entries={flippedToBuy}
          variant="flipBuy"
        />
        <BucketSection
          title="Tambah Akumulasi"
          subtitle="Broker buy → buy dengan posisi membesar"
          tone="emerald-soft"
          icon={<TrendingUp className="h-4 w-4" />}
          entries={increasedBuy}
          variant="increasedBuy"
        />
        <BucketSection
          title="Mulai Distribusi"
          subtitle="Broker baru muncul di NET SELL (sebelumnya tidak ada)"
          tone="rose"
          icon={<UserPlus className="h-4 w-4" />}
          entries={newDistributors}
          variant="newSell"
        />
        <BucketSection
          title="Berbalik Dist (BUY → SELL)"
          subtitle="Sebelumnya borong, sekarang malah jualan — sinyal kuat mulai distribusi"
          tone="rose"
          icon={<TrendingDown className="h-4 w-4" />}
          entries={flippedToSell}
          variant="flipSell"
        />
        <BucketSection
          title="Tambah Distribusi"
          subtitle="Broker sell → sell dengan posisi jual membesar"
          tone="rose-soft"
          icon={<TrendingDown className="h-4 w-4" />}
          entries={increasedSell}
          variant="increasedSell"
        />
      </div>

      {(decreasedBuy.length > 0 ||
        decreasedSell.length > 0 ||
        exitedBuy.length > 0 ||
        exitedSell.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border border-t border-border">
          <BucketSection
            title="Akum Berkurang"
            subtitle="Masih buy tapi lot/value-nya menyusut"
            tone="muted"
            icon={<TrendingDown className="h-4 w-4" />}
            entries={decreasedBuy}
            variant="decreasedBuy"
          />
          <BucketSection
            title="Dist Berkurang"
            subtitle="Masih sell tapi lot/value-nya menyusut"
            tone="muted"
            icon={<TrendingUp className="h-4 w-4" />}
            entries={decreasedSell}
            variant="decreasedSell"
          />
          <BucketSection
            title="Selesai Akumulasi"
            subtitle="Sebelumnya buy, sekarang hilang dari Top 10 — kemungkinan take-profit / close"
            tone="muted"
            icon={<UserMinus className="h-4 w-4" />}
            entries={exitedBuy}
            variant="exitedBuy"
          />
          <BucketSection
            title="Selesai Distribusi"
            subtitle="Sebelumnya sell, sekarang hilang dari Top 10 — kemungkinan selesai jual / cover"
            tone="muted"
            icon={<UserMinus className="h-4 w-4" />}
            entries={exitedSell}
            variant="exitedSell"
          />
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
  const lines: string[] = [];

  const fmtNames = (arr: BrokerCompareEntry[], n = 3) =>
    arr.slice(0, n).map((e) => e.code).join(", ");

  if (comparison.flippedToBuy.length > 0) {
    const top = comparison.flippedToBuy[0];
    lines.push(
      `${comparison.flippedToBuy.length} broker BERBALIK akum (sebelumnya jual, sekarang borong): ${fmtNames(comparison.flippedToBuy)}${comparison.flippedToBuy.length > 3 ? ", ..." : ""}. Top: ${top.code} (${top.info.name}) ${fmtIDR(top.prevValue)} → ${fmtIDR(top.currValue)}.`,
    );
  }
  if (comparison.newAccumulators.length > 0) {
    const top = comparison.newAccumulators[0];
    lines.push(
      `${comparison.newAccumulators.length} broker BARU MUNCUL akumulasi: ${fmtNames(comparison.newAccumulators)}${comparison.newAccumulators.length > 3 ? ", ..." : ""}. Top: ${top.code} (${top.info.name}) ${fmtIDR(top.currValue)}.`,
    );
  }
  if (comparison.flippedToSell.length > 0) {
    const top = comparison.flippedToSell[0];
    lines.push(
      `${comparison.flippedToSell.length} broker BERBALIK dist (sebelumnya borong, sekarang jual): ${fmtNames(comparison.flippedToSell)}${comparison.flippedToSell.length > 3 ? ", ..." : ""}. Top: ${top.code} (${top.info.name}) ${fmtIDR(top.prevValue)} → ${fmtIDR(top.currValue)}.`,
    );
  }
  if (comparison.newDistributors.length > 0) {
    const top = comparison.newDistributors[0];
    lines.push(
      `${comparison.newDistributors.length} broker BARU MUNCUL distribusi: ${fmtNames(comparison.newDistributors)}${comparison.newDistributors.length > 3 ? ", ..." : ""}. Top: ${top.code} (${top.info.name}) ${fmtIDR(top.currValue)}.`,
    );
  }

  if (totalSignals === 0) {
    lines.push("Tidak ada pergeseran berarti antara dua snapshot — komposisi broker relatif sama.");
  }

  return (
    <div className="px-4 py-3 border-b border-border bg-muted/15 space-y-1">
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

function BucketSection({
  title,
  subtitle,
  tone,
  icon,
  entries,
  variant,
}: {
  title: string;
  subtitle: string;
  tone: "emerald" | "emerald-soft" | "rose" | "rose-soft" | "muted";
  icon: React.ReactNode;
  entries: BrokerCompareEntry[];
  variant: Variant;
}) {
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
      ? "bg-emerald-500/10 border-emerald-500/30"
      : tone === "emerald-soft"
        ? "bg-emerald-500/5 border-emerald-500/20"
        : tone === "rose"
          ? "bg-rose-500/10 border-rose-500/30"
          : tone === "rose-soft"
            ? "bg-rose-500/5 border-rose-500/20"
            : "bg-muted/20 border-border";

  return (
    <div className="bg-card">
      <div className={`flex items-center gap-2 px-3 py-2 border-l-2 ${headerBg}`}>
        <span className={headerColor}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className={`text-[12px] font-semibold uppercase tracking-wide ${headerColor}`}>
            {title}
            <span className="ml-2 text-[10px] font-mono text-muted-foreground">
              ({entries.length})
            </span>
          </div>
          <div className="text-[10px] text-muted-foreground">{subtitle}</div>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="px-3 py-3 text-[11px] text-muted-foreground/60 italic">
          — tidak ada —
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {entries.map((e) => (
            <CompareRow key={e.code} entry={e} variant={variant} />
          ))}
        </ul>
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
  const isBuyVariant = variant.endsWith("Buy") || variant === "newBuy" || variant === "flipBuy";
  const codeColor = isBuyVariant ? "text-emerald-300" : "text-rose-300";

  let valueLine: React.ReactNode;
  if (variant === "newBuy" || variant === "newSell") {
    valueLine = (
      <span className="font-mono text-[11px] text-muted-foreground">
        baru muncul →{" "}
        <span className={isBuyVariant ? "text-emerald-300" : "text-rose-300"}>
          {fmtIDR(entry.currValue)}
        </span>
      </span>
    );
  } else if (variant === "flipBuy" || variant === "flipSell") {
    valueLine = (
      <span className="font-mono text-[11px] text-muted-foreground">
        <span className={entry.prevValue > 0 ? "text-emerald-400/70" : "text-rose-400/70"}>
          {fmtIDR(entry.prevValue)}
        </span>{" "}
        <ArrowRight className="inline h-3 w-3 mx-0.5 text-amber-300" />{" "}
        <span className={isBuyVariant ? "text-emerald-300" : "text-rose-300"}>
          {fmtIDR(entry.currValue)}
        </span>
        <span className="ml-2 text-amber-300/80">
          (Δ {fmtIDR(entry.delta)})
        </span>
      </span>
    );
  } else if (variant === "exitedBuy" || variant === "exitedSell") {
    valueLine = (
      <span className="font-mono text-[11px] text-muted-foreground">
        sebelumnya{" "}
        <span className={entry.prevValue > 0 ? "text-emerald-400/70" : "text-rose-400/70"}>
          {fmtIDR(entry.prevValue)}
        </span>{" "}
        → hilang dari Top 10
      </span>
    );
  } else {
    // increased / decreased same-side
    valueLine = (
      <span className="font-mono text-[11px] text-muted-foreground">
        <span className={entry.prevValue > 0 ? "text-emerald-400/70" : "text-rose-400/70"}>
          {fmtIDR(entry.prevValue)}
        </span>{" "}
        <ArrowRight className="inline h-3 w-3 mx-0.5 text-muted-foreground" />{" "}
        <span className={isBuyVariant ? "text-emerald-300" : "text-rose-300"}>
          {fmtIDR(entry.currValue)}
        </span>
        <span
          className={`ml-2 ${
            (isBuyVariant && entry.delta > 0) || (!isBuyVariant && entry.delta < 0)
              ? "text-amber-300/80"
              : "text-muted-foreground/70"
          }`}
        >
          (Δ {fmtIDR(entry.delta)})
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
