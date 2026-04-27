import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Calendar, Check, Copy, Hash, X } from "lucide-react";
import { ResultTable } from "@/components/ResultTable";
import { SummaryCard } from "@/components/SummaryCard";
import { mergeInputs, type MergedTable } from "@/lib/merger";

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
  data: `/DATA 🗓24-04-2026 || ⏰09:00:00 Wib.
Halo Kak Bang Tra🥰,
Berikut adalah Data saham ESIP (6 candle) :
--------------------------------------------------
🗓 Date  |Price| Gain|Freq | MF +/- | Value| NBSA|
--------------------------------------------------
24-04-2026    88 -4.35   2Rb   -821Jt 🔴   2M  +188Jt
23-04-2026    92 -3.16   2Rb   -938Jt 🔴   2M  -189Jt
22-04-2026    95  1.06   3Rb   +336Jt 🟢   3M   -52Jt
21-04-2026    94  1.08   3Rb    -16Jt 🔴   4M  +172Jt
20-04-2026    93  0.00   5Rb   -637Jt 🔴   4M  -252Jt
17-04-2026    93 -8.82   6Rb     -4M 🔴   8M  +316Jt
--------------------------------------------------➕
TOTAL✍️ :              21Rb    -6M 🔴  23M  +183Jt`,
  nbsa: `/ACCUMNBSA 🗓24-04-2026 || ⏰09:00:00 Wib.
Halo Kak Bang Tra🥰,
Berikut adalah Data Acc/Dist NBSA
saham ESIP (6 candle) :
----------------------------------------
🗓 Date  |Price| Value |NBSA| ket...   |
----------------------------------------
24-04-2026    88   2M  +188Jt  Small Accum
23-04-2026    92   2M  -189Jt  Small Dist
22-04-2026    95   3M   -52Jt  Netral
21-04-2026    94   4M  +172Jt  Netral
20-04-2026    93   4M  -252Jt  Netral
17-04-2026    93   8M  +316Jt  Netral
-----------------------------------------➕
TOTAL✍️ :        23M  +183Jt  Netral`,
  mf: `/ACUUMMF 🗓24-04-2026 || ⏰09:00:00 Wib.
Halo Kak Bang Tra🥰,
Berikut adalah Data
Acc/Dist Money Flow saham ESIP (6 candle) :
------------------------------------------
🗓 Date  |Price| Value |MF+/-| ket..     |
------------------------------------------
24-04-2026    88   2M  -821Jt  Massive Dist
23-04-2026    92   2M  -938Jt  Massive Dist
22-04-2026    95   3M  +336Jt  Small Accum
21-04-2026    94   4M   -16Jt  Netral
20-04-2026    93   4M  -637Jt  Normal Dist
17-04-2026    93   8M    -4M   Massive Dist
-----------------------------------------➕
TOTAL✍️ :        23M    -6M   Netral`,
  rcm: `/RCM 🗓24-04-2026 || ⏰09:00:00 Wib.
Halo Kak Bang Tra🥰,
Berikut adalah Rekap Clean Money Saham ESIP (6 Hari)
dari tanggal 17-4-2026 s/d 24-4-2026
-------------------------------------------------------------------------
   Date   | Tx|Avp P| Gain%| Value |Smart M.|  Bad M. | Clean M.|🚦| RCV
-------------------------------------------------------------------------
24-04-2026  3x    90  -4.35   2.00M    0.00   -208.67Jt  -208.67Jt🔴  -98
23-04-2026  2x    92  -3.16   2.00M    0.00   -227.95Jt  -227.95Jt🔴  -99
22-04-2026 10x    95   1.06   3.00M  672.67Jt -317.45Jt   355.22Jt🟢   33
21-04-2026  4x    91   1.08   4.00M  327.53Jt -267.83Jt    59.71Jt🟢   10
20-04-2026  6x    95   0.00   4.00M  234.90Jt -415.25Jt  -180.35Jt🔴  -22
17-04-2026 15x    96  -8.82   8.00M   96.45Jt   -2.65M     -2.55M 🔴  -88
-------------------------------------------------------------------------➕
           40x    93  -2.20  23.00M    1.33M    -4.09M    -2.76M 🔴  -264`,
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
    setSymbol("ESIP");
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
        <ResultModal
          merged={merged}
          symbol={symbol}
          filledCount={filledCount}
          onClose={handleCloseResult}
        />
      )}
    </div>
  );
}

function ResultModal({
  merged,
  symbol,
  filledCount,
  onClose,
}: {
  merged: MergedTable;
  symbol: string;
  filledCount: number;
  onClose: () => void;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    const outer = outerRef.current;
    if (!inner || !outer) return;

    let raf1 = 0;
    let raf2 = 0;

    const recalc = () => {
      // Reset transform supaya pengukuran benar di ukuran alami.
      inner.style.transform = "none";
      // Force reflow agar offsetHeight memperhitungkan perubahan transform.
      void inner.offsetHeight;
      const naturalH = inner.scrollHeight;
      const naturalW = inner.scrollWidth;
      const availH = outer.clientHeight;
      const availW = outer.clientWidth;
      if (naturalH === 0 || naturalW === 0 || availH === 0 || availW === 0)
        return;
      // Beri sedikit margin keamanan (0.5%) supaya tidak ada 1-2 px sisa.
      const s = Math.min(1, (availW / naturalW) * 0.995, (availH / naturalH) * 0.995);
      setScale(s);
    };

    // Dua RAF supaya layout sudah benar-benar settle (font, gambar, dll).
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(recalc);
    });

    const ro = new ResizeObserver(() => {
      recalc();
    });
    ro.observe(outer);
    ro.observe(inner);
    window.addEventListener("resize", recalc);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      ro.disconnect();
      window.removeEventListener("resize", recalc);
    };
  }, [merged, symbol]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6"
    >
      <div
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-md animate-in fade-in"
      />

      <div className="relative w-full h-full max-w-[1500px] max-h-[96vh] min-h-0 min-w-0 flex flex-col rounded-2xl border border-border bg-card shadow-2xl shadow-emerald-500/10 overflow-hidden animate-in zoom-in-95 fade-in duration-200">
        <div className="shrink-0 flex items-center justify-between gap-4 px-5 md:px-6 py-3 border-b border-border bg-card/95 backdrop-blur z-10">
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-bold text-emerald-400 truncate">
              Hasil Gabungan {symbol ? `— ${symbol}` : ""}
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Data lengkap hasil penggabungan dari {filledCount} sumber
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-md border border-border bg-background/40 text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
            title="Tutup (Esc)"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          ref={outerRef}
          className="flex-1 min-h-0 min-w-0 overflow-hidden px-4 md:px-5 py-3"
        >
          <div
            ref={innerRef}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              width: "100%",
              willChange: "transform",
            }}
            className="space-y-3"
          >
            <SummaryCard merged={merged} />
            <ResultTable merged={merged} symbol={symbol} />
          </div>
        </div>
      </div>
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
