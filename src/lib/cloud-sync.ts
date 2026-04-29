import { listSaved, setAll, type SavedItem } from "./storage";

export type SyncConfig = {
  token: string;
  gistId: string;
  lastSyncAt?: string;
};

const CONFIG_KEY = "auto-merge-saham:sync-v1";
const FILENAME = "auto-merge-saham.json";
const GIST_DESC = "auto-merge-saham — saved data sync";

export function loadConfig(): SyncConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (
      c &&
      typeof c.token === "string" &&
      typeof c.gistId === "string" &&
      c.token.length > 0 &&
      c.gistId.length > 0
    ) {
      return c as SyncConfig;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function saveConfig(c: SyncConfig): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
}

export function clearConfig(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CONFIG_KEY);
}

async function ghFetch(
  token: string,
  url: string,
  init?: RequestInit,
): Promise<unknown> {
  const res = await fetch(`https://api.github.com${url}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function createGist(
  token: string,
  items: SavedItem[],
): Promise<string> {
  const data = (await ghFetch(token, "/gists", {
    method: "POST",
    body: JSON.stringify({
      description: GIST_DESC,
      public: false,
      files: {
        [FILENAME]: { content: JSON.stringify(items, null, 2) || "[]" },
      },
    }),
  })) as { id: string };
  return data.id;
}

export async function pushToGist(
  token: string,
  gistId: string,
  items: SavedItem[],
): Promise<void> {
  await ghFetch(token, `/gists/${gistId}`, {
    method: "PATCH",
    body: JSON.stringify({
      files: {
        [FILENAME]: { content: JSON.stringify(items, null, 2) || "[]" },
      },
    }),
  });
}

export async function pullFromGist(
  token: string,
  gistId: string,
): Promise<SavedItem[]> {
  const data = (await ghFetch(token, `/gists/${gistId}`)) as {
    files: Record<
      string,
      { content?: string; truncated?: boolean; raw_url?: string } | undefined
    >;
  };
  const file = data.files?.[FILENAME];
  if (!file) return [];
  let content = file.content ?? "";
  if (file.truncated && file.raw_url) {
    const r = await fetch(file.raw_url);
    if (!r.ok) throw new Error(`Gagal ambil isi gist (${r.status})`);
    content = await r.text();
  }
  if (!content.trim()) return [];
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (it: unknown): it is SavedItem =>
        !!it &&
        typeof it === "object" &&
        typeof (it as SavedItem).id === "string" &&
        typeof (it as SavedItem).symbol === "string" &&
        typeof (it as SavedItem).savedAt === "string" &&
        typeof (it as SavedItem).data === "object",
    );
  } catch {
    return [];
  }
}

export function mergeItems(
  local: SavedItem[],
  remote: SavedItem[],
): SavedItem[] {
  const map = new Map<string, SavedItem>();
  for (const it of remote) map.set(it.id, it);
  for (const it of local) {
    const ex = map.get(it.id);
    const lt = new Date(it.savedAt).getTime();
    const et = ex ? new Date(ex.savedAt).getTime() : -1;
    if (!ex || lt > et) map.set(it.id, it);
  }
  return Array.from(map.values()).sort(
    (a, b) =>
      new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  );
}

/** Fire-and-forget push of current local items to gist when sync is configured. */
export async function autoSync(): Promise<void> {
  const cfg = loadConfig();
  if (!cfg) return;
  try {
    await pushToGist(cfg.token, cfg.gistId, listSaved());
    saveConfig({ ...cfg, lastSyncAt: new Date().toISOString() });
  } catch (e) {
    console.warn("[cloud-sync] autoSync gagal:", e);
  }
}

/** Pull from gist, merge with local, write merged back to local. Returns merged. */
export async function pullAndMerge(): Promise<SavedItem[] | null> {
  const cfg = loadConfig();
  if (!cfg) return null;
  const remote = await pullFromGist(cfg.token, cfg.gistId);
  const local = listSaved();
  const merged = mergeItems(local, remote);
  setAll(merged);
  // Push merged back so cloud reflects the union
  try {
    await pushToGist(cfg.token, cfg.gistId, merged);
  } catch {
    /* best effort */
  }
  saveConfig({ ...cfg, lastSyncAt: new Date().toISOString() });
  return merged;
}
