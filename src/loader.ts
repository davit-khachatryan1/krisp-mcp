// CSV text -> clean Lead[] + a report of what was mapped.
// Knows nothing about where the text came from (see source.ts) or about scoring.

import { parse } from "csv-parse/sync";
import type { IcpConfig } from "./config.js";
import type { Lead, LoadReport } from "./types.js";

const REQUIRED_FIELDS = ["email", "company"];
const OPTIONAL_FIELDS = [
  "lead_id",
  "first_name",
  "last_name",
  "title",
  "industry",
  "headcount",
  "country",
];
const DELIMITERS = [",", ";", "\t", "|"];
const LEGAL_SUFFIXES = new Set([
  "inc",
  "llc",
  "ltd",
  "limited",
  "gmbh",
  "co",
  "corp",
  "corporation",
  "company",
  "sa",
  "sas",
  "bv",
  "ag",
  "plc",
  "pty",
  "srl",
  "oy",
  "ab",
]);
const EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

export function loadLeads(
  text: string,
  config: IcpConfig,
): { leads: Lead[]; report: LoadReport } {
  const csv = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(csv);
  const rows = parse(csv, {
    delimiter,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: true,
  }) as string[][];
  if (rows.length === 0)
    throw new Error("The CSV is empty – no header row found.");

  const [header, ...dataRows] = rows;
  const { columns, unrecognizedHeaders } = mapHeaders(header, config);

  const missingRequired = REQUIRED_FIELDS.filter(
    (field) => columns[field] === undefined,
  );
  if (missingRequired.length > 0) {
    throw new Error(
      `Required column(s) missing: ${missingRequired.join(", ")}. Headers found: ${header.join(", ")}. ` +
        "If one of them means the same thing, add an alias in config/icp.json → column_aliases.",
    );
  }

  const leads: Lead[] = [];
  for (const row of dataRows) {
    if (row.every((value) => value.trim() === "")) continue;
    const get = (field: string) =>
      columns[field] === undefined ? "" : (row[columns[field]] ?? "").trim();
    const rowNumber = leads.length + 1;

    let firstName = get("first_name");
    let lastName = get("last_name");
    if (columns.first_name === undefined && columns.full_name !== undefined) {
      const [first = "", ...rest] = get("full_name")
        .split(/\s+/)
        .filter(Boolean);
      firstName = first;
      lastName = lastName || rest.join(" ");
    }

    const emailRaw = get("email");
    const email = emailRaw
      .toLowerCase()
      .replace(/^mailto:/, "")
      .replace(/[<>]/g, "")
      .trim();
    const headcountRaw = get("headcount");
    const company = get("company");

    leads.push({
      leadId: get("lead_id") || `ROW${String(rowNumber).padStart(3, "0")}`,
      firstName: fixNameCase(firstName),
      lastName: fixNameCase(lastName),
      title: get("title").replace(/\s+/g, " "),
      company,
      companyKey: normalizeCompany(company),
      industry: get("industry"),
      headcount: parseHeadcount(headcountRaw),
      headcountRaw,
      country: normalizeCountry(get("country"), config.country_aliases),
      email,
      emailRaw,
      domain: email.includes("@")
        ? email.slice(email.lastIndexOf("@") + 1)
        : "",
      rowNumber,
      status: null,
      score: 0,
      reasons: [],
      warnings: [],
      persona: {
        seniority: null,
        function: null,
        authority: 0,
        callRelevance: 0,
      },
      companyFit: {
        industryTier: "unknown",
        industryScore: 0,
        headcountScore: 0,
      },
      regulatedIndustry: false,
    });
  }

  const columnsMapped: Record<string, string> = {};
  for (const [field, index] of Object.entries(columns))
    columnsMapped[field] = header[index] || "(empty header)";

  return {
    leads,
    report: {
      delimiter,
      rows: leads.length,
      columnsMapped,
      columnsMissing: OPTIONAL_FIELDS.filter(
        (field) => columns[field] === undefined,
      ),
      unrecognizedHeaders,
    },
  };
}

/** The delimiter that appears most often in the header line (ties -> comma). */
function detectDelimiter(csv: string): string {
  const headerLine =
    csv.split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
  let best = DELIMITERS[0];
  for (const candidate of DELIMITERS) {
    if (headerLine.split(candidate).length > headerLine.split(best).length)
      best = candidate;
  }
  return best;
}

/** "Job Title" -> "job_title" */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Canonical field -> column index. The first header that matches a field wins. */
function mapHeaders(header: string[], config: IcpConfig) {
  const columns: Record<string, number> = {};
  const unrecognizedHeaders: string[] = [];
  const unnamed: number[] = [];
  header.forEach((name, index) => {
    const normalized = normalizeHeader(name);
    const field = Object.keys(config.column_aliases).find((key) =>
      config.column_aliases[key].includes(normalized),
    );
    if (field && columns[field] === undefined) columns[field] = index;
    else if (name.trim() === "") unnamed.push(index);
    else unrecognizedHeaders.push(name);
  });
  // A column without a header (blank A1 in a sheet, an exported row index) is taken as lead_id
  // when the file has no lead_id column.
  if (columns.lead_id === undefined && unnamed.length > 0)
    columns.lead_id = unnamed[0];
  return { columns, unrecognizedHeaders };
}

/** "1400", "1,400", "1.4k" -> 1400; "51-200" -> 125 (midpoint); "200+" -> 200; "" / "n/a" -> null */
export function parseHeadcount(raw: string): number | null {
  const value = raw.toLowerCase().replace(/[,\s]/g, "");
  const number = "(\\d+(?:\\.\\d+)?k?)";
  const range = value.match(new RegExp(`^${number}[-–]${number}$`));
  if (range) return Math.floor((toNumber(range[1]) + toNumber(range[2])) / 2);
  const single = value.match(new RegExp(`^${number}\\+?$`));
  if (single) return Math.round(toNumber(single[1]));
  return null;
}

function toNumber(value: string): number {
  return value.endsWith("k") ? parseFloat(value) * 1000 : parseFloat(value);
}

/** "Acme Cloud Inc.", "Acme Cloud", "Acme Cloud GmbH" -> "acme cloud" */
export function normalizeCompany(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // "Müller" -> "Muller"
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words[words.length - 1]))
    words.pop();
  return words.join(" ");
}

/** "U.S." -> "u s" -> "United States" via config.country_aliases; unknown values are kept as written. */
export function normalizeCountry(
  raw: string,
  aliases: Record<string, string>,
): string {
  const key = raw
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return aliases[key] ?? raw;
}

/** "JOHN" / "john" -> "John"; mixed case ("McDonald") is left alone. */
function fixNameCase(name: string): string {
  if (name !== name.toLowerCase() && name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(
      /(^|[\s'-])(\p{L})/gu,
      (_, sep: string, letter: string) => sep + letter.toUpperCase(),
    );
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}
