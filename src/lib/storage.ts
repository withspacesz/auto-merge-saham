export type SourceKey = "data" | "nbsa" | "mf" | "rcm" | "broker" | "brokerPrev";

export type SavedItem = {
  id: string;
  symbol: string;
  savedAt: string; // ISO timestamp ketika disimpan
  ket: string; // catatan / keterangan bebas
  filledCount: number;
  data: Record<SourceKey, string>;
};

const STORAGE_KEY = "auto-merge-saham:saved-v1";

function safeParse(raw: string | null): SavedItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (it): it is SavedItem =>
        it &&
        typeof it.id === "string" &&
        typeof it.symbol === "string" &&
        typeof it.savedAt === "string" &&
        typeof it.data === "object",
    );
  } catch {
    return [];
  }
}

export function listSaved(): SavedItem[] {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

export function saveItem(item: Omit<SavedItem, "id" | "savedAt"> & {
  id?: string;
  savedAt?: string;
}): SavedItem {
  const now = new Date().toISOString();
  const id =
    item.id ??
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const next: SavedItem = {
    id,
    symbol: item.symbol,
    savedAt: item.savedAt ?? now,
    ket: item.ket,
    filledCount: item.filledCount,
    data: item.data,
  };
  const all = listSaved();
  // ganti kalau id sama, kalau tidak prepend (paling baru di atas)
  const filtered = all.filter((x) => x.id !== id);
  const updated = [next, ...filtered];
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return next;
}

export function deleteSaved(id: string): SavedItem[] {
  const all = listSaved();
  const updated = all.filter((x) => x.id !== id);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

export function setAll(items: SavedItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function formatSavedDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}-${mm}-${yyyy} ${hh}:${mi}`;
  } catch {
    return iso;
  }
}
