import { Building2, ArrowUpCircle, ArrowDownCircle } from "lucide-react";
import {
  type BrokerActivity,
  type BrokerEntry,
  type BrokerType,
  getBrokerInfo,
} from "@/lib/parser-broker";

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

type Props = { broker: BrokerActivity };

export function BrokerCard({ broker }: Props) {
  const allEntries = [
    ...broker.buys.map((e) => ({ ...e, side: "buy" as const })),
    ...broker.sells.map((e) => ({ ...e, side: "sell" as const })),
  ];

  // Total beli & jual
  const totalBuy = broker.buys.reduce((s, e) => s + e.value, 0);
  const totalSell = broker.sells.reduce((s, e) => s + e.value, 0);
  const netBSA = totalBuy + totalSell;

  // Pisahkan asing & lokal
  const enriched = allEntries.map((e) => {
    const info = getBrokerInfo(e.code);
    return { ...e, info };
  });

  const asingEntries = enriched.filter((e) => e.info.type === "asing");
  const lokalEntries = enriched.filter((e) => e.info.type === "lokal");
  const unknownEntries = enriched.filter((e) => e.info.type === "unknown");

  const sumNet = (arr: typeof enriched): number =>
    arr.reduce((s, e) => s + e.value, 0);

  const netAsing = sumNet(asingEntries);
  const netLokal = sumNet(lokalEntries);
  const netUnknown = sumNet(unknownEntries);

  // Untuk visualisasi bar — pakai nilai absolut max sebagai skala
  const maxAbs = Math.max(
    ...enriched.map((e) => Math.abs(e.value)),
    1,
  );

  // Top buyer / seller per kategori
  const sortedBuys = [...enriched]
    .filter((e) => e.value > 0)
    .sort((a, b) => b.value - a.value);
  const sortedSells = [...enriched]
    .filter((e) => e.value < 0)
    .sort((a, b) => a.value - b.value);

  const topAsingBuyer = sortedBuys.find((e) => e.info.type === "asing");
  const topAsingSeller = sortedSells.find((e) => e.info.type === "asing");
  const topLokalBuyer = sortedBuys.find((e) => e.info.type === "lokal");
  const topLokalSeller = sortedSells.find((e) => e.info.type === "lokal");

  // Narrative
  const narrative = buildNarrative({
    netBSA,
    netAsing,
    netLokal,
    topAsingBuyer,
    topAsingSeller,
    topLokalBuyer,
    topLokalSeller,
    totalBuy,
  });

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border bg-gradient-to-r from-cyan-500/5 to-transparent">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-cyan-300 tracking-wide">
            Broker Activity Hari Terakhir
          </h3>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {broker.symbol && (
            <span className="font-mono font-bold text-foreground">
              {broker.symbol}
            </span>
          )}
          {broker.symbol && broker.date && " • "}
          {broker.date}
        </span>
      </div>

      {/* Total stats */}
      <div className="grid grid-cols-3 gap-2 p-3">
        <StatBox
          icon={<ArrowUpCircle className="h-3.5 w-3.5" />}
          label="Total Beli"
          value={fmtIDR(totalBuy)}
          tone="green"
          sub={`${broker.buys.length} broker`}
        />
        <StatBox
          icon={<ArrowDownCircle className="h-3.5 w-3.5" />}
          label="Total Jual"
          value={fmtIDR(totalSell)}
          tone="red"
          sub={`${broker.sells.length} broker`}
        />
        <StatBox
          label="NBSA Net"
          value={fmtIDR(netBSA)}
          tone={netBSA > 0 ? "green" : netBSA < 0 ? "red" : "neutral"}
          sub={
            netBSA > 0
              ? "Net buy dominan"
              : netBSA < 0
                ? "Net sell dominan"
                : "Seimbang"
          }
        />
      </div>

      {/* Net Asing / Lokal summary */}
      <div className="grid grid-cols-2 gap-2 px-3 pb-3">
        <NetSideCard
          label="Asing"
          type="asing"
          net={netAsing}
          count={asingEntries.length}
        />
        <NetSideCard
          label="Lokal"
          type="lokal"
          net={netLokal}
          count={lokalEntries.length}
        />
      </div>

      {/* Detail broker list (sorted by abs value) */}
      <div className="px-3 pb-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 px-1">
          Detail Broker · {enriched.length} broker (sorted by nominal)
        </div>
        <div className="rounded-lg border border-border bg-muted/10 overflow-hidden">
          <div className="grid grid-cols-[28px_50px_1fr_70px_90px] gap-2 px-2 py-1.5 border-b border-border bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Tipe</span>
            <span>Kode</span>
            <span>Nama</span>
            <span className="text-right">Lot</span>
            <span className="text-right">Nilai</span>
          </div>
          <div className="divide-y divide-border/40">
            {[...enriched]
              .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
              .map((e, i) => (
                <BrokerRow
                  key={e.code + i + e.side}
                  entry={e}
                  maxAbs={maxAbs}
                />
              ))}
          </div>
        </div>
        {netUnknown !== 0 && unknownEntries.length > 0 && (
          <div className="mt-1.5 text-[10px] text-muted-foreground px-1">
            * {unknownEntries.length} broker belum dikenali ({fmtIDR(netUnknown)} net)
          </div>
        )}
      </div>

      {/* Narrative */}
      <div className="px-3 pb-3">
        <div
          className={`rounded-lg border p-3 ${TONE_BG[narrative.tone]} ring-1 ring-inset ${
            narrative.tone === "green"
              ? "ring-emerald-500/30"
              : narrative.tone === "red"
                ? "ring-rose-500/30"
                : "ring-amber-500/30"
          }`}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Kesimpulan Bandar
            </span>
            <span
              className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded uppercase ${TONE_BADGE[narrative.tone]}`}
            >
              {narrative.label}
            </span>
          </div>
          <div
            className={`text-sm font-bold mb-1 ${TONE_TEXT[narrative.tone]}`}
          >
            {narrative.headline}
          </div>
          <p className="text-[11px] md:text-xs text-muted-foreground leading-relaxed max-w-[680px]">
            {narrative.detail}
          </p>
        </div>
      </div>
    </div>
  );
}

function StatBox({
  icon,
  label,
  value,
  tone,
  sub,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  tone: Tone;
  sub?: string;
}) {
  return (
    <div className={`rounded-lg border p-2.5 ${TONE_BG[tone]}`}>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-base font-bold font-mono mt-0.5 ${TONE_TEXT[tone]}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
      )}
    </div>
  );
}

function NetSideCard({
  label,
  type,
  net,
  count,
}: {
  label: string;
  type: BrokerType;
  net: number;
  count: number;
}) {
  const tone: Tone = net > 0 ? "green" : net < 0 ? "red" : "neutral";
  const status =
    net > 0 ? "Akumulasi" : net < 0 ? "Distribusi" : "Seimbang";
  return (
    <div className={`rounded-lg border p-2.5 ${TONE_BG[tone]}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${typeBadgeClass(type)}`}
          >
            {label}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {count} broker
          </span>
        </div>
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${TONE_BADGE[tone]}`}
        >
          {status}
        </span>
      </div>
      <div className={`text-base font-bold font-mono ${TONE_TEXT[tone]}`}>
        {fmtIDR(net)}
      </div>
    </div>
  );
}

function BrokerRow({
  entry,
  maxAbs,
}: {
  entry: BrokerEntry & {
    side: "buy" | "sell";
    info: { name: string; type: BrokerType };
  };
  maxAbs: number;
}) {
  const isPos = entry.value > 0;
  const valTone = isPos ? "text-emerald-300" : "text-rose-300";
  const barWidth = (Math.abs(entry.value) / maxAbs) * 100;
  return (
    <div className="grid grid-cols-[28px_50px_1fr_70px_90px] gap-2 px-2 py-1.5 items-center text-[11px] hover:bg-muted/20">
      <span
        className={`text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded text-center ${typeBadgeClass(entry.info.type)}`}
      >
        {typeLabel(entry.info.type)}
      </span>
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

type NarrativeResult = {
  label: "ASING DRIVER" | "LOKAL DRIVER" | "DUA-DUANYA AKUM" | "DISTRIBUSI" | "CAMPURAN";
  tone: Tone;
  headline: string;
  detail: string;
};

function buildNarrative(args: {
  netBSA: number;
  netAsing: number;
  netLokal: number;
  topAsingBuyer?: { code: string; info: { name: string }; value: number };
  topAsingSeller?: { code: string; info: { name: string }; value: number };
  topLokalBuyer?: { code: string; info: { name: string }; value: number };
  topLokalSeller?: { code: string; info: { name: string }; value: number };
  totalBuy: number;
}): NarrativeResult {
  const { netBSA, netAsing, netLokal, topAsingBuyer, topAsingSeller, topLokalBuyer, topLokalSeller, totalBuy } =
    args;

  const fmtPct = (n: number) =>
    totalBuy > 0 ? `${((Math.abs(n) / totalBuy) * 100).toFixed(0)}%` : "—";

  const parts: string[] = [];

  // Sisi asing
  if (topAsingBuyer && netAsing > 0) {
    parts.push(
      `Asing dipimpin ${topAsingBuyer.code} (${topAsingBuyer.info.name}) akum ${fmtIDR(topAsingBuyer.value)} (~${fmtPct(topAsingBuyer.value)} dari total beli)`,
    );
  } else if (topAsingSeller && netAsing < 0) {
    parts.push(
      `Asing dist dipimpin ${topAsingSeller.code} (${topAsingSeller.info.name}) jual ${fmtIDR(topAsingSeller.value)}`,
    );
  } else if (topAsingBuyer || topAsingSeller) {
    parts.push("Sisi asing campur — beli & jual saling tutup");
  }

  // Sisi lokal
  if (topLokalBuyer && netLokal > 0) {
    parts.push(
      `lokal didorong ${topLokalBuyer.code} (${topLokalBuyer.info.name}) +${fmtIDR(topLokalBuyer.value).replace(/^\+/, "")}`,
    );
  } else if (topLokalSeller && netLokal < 0) {
    parts.push(
      `lokal dist dipimpin ${topLokalSeller.code} (${topLokalSeller.info.name}) ${fmtIDR(topLokalSeller.value)}`,
    );
  }

  // Tentukan driver utama
  let label: NarrativeResult["label"] = "CAMPURAN";
  let tone: Tone = "amber";
  let headline = "Pola broker campur — belum ada driver dominan";

  if (netAsing > 0 && netLokal > 0) {
    label = "DUA-DUANYA AKUM";
    tone = "green";
    headline = "Asing & Lokal sama-sama akumulasi";
  } else if (netAsing < 0 && netLokal < 0) {
    label = "DISTRIBUSI";
    tone = "red";
    headline = "Asing & Lokal sama-sama distribusi";
  } else if (Math.abs(netAsing) > Math.abs(netLokal)) {
    if (netAsing > 0) {
      label = "ASING DRIVER";
      tone = "green";
      headline = "Asing jadi driver utama — akumulasi";
    } else {
      label = "ASING DRIVER";
      tone = "red";
      headline = "Asing jadi driver — distribusi";
    }
  } else if (Math.abs(netLokal) > Math.abs(netAsing)) {
    if (netLokal > 0) {
      label = "LOKAL DRIVER";
      tone = "green";
      headline = "Lokal jadi driver utama — akumulasi";
    } else {
      label = "LOKAL DRIVER";
      tone = "red";
      headline = "Lokal jadi driver — distribusi";
    }
  }

  // Net summary
  parts.push(
    `Net Asing ${fmtIDR(netAsing)} • Net Lokal ${fmtIDR(netLokal)} • NBSA ${fmtIDR(netBSA)}`,
  );

  // Konteks tambahan untuk pola "Asing serap saat ada distribusi lokal besar"
  if (netAsing > 0 && netLokal < 0 && Math.abs(netLokal) > Math.abs(netAsing) * 0.5) {
    parts.push(
      "Pola klasik: asing serap di tengah distribusi lokal — bandar asing yang ngangkat.",
    );
  } else if (netAsing < 0 && netLokal > 0) {
    parts.push(
      "Pola klasik: asing buang ke lokal — hati-hati lokal jadi bag holder.",
    );
  }

  return {
    label,
    tone,
    headline,
    detail: parts.join(". ") + ".",
  };
}
