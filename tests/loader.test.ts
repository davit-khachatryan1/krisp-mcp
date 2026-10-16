import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { isValidEmail, loadLeads, normalizeCompany, normalizeHeader, parseHeadcount } from "../src/loader.js";
import { hasLeads, LEADS_CSV, leadsTitle, readCsv } from "./helpers.js";

const config = loadConfig();

describe("parseHeadcount", () => {
  it.each([
    ["1400", 1400],
    ["1,400", 1400],
    ["1.4k", 1400],
    ["51-200", 125],
    ["200+", 200],
    ["", null],
    ["n/a", null],
  ])("%j -> %j", (raw, expected) => {
    expect(parseHeadcount(raw)).toBe(expected);
  });
});

describe("normalizers", () => {
  it("company names with legal suffixes map to one key", () => {
    for (const name of ["Acme Cloud Inc.", "Acme Cloud", "Acme Cloud GmbH"]) {
      expect(normalizeCompany(name)).toBe("acme cloud");
    }
  });

  it("headers", () => {
    expect(normalizeHeader("Job Title")).toBe("job_title");
    expect(normalizeHeader(" E-mail ")).toBe("e_mail");
  });

  it("email needs a TLD", () => {
    expect(isValidEmail("grace.taylor@orbitfintech")).toBe(false);
    expect(isValidEmail("grace.taylor@orbitfintech.com")).toBe(true);
  });
});

describe("header mapping (header-only CSV strings, no lead data)", () => {
  it("maps aliases such as 'Job Title' and picks the delimiter", () => {
    const { report } = loadLeads("\uFEFFLead ID;Name;Job Title;Organization;E-mail\n", config);
    expect(report.delimiter).toBe(";");
    expect(report.columnsMapped).toMatchObject({
      lead_id: "Lead ID", full_name: "Name", title: "Job Title", company: "Organization", email: "E-mail",
    });
    expect(report.columnsMissing).toEqual(["first_name", "last_name", "industry", "headcount", "country"]);
  });

  it("an empty header becomes lead_id when there is no lead_id column (blank A1 in a sheet)", () => {
    const { report } = loadLeads(",first_name,company,email,,\n", config);
    expect(report.columnsMapped.lead_id).toBe("(empty header)");
    expect(report.columnsMissing).not.toContain("lead_id");
    expect(report.unrecognizedHeaders).toEqual([]); // trailing blank columns are not "unrecognized"
  });

  it("a real lead_id column wins over an empty header", () => {
    const { report } = loadLeads("lead_id,,company,email\n", config);
    expect(report.columnsMapped.lead_id).toBe("lead_id");
  });

  it("missing email/company column -> clear error", () => {
    expect(() => loadLeads("name,title\n", config)).toThrow(/Required column.*email, company.*column_aliases/);
  });
});

describe.skipIf(!hasLeads)(leadsTitle("data/leads.csv"), () => {
  it("loads 50 rows with comma delimiter", () => {
    const { leads, report } = loadLeads(readCsv(LEADS_CSV), config);
    expect(report.delimiter).toBe(",");
    expect(leads).toHaveLength(50);
  });
});

