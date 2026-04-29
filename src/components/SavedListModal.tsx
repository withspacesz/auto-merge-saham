import { useEffect, useState } from "react";
import {
  Cloud,
  CloudOff,
  Eye,
  Inbox,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  deleteSaved,
  formatSavedDate,
  listSaved,
  type SavedItem,
} from "@/lib/storage";
import {
  autoSync,
  clearConfig,
  loadConfig,
  pullAndMerge,
} from "@/lib/cloud-sync";

type Props = {
  onClose: () => void;
  onView: (item: SavedItem) => void;
  onOpenLogin: () => void;
  onSyncChanged?: () => void;
};

export function SavedListModal({
  onClose,
  onView,
  onOpenLogin,
  onSyncChanged,
}: Props) {
  const [items, setItems] = useState<SavedItem[]>(() => listSaved());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [config, setConfig] = useState(() => loadConfig());
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{
    text: string;
    kind: "ok" | "err";
  } | null>(null);

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

  const handleDelete = (id: string) => {
    const next = deleteSaved(id);
    setItems(next);
    setConfirmDeleteId(null);
    void autoSync();
  };

  const refresh = () => setItems(listSaved());

  const flashMsg = (text: string, kind: "ok" | "err") => {
    setSyncMsg({ text, kind });
    window.setTimeout(() => setSyncMsg(null), 3500);
  };

  const handlePull = async () => {
    setSyncing(true);
    try {
      await pullAndMerge();
      refresh();
      setConfig(loadConfig());
      flashMsg("Tarik dari cloud berhasil.", "ok");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      flashMsg(`Gagal tarik: ${msg}`, "err");
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = () => {
    clearConfig();
    setConfig(null);
    onSyncChanged?.();
    flashMsg("Cloud sync diputuskan. Data lokal tetap.", "ok");
  };

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

      <div className="relative w-full max-w-3xl max-h-[88vh] flex flex-col rounded-xl border border-border bg-card shadow-2xl shadow-emerald-500/10 overflow-hidden animate-in zoom-in-95 fade-in duration-200">
        <div className="shrink-0 flex items-start justify-between gap-4 px-5 py-3 border-b border-border bg-card/95 backdrop-blur z-10">
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-bold text-emerald-400">
              Data Tersimpan
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {items.length === 0
                ? "Belum ada data. Simpan dari hasil analisa untuk melihatnya di sini."
                : `${items.length} data tersimpan`}
              {config?.lastSyncAt && (
                <>
                  {" · sinkron terakhir "}
                  <span className="text-emerald-300/80 font-mono">
                    {formatSavedDate(config.lastSyncAt)}
                  </span>
                </>
              )}
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

        {/* Sync toolbar */}
        <div className="shrink-0 px-5 py-2.5 border-b border-border bg-muted/20 flex items-center gap-2 flex-wrap">
          {config ? (
            <>
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30">
                <Cloud className="h-3.5 w-3.5" />
                Tersinkron ke GitHub Gist
              </span>
              <button
                onClick={handlePull}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border border-border bg-background/40 text-foreground hover:border-border/80 disabled:opacity-50 transition-colors"
              >
                {syncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Tarik dari cloud
              </button>
              <button
                onClick={handleDisconnect}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-muted-foreground hover:text-red-300 transition-colors"
                title="Putuskan sambungan (data lokal tetap)"
              >
                <CloudOff className="h-3.5 w-3.5" />
                Putuskan
              </button>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground">
                <CloudOff className="h-3.5 w-3.5" />
                Belum tersinkron
              </span>
              <button
                onClick={onOpenLogin}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-emerald-950 transition-colors"
              >
                <Cloud className="h-3.5 w-3.5" />
                Login GitHub
              </button>
            </>
          )}
          {syncMsg && (
            <span
              className={`ml-auto text-[11px] font-medium ${
                syncMsg.kind === "ok" ? "text-emerald-300" : "text-red-300"
              }`}
            >
              {syncMsg.text}
            </span>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-16 px-6 text-muted-foreground">
              <Inbox className="h-10 w-10 mb-3 opacity-60" />
              <p className="text-sm">Belum ada data tersimpan.</p>
              <p className="text-xs mt-1 opacity-80">
                Buka hasil analisa, lalu klik{" "}
                <span className="text-emerald-400 font-medium">Simpan Data</span>{" "}
                untuk menyimpan.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/40 backdrop-blur text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Nama Saham</th>
                  <th className="text-left px-4 py-2 font-semibold">Tgl Data</th>
                  <th className="text-left px-4 py-2 font-semibold">Ket</th>
                  <th className="text-right px-4 py-2 font-semibold w-32">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const isConfirming = confirmDeleteId === it.id;
                  return (
                    <tr
                      key={it.id}
                      className="border-t border-border hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/30 font-mono text-xs font-semibold tracking-wide">
                          {it.symbol || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs font-mono whitespace-nowrap">
                        {formatSavedDate(it.savedAt)}
                      </td>
                      <td className="px-4 py-3 text-foreground/90">
                        <div className="line-clamp-2">
                          {it.ket || (
                            <span className="text-muted-foreground italic">
                              {it.filledCount} sumber data
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {isConfirming ? (
                            <>
                              <button
                                onClick={() => handleDelete(it.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-red-500/15 text-red-300 ring-1 ring-red-500/40 hover:bg-red-500/25 transition-colors"
                              >
                                Hapus?
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="inline-flex items-center px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground transition-colors"
                              >
                                Batal
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => onView(it)}
                                title="Lihat analisa"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-emerald-950 transition-colors"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(it.id)}
                                title="Hapus data"
                                className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-border text-muted-foreground hover:text-red-300 hover:border-red-500/40 hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
