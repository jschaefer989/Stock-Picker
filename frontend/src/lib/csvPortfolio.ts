import Papa from "papaparse";

import type { HoldingIn } from "@/lib/types";

const REQUIRED_HEADERS = [
  "Symbol",
  "Description",
  "Mkt Val (Market Value)",
  "Asset Type",
] as const;

type CsvRow = {
  [key: string]: string | undefined;
};

function cleanCell(value: string | undefined): string {
  return (value ?? "").replace(/^"|"$/g, "").trim();
}

function parseMoney(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw
    .replace(/[$,]/g, "")
    .replace(/[()]/g, "")
    .trim();
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function mapAssetType(raw: string | undefined): HoldingIn["holding_type"] {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (normalized.includes("mutual")) return "mutual_fund";
  if (normalized.includes("stock") || normalized.includes("equity")) return "stock";
  return "etf";
}

function isLikelyHoldingRow(symbol: string, assetType: string): boolean {
  const s = symbol.toUpperCase();
  const a = assetType.toLowerCase();

  if (!s) return false;
  if (s === "POSITIONS TOTAL") return false;
  if (s.includes("CASH & CASH")) return false;
  if (a.includes("cash") || a.includes("money market")) return false;

  // Most tickers are alphanumeric and may include . or - (e.g. BRK.B)
  return /^[A-Z0-9.-]+$/.test(s);
}

export function parsePortfolioCsv(csvText: string): HoldingIn[] {
  // First pass: read raw rows so we can skip account-title preamble rows.
  const raw = Papa.parse<string[]>(csvText, {
    header: false,
    skipEmptyLines: "greedy",
  });

  if (raw.errors.length) {
    throw new Error(`CSV parse error: ${raw.errors[0].message}`);
  }

  const rows = raw.data;
  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map((cell) => cleanCell(cell));
    return REQUIRED_HEADERS.every((required) => normalized.includes(required));
  });

  if (headerIndex < 0) {
    throw new Error("Could not find the CSV header row. Ensure the export includes Symbol, Description, Mkt Val (Market Value), and Asset Type columns.");
  }

  const normalizedCsv = Papa.unparse(rows.slice(headerIndex));
  const result = Papa.parse<CsvRow>(normalizedCsv, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => cleanCell(header),
  });

  if (result.errors.length) {
    throw new Error(`CSV parse error: ${result.errors[0].message}`);
  }

  const headers = result.meta.fields ?? [];
  for (const required of REQUIRED_HEADERS) {
    if (!headers.includes(required)) {
      throw new Error(`Missing required CSV column: ${required}`);
    }
  }

  const holdings: HoldingIn[] = [];
  for (const row of result.data) {
    const ticker = cleanCell(row["Symbol"]).toUpperCase();
    const assetType = cleanCell(row["Asset Type"]);
    const value = parseMoney(row["Mkt Val (Market Value)"]);
    if (!isLikelyHoldingRow(ticker, assetType) || value <= 0) continue;

    holdings.push({
      ticker,
      name: cleanCell(row["Description"]),
      value,
      holding_type: mapAssetType(assetType),
    });
  }

  if (!holdings.length) {
    throw new Error("No valid holdings found in CSV. Ensure Symbol and Market Value are present.");
  }

  return holdings;
}
