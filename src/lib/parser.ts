export type ParsedRow = Record<string, string> & { __isTotal?: string };
export type ParsedTable = {
  headers: string[];
  rows: ParsedRow[];
  total?: ParsedRow;
  rawTitle?: string;
};

const DATE_REGEX = /\b\d{2}-\d{2}-\d{4}\b/;
const SEPARATOR_LINE = /^[\s━─\-=_*+]{4,}$/;
const HEADER_KEYWORDS = ["date", "tanggal", "tgl"];

const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{1F100}-\u{1F1FF}\u{2700}-\u{27BF}\u{FE0F}\u{200D}\u{20E3}\u{1F900}-\u{1F9FF}]/gu;

const stripEmoji = (s: string): string =>
  s.replace(EMOJI_RE, "").replace(/[‼❗❕]/g, "");

const isEmojiOnly = (s: string): boolean =>
  s.length > 0 && stripEmoji(s).replace(/[‼❗❕]/g, "").trim().length === 0;

const stripLeadingEmoji = (s: string): string => {
  const re =
    /^[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{1F100}-\u{1F1FF}\u{2700}-\u{27BF}\u{FE0F}\u{200D}\u{20E3}\u{1F900}-\u{1F9FF}]+/u;
  return s.replace(re, "");
};

const cleanCell = (s: string): string =>
  stripEmoji(s).replace(/\s+/g, " ").trim();

const splitHeaderCells = (line: string): string[] => {
  const stripped = stripEmoji(line);
  if (stripped.includes("|")) {
    return stripped
      .split("|")
      .map((c) => cleanCell(c))
      .filter((c) => c.length > 0);
  }
  return stripped
    .split(/\s{2,}/)
    .map((c) => cleanCell(c))
    .filter((c) => c.length > 0);
};

type Token = { value: string; start: number };

// Tokenize a line preserving emojis attached to values.
// Behaviour:
//  - Whitespace-separated tokens are extracted from the original (un-stripped) line.
//  - Standalone emoji-only tokens are merged into the previous token's value
//    (e.g. "-3M 🔴 12M" → ["-3M🔴" @ pos, "12M" @ pos]).
//  - Leading decorator emojis are stripped from a token (e.g. "🗓27-04-2026" → "27-04-2026").
//  - Standalone emoji at the very start (no previous token) is dropped.
// Split a token like "170-14.57" or "234-14.60" into ["170", "-14.57"] when
// two numbers are stuck together with a sign. Skip dates ("27-04-2026") and
// already-signed leading values ("-3M🔴" stays whole).
const splitStuckSignedNumbers = (tok: Token): Token[] => {
  if (DATE_REGEX.test(tok.value)) return [tok];
  // Match: leading unsigned number (optionally with suffix), then a sign,
  // then another number. Only split once.
  const m = tok.value.match(
    /^(\d+(?:\.\d+)?[A-Za-z%]*)([+\-]\d+(?:\.\d+)?.*)$/,
  );
  if (!m) return [tok];
  return [
    { value: m[1], start: tok.start },
    { value: m[2], start: tok.start + m[1].length },
  ];
};

const tokenizeWithPos = (line: string): Token[] => {
  const raw: Token[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    raw.push({ value: m[0], start: m.index });
  }
  const result: Token[] = [];
  for (const t of raw) {
    if (isEmojiOnly(t.value)) {
      if (result.length > 0) {
        const prev = result[result.length - 1];
        prev.value = prev.value + t.value;
      }
      // else: standalone emoji at start, drop
      continue;
    }
    const cleaned = stripLeadingEmoji(t.value);
    const startShift = t.value.length - cleaned.length;
    if (cleaned.length === 0) continue;
    const base: Token = { value: cleaned, start: t.start + startShift };
    for (const sub of splitStuckSignedNumbers(base)) {
      result.push(sub);
    }
  }
  return result;
};

const splitDataCells = (line: string, columnCount: number): string[] => {
  // Replace pipes with space so they act as separators
  const normalized = line.replace(/\|/g, " ");
  const toks = tokenizeWithPos(normalized);
  if (toks.length === 0 || columnCount <= 0) return [];
  const tokens = toks.map((t) => t.value);

  if (tokens.length <= columnCount) return tokens;

  const cells: string[] = tokens.slice(0, columnCount - 1);
  const tail = tokens.slice(columnCount - 1).join(" ");
  cells.push(tail);
  return cells;
};

const isJunkLine = (line: string): boolean => {
  const stripped = stripEmoji(line).trim();
  if (stripped.length === 0) return true;
  if (stripped.startsWith("/")) return true;
  if (/^berikut adalah/i.test(stripped)) return true;
  if (/^halo\b/i.test(stripped)) return true;
  if (/^dari\s+tanggal\b/i.test(stripped)) return true;
  if (/wib\.?$/i.test(stripped)) return true;
  if (/^copy$/i.test(stripped)) return true;
  if (/^[+\-=]\s*$/.test(stripped)) return true;
  return false;
};

const looksLikeHeader = (line: string): boolean => {
  const stripped = stripEmoji(line).toLowerCase().trim();
  if (DATE_REGEX.test(stripped)) return false;
  if (isJunkLine(line)) return false;
  return HEADER_KEYWORDS.some((k) => {
    const re = new RegExp(`(^|[\\s|])${k}([\\s|]|$)`, "i");
    return re.test(stripped);
  });
};

const isTotalLine = (line: string): boolean => {
  const stripped = stripEmoji(line).trim();
  if (DATE_REGEX.test(stripped)) return false;
  if (/^total/i.test(stripped)) return true;
  // Indented numeric-only line (RCM total style: "  113x  382  -1.52  ...")
  const tokens = stripped.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length < 3) return false;
  const numericTokens = tokens.filter((t) => /\d/.test(t)).length;
  return numericTokens >= Math.max(2, Math.floor(tokens.length * 0.6));
};

export const parseTable = (input: string): ParsedTable | null => {
  const allLines = input
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0);

  if (allLines.length === 0) return null;

  let title: string | undefined;
  for (const l of allLines.slice(0, 6)) {
    const stripped = stripEmoji(l).trim();
    if (stripped.startsWith("/")) {
      title = stripped.replace(/^\//, "").trim().split(/\s+/)[0];
      break;
    }
    const m = /berikut adalah\s+(.+)$/i.exec(stripped);
    if (m) {
      title = m[1].replace(/[:\-]+$/, "").trim();
      break;
    }
  }

  let headerIdx = -1;
  for (let i = 0; i < allLines.length; i++) {
    if (looksLikeHeader(allLines[i])) {
      headerIdx = i;
      break;
    }
  }

  let headers: string[] = [];
  let dataStart = 0;

  if (headerIdx >= 0) {
    headers = splitHeaderCells(allLines[headerIdx]);
    dataStart = headerIdx + 1;
    while (
      dataStart < allLines.length &&
      (SEPARATOR_LINE.test(allLines[dataStart].trim()) ||
        isJunkLine(allLines[dataStart]))
    ) {
      dataStart++;
    }
  } else {
    const firstDataIdx = allLines.findIndex(
      (l) => DATE_REGEX.test(l) && !isJunkLine(l),
    );
    if (firstDataIdx === -1) return null;
    dataStart = firstDataIdx;
    const sample = stripEmoji(allLines[firstDataIdx])
      .split(/\s+/)
      .filter((t) => t.length > 0);
    headers = sample.map((_, i) => (i === 0 ? "Date" : `Col${i}`));
  }

  if (headers.length === 0) return null;

  const dateCol = headers.findIndex((h) =>
    HEADER_KEYWORDS.includes(stripEmoji(h).toLowerCase().trim()),
  );
  const dateHeaderIdx = dateCol >= 0 ? dateCol : 0;

  for (let i = 0; i < headers.length; i++) {
    headers[i] = stripEmoji(headers[i]).trim();
  }

  const rows: ParsedRow[] = [];
  let totalLine: string | null = null;
  let firstDataLine: string | null = null;

  for (let i = dataStart; i < allLines.length; i++) {
    const line = allLines[i];
    const trimmed = line.trim();
    if (SEPARATOR_LINE.test(trimmed)) continue;
    if (isJunkLine(line)) continue;

    if (DATE_REGEX.test(line)) {
      if (firstDataLine === null) {
        firstDataLine = line;
      }
      const cells = splitDataCells(line, headers.length);
      if (cells.length === 0) continue;

      const row: ParsedRow = {};
      for (let h = 0; h < headers.length && h < cells.length; h++) {
        row[headers[h]] = cells[h];
      }
      if (
        !row[headers[dateHeaderIdx]] ||
        !DATE_REGEX.test(row[headers[dateHeaderIdx]])
      ) {
        const anyDate = line.match(DATE_REGEX);
        if (anyDate) row[headers[dateHeaderIdx]] = anyDate[0];
        else continue;
      }
      rows.push(row);
    } else if (isTotalLine(line) && totalLine === null) {
      totalLine = line;
    }
  }

  let total: ParsedRow | undefined;
  if (totalLine && firstDataLine) {
    total = buildTotalRow(totalLine, firstDataLine, headers, dateHeaderIdx);
  }

  return { headers, rows, total, rawTitle: title };
};

const buildTotalRow = (
  totalLine: string,
  dataLine: string,
  headers: string[],
  dateHeaderIdx: number,
): ParsedRow => {
  const dataTokens = tokenizeWithPos(dataLine);
  const colPositions = dataTokens
    .slice(0, headers.length)
    .map((t) => t.start);
  // If data has fewer tokens than headers (unlikely), pad with last position
  while (colPositions.length < headers.length) {
    colPositions.push(
      colPositions.length > 0 ? colPositions[colPositions.length - 1] : 0,
    );
  }

  // Replace leading "TOTAL" prefix (with possible emoji decorators, colons,
  // and whitespace) with same-length spaces to preserve alignment.
  // Pattern: "TOTAL" followed by anything that is NOT a value-start char
  // (digits, +/-, or alphabetic value chars). This consumes "TOTAL✍️ : ".
  const totalStr = totalLine.replace(
    /^(\s*total[^\d+\-A-Za-z]*)/i,
    (m) => " ".repeat(m.length),
  );
  let totalTokens = tokenizeWithPos(totalStr);

  // Collapse consecutive alphabetic-only tokens (e.g. "Big" + "Accum🔥"
  // → "Big Accum🔥") so multi-word last-column values stay intact.
  const collapsed: Token[] = [];
  for (const t of totalTokens) {
    const isAlpha = !/\d/.test(t.value) && /[a-zA-Z]/.test(t.value);
    const prev = collapsed[collapsed.length - 1];
    const prevAlpha =
      prev && !/\d/.test(prev.value) && /[a-zA-Z]/.test(prev.value);
    if (isAlpha && prevAlpha) {
      prev.value = prev.value + " " + t.value;
    } else {
      collapsed.push({ value: t.value, start: t.start });
    }
  }
  totalTokens = collapsed;

  const row: ParsedRow = { __isTotal: "1" };
  row[headers[dateHeaderIdx]] = "TOTAL";

  // Compute center positions of data tokens for better alignment
  const dataCenters = dataTokens.slice(0, headers.length).map(
    (t) => t.start + t.value.length / 2,
  );
  // If data row has more tokens than headers, extend the LAST column's center
  // to span all trailing tokens (e.g. "Big Accum" multi-word last column)
  if (dataTokens.length > headers.length && dataCenters.length > 0) {
    const lastTok = dataTokens[headers.length - 1];
    const tailEnd =
      dataTokens[dataTokens.length - 1].start +
      dataTokens[dataTokens.length - 1].value.length;
    dataCenters[dataCenters.length - 1] = (lastTok.start + tailEnd) / 2;
  }
  while (dataCenters.length < headers.length) {
    dataCenters.push(
      dataCenters.length > 0 ? dataCenters[dataCenters.length - 1] : 0,
    );
  }

  let minCol = 0;
  for (const tok of totalTokens) {
    const tokCenter = tok.start + tok.value.length / 2;
    let bestCol = -1;
    let bestDist = Infinity;
    for (let c = minCol; c < dataCenters.length; c++) {
      if (c === dateHeaderIdx) continue;
      const d = Math.abs(tokCenter - dataCenters[c]);
      // Prefer later column on tie (totals tend to be right-aligned)
      if (d <= bestDist) {
        bestDist = d;
        bestCol = c;
      }
    }
    if (bestCol === -1) bestCol = dataCenters.length - 1;
    const colName = headers[bestCol];
    row[colName] = row[colName] ? row[colName] + " " + tok.value : tok.value;
    minCol = bestCol;
  }

  return row;
};

export const normalizeDate = (s: string): string => {
  const m = s.match(DATE_REGEX);
  return m ? m[0] : s;
};

export const normalizeHeader = (h: string): string =>
  stripEmoji(h)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9+/-]/g, "");
