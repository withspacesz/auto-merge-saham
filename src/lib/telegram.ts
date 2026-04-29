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

function pad(s: string, len: number, align: "l" | "r" = "l"): string {
  const str = String(s ?? "");
  if (str.length >= len) return str.slice(0, len);
  const space = " ".repeat(len - str.length);
  return align === "r" ? space + str : str + space;
}

// Render tabel hasil gabungan jadi monospace text yang muat di Telegram.
function formatMergedTable(merged: MergedTable, symbol: string): string {
  const lines: string[] = [];
  const sym = symbol.trim() || "—";
  lines.push(`<b>📊 HASIL GABUNGAN — ${escapeHtml(sym)}</b>`);
  lines.push(
    `<i>${merged.sourceCount} sumber digabung • ${merged.matchedDates} tanggal cocok</i>`,
  );
  lines.push("");

  // Pilih kolom inti supaya muat di chat mobile.
  const PRIORITY = [
    "Tanggal",
    "Price",
    "Gain",
    "NBSA",
    "MF +/-",
    "Value",
    "Ket NBSA",
    "Ket MF",
    "Ket RCM",
  ];
  const headers = PRIORITY.filter((h) => merged.headers.includes(h));
  // Kalau header inti tidak ada, fallback ke 5 kolom pertama
  const usedHeaders =
    headers.length > 0 ? headers : merged.headers.slice(0, 5);

  // Hitung lebar kolom
  const widths: Record<string, number> = {};
  for (const h of usedHeaders) {
    let w = h.length;
    for (const r of merged.rows) {
      const v = String(r[h] ?? "");
      if (v.length > w) w = v.length;
    }
    widths[h] = Math.min(w, 14); // batas 14 char per kolom
  }

  const headerLine = usedHeaders
    .map((h) => pad(h, widths[h]))
    .join(" │ ");
  const sepLine = usedHeaders
    .map((h) => "─".repeat(widths[h]))
    .join("─┼─");

  lines.push("<pre>");
  lines.push(escapeHtml(headerLine));
  lines.push(escapeHtml(sepLine));
  for (const row of merged.rows) {
    const isTotal = !!row.__isTotal;
    const cells = usedHeaders
      .map((h) => {
        const raw = String(row[h] ?? "");
        // Buang emoji panjang biar rapi
        const cleaned = raw.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu, "").trim();
        return pad(cleaned || "—", widths[h]);
      })
      .join(" │ ");
    lines.push(escapeHtml(isTotal ? `Σ ${cells}` : cells));
  }
  lines.push("</pre>");
  return lines.join("\n");
}

// Ringkasan & analisa bandar (versi singkat untuk Telegram).
function formatBrokerSummary(
  brokerAnalysis: BrokerAnalysis | null,
  symbol: string,
): string {
  const lines: string[] = [];
  const sym = symbol.trim() || "—";
  lines.push(`<b>🏦 RINGKASAN &amp; ANALISA BANDAR — ${escapeHtml(sym)}</b>`);

  if (!brokerAnalysis) {
    lines.push("");
    lines.push("<i>Data broker belum tersedia.</i>");
    return lines.join("\n");
  }

  const a = brokerAnalysis;
  lines.push("");
  lines.push(`<b>📅 Periode:</b> ${escapeHtml(a.date || "—")}`);
  lines.push("");

  // Narasi headline
  const toneEmoji =
    a.narrative.tone === "green" ? "🟢"
    : a.narrative.tone === "red" ? "🔴"
    : a.narrative.tone === "amber" ? "🟡"
    : "⚪";
  lines.push(`${toneEmoji} <b>${escapeHtml(a.narrative.headline)}</b>`);
  lines.push(`<i>${escapeHtml(a.narrative.detail)}</i>`);
  lines.push("");

  // Total flow
  lines.push("<b>💰 Aliran Dana</b>");
  lines.push(`• Total Buy   : <code>${escapeHtml(fmtIDR(a.totalBuy))}</code>`);
  lines.push(`• Total Sell  : <code>${escapeHtml(fmtIDR(a.totalSell))}</code>`);
  lines.push(`• Net BSA     : <code>${escapeHtml(fmtIDR(a.netBSA))}</code>`);
  lines.push("");
  lines.push("<b>🌐 Komposisi</b>");
  lines.push(`• Asing       : <code>${escapeHtml(fmtIDR(a.netAsing))}</code>`);
  lines.push(`• Lokal       : <code>${escapeHtml(fmtIDR(a.netLokal))}</code>`);
  if (a.netUnknown !== 0) {
    lines.push(`• Unknown     : <code>${escapeHtml(fmtIDR(a.netUnknown))}</code>`);
  }
  lines.push("");

  // Top buyer/seller per kategori
  if (a.topAsingBuyer || a.topAsingSeller) {
    lines.push("<b>🌎 Top Asing</b>");
    if (a.topAsingBuyer) {
      lines.push(
        `• 🟢 Buy : <b>${escapeHtml(a.topAsingBuyer.code)}</b> ${escapeHtml(a.topAsingBuyer.info.name)} — <code>${escapeHtml(fmtIDR(a.topAsingBuyer.value))}</code>`,
      );
    }
    if (a.topAsingSeller) {
      lines.push(
        `• 🔴 Sell: <b>${escapeHtml(a.topAsingSeller.code)}</b> ${escapeHtml(a.topAsingSeller.info.name)} — <code>${escapeHtml(fmtIDR(a.topAsingSeller.value))}</code>`,
      );
    }
    lines.push("");
  }
  if (a.topLokalBuyer || a.topLokalSeller) {
    lines.push("<b>🇮🇩 Top Lokal</b>");
    if (a.topLokalBuyer) {
      lines.push(
        `• 🟢 Buy : <b>${escapeHtml(a.topLokalBuyer.code)}</b> ${escapeHtml(a.topLokalBuyer.info.name)} — <code>${escapeHtml(fmtIDR(a.topLokalBuyer.value))}</code>`,
      );
    }
    if (a.topLokalSeller) {
      lines.push(
        `• 🔴 Sell: <b>${escapeHtml(a.topLokalSeller.code)}</b> ${escapeHtml(a.topLokalSeller.info.name)} — <code>${escapeHtml(fmtIDR(a.topLokalSeller.value))}</code>`,
      );
    }
    lines.push("");
  }

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
    limit = 5,
  ) => {
    lines.push("");
    lines.push(`${icon} <b>${escapeHtml(title)}</b>`);
    if (entries.length === 0) {
      lines.push("<i>— tidak ada</i>");
      return;
    }
    entries.slice(0, limit).forEach((e, i) => {
      const w = e.weeklyValue ? fmtIDR(e.weeklyValue) : "—";
      const d = e.dailyValue ? fmtIDR(e.dailyValue) : "—";
      lines.push(
        `${i + 1}. <b>${escapeHtml(e.code)}</b> ${escapeHtml(e.info.name)}`,
      );
      lines.push(
        `   <code>W:${escapeHtml(w)} | D:${escapeHtml(d)}</code>`,
      );
      lines.push(`   <i>${escapeHtml(e.reason)}</i>`);
    });
  };

  renderBucket("CONTROLLER (Akumulator Konsisten)", "🟢", c.topAccumulators);

  // Konfirmasi: broker baru masuk akumulasi (NEW_AKUM + FLIP_TO_AKUM)
  renderBucket("KONFIRMASI (Broker Baru Akumulasi)", "🔵", c.newOrFlipAkum);

  // Distributor: konsisten dist + flip warning
  const distributors: ConsistencyEntry[] = [
    ...c.flipWarning,
    ...c.konsistenDist,
    ...c.newOrFreshDist,
  ];
  renderBucket("DISTRIBUTOR (Penekan Jual)", "🔴", distributors);

  lines.push("");
  lines.push(`<b>📝 Kesimpulan:</b>`);
  lines.push(`<i>${escapeHtml(c.conclusion)}</i>`);

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

  return sections.join("\n\n———————————————\n\n");
}
