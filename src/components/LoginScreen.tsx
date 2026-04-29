import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  ExternalLink,
  Github,
  Loader2,
  Lock,
  ShieldCheck,
  X,
} from "lucide-react";
import { listSaved } from "@/lib/storage";
import {
  createGist,
  loadConfig,
  markSkipped,
  pullAndMerge,
  saveConfig,
} from "@/lib/cloud-sync";
import { useToast } from "@/components/ToastHost";

type Props = {
  onClose: () => void;
  onConnected: () => void;
  /** Kalau true, tombol Lewati ditampilkan (untuk tampilan login awal). */
  allowSkip?: boolean;
};

export function LoginScreen({ onClose, onConnected, allowSkip = true }: Props) {
  const existing = loadConfig();
  const [tokenInput, setTokenInput] = useState("");
  const [gistInput, setGistInput] = useState(existing?.gistId ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && allowSkip) handleSkip();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowSkip]);

  const handleSkip = () => {
    markSkipped();
    onClose();
  };

  const handleConnect = async () => {
    const token = tokenInput.trim();
    if (!token) {
      setErr("Token tidak boleh kosong.");
      toast.error("Token kosong", "Tempel Personal Access Token dulu.");
      return;
    }
    setBusy(true);
    setErr(null);
    const loadingId = toast.loading(
      "Menyambungkan ke GitHub...",
      "Verifikasi token & gist.",
    );
    try {
      let gistId = gistInput.trim();
      let createdNew = false;
      if (!gistId) {
        gistId = await createGist(token, listSaved());
        createdNew = true;
      }
      saveConfig({ token, gistId, lastSyncAt: new Date().toISOString() });
      // Sekalian tarik & merge biar konsisten
      try {
        await pullAndMerge();
      } catch {
        /* not fatal */
      }
      toast.update(loadingId, {
        kind: "success",
        title: createdNew ? "Gist baru dibuat" : "Tersambung ke gist",
        description: createdNew
          ? "Gist privat berhasil dibuat di akun GitHub kamu."
          : "Berhasil sambung ke gist yang ada.",
      });
      onConnected();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(`Gagal sambungkan: ${msg}`);
      toast.update(loadingId, {
        kind: "error",
        title: "Gagal login",
        description: msg.slice(0, 160),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center p-3 md:p-4"
    >
      <div className="absolute inset-0 bg-background/85 backdrop-blur-md animate-in fade-in" />

      <div className="relative w-full max-w-lg rounded-2xl border border-emerald-500/20 bg-card shadow-2xl shadow-emerald-500/10 overflow-hidden animate-in zoom-in-95 fade-in duration-200">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-5 border-b border-border bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent">
          {allowSkip && (
            <button
              onClick={handleSkip}
              title="Lewati"
              className="absolute top-3 right-3 inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <div className="flex items-center gap-3">
            <div className="shrink-0 inline-flex items-center justify-center h-11 w-11 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30 text-emerald-300">
              <Github className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-bold text-foreground">
                Login GitHub
              </h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Sinkronkan data tersimpan ke akun GitHub kamu (gist privat).
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Steps */}
          <ol className="space-y-2 text-[12.5px] text-muted-foreground">
            <li className="flex gap-2">
              <span className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-500/15 text-emerald-300 text-[11px] font-bold ring-1 ring-emerald-500/30">
                1
              </span>
              <span>
                Buka{" "}
                <a
                  href="https://github.com/settings/tokens?type=beta"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200 underline underline-offset-2 font-medium"
                >
                  github.com/settings/tokens
                  <ExternalLink className="h-3 w-3" />
                </a>
                , buat <span className="text-foreground font-medium">Personal Access Token</span> dengan scope{" "}
                <code className="px-1 py-0.5 rounded bg-muted text-foreground font-mono text-[10.5px]">
                  gist
                </code>
                .
              </span>
            </li>
            <li className="flex gap-2">
              <span className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-500/15 text-emerald-300 text-[11px] font-bold ring-1 ring-emerald-500/30">
                2
              </span>
              <span>Tempel token di bawah, lalu klik Sambungkan.</span>
            </li>
          </ol>

          {/* Form */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Lock className="h-3 w-3" />
              Personal Access Token
            </label>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConnect();
              }}
              autoFocus
            />
          </div>

          <details className="group">
            <summary className="cursor-pointer text-[11.5px] text-muted-foreground hover:text-foreground transition-colors select-none">
              Sudah punya gist? Sambungkan ke gist yang sama (untuk perangkat lain)
            </summary>
            <div className="mt-2 space-y-1.5">
              <input
                type="text"
                value={gistInput}
                onChange={(e) => setGistInput(e.target.value)}
                placeholder="Gist ID (opsional, otomatis dibuat kalau kosong)"
                className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm font-mono outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40"
              />
              <p className="text-[10.5px] text-muted-foreground/80">
                Buka gist kamu di{" "}
                <a
                  href="https://gist.github.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-300 hover:text-emerald-200 underline underline-offset-2"
                >
                  gist.github.com
                </a>
                , copy ID dari URL (bagian setelah username).
              </p>
            </div>
          </details>

          {err && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
              {err}
            </div>
          )}

          {/* Privacy note */}
          <div className="flex items-start gap-2 rounded-md bg-muted/40 border border-border px-3 py-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-300" />
            <span>
              Token hanya disimpan di browser kamu (localStorage), tidak dikirim ke
              server manapun selain GitHub.
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-border bg-muted/20 flex items-center gap-2">
          <button
            onClick={handleConnect}
            disabled={busy || !tokenInput.trim()}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/30 disabled:cursor-not-allowed text-emerald-950 disabled:text-emerald-950/60 text-sm font-semibold transition-colors"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Menyambungkan...
              </>
            ) : (
              <>
                <Cloud className="h-4 w-4" />
                Sambungkan
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
          {allowSkip && (
            <button
              onClick={handleSkip}
              disabled={busy}
              className="px-4 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
            >
              Lewati dulu
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Banner kecil di sudut buat kasih tahu kalau lagi tersinkron. */
export function SyncedBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300">
      <CheckCircle2 className="h-3 w-3" />
      Tersinkron
    </span>
  );
}
