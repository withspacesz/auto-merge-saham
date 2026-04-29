import { useEffect } from "react";
import { Send, X, Settings2 } from "lucide-react";

export function TelegramConfirmModal({
  symbol,
  hasConfig,
  onYes,
  onNo,
  onOpenSettings,
}: {
  symbol: string;
  hasConfig: boolean;
  onYes: () => void;
  onNo: () => void;
  onOpenSettings: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onNo();
      if (e.key === "Enter" && hasConfig) onYes();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onYes, onNo, hasConfig]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center p-3 md:p-4"
    >
      <div
        onClick={onNo}
        className="absolute inset-0 bg-background/70 backdrop-blur-md animate-in fade-in"
      />

      <div className="relative w-full max-w-sm rounded-xl border border-border bg-card shadow-2xl shadow-emerald-500/10 overflow-hidden animate-in zoom-in-95 fade-in duration-200">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-9 w-9 rounded-lg bg-sky-500/15 ring-1 ring-sky-500/30 flex items-center justify-center text-sky-300">
              <Send className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm md:text-base font-bold text-emerald-400">
                Kirim ke Telegram?
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Hasil analisa {symbol ? <span className="font-mono">{symbol}</span> : "saham"} bisa dikirim ke chat kamu.
              </p>
            </div>
          </div>
          <button
            onClick={onNo}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-border bg-background/40 text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
            aria-label="Tutup"
            title="Tutup (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-foreground/90 leading-relaxed">
            Kirim <b>Ringkasan &amp; Analisa Bandar</b>, <b>Hasil Gabungan Data</b>, dan
            <b> Analisa Bandar — Controller, Konfirmasi, Distributor</b> ke Telegram?
          </p>
          {!hasConfig && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              Telegram belum disetel. Atur Bot Token &amp; Chat ID dulu di pengaturan.
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-border bg-muted/20">
          <button
            onClick={onOpenSettings}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Pengaturan
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onNo}
              className="px-3 py-2 rounded-md text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              Tidak
            </button>
            <button
              onClick={onYes}
              disabled={!hasConfig}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/30 disabled:cursor-not-allowed text-emerald-950 transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
              Ya, kirim
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
