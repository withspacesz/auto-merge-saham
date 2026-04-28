import { parseTable, normalizeDate, normalizeHeader, type ParsedTable } from "./parser";
import { formatCell } from "./format";

export type MergedRow = Record<string, string> & { __isTotal?: string };
export type MergedTable = {
  headers: string[];
  rows: MergedRow[];
  sourceCount: number;
  matchedDates: number;
};

export type SourceInput = {
  key: string;
  text: string;
};

const DATE_KEYS = ["date", "tanggal", "tgl"];

const isDateHeader = (h: string): boolean => DATE_KEYS.includes(normalizeHeader(h));

const ketLabelForSourceKey = (sourceKey?: string): string | null => {
  if (!sourceKey) return null;
  const k = sourceKey.toLowerCase();
  if (k === "nbsa") return "Ket NBSA";
  if (k === "mf") return "Ket MF";
  if (k === "rcm") return "Ket RCM";
  return null;
};

const renameForContext = (
  header: string,
  table: ParsedTable,
  sourceKey?: string,
): string => {
  const normalized = normalizeHeader(header);
  const lower = header.toLowerCase().trim();
  const isKet =
    normalized === "ket" || lower.startsWith("ket") || /^ket\.?\.?\.?$/.test(lower);

  if (isKet) {
    // If header itself already contains specific tag (e.g. "ket nbsa"), respect it.
    if (lower.includes("nbsa")) return "Ket NBSA";
    if (lower.includes("mf") || lower.includes("money flow")) return "Ket MF";
    if (lower.includes("rcm")) return "Ket RCM";

    // Use the source key (which textarea this came from) — most reliable.
    const fromKey = ketLabelForSourceKey(sourceKey);
    if (fromKey) return fromKey;

    // Fall back to the parsed title text.
    const t = (table.rawTitle ?? "").toLowerCase();
    if (t.includes("nbsa")) return "Ket NBSA";
    if (t.includes("mf") || t.includes("money flow")) return "Ket MF";
    if (t.includes("rcm")) return "Ket RCM";

    return "Ket";
  }
  return header;
};

export const mergeInputs = (
  inputs: SourceInput[] | string[],
): { merged: MergedTable | null; tables: (ParsedTable | null)[] } => {
  const normalized: SourceInput[] = inputs.map((it) =>
    typeof it === "string" ? { key: "", text: it } : it,
  );
  const tables = normalized.map((i) => (i.text.trim() ? parseTable(i.text) : null));
  const sourceKeyByTable = new Map<ParsedTable, string>();
  tables.forEach((t, i) => {
    if (t) sourceKeyByTable.set(t, normalized[i].key);
  });
  const valid = tables.filter(
    (t): t is ParsedTable => t !== null && t.rows.length > 0,
  );

  if (valid.length === 0) {
    return { merged: null, tables };
  }

  const headerOrder: string[] = ["Tanggal"];
  // Map normalized-key -> display header
  const keyToDisplay = new Map<string, string>([["tanggal", "Tanggal"]]);
  // Map display header -> the original (raw) header on the owning table
  const ownerOriginalHeader = new Map<string, string>();
  // Map display header -> the table that first introduced it
  const ownerTable = new Map<string, ParsedTable>();

  for (const table of valid) {
    const sk = sourceKeyByTable.get(table);
    for (const h of table.headers) {
      if (isDateHeader(h)) continue;
      const renamed = renameForContext(h, table, sk);
      const key = normalizeHeader(renamed);
      if (!keyToDisplay.has(key)) {
        keyToDisplay.set(key, renamed);
        headerOrder.push(renamed);
        ownerOriginalHeader.set(renamed, h);
        ownerTable.set(renamed, table);
      }
    }
  }

  const dateMap = new Map<string, MergedRow>();
  const totalRow: MergedRow = { Tanggal: "TOTAL", __isTotal: "1" };
  let hasTotal = false;

  for (const table of valid) {
    const sk = sourceKeyByTable.get(table);
    const dateHeader = table.headers.find((h) => isDateHeader(h)) ?? table.headers[0];
    for (const row of table.rows) {
      const rawDate = row[dateHeader];
      if (!rawDate) continue;
      const date = normalizeDate(rawDate);
      if (!date) continue;

      let target = dateMap.get(date);
      if (!target) {
        target = { Tanggal: date };
        dateMap.set(date, target);
      }
      for (const h of table.headers) {
        if (isDateHeader(h)) continue;
        const renamed = renameForContext(h, table, sk);
        const display = keyToDisplay.get(normalizeHeader(renamed)) ?? renamed;
        const value = row[h];
        if (value !== undefined && value !== "") {
          if (!target[display]) {
            target[display] = value;
          }
        }
      }
    }

    if (table.total) hasTotal = true;
  }

  // Fill TOTAL row by falling back across all sources.
  // For each column, take the first non-empty value from any source's TOTAL.
  // The owning source is tried first, then others. This way columns like
  // Gain (no /data total) can be filled from /rcm's Gain% total.
  if (hasTotal) {
    for (const display of headerOrder) {
      if (display === "Tanggal") continue;
      const ordered: ParsedTable[] = [];
      const owner = ownerTable.get(display);
      if (owner) ordered.push(owner);
      for (const t of valid) {
        if (t !== owner) ordered.push(t);
      }
      for (const t of ordered) {
        if (!t.total) continue;
        const tsk = sourceKeyByTable.get(t);
        const origH = t.headers.find((h) => {
          if (isDateHeader(h)) return false;
          const renamed = renameForContext(h, t, tsk);
          return keyToDisplay.get(normalizeHeader(renamed)) === display;
        });
        if (!origH) continue;
        const v = t.total[origH];
        if (v !== undefined && v !== "") {
          totalRow[display] = v;
          break;
        }
      }
    }
  }

  const sortedRows = Array.from(dateMap.values()).sort((a, b) => {
    const [da, ma, ya] = (a.Tanggal ?? "").split("-").map(Number);
    const [db, mb, yb] = (b.Tanggal ?? "").split("-").map(Number);
    const ta = new Date(ya || 0, (ma || 1) - 1, da || 1).getTime();
    const tb = new Date(yb || 0, (mb || 1) - 1, db || 1).getTime();
    return tb - ta;
  });

  if (hasTotal) sortedRows.push(totalRow);

  const matchedDates = sortedRows.filter((r) => {
    if (r.__isTotal) return false;
    let count = 0;
    for (const t of valid) {
      const dateHeader = t.headers.find((h) => isDateHeader(h)) ?? t.headers[0];
      if (t.rows.some((row) => normalizeDate(row[dateHeader] ?? "") === r.Tanggal)) {
        count++;
      }
    }
    return count >= 2;
  }).length;

  return {
    merged: {
      headers: headerOrder,
      rows: sortedRows,
      sourceCount: valid.length,
      matchedDates,
    },
    tables,
  };
};

const cellOf = (r: MergedRow, h: string): string => formatCell(h, r[h] ?? "");

export const mergedToText = (merged: MergedTable): string => {
  const widths = merged.headers.map((h) =>
    Math.max(h.length, ...merged.rows.map((r) => cellOf(r, h).length)),
  );

  const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - s.length));

  const headerLine = merged.headers.map((h, i) => pad(h, widths[i])).join("  ");
  const sep = widths.map((w) => "-".repeat(w)).join("  ");
  const dataLines = merged.rows.map((r) =>
    merged.headers.map((h, i) => pad(cellOf(r, h), widths[i])).join("  "),
  );

  return [headerLine, sep, ...dataLines].join("\n");
};

export const mergedToCSV = (merged: MergedTable): string => {
  const escape = (s: string) => {
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [merged.headers.map(escape).join(",")];
  for (const row of merged.rows) {
    lines.push(merged.headers.map((h) => escape(cellOf(row, h))).join(","));
  }
  return lines.join("\n");
};
