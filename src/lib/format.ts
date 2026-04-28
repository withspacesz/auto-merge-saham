export type CellTone = "neutral" | "positive" | "negative" | "muted";

export const formatCell = (header: string, value: string): string => {
  if (!value) return value;
  const h = header.toLowerCase();
  // Auto-append % to Gain column when missing
  if ((h === "gain" || h === "gain%" || /^gain\b/.test(h)) && /-?\d/.test(value)) {
    if (!value.includes("%")) return value + "%";
  }
  return value;
};

const POSITIVE_KEYWORDS = ["accum", "akumulasi", "buy", "netral_pos"];
const NEGATIVE_KEYWORDS = ["dist", "sell"];

export const cellTone = (header: string, value: string): CellTone => {
  if (!value || value === "-" || value === "0") return "muted";
  const v = value.toLowerCase();
  const h = header.toLowerCase();

  if (h.includes("ket")) {
    if (POSITIVE_KEYWORDS.some((k) => v.includes(k))) return "positive";
    if (NEGATIVE_KEYWORDS.some((k) => v.includes(k))) return "negative";
    return "neutral";
  }

  if (h.includes("gain") || h.includes("mf") || h.includes("nbsa") || h.includes("smart") || h.includes("clean") || h.includes("bad")) {
    if (value.startsWith("+")) return "positive";
    if (value.startsWith("-")) return "negative";
    if (h.includes("bad") && /[1-9]/.test(value)) return "negative";
    return "neutral";
  }

  return "neutral";
};

export const toneClass = (tone: CellTone): string => {
  switch (tone) {
    case "positive":
      return "text-emerald-400";
    case "negative":
      return "text-rose-400";
    case "muted":
      return "text-muted-foreground";
    default:
      return "text-foreground";
  }
};
