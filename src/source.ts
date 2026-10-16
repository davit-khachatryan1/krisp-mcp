// Decides WHERE the CSV text comes from. Parsing and cleaning happen in loader.ts.
//
//   source empty            -> config/sources.json "default_sources", tried in order
//                              (data/leads.csv, then the team Google Sheet)
//   source "new_leads.csv"  -> that file in the data folder (file names only)
//   source Google Sheets URL -> the sheet's CSV export
//
// Nothing is cached: every tool call reads the file / fetches the sheet again.
// To support another place (CRM, Excel, a database), add a reader here that returns
// { text, sourceLabel }; loader, scoring and drafting stay the same.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { loadDefaultSources, PROJECT_ROOT } from "./config.js";

export interface SourceResult {
  text: string;
  sourceLabel: string; // file name or sheet id, shown in the find_leads summary
  skipped: string[];   // default sources that could not be read, with the reason
}

interface ReadOptions {
  dataDir?: string;
  timeoutMs?: number;
  defaults?: string[]; // tests pass their own list; normally config/sources.json
}

const FETCH_TIMEOUT_MS = 10_000;
const NOT_SHARED =
  "The sheet is not shared. Set sharing to 'Anyone with the link can view', or use a local CSV.";

/** Data folder: env LEADS_DIR (relative = from the project root) or <project root>/data. */
export function getDataDir(): string {
  return path.resolve(PROJECT_ROOT, process.env.LEADS_DIR || "data");
}

export async function readSource(source?: string, opts: ReadOptions = {}): Promise<SourceResult> {
  const value = (source ?? "").trim();
  if (value) return { ...(await readOne(value, opts)), skipped: [] }; // an explicit source never falls back

  // No source given: the first default that can be read wins; the others are reported, not hidden.
  const skipped: string[] = [];
  for (const candidate of opts.defaults ?? loadDefaultSources()) {
    try {
      return { ...(await readOne(candidate, opts)), skipped };
    } catch (err) {
      skipped.push(`${candidate}: ${(err as Error).message}`);
    }
  }
  throw new Error(
    `None of the default sources (config/sources.json) could be read:\n- ${skipped.join("\n- ")}\n` +
      "Add data/leads.csv, fix config/sources.json, or pass a source.",
  );
}

/** One source: a Google Sheets link or a .csv file name in the data folder. */
async function readOne(value: string, opts: ReadOptions): Promise<Omit<SourceResult, "skipped">> {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    const sheet = toSheetExportUrl(value);
    const text = await fetchSheet(sheet.exportUrl, opts.timeoutMs ?? FETCH_TIMEOUT_MS);
    return { text, sourceLabel: `Google Sheet ${sheet.sheetId} (${sheet.gid ? `gid ${sheet.gid}` : "first tab"})` };
  }

  const filePath = resolveLocalFile(value, opts.dataDir ?? getDataDir());
  return { text: decodeBytes(readFileSync(filePath)), sourceLabel: value };
}

/** Accepts only a .csv file name that sits directly in the data folder. */
export function resolveLocalFile(name: string, dataDir: string): string {
  const dir = path.resolve(dataDir);
  if (path.isAbsolute(name)) {
    throw new Error(`'${name}' is an absolute path. Pass only a file name inside the data folder (${dir}).`);
  }
  const fullPath = path.resolve(dir, name);
  if (path.dirname(fullPath) !== dir) {
    throw new Error(`'${name}' is outside the data folder. Pass only a file name inside ${dir}.`);
  }
  if (path.extname(fullPath).toLowerCase() !== ".csv") {
    throw new Error(`'${name}' is not a .csv file. Only .csv files are accepted.`);
  }
  if (!existsSync(fullPath)) {
    const available = existsSync(dir)
      ? readdirSync(dir).filter((file) => file.toLowerCase().endsWith(".csv")).sort()
      : [];
    const hint = available.length > 0
      ? `Available files: ${available.join(", ")}.`
      : "There are no .csv files there yet – add one first.";
    throw new Error(`File '${name}' not found in the data folder (${dir}). ${hint}`);
  }
  return fullPath;
}

/**
 * Turns any Google Sheets link into its CSV export URL.
 * Only the sheet id and gid are taken from the input; the URL we fetch is always built here,
 * so the server can never be pointed at an arbitrary address.
 */
export function toSheetExportUrl(link: string): { exportUrl: string; sheetId: string; gid: string | null } {
  const onlySheets = `Only Google Sheets links are accepted (https://docs.google.com/spreadsheets/d/<ID>/...), got '${link}'.`;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new Error(onlySheets);
  }
  const match = url.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (url.protocol !== "https:" || url.host !== "docs.google.com" || !match) {
    throw new Error(onlySheets);
  }
  if (match[1] === "e") {
    throw new Error("'Publish to web' links (/spreadsheets/d/e/...) are not supported. Use the normal share link of the sheet.");
  }
  const sheetId = match[1];
  // No gid -> no gid parameter: Google then exports the first tab. (Do not default to gid=0:
  // in imported sheets the first tab has another id and gid=0 returns HTTP 400.)
  const rawGid = new URLSearchParams(url.hash.slice(1)).get("gid") ?? url.searchParams.get("gid");
  const gid = rawGid && /^\d+$/.test(rawGid) ? rawGid : null;
  return {
    exportUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gid ? `&gid=${gid}` : ""}`,
    sheetId,
    gid,
  };
}

/** Fetches the export CSV. Google answers with a redirect to googleusercontent.com, so redirects are followed. */
export async function fetchSheet(exportUrl: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs); // covers the response AND the body
  let response: Response;
  let bytes: Uint8Array;
  try {
    response = await fetch(exportUrl, { signal: controller.signal, redirect: "follow" });
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(
        `Timed out after ${timeoutMs / 1000} s fetching the Google Sheet. Check your connection, or put the CSV in the data folder and use that file instead.`,
      );
    }
    throw new Error(
      `Could not reach Google Sheets (${(err as Error).message}). Check your connection, or put the CSV in the data folder and use that file instead.`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 || response.status === 403) throw new Error(NOT_SHARED);
  if (!response.ok) {
    throw new Error(`Google Sheets returned HTTP ${response.status}. Check the link, or use a local CSV.`);
  }
  const text = decodeBytes(bytes);
  // A private sheet redirects to the Google sign-in page: HTML instead of CSV.
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/html") || text.trimStart().startsWith("<")) throw new Error(NOT_SHARED);
  return text;
}

/** UTF-8 first; if the bytes are not valid UTF-8 (e.g. an old Excel export), fall back to latin1. */
export function decodeBytes(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("latin1").decode(bytes);
  }
}
