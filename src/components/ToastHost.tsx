import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Info,
  Loader2,
  X,
  type LucideIcon,
} from "lucide-react";

type ToastKind = "success" | "error" | "info" | "loading";

export type ToastInput = {
  kind?: ToastKind;
  title: string;
  description?: string;
  duration?: number; // ms, 0 = persist
  icon?: LucideIcon;
};

type Toast = ToastInput & {
  id: number;
  exiting?: boolean;
};

type ToastApi = {
  show: (t: ToastInput) => number;
  success: (title: string, description?: string) => number;
  error: (title: string, description?: string) => number;
  info: (title: string, description?: string) => number;
  loading: (title: string, description?: string) => number;
  update: (id: number, t: Partial<ToastInput>) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const KIND_STYLES: Record<
  ToastKind,
  {
    icon: LucideIcon;
    iconClass: string;
    ring: string;
    accent: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    iconClass: "text-emerald-300",
    ring: "ring-emerald-500/40 shadow-emerald-500/20",
    accent: "from-emerald-500/20",
  },
  error: {
    icon: AlertCircle,
    iconClass: "text-red-300",
    ring: "ring-red-500/40 shadow-red-500/20",
    accent: "from-red-500/20",
  },
  info: {
    icon: Info,
    iconClass: "text-sky-300",
    ring: "ring-sky-500/40 shadow-sky-500/20",
    accent: "from-sky-500/20",
  },
  loading: {
    icon: Loader2,
    iconClass: "text-emerald-300 animate-spin",
    ring: "ring-emerald-500/30 shadow-emerald-500/10",
    accent: "from-emerald-500/10",
  },
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const removeNow = useCallback((id: number) => {
    setToasts((arr) => arr.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      // animasi keluar dulu, baru hapus
      setToasts((arr) =>
        arr.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
      );
      window.setTimeout(() => removeNow(id), 220);
    },
    [removeNow],
  );

  const scheduleDismiss = useCallback(
    (id: number, duration: number) => {
      if (duration <= 0) return;
      const prev = timers.current.get(id);
      if (prev) clearTimeout(prev);
      const handle = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, handle);
    },
    [dismiss],
  );

  const show = useCallback(
    (t: ToastInput): number => {
      const id = nextId++;
      const kind: ToastKind = t.kind ?? "info";
      const duration = t.duration ?? (kind === "loading" ? 0 : 3500);
      setToasts((arr) => [...arr, { ...t, kind, id }]);
      scheduleDismiss(id, duration);
      return id;
    },
    [scheduleDismiss],
  );

  const update = useCallback(
    (id: number, patch: Partial<ToastInput>) => {
      setToasts((arr) =>
        arr.map((t) => (t.id === id ? { ...t, ...patch, exiting: false } : t)),
      );
      const kind = patch.kind ?? "info";
      const duration =
        patch.duration ?? (kind === "loading" ? 0 : 3500);
      scheduleDismiss(id, duration);
    },
    [scheduleDismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, description) => show({ kind: "success", title, description }),
      error: (title, description) =>
        show({ kind: "error", title, description, duration: 5000 }),
      info: (title, description) => show({ kind: "info", title, description }),
      loading: (title, description) =>
        show({ kind: "loading", title, description, duration: 0 }),
      update,
      dismiss,
    }),
    [show, update, dismiss],
  );

  useEffect(() => {
    const cur = timers.current;
    return () => {
      cur.forEach((h) => clearTimeout(h));
      cur.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[min(92vw,360px)]">
      {toasts.map((t) => {
        const kind = (t.kind ?? "info") as ToastKind;
        const style = KIND_STYLES[kind];
        const Icon = t.icon ?? style.icon;
        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto relative overflow-hidden rounded-lg border border-border bg-card shadow-2xl ring-1 ${
              style.ring
            } transition-all duration-200 ease-out ${
              t.exiting
                ? "opacity-0 translate-x-4 scale-95"
                : "opacity-100 translate-x-0 scale-100 animate-in slide-in-from-right-5 fade-in"
            }`}
          >
            <div
              className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${style.accent} via-transparent to-transparent`}
            />
            <div className="flex items-start gap-3 px-3.5 py-3">
              <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${style.iconClass}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-foreground leading-tight">
                  {t.title}
                </div>
                {t.description && (
                  <div className="mt-0.5 text-[12px] text-muted-foreground leading-snug">
                    {t.description}
                  </div>
                )}
              </div>
              <button
                onClick={() => onDismiss(t.id)}
                className="shrink-0 -mr-1 -mt-1 inline-flex items-center justify-center h-6 w-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                aria-label="Tutup notifikasi"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {kind !== "loading" && (
              <div
                key={t.id /* restart bar on update */}
                className={`h-0.5 origin-left ${
                  kind === "success"
                    ? "bg-emerald-500/60"
                    : kind === "error"
                      ? "bg-red-500/60"
                      : "bg-sky-500/60"
                } animate-toast-bar`}
                style={{
                  animationDuration: `${t.duration ?? 3500}ms`,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback no-op kalau provider belum dipasang (mis. saat test)
    return {
      show: () => 0,
      success: () => 0,
      error: () => 0,
      info: () => 0,
      loading: () => 0,
      update: () => {},
      dismiss: () => {},
    };
  }
  return ctx;
}
