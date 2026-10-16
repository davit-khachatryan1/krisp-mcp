import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadConfig, loadDefaultSources } from "../src/config.js";
import { loadLeads } from "../src/loader.js";
import { readSource, resolveLocalFile, toSheetExportUrl } from "../src/source.js";

const SHEET_ID = "1AbC_dEf-123";
const HEADER_ONLY_CSV = "lead_id,first_name,last_name,title,company,industry,headcount,country,email\n";

describe("local files: only .csv names inside the data folder", () => {
  let dataDir: string;
  beforeAll(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "krisp-data-"));
    writeFileSync(path.join(dataDir, "a.csv"), ""); // empty files: only the names matter here
    writeFileSync(path.join(dataDir, "b.csv"), "");
  });
  afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

  it("resolves a plain file name", () => {
    expect(resolveLocalFile("a.csv", dataDir)).toBe(path.join(dataDir, "a.csv"));
  });

  it("rejects paths that leave the data folder", () => {
    expect(() => resolveLocalFile("../package.json", dataDir)).toThrow(/outside the data folder/);
    expect(() => resolveLocalFile("../x.csv", dataDir)).toThrow(/outside the data folder/);
  });

  it("rejects absolute paths", () => {
    expect(() => resolveLocalFile(path.join(dataDir, "a.csv"), dataDir)).toThrow(/absolute path/);
  });

  it("rejects non-.csv files", () => {
    expect(() => resolveLocalFile("notes.txt", dataDir)).toThrow(/not a \.csv file/);
  });

  it("lists the available files when the name is unknown", () => {
    expect(() => resolveLocalFile("missing.csv", dataDir)).toThrow(/not found.*Available files: a\.csv, b\.csv/);
  });
});

describe("Google Sheets links -> CSV export URL", () => {
  it("keeps the gid from the #gid= fragment", () => {
    const sheet = toSheetExportUrl(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=123`);
    expect(sheet).toEqual({
      exportUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=123`,
      sheetId: SHEET_ID,
      gid: "123",
    });
  });

  it("without a gid, exports the first tab (no gid=0: imported sheets answer 400 to it)", () => {
    expect(toSheetExportUrl(`https://docs.google.com/spreadsheets/d/${SHEET_ID}`)).toEqual({
      exportUrl: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`,
      sheetId: SHEET_ID,
      gid: null,
    });
  });

  it("handles /edit?usp=sharing links", () => {
    const sheet = toSheetExportUrl(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?usp=sharing`);
    expect(sheet.exportUrl).toBe(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`);
  });

  it("rejects any other URL", () => {
    expect(() => toSheetExportUrl("https://example.com/x.csv")).toThrow(/Only Google Sheets links/);
    expect(() => toSheetExportUrl(`http://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`)).toThrow(/Only Google Sheets links/);
    expect(() => toSheetExportUrl(`https://docs.google.com.evil.io/spreadsheets/d/${SHEET_ID}`)).toThrow(/Only Google Sheets links/);
    expect(() => toSheetExportUrl("https://docs.google.com/document/d/abc/edit")).toThrow(/Only Google Sheets links/);
  });

  it("readSource never fetches a non-Google URL", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(readSource("https://example.com/x.csv")).rejects.toThrow(/Only Google Sheets links/);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("fetching a sheet (fetch is mocked – no real network)", () => {
  const link = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=7`;
  afterEach(() => vi.unstubAllGlobals());

  it("returns the CSV text, which the loader can parse", async () => {
    const fetchMock = vi.fn(async () => new Response(HEADER_ONLY_CSV, { headers: { "content-type": "text/csv" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await readSource(link);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=7`,
      expect.anything(),
    );
    expect(result).toEqual({ text: HEADER_ONLY_CSV, sourceLabel: `Google Sheet ${SHEET_ID} (gid 7)`, skipped: [] });
    const { report } = loadLeads(result.text, loadConfig());
    expect(report.columnsMapped.email).toBe("email");
    expect(report.columnsMissing).toEqual([]);
  });

  it("403 -> 'not shared'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 403 })));
    await expect(readSource(link)).rejects.toThrow(/The sheet is not shared/);
  });

  it("HTML sign-in page -> 'not shared'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<!DOCTYPE html><html>Sign in</html>", { status: 200 })));
    await expect(readSource(link)).rejects.toThrow(/The sheet is not shared/);
  });

  it("times out instead of hanging", async () => {
    const neverAnswers = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    vi.stubGlobal("fetch", vi.fn(neverAnswers));
    await expect(readSource(link, { timeoutMs: 20 })).rejects.toThrow(/Timed out after .*data folder/);
  });

  it("network error -> says so and suggests a local CSV", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(readSource(link)).rejects.toThrow(/Could not reach Google Sheets \(fetch failed\).*data folder/);
  });
});

describe("default sources when no source is given (config/sources.json order)", () => {
  const sheetLink = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit`;
  const defaults = ["leads.csv", sheetLink];
  let withFile: string;
  let empty: string;
  beforeAll(() => {
    withFile = mkdtempSync(path.join(os.tmpdir(), "krisp-with-file-"));
    writeFileSync(path.join(withFile, "leads.csv"), HEADER_ONLY_CSV);
    empty = mkdtempSync(path.join(os.tmpdir(), "krisp-empty-"));
  });
  afterAll(() => {
    rmSync(withFile, { recursive: true, force: true });
    rmSync(empty, { recursive: true, force: true });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("uses data/leads.csv first and never touches the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await readSource(undefined, { dataDir: withFile, defaults });
    expect(result).toMatchObject({ sourceLabel: "leads.csv", skipped: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to the sheet when leads.csv is missing, and says so", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(HEADER_ONLY_CSV, { headers: { "content-type": "text/csv" } })));
    const result = await readSource("", { dataDir: empty, defaults });
    expect(result.sourceLabel).toBe(`Google Sheet ${SHEET_ID} (first tab)`);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toMatch(/^leads\.csv: File 'leads\.csv' not found/);
  });

  it("lists every attempt when no default can be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("denied", { status: 403 })));
    await expect(readSource(undefined, { dataDir: empty, defaults })).rejects.toThrow(
      /None of the default sources[\s\S]*leads\.csv: File 'leads\.csv' not found[\s\S]*The sheet is not shared/,
    );
  });

  it("an explicit source never falls back", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(readSource("missing.csv", { dataDir: withFile, defaults })).rejects.toThrow(/not found/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("config: leads.csv first, then a Google Sheet; only leads.csv when the file is absent", () => {
    const configured = loadDefaultSources();
    expect(configured[0]).toBe("leads.csv");
    expect(configured[1]).toMatch(/^https:\/\/docs\.google\.com\/spreadsheets\/d\//);
    expect(loadDefaultSources("config/does-not-exist.json")).toEqual(["leads.csv"]);
  });
});
