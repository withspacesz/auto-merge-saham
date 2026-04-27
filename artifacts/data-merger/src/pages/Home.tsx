import { useEffect, useMemo, useState } from "react";
import { Calendar, Check, Copy, Hash, X } from "lucide-react";
import { ResultTable } from "@/components/ResultTable";
import { SummaryCard } from "@/components/SummaryCard";
import { mergeInputs } from "@/lib/merger";

type SourceKey = "data" | "nbsa" | "mf" | "rcm";

const SOURCES: { key: SourceKey; label: string; tag: string; cmdBase: string; hint: string }[] = [
  {
    key: "data",
    label: "Data Gabungan / Utama",
    tag: "DATA",
    cmdBase: "/data",
    hint: "Paste data lengkap (sudah ada ket nbsa & ket mf) ATAU data utama saja",
  },
  {
    key: "nbsa",
    label: "NBSA",
    tag: "NBSA",
    cmdBase: "/accumnbsa",
    hint: "Paste data Acc/Dist NBSA (kolom: Date, Price, Value, NBSA, ket)",
  },
  {
    key: "mf",
    label: "Money Flow",
    tag: "MONEY FLOW",
    cmdBase: "/accummf",
    hint: "Paste data Acc/Dist Money Flow (kolom: Date, Price, Value, MF +/-, ket)",
  },
  {
    key: "rcm",
    label: "Rekap Clean Money",
    tag: "REKAP CLEAN MONEY",
    cmdBase: "/rcm",
    hint: "Paste data Rekap Clean Money (kolom: Date, Tx, Avp P, Gain%, Value, Smart M., Bad M., Clean M., RCV)",
  },
];

const SAMPLE: Record<SourceKey, string> = {
  data: `/DATA 🗓27-04-2026 || ⏰01:23:13 Wib.
Halo Kak Bang Tra🥰,
Berikut adalah Data saham ACES (7 candle) :
--------------------------------------------------
🗓 Date  |Price| Gain|Freq | MF +/- | Value| NBSA|
--------------------------------------------------
24-04-2026   390 -1.52   4Rb   -3M 🔴  12M    +2M
23-04-2026   396  0.51   7Rb   -4M 🔴  23M    +6M
22-04-2026   394  2.07   7Rb   -2M 🔴  18M    +5M
21-04-2026   386  3.76   5Rb   +2M 🟢  16M   +10M
20-04-2026   372 -1.06   5Rb   -4M 🔴  14M    +2M
17-04-2026   376  2.73   9Rb   +2M 🟢  29M    +2M
16-04-2026   366  2.23   4Rb   +1M 🟢  14M    +6M
--------------------------------------------------➕
TOTAL✍️ :               41Rb   -7M 🔴 126M   +33M`,
  nbsa: `/ACCUMNBSA 🗓27-04-2026 || ⏰01:22:52 Wib.
Halo Kak Bang Tra🥰,
Berikut adalah Data Acc/Dist NBSA
saham ACES (7 candle) :
----------------------------------------
🗓 Date  |Price| Value |NBSA| ket...   |
----------------------------------------
24-04-2026   390  12M    +2M  Normal Accum
23-04-2026   396  23M    +6M  Big Accum🔥
22-04-2026   394  18M    +5M  Big Accum🔥
21-04-2026   386  16M   +10M  Big Accum🔥
20-04-2026   372  14M    +2M  Small Accum
17-04-2026   376  29M    +2M  Netral
16-04-2026   366  14M    +6M  Big Accum🔥
-----------------------------------------➕
TOTAL✍️ :        126M   +33M  Big Accum🔥`,
  mf: `/ACUUMMF 🗓27-04-2026 || ⏰01:23:07 Wib.
Halo Kak Bang Tra🥰,
Berikut adalah Data
Acc/Dist Money Flow saham ACES (7 candle) :
------------------------------------------
🗓 Date  |Price| Value |MF+/-| ket..     |
------------------------------------------
24-04-2026   390  12M    -3M  Big Dist‼️
23-04-2026   396  23M    -4M  Normal Dist
22-04-2026   394  18M    -2M  Small Dist
21-04-2026   386  16M    +2M  Small Accum
20-04-2026   372  14M    -4M  Big Dist‼️
17-04-2026   376  29M    +2M  Small Accum
16-04-2026   366  14M    +1M  Small Accum
-----------------------------------------➕
TOTAL✍️ :        126M    -7M  Netral`,
  rcm: `/RCM 🗓27-04-2026 || ⏰01:23:41 Wib.
Halo Kak Bang Tra🥰,
Berikut adalah Rekap Clean Money Saham ACES (7 Hari)
dari tanggal 16-4-2026 s/d 24-4-2026
-------------------------------------------------------------------------
   Date   | Tx|Avp P| Gain%| Value |Smart M.|  Bad M. | Clean M.|🚦| RCV
-------------------------------------------------------------------------
24-04-2026 11x   384  -1.52   3.07M  649.56Jt   -1.53M  -878.31Jt🔴  -28
23-04-2026 14x   396   0.51   8.68M    2.71M    -5.09M    -2.38M 🔴  -27
22-04-2026 12x   392   2.07   8.68M    3.40M    -3.30M   102.54Jt🟢    1
21-04-2026 24x   381   3.76   8.46M    4.65M    -3.04M     1.61M 🟢   18
20-04-2026 25x   375  -1.06   7.10M    1.95M    -4.55M    -2.60M 🔴  -36
17-04-2026 14x   379   2.73   9.28M    4.81M    -3.25M     1.56M 🟢   16
16-04-2026 13x   364   2.23   5.02M    3.58M  -800.39Jt    2.78M 🟢   55
-------------------------------------------------------------------------➕
          113x   382  -1.52  50.29M   21.77M   -21.56M   200.57Jt🟢    0`,
};

type Mode = "candle" | "tanggal";

export function HomePage() {
  const [mode, setMode] = useState<Mode>("tanggal");
  const [symbol, setSymbol] = useState("");
  const [candleCount, setCandleCount] = useState("7");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [active, setActive] = useState<SourceKey>("data");
  const [data, setData] = useState<Record<SourceKey, string>>({
    data: "",
    nbsa: "",
    mf: "",
    rcm: "",
  });
  const [submitted, setSubmitted] = useState<Record<SourceKey, string> | null>(null);
  const [showResult, setShowResult] = useState(false);

  const filledCount = (Object.values(data) as string[]).filter((v) => v.trim().length > 0).length;

  const handleMerge = () => {
    setSubmitted({ ...data });
    setShowResult(true);
  };

  const handleReset = () => {
    setData({ data: "", nbsa: "", mf: "", rcm: "" });
    setSubmitted(null);
    setSymbol("");
    setShowResult(false);
  };

  const handleSample = () => {
    setData(SAMPLE);
    setSymbol("CTTH");
    setSubmitted(SAMPLE);
    setShowResult(true);
  };

  const handleCloseResult = () => {
    setShowResult(false);
  };

  useEffect(() => {
    if (!showResult) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowResult(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [showResult]);

  const { merged } = useMemo(() => {
    if (!submitted) return { merged: null };
    const inputs = SOURCES.map((s) => ({ key: s.key, text: submitted[s.key] ?? "" }));
    return mergeInputs(inputs);
  }, [submitted]);

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-8 space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-emerald-400">
            Auto Merge Saham
          </h1>
          <p className="text-sm text-muted-foreground">
            Gabungkan data saham dari beberapa sumber menjadi satu tabel lengkap secara otomatis
          </p>
        </header>

        <section className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <div className="inline-flex rounded-md bg-muted p-1">
              <button
                onClick={() => setMode("candle")}
                className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === "candle"
                    ? "bg-emerald-500 text-emerald-950"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Candle
              </button>
              <button
                onClick={() => setMode("tanggal")}
                className={`px-3.5 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === "tanggal"
                    ? "bg-emerald-500 text-emerald-950"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Tanggal
              </button>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-muted-foreground">Kode:</span>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="CLAY"
                className="w-28 bg-input border border-border rounded-md px-3 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40"
              />
            </div>

            {mode === "candle" ? (
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <input
                  type="number"
                  min="1"
                  value={candleCount}
                  onChange={(e) => setCandleCount(e.target.value)}
                  placeholder="7"
                  className="w-20 bg-input border border-border rounded-md px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
                <span className="text-sm text-muted-foreground">candle</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Dari:</span>
                  <div className="relative">
                    <input
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      className="bg-input border border-border rounded-md pl-3 pr-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40 [color-scheme:dark]"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">S/d:</span>
                  <input
                    type="date"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    className="bg-input border border-border rounded-md pl-3 pr-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/40 [color-scheme:dark]"
                  />
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {SOURCES.map((s) => (
              <CommandRow
                key={s.key}
                tag={s.tag}
                command={formatCommand(s.cmdBase, symbol, mode, candleCount, from, to)}
                filled={data[s.key].trim().length > 0}
                active={active === s.key}
                onClick={() => setActive(s.key)}
              />
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <nav className="flex items-center gap-1 px-2 pt-2 border-b border-border overflow-x-auto">
            {SOURCES.map((s) => {
              const isActive = active === s.key;
              const filled = data[s.key].trim().length > 0;
              return (
                <button
                  key={s.key}
                  onClick={() => setActive(s.key)}
                  className={`relative px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? "text-emerald-400"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {s.label}
                    {filled && (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    )}
                  </span>
                  {isActive && (
                    <span className="absolute left-3 right-3 -bottom-px h-0.5 bg-emerald-400 rounded-full" />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="px-4 py-2 text-xs text-muted-foreground border-b border-border bg-muted/20">
            {SOURCES.find((s) => s.key === active)?.hint}
          </div>

          <textarea
            value={data[active]}
            onChange={(e) => setData((prev) => ({ ...prev, [active]: e.target.value }))}
            spellCheck={false}
            placeholder="Paste data di sini..."
            className="w-full min-h-[260px] bg-transparent text-[13px] font-mono px-4 py-3 outline-none resize-y placeholder:text-muted-foreground/60 leading-relaxed"
          />
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleMerge}
            disabled={filledCount === 0}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/30 disabled:cursor-not-allowed text-emerald-950 disabled:text-emerald-950/60 text-sm font-semibold transition-colors"
          >
            Gabungkan Data
          </button>
          <button
            onClick={handleSample}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-muted hover:bg-muted/70 text-foreground text-sm font-medium transition-colors"
          >
            Coba Data Contoh
          </button>
          <button
            onClick={handleReset}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-muted hover:bg-muted/70 text-foreground text-sm font-medium transition-colors"
          >
            Reset
          </button>
          <div className="ml-auto text-xs text-muted-foreground flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            {filledCount} dari {SOURCES.length} sumber terisi
          </div>
        </div>

      </div>

      {showResult && merged && submitted && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8"
        >
          <div
            onClick={handleCloseResult}
            className="absolute inset-0 bg-background/70 backdrop-blur-md animate-in fade-in"
          />

          <div className="relative w-full max-w-[1400px] max-h-[92vh] flex flex-col rounded-2xl border border-border bg-card shadow-2xl shadow-emerald-500/10 overflow-hidden animate-in zoom-in-95 fade-in duration-200">
            <div className="flex items-center justify-between gap-4 px-5 md:px-6 py-4 border-b border-border bg-card/95 backdrop-blur sticky top-0 z-10">
              <div className="min-w-0">
                <h2 className="text-lg md:text-xl font-bold text-emerald-400 truncate">
                  Hasil Gabungan {symbol ? `— ${symbol}` : ""}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Data lengkap hasil penggabungan dari {filledCount} sumber
                </p>
              </div>
              <button
                onClick={handleCloseResult}
                className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-md border border-border bg-background/40 text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
                title="Tutup (Esc)"
                aria-label="Tutup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-5 md:px-6 py-5 space-y-5">
              <SummaryCard merged={merged} />
              <ResultTable merged={merged} symbol={symbol} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatCommand(
  cmdBase: string,
  symbol: string,
  mode: Mode,
  candleCount: string,
  from: string,
  to: string,
): string {
  const sym = symbol || "SAHAM";
  if (mode === "candle") {
    const n = candleCount && Number(candleCount) > 0 ? candleCount : "N";
    return `${cmdBase} ${sym} ${n}`;
  }
  const fromCompact = from ? from.replace(/-/g, "") : "YYYYMMDD";
  const toCompact = to ? to.replace(/-/g, "") : "YYYYMMDD";
  return `${cmdBase} ${sym} date > ${fromCompact} + date <= ${toCompact}`;
}

type CommandRowProps = {
  tag: string;
  command: string;
  filled: boolean;
  active: boolean;
  onClick: () => void;
};

function CommandRow({ tag, command, filled, active, onClick }: CommandRowProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`group flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all cursor-pointer ${
        active
          ? "border-emerald-500/50 bg-emerald-500/5"
          : "border-border bg-input/40 hover:border-border/80 hover:bg-input/60"
      }`}
    >
      <span
        className={`text-[10px] font-semibold tracking-wider uppercase px-2 py-1 rounded ${
          filled
            ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {tag}
      </span>
      <code
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="text-xs font-mono text-muted-foreground truncate flex-1 select-text cursor-text"
      >
        {command}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? "Tersalin" : "Salin perintah"}
        className={`shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-md border transition-colors ${
          copied
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            : "border-border bg-background/40 text-muted-foreground hover:text-foreground hover:border-border/80"
        }`}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
