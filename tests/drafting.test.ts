import { describe, expect, it } from "vitest";
import { draftEmail, findLeads } from "../src/core.js";
import { TEMPLATES } from "../src/drafting.js";
import { hasLeads, leadsTitle } from "./helpers.js";

describe("templates", () => {
  it("never mention sending, links or images", () => {
    const text = JSON.stringify(TEMPLATES);
    expect(text).not.toMatch(/https?:\/\//);
  });

  it("use no size placeholders and don't assume the prospect's CRM", () => {
    const text = JSON.stringify(TEMPLATES);
    expect(text).not.toMatch(/\{a?_?size\}/);
    expect(text).not.toContain("HubSpot or Salesforce");
  });
});

describe.skipIf(!hasLeads)(leadsTitle("drafts don't expose the data we hold (top 10)"), () => {
  it("no headcount, size label, country or CRM guess in subject, body or notes", async () => {
    const { selected } = await findLeads();
    expect(selected).toHaveLength(10);
    for (const lead of selected) {
      const draft = await draftEmail(lead.leadId);
      if (!("body" in draft)) throw new Error(`expected a draft for ${lead.leadId}`);
      const email = `${draft.subject}\n${draft.body}`;
      const notes = draft.personalizationNotes.join("\n");
      const headcounts = lead.headcount === null ? [] : [String(lead.headcount), lead.headcount.toLocaleString("en-US")];

      for (const number of headcounts) {
        expect(email, `${lead.leadId} shows headcount ${number}`).not.toContain(number);
        expect(notes, `${lead.leadId} notes show headcount ${number}`).not.toContain(number);
      }
      expect(email, `${lead.leadId} shows a size label`).not.toContain("-person");
      expect(email, `${lead.leadId} shows the country`).not.toContain(lead.country);
      expect(notes, `${lead.leadId} notes show the country`).not.toContain(lead.country);
      expect(email).not.toContain("HubSpot or Salesforce");
    }
  });
});

describe.skipIf(!hasLeads)(leadsTitle("draft_email on data/leads.csv"), () => {
  it("L017 -> BPO operations angle, personal greeting, short, not sent", async () => {
    const draft = await draftEmail("L017");
    expect(draft).toMatchObject({ leadId: "L017", angle: "operations_bpo", sent: false });
    if (!("body" in draft)) throw new Error("expected a draft");
    expect(draft.body.startsWith("Hi Noah,")).toBe(true);
    expect(draft.wordCount).toBeLessThanOrEqual(120);
  });

  it("L048 (invalid email, excluded) -> error, no draft", async () => {
    const result = await draftEmail("L048");
    expect(result).toMatchObject({ leadId: "L048", error: "lead is excluded - no draft created" });
  });

  it("L002 (sales@ mailbox, review) -> team greeting + warning", async () => {
    const draft = await draftEmail("l002"); // ids are case-insensitive
    if (!("body" in draft)) throw new Error("expected a draft");
    expect(draft.body.startsWith("Hi Kodex Labs team,")).toBe(true);
    expect(draft.toName).toBe("Kodex Labs team");
    expect(draft.dataStatus).toBe("review");
    expect(draft.warnings.join(" ")).toContain("REVIEW");
  });

  it("L016 (a backup with default rules) -> dataStatus ok, no ranking status or warning", async () => {
    const draft = await draftEmail("L016");
    if (!("body" in draft)) throw new Error("expected a draft");
    expect(draft.dataStatus).toBe("ok");
    expect(draft).not.toHaveProperty("status");
    expect(draft.warnings).toEqual([]);
  });

  it("unknown id -> not found", async () => {
    expect(await draftEmail("L999")).toEqual({ error: "lead_id 'L999' not found" });
  });
});
