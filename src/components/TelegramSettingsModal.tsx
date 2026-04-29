import { useEffect, useRef, useState } from "react";
import { Send, X, Loader2, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import {
  loadTelegramConfig,
  saveTelegramConfig,
  clearTelegramConfig,
  testTelegramConfig,
  loadAskBeforeSend,
  saveAskBeforeSend,
} from "@/lib/telegram";
import { useToast } from "@/components/ToastHost";

type Status = "idle" | "testing" | "ok" | "err";

export function TelegramSettingsModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const existing = loadTelegramConfig();
  const [botToken, setBotToken] = useState(existing?.botToken ?? "");
  const [chatId, setChatId] = useState(existing?.chatId ?? "");
  const [askBefore, setAskBefore] = useState<boolean>(loadAskBeforeSend());
  const [status, setStatus] = useState<Status>("idle");
  const [errMsg, setErrMsg] = useState<string>("");
  const toast = useToast();
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const handleTestAndSave = async () => {
    const tk = botToken.trim();
    const cid = chatId.trim();
    if (!tk || !cid) {
      setStatus("err");
      setErrMsg("Bot Token dan Chat ID wajib diisi.");
      return;
    }
    setStatus("testing");
    setErrMsg("");
    try {
      const cfg = { botToken: tk, chatId: cid };
      const r = await testTelegramConfig(cfg);
      saveTelegramConfig(cfg);
      saveAskBeforeSend(askBefore);
      setStatus("ok");
      toast.success(
        "Telegram tersambung",
        `Bot @${r.username} siap menerima hasil analisa.`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus("err");
      setErrMsg(msg);
    }
  };

  const handleSaveOnly = () => {
    const tk = botToken.trim();
    const cid = chatId.trim();
    saveAskBeforeSend(askBefore);
    if (!tk || !cid) {
      // hanya simpan preferensi tanya
      toast.info("Pengaturan disimpan", "Preferensi konfirmasi diperbarui.");
      return;
    }
    saveTelegramConfig({ botToken: tk, chatId: cid });
    toast.success("Pengaturan disimpan", "Konfigurasi Telegram diperbarui.");
  };

  const handleClear = () => {
    clearTelegramConfig();
    setBotToken("");
    setChatId("");
    setStatus("idle");
    setErrMsg("");
    toast.info("Telegram diputus", "Konfigurasi bot dihapus dari perangkat ini.");
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 md:p-4"
    >
      <div
        ref={overlayRef}
        onClick={onClose}
        className="absolute inset-0 bg-background/70 backdrop-blur-md animate-in fade-in"
      />

      <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl shadow-emerald-500/10 overflow-hidden animate-in zoom-in-95 fade-in duration-200">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border bg-card/95">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-sky-500/15 ring-1 ring-sky-500/30 flex items-center justify-center text-sky-300">
              <Send className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm md:text-base font-bold text-emerald-400">
                Pengaturan Telegram
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Kirim hasil analisa langsung ke chat Telegram kamu.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border bg-background/40 text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
            aria-label="Tutup"
            title="Tutup (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Bot Token
            </label>
            <input
              type="text"
              value={botToken}
              onChange={(e) => {
                setBotToken(e.target.value);
                setStatus("idle");
              }}
              placeholder="123456:ABC-DEF..."
              spellCheck={false}
              className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40"
            />
            <p className="text-[10.5px] text-muted-foreground leading-relaxed">
              Buat bot lewat <span className="font-mono">@BotFather</span> di Telegram → ketik <span className="font-mono">/newbot</span> → salin token yang muncul.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Chat ID
            </label>
            <input
              type="text"
              value={chatId}
              onChange={(e) => {
                setChatId(e.target.value);
                setStatus("idle");
              }}
              placeholder="123456789 atau -1001234567890"
              spellCheck={false}
              className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40"
            />
            <p className="text-[10.5px] text-muted-foreground leading-relaxed">
              Cek chat ID lewat <span className="font-mono">@userinfobot</span>. Kirim dulu pesan apa saja ke bot kamu supaya dia bisa balas.
            </p>
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={askBefore}
              onChange={(e) => setAskBefore(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-emerald-500"
            />
            <div className="text-xs">
              <div className="font-medium text-foreground">
                Tampilkan konfirmasi sebelum kirim
              </div>
              <div className="text-[11px] text-muted-foreground">
                Setiap kali kamu menutup hasil analisa, akan muncul pop-up "Kirim ke Telegram?".
              </div>
            </div>
          </label>

          {status === "ok" && (
            <div className="flex items-start gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Koneksi berhasil. Cek Telegram kamu untuk pesan tes.</span>
            </div>
          )}
          {status === "err" && (
            <div className="flex items-start gap-2 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="break-words">{errMsg}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border bg-muted/20">
          <button
            onClick={handleClear}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium text-rose-300 hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Hapus
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSaveOnly}
              className="px-3 py-2 rounded-md text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              Simpan Saja
            </button>
            <button
              onClick={handleTestAndSave}
              disabled={status === "testing"}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/40 text-emerald-950 transition-colors"
            >
              {status === "testing" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Menguji...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Tes &amp; Simpan
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
