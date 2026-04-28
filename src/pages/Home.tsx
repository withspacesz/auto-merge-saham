import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Calendar, Check, Copy, Hash, X } from "lucide-react";
import { ResultTable } from "@/components/ResultTable";
import { SummaryCard } from "@/components/SummaryCard";
import { TopBrokerCard } from "@/components/TopBrokerCard";
import { BrokerCompareCard } from "@/components/BrokerCompareCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { mergeInputs, type MergedTable } from "@/lib/merger";
import {
  parseBrokerActivity,
  analyzeBrokerActivity,
  compareBrokerActivity,
  analyzeBrokerConsistency,
  type BrokerAnalysis,
  type BrokerComparison,
  type ConsistencyAnalysis,
} from "@/lib/parser-broker";
import { BrokerConsistencyCard } from "@/components/BrokerConsistencyCard";

type SourceKey = "data" | "nbsa" | "mf" | "rcm" | "broker" | "brokerPrev";

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
  {
    key: "broker",
    label: "Broker (Sekarang)",
    tag: "BROKER NOW",
    cmdBase: "/broksum",
    hint: "Paste data Broker Summary periode SEKARANG (mis. 24-04 s.d 27-04 — kumulatif beberapa hari)",
  },
  {
    key: "brokerPrev",
    label: "Broker (Sebelumnya)",
    tag: "BROKER PREV",
    cmdBase: "/broksum",
    hint: "Opsional. Paste snapshot broker SEBELUMNYA (mis. 24-04 s.d 24-04 single day) untuk lihat siapa yang baru akumulasi / berbalik posisi",
  },
];

const SAMPLE: Record<SourceKey, string> = {
  data: `/DATA 🗓28-04-2026 || ⏰09:00:00 Wib.
Halo Kak Bang Tra🥰,
Berikut adalah Data saham ELSA (6 candle) :
--------------------------------------------------
🗓 Date  |Price| Gain|Freq | MF +/- | Value| NBSA|
--------------------------------------------------
27-04-2026   780  0.00   8Rb     -8M 🔴  35M   +4M
24-04-2026   780 -3.11  21Rb    -35M 🔴 111M  -19M
23-04-2026   805 10.27  27Rb    +30M 🟢 175M  +12M
22-04-2026   730  1.39   5Rb     -1M 🔴  21M   +7M
21-04-2026   720 -0.69   4Rb     -6M 🔴  14M   -1M
20-04-2026   725  0.00   8Rb     -4M 🔴  34M   -7M
--------------------------------------------------➕
TOTAL✍️ :              93Rb    -16M 🔴 514M   -5M`,
  nbsa: `/ACCUMNBSA 🗓28-04-2026 || ⏰09:00:00 Wib.
Halo Kak Bang Tra🥰,
Berikut adalah Data Acc/Dist NBSA
saham ELSA (6 candle) :
----------------------------------------
🗓 Date  |Price| Value |NBSA| ket...   |
----------------------------------------
27-04-2026   780  35M   +4M   Small Accum
24-04-2026   780 111M  -19M   Normal Dist
23-04-2026   805 175M  +12M   Small Accum
22-04-2026   730  21M   +7M   Big Accum🔥
21-04-2026   720  14M   -1M   Small Dist
20-04-2026   725  34M   -7M   Normal Dist
-----------------------------------------➕
TOTAL✍️ :       514M   -5M   Netral`,
  mf: `/ACUUMMF 🗓28-04-2026 || ⏰09:00:00 Wib.
Halo Kak Bang Tra🥰,
Berikut adalah Data
Acc/Dist Money Flow saham ELSA (6 candle) :
------------------------------------------
🗓 Date  |Price| Value |MF+/-| ket..     |
------------------------------------------
27-04-2026   780  35M   -8M   Big Dist‼️
24-04-2026   780 111M  -35M   Big Dist‼️
23-04-2026   805 175M  +30M   Normal Accum
22-04-2026   730  21M   -1M   Netral
21-04-2026   720  14M   -6M   Massive Dist
20-04-2026   725  34M   -4M   Small Dist
-----------------------------------------➕
TOTAL✍️ :       514M  -16M   Netral`,
  rcm: `/RCM 🗓28-04-2026 || ⏰09:00:00 Wib.
Halo Kak Bang Tra🥰,
Berikut adalah Rekap Clean Money Saham ELSA (6 Hari)
dari tanggal 20-4-2026 s/d 27-4-2026
-------------------------------------------------------------------------
   Date   | Tx|Avp P| Gain%| Value |Smart M.|  Bad M. | Clean M.|🚦| RCV
-------------------------------------------------------------------------
27-04-2026 13x   767   0.00   35.00M   4.64M    -4.29M   355.23Jt🟢    3
24-04-2026 12x   776  -3.11  111.00M   2.84M   -12.45M    -9.61M🔴  -56
23-04-2026 39x   777  10.27  175.00M  40.59M   -13.82M    26.77M🟢   33
22-04-2026  6x   737   1.39   21.00M   4.62M    -1.38M     3.24M🟢   50
21-04-2026 15x   717  -0.69   14.00M 873.41Jt   -3.94M    -3.07M🔴  -59
20-04-2026  8x   731   0.00   34.00M 655.25Jt   -6.60M    -5.95M🔴  -79
-------------------------------------------------------------------------➕
          116x   782   5.77  514.00M  80.99M   -54.68M    26.31M🟢   15`,
  broker: `/BROKSUM 🗓28-04-2026 || ⏰13:06:52 Wib. ®️@chart_saham_bot
Halo Kak Bang Tra🥰, Berikut adalah Data
          Broker Summary ELSA  Regular Board (RG)
            Tanggal 2026-04-27 s.d 2026-04-27
-----------------------------------------------------------------------
   🟩🟩🟩🟩 NET BUY 🟩🟩🟩🟩      🟥🟥🟥🟥 NET SELL 🟥🟥🟥🟥
 No|KODE|B.Val| B.Lot| B.Fq| B.Avg| No|KODE| S.Val| S.Lot| S.fq| S.Avg|
-----------------------------------------------------------------------
 1. AI   5.8M   74.9rb 541     771   1. AK  -1.7M  -21.3rb 876     769
 2. HP 732.5Jt   9.6rb 113     765   2. XL  -1.5M  -19.8rb   3rb   763
 3. PD 720.9Jt   9.5rb 413     760   3. XC  -1.4M  -17.8rb 709     762
 4. DH 488.2Jt   6.5rb  75     757   4. NI  -1.2M  -15.2rb 215     771
 5. KK 421.9Jt   5.4rb 186     771   5. ZP -966.7Jt -12.6rb  75     767
 6. OD 335.1Jt   4.4rb 338     764   6. SQ -906.0Jt -11.6rb 239     773
 7. LG 246.1Jt   3.2rb  78     764   7. GR -589.4Jt  -7.7rb 166     762
 8. CP 244.0Jt   3.2rb 151     763   8. CC -487.6Jt  -6.2rb 486     767
 9. MG 131.4Jt   1.7rb  20     758   9. BK -417.7Jt  -5.4rb  39     773
10. DX  88.3Jt   1.2rb  14     755  10. YB -396.5Jt  -5.1rb  90     769`,
  brokerPrev: `/BROKSUM 🗓28-04-2026 || ⏰14:22:01 Wib. ®️@chart_saham_bot
Halo Kak Bang Tra🥰, Berikut adalah Data
          Broker Summary ELSA  Regular Board (RG)
            Tanggal 2026-04-20 s.d 2026-04-27
-----------------------------------------------------------------------
   🟩🟩🟩🟩 NET BUY 🟩🟩🟩🟩      🟥🟥🟥🟥 NET SELL 🟥🟥🟥🟥
 No|KODE|B.Val| B.Lot| B.Fq| B.Avg| No|KODE| S.Val| S.Lot| S.fq| S.Avg|
-----------------------------------------------------------------------
 1. LG  13.2M  168.5rb   1rb   782   1. GR -18.6M  -235.4rb   2rb   782
 2. CC   9.6M  122.1rb   9rb   774   2. XL  -5.7M  -76.5rb  24rb   769
 3. PD   7.5M   93.2rb   4rb   776   3. YP  -5.1M  -66.8rb   6rb   769
 4. XC   6.2M   78.4rb   5rb   777   4. NI  -4.2M  -54.7rb   2rb   766
 5. AI   4.9M   64.1rb 607     771   5. SQ  -4.1M  -52.2rb   1rb   771
 6. RX   3.2M   45.0rb 334     718   6. AK  -3.5M  -37.7rb   7rb   774
 7. DR   2.9M   37.3rb   1rb   778   7. KK  -3.0M  -38.4rb   1rb   775
 8. YU   1.8M   21.1rb 538     784   8. YB  -1.5M  -19.2rb 851     773
 9. DH 894.3Jt  11.8rb 300     765   9. ZP  -1.4M  -18.4rb   1rb   770
10. BK 854.9Jt  10.7rb 438     773  10. TP  -1.2M  -16.7rb 496     752`,
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
    broker: "",
    brokerPrev: "",
  });
  const [submitted, setSubmitted] = useState<Record<SourceKey, string> | null>(null);
  const [showResult, setShowResult] = useState(false);

  // Defensif: kalau state lama (sebelum brokerPrev ditambahkan) di-rehydrate
  // oleh HMR, beberapa key bisa undefined. Pastikan selalu string.
  const safeData: Record<SourceKey, string> = {
    data: data.data ?? "",
    nbsa: data.nbsa ?? "",
    mf: data.mf ?? "",
    rcm: data.rcm ?? "",
    broker: data.broker ?? "",
    brokerPrev: data.brokerPrev ?? "",
  };
  const filledCount = (Object.values(safeData) as string[]).filter(
    (v) => v.trim().length > 0,
  ).length;

  const handleMerge = () => {
    setSubmitted({ ...data });
    setShowResult(true);
  };

  const handleReset = () => {
    setData({ data: "", nbsa: "", mf: "", rcm: "", broker: "", brokerPrev: "" });
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
    // Broker activity punya format khusus (2 kolom NET BUY/NET SELL),
    // tidak ikut di-merge ke tabel utama — diparse terpisah utk BrokerCard.
    const inputs = SOURCES.filter((s) => s.key !== "broker").map((s) => ({
      key: s.key,
      text: submitted[s.key] ?? "",
    }));
    return mergeInputs(inputs);
  }, [submitted]);

  const brokerAnalysis = useMemo<BrokerAnalysis | null>(() => {
    if (!submitted) return null;
    const parsed = parseBrokerActivity(submitted.broker ?? "");
    return parsed ? analyzeBrokerActivity(parsed) : null;
  }, [submitted]);

  const brokerComparison = useMemo<BrokerComparison | null>(() => {
    if (!submitted) return null;
    const curr = parseBrokerActivity(submitted.broker ?? "");
    const prev = parseBrokerActivity(submitted.brokerPrev ?? "");
    if (!curr || !prev) return null;
    return compareBrokerActivity(prev, curr);
  }, [submitted]);

  const brokerConsistency = useMemo<ConsistencyAnalysis | null>(() => {
    if (!submitted) return null;
    const a = parseBrokerActivity(submitted.broker ?? "");
    const b = parseBrokerActivity(submitted.brokerPrev ?? "");
    if (!a || !b) return null;
    return analyzeBrokerConsistency(a, b);
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
                filled={safeData[s.key].trim().length > 0}
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
              const filled = safeData[s.key].trim().length > 0;
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
            value={safeData[active]}
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

      {showResult && (merged || brokerAnalysis || brokerComparison) && submitted && (
        <ResultModal
          merged={merged}
          symbol={symbol}
          filledCount={filledCount}
          brokerAnalysis={brokerAnalysis}
          brokerComparison={brokerComparison}
          brokerConsistency={brokerConsistency}
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
  brokerAnalysis,
  brokerComparison,
  brokerConsistency,
  onClose,
}: {
  merged: MergedTable | null;
  symbol: string;
  filledCount: number;
  brokerAnalysis: BrokerAnalysis | null;
  brokerComparison: BrokerComparison | null;
  brokerConsistency: ConsistencyAnalysis | null;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"rekomendasi" | "top-broker" | "bandingkan">(
    brokerComparison ? "bandingkan" : "rekomendasi",
  );

  // Kalau tab yang dipilih tidak tersedia, jatuhkan ke rekomendasi.
  useEffect(() => {
    if (!brokerAnalysis && tab === "top-broker") setTab("rekomendasi");
    if (!brokerComparison && tab === "bandingkan") setTab("rekomendasi");
  }, [brokerAnalysis, brokerComparison, tab]);

  // Auto-fit imperatif: terus pantau ukuran konten dan skalakan supaya
  // muat tinggi modal tanpa scroll, sambil mempertahankan lebar visual
  // 100% (sama dengan header).
  const outerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    let raf = 0;

    const fit = () => {
      // Reset dulu ke lebar natural penuh tanpa transform supaya
      // pengukuran tinggi konten akurat.
      inner.style.transform = "none";
      inner.style.transformOrigin = "top left";
      inner.style.width = "100%";
      // Paksa reflow.
      void inner.offsetHeight;

      const cs = getComputedStyle(outer);
      const padT = parseFloat(cs.paddingTop) || 0;
      const padB = parseFloat(cs.paddingBottom) || 0;
      const availH = outer.clientHeight - padT - padB;
      const naturalH = inner.scrollHeight;

      if (naturalH <= 0 || availH <= 0) return;

      let next = 1;
      if (naturalH > availH) {
        // Margin 6% supaya aman dari pembulatan piksel & late render.
        next = Math.max(0.3, (availH / naturalH) * 0.94);
      }

      // Terapkan langsung ke DOM. Lebar dilebarin 1/scale supaya
      // setelah dikecilkan, lebar visualnya tetap = lebar outer (penuh).
      inner.style.transform = `scale(${next})`;
      inner.style.transformOrigin = "top left";
      inner.style.width = next < 1 ? `${100 / next}%` : "100%";
      inner.style.willChange = "transform";

      // Verifikasi pasca-apply: kalau setelah scaling tinggi visual
      // ternyata masih lewat (mis. konten reflow jadi lebih tinggi
      // di lebar baru), kecilkan lagi.
      void inner.offsetHeight;
      const visualH = inner.scrollHeight * next;
      if (visualH > availH) {
        const adjust = Math.max(0.3, (availH / inner.scrollHeight) * 0.94);
        inner.style.transform = `scale(${adjust})`;
        inner.style.width = adjust < 1 ? `${100 / adjust}%` : "100%";
      }
    };

    const schedule = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(fit);
      });
    };

    schedule();
    const t1 = window.setTimeout(schedule, 150);
    const t2 = window.setTimeout(schedule, 500);
    const t3 = window.setTimeout(schedule, 1500);

    const ro = new ResizeObserver(schedule);
    ro.observe(outer);
    ro.observe(inner);

    const mo = new MutationObserver(schedule);
    mo.observe(inner, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    window.addEventListener("resize", schedule);
    if (typeof document !== "undefined" && (document as any).fonts?.ready) {
      (document as any).fonts.ready.then(schedule).catch(() => {});
    }

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [merged, symbol, brokerAnalysis, brokerComparison, tab]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4"
    >
      <div
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-md animate-in fade-in"
      />

      <div className="relative w-full h-full max-w-[1400px] max-h-[94vh] min-h-0 min-w-0 flex flex-col rounded-xl border border-border bg-card shadow-2xl shadow-emerald-500/10 overflow-hidden animate-in zoom-in-95 fade-in duration-200">
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
              transformOrigin: "top left",
              willChange: "transform",
            }}
            className="space-y-3"
          >
            {(merged || brokerAnalysis || brokerComparison) && (
              <div>
                <div className="flex items-center gap-1 mb-2">
                  {brokerComparison && (
                    <TabButton
                      active={tab === "bandingkan"}
                      onClick={() => setTab("bandingkan")}
                    >
                      Bandingkan Broker
                    </TabButton>
                  )}
                  <TabButton
                    active={tab === "rekomendasi"}
                    onClick={() => setTab("rekomendasi")}
                  >
                    Rekomendasi
                  </TabButton>
                  {brokerAnalysis && (
                    <TabButton
                      active={tab === "top-broker"}
                      onClick={() => setTab("top-broker")}
                    >
                      Semua Broker
                    </TabButton>
                  )}
                </div>
                {tab === "bandingkan" && brokerComparison && (
                  <BrokerCompareCard comparison={brokerComparison} />
                )}
                {tab === "rekomendasi" && merged && (
                  <div className="space-y-4">
                    <ErrorBoundary label="Rekomendasi">
                      <SummaryCard merged={merged} brokerAnalysis={brokerAnalysis} />
                    </ErrorBoundary>
                  </div>
                )}
                {tab === "top-broker" && brokerAnalysis && (
                  <div className="space-y-3">
                    {brokerConsistency && (
                      <ErrorBoundary label="Konsistensi Broker">
                        <BrokerConsistencyCard analysis={brokerConsistency} merged={merged} />
                      </ErrorBoundary>
                    )}
                    <ErrorBoundary label="Semua Broker">
                      <TopBrokerCard analysis={brokerAnalysis} />
                    </ErrorBoundary>
                  </div>
                )}
              </div>
            )}
            {merged && tab === "rekomendasi" && (
              <ErrorBoundary label="Tabel Hasil">
                <ResultTable merged={merged} symbol={symbol} />
              </ErrorBoundary>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
        active ? "text-emerald-400" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
      {active && (
        <span className="absolute left-3 right-3 -bottom-px h-0.5 bg-emerald-400 rounded-full" />
      )}
    </button>
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
