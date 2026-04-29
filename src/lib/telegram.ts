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
  lines.push(`<b>📊 HASIL GABUNGAN — ${escapeHtml(sym)}</b>`);
  lines.push(
    `<i>${merged.sourceCount} sumber • ${merged.matchedDates} tgl cocok</i>`,
  );
  lines.push("");

  // Hanya kolom inti — drop yang noise (Value, Ket NBSA biasanya Netral).
  const PRIORITY = ["Tanggal", "Price", "NBSA", "MF +/-", "Ket MF"];
  const headers = PRIORITY.filter((h) => merged.headers.includes(h));
  const usedHeaders =
    headers.length > 0 ? headers : merged.headers.slice(0, 5);

  // Pisahkan baris total dari baris harian
  const dataRows = merged.rows.filter((r) => !r.__isTotal);
  const totalRow = merged.rows.find((r) => r.__isTotal);

  // Batasi maksimal 6 baris terbaru biar tidak overflow di mobile.
  const MAX_ROWS = 6;
  const shown = dataRows.slice(0, MAX_ROWS);
  const omitted = dataRows.length - shown.length;

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
    if (h === "Ket MF") v = KET_SHORT[v] ?? v;
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

  lines.push("<pre>");
  lines.push(escapeHtml(headerLine));
  lines.push(escapeHtml(sepLine));
  for (const row of shown) {
    const cells = usedHeaders
      .map((h) => pad(cleanCell(h, String(row[h] ?? "")), widths[h]))
      .join(" │ ");
    lines.push(escapeHtml(cells));
  }
  if (totalRow) {
    const cells = usedHeaders
      .map((h) => pad(cleanCell(h, String(totalRow[h] ?? "")), widths[h]))
      .join(" │ ");
    lines.push(escapeHtml(`Σ ${cells}`));
  }
  lines.push("</pre>");
  if (omitted > 0) {
    lines.push(`<i>+${omitted} baris lain disembunyikan</i>`);
  }
  return lines.join("\n");
}

// Ringkasan & analisa bandar (versi ringkas untuk Telegram).
function formatBrokerSummary(
  brokerAnalysis: BrokerAnalysis | null,
  symbol: string,
): string {
  const lines: string[] = [];
  const sym = symbol.trim() || "—";
  lines.push(`<b>🏦 RINGKASAN BANDAR — ${escapeHtml(sym)}</b>`);

  if (!brokerAnalysis) {
    lines.push("<i>Data broker belum tersedia.</i>");
    return lines.join("\n");
  }

  const a = brokerAnalysis;
  const toneEmoji =
    a.narrative.tone === "green" ? "🟢"
    : a.narrative.tone === "red" ? "🔴"
    : a.narrative.tone === "amber" ? "🟡"
    : "⚪";

  lines.push(`<i>📅 ${escapeHtml(a.date || "—")}</i>`);
  lines.push("");
  lines.push(`${toneEmoji} <b>${escapeHtml(a.narrative.headline)}</b>`);
  // Pendekkan narasi detail ke ~180 char
  const detail = a.narrative.detail.length > 180
    ? a.narrative.detail.slice(0, 177).trimEnd() + "…"
    : a.narrative.detail;
  lines.push(escapeHtml(detail));
  lines.push("");

  // Aliran dana — 1 baris kompak
  lines.push(
    `💰 B:<code>${escapeHtml(fmtIDRShort(a.totalBuy))}</code> S:<code>${escapeHtml(fmtIDRShort(a.totalSell))}</code> Net:<code>${escapeHtml(fmtIDRShort(a.netBSA))}</code>`,
  );
  // Komposisi — 1 baris
  const compParts = [
    `Asing <code>${escapeHtml(fmtIDRShort(a.netAsing))}</code>`,
    `Lokal <code>${escapeHtml(fmtIDRShort(a.netLokal))}</code>`,
  ];
  if (a.netUnknown !== 0) {
    compParts.push(`Unk <code>${escapeHtml(fmtIDRShort(a.netUnknown))}</code>`);
  }
  lines.push(`🌐 ${compParts.join(" | ")}`);
  lines.push("");

  // Top buyer / seller — gabungkan asing & lokal jadi 2 baris saja
  const buyerParts: string[] = [];
  if (a.topAsingBuyer) {
    buyerParts.push(`A:<b>${escapeHtml(a.topAsingBuyer.code)}</b> ${escapeHtml(fmtIDRShort(a.topAsingBuyer.value))}`);
  }
  if (a.topLokalBuyer) {
    buyerParts.push(`L:<b>${escapeHtml(a.topLokalBuyer.code)}</b> ${escapeHtml(fmtIDRShort(a.topLokalBuyer.value))}`);
  }
  if (buyerParts.length) lines.push(`🟢 Top Buy  | ${buyerParts.join(" • ")}`);

  const sellerParts: string[] = [];
  if (a.topAsingSeller) {
    sellerParts.push(`A:<b>${escapeHtml(a.topAsingSeller.code)}</b> ${escapeHtml(fmtIDRShort(a.topAsingSeller.value))}`);
  }
  if (a.topLokalSeller) {
    sellerParts.push(`L:<b>${escapeHtml(a.topLokalSeller.code)}</b> ${escapeHtml(fmtIDRShort(a.topLokalSeller.value))}`);
  }
  if (sellerParts.length) lines.push(`🔴 Top Sell | ${sellerParts.join(" • ")}`);

  return lines.join("\n").trimEnd();
}

// Analisa bandar — Controller, Konfirmasi, Distributor.
// Mapping ke struktur ConsistencyAnalysis:
//  - Controller   = topAccumulators (akumulator paling konsisten / driver beli)
//  - Konfirmasi   = newOrFlipAkum   (broker baru masuk akumulasi, konfirmator)
//  - Distributor  = konsistenDist + flipWarning (driver / risiko sell)
function formatBrokerConsistency(
  c: ConsistencyAnalysis | null,
  symbol: string,
): string {
  const lines: string[] = [];
  const sym = symbol.trim() || "—";
  lines.push(`<b>🎯 ANALISA BANDAR — ${escapeHtml(sym)}</b>`);
  lines.push(`<i>Controller • Konfirmasi • Distributor</i>`);

  if (!c) {
    lines.push("");
    lines.push("<i>Butuh dua periode broker (sekarang &amp; sebelumnya) untuk analisa ini.</i>");
    return lines.join("\n");
  }

  const renderBucket = (
    title: string,
    icon: string,
    entries: ConsistencyEntry[],
    limit = 3,
  ) => {
    lines.push("");
    lines.push(`${icon} <b>${escapeHtml(title)}</b>`);
    if (entries.length === 0) {
      lines.push("<i>— tidak ada</i>");
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
      // 1 baris per broker: "1. CODE Nama • W:+xJt D:+yJt"
      lines.push(
        `${i + 1}. <b>${escapeHtml(e.code)}</b> ${escapeHtml(shortName(e.info.name))} • <code>W:${escapeHtml(w)} D:${escapeHtml(d)}</code>`,
      );
    });
  };

  renderBucket("CONTROLLER (Akumulator)", "🟢", c.topAccumulators);
  renderBucket("KONFIRMASI (Baru Akumulasi)", "🔵", c.newOrFlipAkum);

  // Distributor: prioritaskan flip warning dulu (lebih bahaya), lalu konsisten.
  const distributors: ConsistencyEntry[] = [
    ...c.flipWarning,
    ...c.konsistenDist,
    ...c.newOrFreshDist,
  ];
  renderBucket("DISTRIBUTOR (Penekan Jual)", "🔴", distributors);

  lines.push("");
  // Pendekkan kesimpulan ke ~220 char
  const concl = c.conclusion.length > 220
    ? c.conclusion.slice(0, 217).trimEnd() + "…"
    : c.conclusion;
  lines.push(`<b>📝 Kesimpulan:</b> <i>${escapeHtml(concl)}</i>`);

  return lines.join("\n").trimEnd();
}

// Susun keseluruhan pesan: header + ringkasan + tabel + analisa bandar.
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

  const sections: string[] = [];

  // Header utama
  sections.push(
    `<b>📈 AUTO MERGE SAHAM</b>\n<b>${escapeHtml(sym)}</b> • <i>${escapeHtml(now)}</i>`,
  );

  // 1. Ringkasan & Analisa Bandar
  sections.push(formatBrokerSummary(args.brokerAnalysis, sym));

  // 2. Hasil Gabungan Data
  if (args.merged) {
    sections.push(formatMergedTable(args.merged, sym));
  }

  // 3. Analisa Bandar — Controller, Konfirmasi, Distributor
  sections.push(formatBrokerConsistency(args.brokerConsistency, sym));

  return sections.join("\n\n———\n\n");
}
