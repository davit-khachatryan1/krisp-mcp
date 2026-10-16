import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { loadLeads } from "../src/loader.js";
import { analyze, scoreLead, select } from "../src/scoring.js";
import type { Lead } from "../src/types.js";
import { hasLeads, LEADS_CSV, leadsTitle, readCsv } from "./helpers.js";

const config = loadConfig();
const TOP_10 = ["L001", "L006", "L014", "L044", "L047", "L008", "L017", "L040", "L042", "L003"];
const LEADS_TEXT = hasLeads ? readCsv(LEADS_CSV) : "";
const lines = () => LEADS_TEXT.trimEnd().split(/\r?\n/);

function run(text: string) {
  const { leads, report } = loadLeads(text, config);
  select(analyze(leads, config), config);
  const byId = new Map(leads.map((lead) => [lead.leadId, lead]));
  const top = leads.filter((l) => l.status === "selected").sort((a, b) => a.rank! - b.rank!).map((l) => l.leadId);
  return { byId, report, top };
}

const idsWith = (byId: Map<string, Lead>, status: string) =>
  [...byId.values()].filter((lead) => lead.status === status).map((lead) => lead.leadId).sort();

describe.skipIf(!hasLeads)(leadsTitle("data/leads.csv with default rules"), () => {
  const { byId, top } = hasLeads ? run(LEADS_TEXT) : { byId: new Map<string, Lead>(), top: [] };

  it("selects the expected top 10 in order", () => {
    expect(top).toEqual(TOP_10);
  });

  it("picks one contact per company", () => {
    expect(new Set(top.map((id) => byId.get(id)!.companyKey)).size).toBe(top.length);
  });

  it("status counts", () => {
    const counts: Record<string, number> = {};
    for (const lead of byId.values()) counts[lead.status!] = (counts[lead.status!] ?? 0) + 1;
    expect(counts).toEqual({ selected: 10, review: 4, excluded: 8, backup: 15, qualified_not_in_top: 13 });
  });

  it("review and excluded leads", () => {
    expect(idsWith(byId, "review")).toEqual(["L002", "L011", "L035", "L049"]);
    expect(idsWith(byId, "excluded")).toEqual(["L005", "L010", "L020", "L023", "L024", "L025", "L045", "L048"]);
  });

  it("every lead has a reason", () => {
    for (const lead of byId.values()) expect(lead.reasons.length).toBeGreaterThan(0);
  });

  it("L001 headcount is filled from L013", () => {
    expect(byId.get("L001")!.headcount).toBe(1400);
    expect(byId.get("L001")!.warnings.join(" ")).toContain("filled with 1400 from L013");
  });
});

// The same real data, reformatted in memory the way an unseen export might look.
// No new data files: every variant is built from data/leads.csv text.
describe.skipIf(!hasLeads)(leadsTitle("robustness: reformatted leads.csv gives the same top 10"), () => {
  it("BOM + ';' delimiter + other header names", () => {
    const [header, ...rows] = lines();
    const renamed = header
      .replace("lead_id", "Lead ID")
      .replace("title", "Job Title")
      .replace("company", "Organization")
      .replace("email", "E-mail");
    const { top, report } = run("﻿" + [renamed, ...rows].join("\n").replaceAll(",", ";"));

    expect(report.delimiter).toBe(";");
    expect(report.columnsMapped).toMatchObject({ lead_id: "Lead ID", title: "Job Title", company: "Organization", email: "E-mail" });
    expect(top).toEqual(TOP_10);
  });

  it("headcounts written as '1.4k' and '9,500'", () => {
    const text = lines()
      .map((line) => (line.startsWith("L013,") ? line.replace(",1400,", ",1.4k,") : line.replace(",9500,", ',"9,500",')))
      .join("\n");
    const { top, byId } = run(text);

    expect(byId.get("L013")!.headcount).toBe(1400);
    expect(byId.get("L008")!.headcount).toBe(9500);
    expect(byId.get("L001")!.warnings.join(" ")).toContain("filled with 1400 from L013");
    expect(top).toEqual(TOP_10);
  });

  it("CRLF, blank rows, an extra column, and two leads without a company", () => {
    const blankCompany = new Set(["L004", "L009"]); // not in the top 10
    const [header, ...rows] = lines();
    const edited = rows.map((line) => {
      const cells = line.split(",");
      if (blankCompany.has(cells[0])) cells[4] = "";
      return [...cells, ""].join(",");
    });
    edited.splice(10, 0, "", ",,,,,,,,,");
    const { top, byId, report } = run([`${header},Notes`, ...edited].join("\r\n"));

    expect(report.rows).toBe(50);
    expect(report.unrecognizedHeaders).toEqual(["Notes"]);
    for (const id of blankCompany) {
      expect(byId.get(id)!.status).toBe("review");
      expect(byId.get(id)!.reasons).toContain("company is empty");
    }
    expect(top).toEqual(TOP_10);
  });
});

// Rules that data/leads.csv never triggers, each shown by editing the real text in memory.
// Every edited lead is outside the top 10, so the top 10 must not move.
describe.skipIf(!hasLeads)(leadsTitle("rules leads.csv does not trigger, shown by editing one row"), () => {
  // lead_id, first_name, last_name, title, company, industry, headcount, country, email
  const COL = { id: 0, first: 1, last: 2, title: 3, company: 4, industry: 5, headcount: 6, email: 8 };
  const row = (id: string) => lines().find((line) => line.startsWith(`${id},`))!.split(",");
  const editRow = (id: string, change: (cells: string[]) => void) =>
    lines()
      .map((line) => {
        const cells = line.split(",");
        if (cells[0] === id) change(cells);
        return cells.join(",");
      })
      .join("\n");
  const addRow = (cells: string[]) => [...lines(), cells.join(",")].join("\n");

  it("personal email domain -> review", () => {
    const { byId, top } = run(editRow("L031", (cells) => (cells[COL.email] = "lukas.lopez@gmail.com")));

    expect(byId.get("L031")!.status).toBe("review");
    expect(byId.get("L031")!.reasons.join(" ")).toContain("personal email domain (gmail.com)");
    expect(top).toEqual(TOP_10);
  });

  it("same email and same role twice -> the later row is an exact duplicate", () => {
    const copy = row("L012");
    copy[COL.id] = "L051";
    const { byId, top } = run(addRow(copy));

    expect(byId.get("L051")!.status).toBe("excluded");
    expect(byId.get("L051")!.reasons).toContain("exact duplicate of L012");
    expect(byId.get("L012")!.status).toBe("qualified_not_in_top");
    expect(top).toEqual(TOP_10);
  });

  it("unknown title -> review", () => {
    const { byId, top } = run(editRow("L016", (cells) => (cells[COL.title] = "Chief Wizard")));

    expect(byId.get("L016")!.status).toBe("review");
    expect(byId.get("L016")!.reasons.join(" ")).toContain("title 'Chief Wizard' not recognised");
    expect(top).toEqual(TOP_10);
  });

  it("senior person at a non-ICP company -> low_fit by company fit", () => {
    const { byId, top } = run(editRow("L033", (cells) => {
      cells[COL.industry] = "Retail";
      cells[COL.headcount] = "8";
    }));

    expect(byId.get("L033")!.title).toBe("VP of Sales");
    expect(byId.get("L033")!.status).toBe("low_fit");
    expect(byId.get("L033")!.reasons.join(" ")).toContain("company fit 0.15 below 0.3");
    expect(top).toEqual(TOP_10);
  });

  it("same name at the same company with another email -> the later row is a possible duplicate", () => {
    const copy = row("L038");
    copy[COL.id] = "L051";
    copy[COL.email] = "m.wilson@bluepeakrecruiting.example";
    const { byId, top } = run(addRow(copy));

    expect(byId.get("L051")!.status).toBe("review");
    expect(byId.get("L051")!.reasons).toContain("possible duplicate of L038");
    expect(byId.get("L038")!.status).toBe("backup");
    expect(top).toEqual(TOP_10);
  });

  it("same company, different title: CFO < VP of Engineering < VP of Sales", () => {
    const base = run(LEADS_TEXT).byId.get("L001")!;
    const score = (title: string) => {
      const lead = { ...base, title, industry: "Software", headcount: 1400 };
      scoreLead(lead, config);
      return lead.score;
    };

    expect([score("CFO"), score("VP of Engineering"), score("VP of Sales")]).toEqual([52, 83.2, 94]);
  });
});
