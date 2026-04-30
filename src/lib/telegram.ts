// Modul untuk mengirim hasil analisa ke Telegram.
// Konfigurasi (bot token + chat id) disimpan di localStorage.
//
// Format pesan dirancang untuk dibaca di mobile Telegram dengan
// tampilan rapi (HTML parse_mode + monospace untuk tabel).

import type { MergedTable } from "./merger";
import type {
  BrokerAnalysis,
  ConsistencyAnalysis,
  ConsistencyEntry,
} from "./parser-broker";
import { computeRecommendation, type Tone as RecTone } from "./recommendation";

const STORAGE_KEY = "ams.telegram.config.v1";
const ASK_BEFORE_SEND_KEY = "ams.telegram.askBeforeSend";

export type TelegramConfig = {
  botToken: string;
  chatId: string;
};

export function loadTelegramConfig(): TelegramConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TelegramConfig;
    if (!parsed.botToken || !parsed.chatId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveTelegramConfig(cfg: TelegramConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function clearTelegramConfig(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export function loadAskBeforeSend(): boolean {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(ASK_BEFORE_SEND_KEY);
  if (raw === null) return true;
  return raw === "1";
}

export function saveAskBeforeSend(value: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ASK_BEFORE_SEND_KEY, value ? "1" : "0");
}

// =====================================================================
// Pengiriman
// =====================================================================

const TELEGRAM_MAX_LEN = 4000; // batas aman (limit asli 4096)

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendOne(
  cfg: TelegramConfig,
  text: string,
): Promise<void> {
  const url = `https://api.telegram.org/bot${encodeURIComponent(cfg.botToken)}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: cfg.chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || (body && body.ok === false)) {
    const msg =
      (body && (body.description || body.error_code)) ||
      `HTTP ${res.status}`;
    throw new Error(`Telegram: ${msg}`);
  }
}

// Bagi pesan panjang ke beberapa chunk biar tidak tertolak Telegram.
function chunkText(text: string, max = TELEGRAM_MAX_LEN): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let buf = "";
  for (const line of text.split("\n")) {
    if ((buf + line + "\n").length > max) {
      if (buf) out.push(buf.trimEnd());
      buf = "";
      // baris itu sendiri terlalu panjang? potong paksa
      if (line.length > max) {
        for (let i = 0; i < line.length; i += max) {
          out.push(line.slice(i, i + max));
        }
        continue;
      }
    }
    buf += line + "\n";
  }
  if (buf.trim()) out.push(buf.trimEnd());
  return out;
}

export async function sendTelegramMessage(
  cfg: TelegramConfig,
  text: string,
): Promise<void> {
  const parts = chunkText(text);
  for (const p of parts) {
    await sendOne(cfg, p);
  }
}

// Test koneksi: panggil getMe.
export async function testTelegramConfig(
  cfg: TelegramConfig,
): Promise<{ username: string }> {
  const url = `https://api.telegram.org/bot${encodeURIComponent(cfg.botToken)}/getMe`;
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new Error(body?.description || `HTTP ${res.status}`);
  }
  // Validasi chat_id sekaligus dgn sendMessage uji.
  await sendOne(cfg, "✅ <b>Auto Merge Saham</b>\nKoneksi Telegram berhasil terhubung.");
  return { username: body.result?.username ?? "bot" };
}

// =====================================================================
// Formatter pesan
// =====================================================================

function fmtIDR(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}M`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}Jt`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}rb`;
  return `${sign}${abs.toFixed(0)}`;
}

// Versi pendek (tanpa desimal) untuk daftar broker biar tidak makan banyak baris.
function fmtIDRShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}M`;
  if (abs >= 1e6) return `${sign}${Math.round(abs / 1e6)}Jt`;
  if (abs >= 1e3) return `${sign}${Math.round(abs / 1e3)}rb`;
  return `${sign}${abs.toFixed(0)}`;
}

// Singkat nama broker biar baris tidak terlalu panjang.
function shortName(name: string, max = 22): string {
  const n = (name || "").replace(/\s+/g, " ").trim();
  if (n.length <= max) return n;
  return n.slice(0, max - 1).trimEnd() + "…";
}

function pad(s: string, len: number, align: "l" | "r" = "l"): string {
  const str = String(s ?? "");
  if (str.length >= len) return str.slice(0, len);
  const space = " ".repeat(len - str.length);
  return align === "r" ? space + str : str + space;
}

// Render tabel hasil gabungan jadi monospace text yang muat di Telegram (versi ringkas).
function formatMergedTable(merged: MergedTable, symbol: string): string {
  const lines: string[] = [];
  const sym = symbol.trim() || "—";

  // Kolom inti sesuai permintaan user — tampilkan lengkap.
  const PRIORITY = ["Tanggal", "Price", "NBSA", "MF +/-", "Ket MF", "Ket NBSA"];
  const headers = PRIORITY.filter((h) => merged.headers.includes(h));
  const usedHeaders =
    headers.length > 0 ? headers : merged.headers.slice(0, 6);

  // Pisahkan baris total dari baris harian
  const dataRows = merged.rows.filter((r) => !r.__isTotal);
  const totalRow = merged.rows.find((r) => r.__isTotal);

  // Tampilkan SEMUA baris (tidak dipotong) sesuai permintaan user.
  const shown = dataRows;

  // Singkat tanggal jadi DD-MM (drop tahun) untuk hemat lebar.
  const shortDate = (s: string) => {
    const m = String(s ?? "").match(/^(\d{2})-(\d{2})-\d{4}$/);
    return m ? `${m[1]}-${m[2]}` : String(s ?? "");
  };

  // Bersihkan emoji & singkat keterangan supaya tabel ringkas.
  const KET_SHORT: Record<string, string> = {
    "Massive Dist": "Mass.Dist",
    "Big Dist": "Big Dist",
    "Big Dist‼️": "Big Dist",
    "Normal Dist": "Norm.Dist",
    "Small Dist": "Sm.Dist",
    "Massive Accum": "Mass.Acc",
    "Big Accum": "Big Acc",
    "Normal Accum": "Norm.Acc",
    "Small Accum": "Sm.Acc",
    Netral: "Netral",
  };
  const cleanCell = (h: string, raw: string) => {
    let v = String(raw ?? "")
      .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{203C}]/gu, "")
      .trim();
    if (h === "Tanggal") v = shortDate(v);
    if (h === "Ket MF" || h === "Ket NBSA") v = KET_SHORT[v] ?? v;
    return v || "—";
  };

  // Hitung lebar kolom
  const widths: Record<string, number> = {};
  for (const h of usedHeaders) {
    let w = h.length;
    for (const r of [...shown, ...(totalRow ? [totalRow] : [])]) {
      const v = cleanCell(h, String(r[h] ?? ""));
      if (v.length > w) w = v.length;
    }
    widths[h] = Math.min(w, 11);
  }

  const headerLine = usedHeaders.map((h) => pad(h, widths[h])).join(" │ ");
  const sepLine = usedHeaders.map((h) => "─".repeat(widths[h])).join("─┼─");

  // Garis pembatas top/bottom selebar tabel (untuk membungkus judul di dalam kotak).
  const tableWidth = headerLine.length;
  const fullSep = "─".repeat(tableWidth);

  lines.push("<pre>");
  // Judul section di dalam kotak (sebelumnya di luar).
  lines.push(escapeHtml(`📊 HASIL GABUNGAN — ${sym}`));
  lines.push(
    escapeHtml(`${merged.sourceCount} sumber • ${merged.matchedDates} tgl cocok`),
  );
  lines.push(escapeHtml(fullSep));
  lines.push(escapeHtml(headerLine));
  lines.push(escapeHtml(sepLine));
  for (const row of shown) {
    const cells = usedHeaders
      .map((h) => pad(cleanCell(h, String(row[h] ?? "")), widths[h]))
      .join(" │ ");
    lines.push(escapeHtml(cells));
  }
  if (totalRow) {
    // Garis pemisah sebelum baris TOTAL (mirip tampilan di app)
    lines.push(escapeHtml(sepLine));
    const cells = usedHeaders
      .map((h) => pad(cleanCell(h, String(totalRow[h] ?? "")), widths[h]))
      .join(" │ ");
    lines.push(escapeHtml(`Σ ${cells}`));
  }
  lines.push("</pre>");
  return lines.join("\n");
}

// Emoji nada untuk konsistensi dgn UI (green/red/amber/neutral).
function toneEmoji(t: RecTone): string {
  return t === "green" ? "🟢" : t === "red" ? "🔴" : t === "amber" ? "🟡" : "⚪";
}

// Bungkus teks panjang ke beberapa baris dengan lebar maksimum tertentu,
// dengan indent kontinuasi supaya rapi di dalam <pre>.
function wrapText(text: string, width: number, indent = ""): string[] {
  const words = String(text ?? "").replace(/\s+/g, " ").trim().split(" ");
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if (!line) {
      line = w;
      continue;
    }
    if ((line + " " + w).length > width) {
      out.push(line);
      line = indent + w;
    } else {
      line += " " + w;
    }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}

// Ringkasan & Analisa Bandar — mirror konten kartu di UI (RecommendationBanner
// + KONFIRMASI BROKER). Output dibungkus <pre> agar tampil sebagai kotak
// monospace yang bisa di-copy di Telegram (mirip tampilan HASIL GABUNGAN).
// Header utama (AUTO MERGE SAHAM + symbol + tanggal) ikut masuk ke dalam
// kotak ini sebagai baris paling atas.
function formatBrokerSummary(
  merged: MergedTable | null,
  brokerAnalysis: BrokerAnalysis | null,
  symbol: string,
  headerInfo: { title: string; subtitle: string },
): string {
  const lines: string[] = [];
  const sym = symbol.trim() || "—";

  // Lebar konten di dalam kotak <pre>. Cukup nyaman dibaca di mobile Telegram.
  const WIDTH = 46;
  const sep = "─".repeat(WIDTH);
  const labelPad = 11; // lebar kolom label "Periode    :"

  // Susun baris label : value dengan word-wrap untuk value panjang.
  const labelLine = (label: string, value: string): string[] => {
    const head = pad(label, labelPad) + ": ";
    const indent = " ".repeat(head.length);
    const wrapped = wrapText(value, WIDTH - head.length, "");
    const out: string[] = [];
    out.push(head + wrapped[0]);
    for (let i = 1; i < wrapped.length; i++) out.push(indent + wrapped[i]);
    return out;
  };

  const box: string[] = [];

  // Header utama: AUTO MERGE SAHAM + symbol/tanggal — sebelumnya di luar kotak.
  box.push(headerInfo.title);
  box.push(headerInfo.subtitle);
  box.push(sep);

  // Judul section — sebelumnya di luar kotak, sekarang ikut masuk.
  box.push(`🏦 RINGKASAN & ANALISA BANDAR — ${sym}`);
  box.push(sep);

  const result = merged ? computeRecommendation(merged, brokerAnalysis) : null;

  if (!result) {
    box.push("Data analisa belum tersedia.");
  } else {
    const {
      recommendation,
      score,
      reasonsTopFour,
      periodLabel,
      days,
      brokerInsight,
    } = result;
    const scoreSign = score > 0 ? "+" : "";

    // Bagian periode
    box.push(...labelLine("Periode", periodLabel));
    box.push(...labelLine("Hari", `${days.length} hari terakhir`));
    box.push(sep);

    // Bagian rekomendasi
    box.push(
      ...labelLine(
        "Rekomendasi",
        `${toneEmoji(recommendation.tone)} ${recommendation.label}  (skor ${scoreSign}${score.toFixed(1)})`,
      ),
    );
    box.push(...labelLine("Headline", `🎯 ${recommendation.headline}`));
    box.push(...labelLine("Detail", recommendation.detail));

    // Bagian alasan (chips → list di dalam kotak)
    if (reasonsTopFour.length > 0) {
      box.push(sep);
      box.push("Alasan:");
      for (const r of reasonsTopFour) {
        const wrapped = wrapText(
          `${toneEmoji(r.tone)} ${r.text}`,
          WIDTH - 2,
          "   ",
        );
        box.push(" • " + wrapped[0]);
        for (let i = 1; i < wrapped.length; i++) box.push("   " + wrapped[i]);
      }
    }

    // Bagian konfirmasi broker
    if (brokerInsight) {
      box.push(sep);
      box.push(`🏢 KONFIRMASI BROKER · ${brokerInsight.date || "—"}`);
      box.push("");
      const verdict =
        `${brokerInsight.verdictPrefix} ${brokerInsight.insight}`.trim();
      const wrapped = wrapText(verdict, WIDTH);
      for (const w of wrapped) box.push(w);
    }
  }

  // Bungkus dalam <pre> agar muncul sebagai kotak copyable di Telegram.
  lines.push("<pre>");
  for (const b of box) lines.push(escapeHtml(b));
  lines.push("</pre>");

  return lines.join("\n").trimEnd();
}

// Analisa bandar — Controller, Konfirmasi, Distributor.
// Mapping ke struktur ConsistencyAnalysis:
//  - Controller   = topAccumulators (akumulator paling konsisten / driver beli)
//  - Konfirmasi   = newOrFlipAkum   (broker baru masuk akumulasi, konfirmator)
//  - Distributor  = konsistenDist + flipWarning (driver / risiko sell)
// Output dibungkus <pre> dengan judul di dalam kotak (mirip section lain).
function formatBrokerConsistency(
  c: ConsistencyAnalysis | null,
  symbol: string,
): string {
  const sym = symbol.trim() || "—";
  const WIDTH = 46;
  const sep = "─".repeat(WIDTH);

  const box: string[] = [];
  // Judul di dalam kotak.
  box.push(`🎯 ANALISA BANDAR — ${sym}`);
  box.push(`Controller • Konfirmasi • Distributor`);
  box.push(sep);

  if (!c) {
    const wrapped = wrapText(
      "Butuh dua periode broker (sekarang & sebelumnya) untuk analisa ini.",
      WIDTH,
    );
    for (const w of wrapped) box.push(w);
  } else {
    const renderBucket = (
      title: string,
      icon: string,
      entries: ConsistencyEntry[],
      limit = 3,
    ) => {
      box.push(`${icon} ${title}`);
      if (entries.length === 0) {
        box.push("   — tidak ada");
        return;
      }
      // Dedup berdasarkan code (broker yang sama bisa muncul di beberapa bucket sumber).
      const seen = new Set<string>();
      const unique = entries.filter((e) => {
        if (seen.has(e.code)) return false;
        seen.add(e.code);
        return true;
      });
      unique.slice(0, limit).forEach((e, i) => {
        const w = e.weeklyValue ? fmtIDRShort(e.weeklyValue) : "—";
        const d = e.dailyValue ? fmtIDRShort(e.dailyValue) : "—";
        // Nama broker tampil LENGKAP (tidak dipotong).
        const nameLine = `${i + 1}. ${e.code} ${e.info.name}`;
        const wrappedName = wrapText(nameLine, WIDTH, "   ");
        for (const w2 of wrappedName) box.push(w2);
        box.push(`   Mingguan: ${w} | Hari ini: ${d}`);
      });
    };

    renderBucket("CONTROLLER (Akumulator)", "🟢", c.topAccumulators, 3);
    box.push(sep);
    renderBucket("KONFIRMASI (Baru Akumulasi)", "🔵", c.newOrFlipAkum, 2);
    box.push(sep);

    // Distributor: prioritaskan flip warning dulu (lebih bahaya), lalu konsisten.
    const distributors: ConsistencyEntry[] = [
      ...c.flipWarning,
      ...c.konsistenDist,
      ...c.newOrFreshDist,
    ];
    renderBucket("DISTRIBUTOR (Penekan Jual)", "🔴", distributors, 2);
    box.push(sep);

    // Pendekkan kesimpulan ke ~220 char
    const concl =
      c.conclusion.length > 220
        ? c.conclusion.slice(0, 217).trimEnd() + "…"
        : c.conclusion;
    box.push("📝 Kesimpulan:");
    const wrapped = wrapText(concl, WIDTH);
    for (const w of wrapped) box.push(w);
  }

  // Bungkus dalam <pre> agar muncul sebagai kotak copyable.
  const lines: string[] = [];
  lines.push("<pre>");
  for (const b of box) lines.push(escapeHtml(b));
  lines.push("</pre>");
  return lines.join("\n").trimEnd();
}

// Susun keseluruhan pesan: ringkasan (sudah memuat header) + tabel + analisa.
// Section dipisah dengan baris kosong saja (tanpa garis ——— pemisah lagi).
export function buildAnalysisMessage(args: {
  symbol: string;
  merged: MergedTable | null;
  brokerAnalysis: BrokerAnalysis | null;
  brokerConsistency: ConsistencyAnalysis | null;
}): string {
  const sym = args.symbol.trim() || "—";
  const now = new Date().toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Header info (dulu di luar kotak) sekarang dipasang di dalam kotak RINGKASAN.
  const headerInfo = {
    title: `📈 AUTO MERGE SAHAM`,
    subtitle: `${sym} • ${now}`,
  };

  const sections: string[] = [];

  // 1. Ringkasan & Analisa Bandar (memuat header utama di dalam kotaknya).
  sections.push(
    formatBrokerSummary(args.merged, args.brokerAnalysis, sym, headerInfo),
  );

  // 2. Hasil Gabungan Data
  if (args.merged) {
    sections.push(formatMergedTable(args.merged, sym));
  }

  // 3. Analisa Bandar — Controller, Konfirmasi, Distributor
  sections.push(formatBrokerConsistency(args.brokerConsistency, sym));

  // Pisahkan section dengan baris kosong saja, tanpa garis ——— pemisah.
  return sections.join("\n\n");
}
