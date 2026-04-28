import { Copy, Download, FileSpreadsheet, Check } from "lucide-react";
import { useState } from "react";
import type { MergedTable } from "@/lib/merger";
import { mergedToText, mergedToCSV } from "@/lib/merger";
import { cellTone, toneClass, formatCell } from "@/lib/format";

type Props = {
  merged: MergedTable;
  symbol: string;
};

export function ResultTable({ merged, symbol }: Props) {
  const [copied, setCopied] = useState<"text" | "csv" | null>(null);

  const handleCopy = async (kind: "text" | "csv") => {
    const text = kind === "csv" ? mergedToCSV(merged) : mergedToText(merged);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1600);
    }
  };

  const handleDownload = () => {
    const csv = mergedToCSV(merged);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${symbol || "merged"}-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const dataRows = merged.rows.filter((r) => !r.__isTotal);
  const candleLabel = `${dataRows.length} candle`;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border bg-gradient-to-r from-emerald-500/5 to-transparent">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <h2 className="text-lg font-semibold text-emerald-400">
            Hasil Gabungan
          </h2>
          {symbol && (
            <span className="text-lg font-semibold text-foreground">— {symbol}</span>
          )}
          <span className="text-xs text-muted-foreground">
            ({candleLabel})
          </span>
          <span className="text-xs text-muted-foreground">
            · {dataRows.length} baris
          </span>
          <span className="text-xs text-muted-foreground">
            · {merged.sourceCount} sumber
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleCopy("text")}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-muted hover:bg-muted/70 text-foreground transition-colors"
          >
            {copied === "text" ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" /> Tersalin
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> Salin teks
              </>
            )}
          </button>
          <button
            onClick={() => handleCopy("csv")}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md bg-muted hover:bg-muted/70 text-foreground transition-colors"
          >
            {copied === "csv" ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" /> Tersalin
              </>
            ) : (
              <>
                <FileSpreadsheet className="h-3.5 w-3.5" /> Salin CSV
              </>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-emerald-950 transition-colors"
          >
            <Download className="h-3.5 w-3.5" /> Unduh CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs md:text-[13px] table-auto">
          <thead>
            <tr className="text-left text-[10px] md:text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/30">
              {merged.headers.map((h) => {
                const isKet = h.toLowerCase().startsWith("ket");
                return (
                  <th
                    key={h}
                    className={`px-2 py-2 font-medium border-b border-border ${
                      isKet ? "whitespace-normal leading-tight" : "whitespace-nowrap"
                    }`}
                  >
                    {h}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {merged.rows.map((row, i) => {
              const isTotal = !!row.__isTotal;
              return (
                <tr
                  key={`${row.Tanggal}-${i}`}
                  className={
                    isTotal
                      ? "border-t-2 border-amber-400/60 bg-amber-500/10 font-semibold"
                      : "border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors"
                  }
                >
                  {merged.headers.map((h) => {
                    const rawValue = row[h] ?? "";
                    const value = formatCell(h, rawValue);
                    const tone = cellTone(h, value);
                    const isFirst = h === "Tanggal";
                    const isKet = h.toLowerCase().startsWith("ket");
                    return (
                      <td
                        key={h}
                        className={`px-2 py-1.5 font-mono text-[12px] md:text-[13px] ${
                          isKet ? "whitespace-normal leading-tight" : "whitespace-nowrap"
                        } ${isTotal ? "text-amber-100" : toneClass(tone)} ${
                          isFirst
                            ? isTotal
                              ? "font-bold text-amber-300 tracking-wider"
                              : "font-semibold text-foreground"
                            : ""
                        }`}
                      >
                        {value || <span className={isTotal ? "text-amber-200/30" : "text-muted-foreground/40"}>—</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {merged.rows.length === 0 && (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">
          Tidak ada baris yang cocok untuk digabungkan.
        </div>
      )}
    </div>
  );
}
