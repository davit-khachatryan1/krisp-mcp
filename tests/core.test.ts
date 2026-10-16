import { describe, expect, it } from "vitest";
import { findLeads } from "../src/core.js";
import { hasLeads, leadsTitle } from "./helpers.js";

describe.skipIf(!hasLeads)(leadsTitle("find_leads filters on data/leads.csv"), () => {
  it("the countries filter understands the same aliases as the data ('USA' = 'United States')", async () => {
    const byName = await findLeads({ countries: ["United States"] });
    const byAlias = await findLeads({ countries: ["USA"] });
    const ids = (result: typeof byName) => result.selected.map((lead) => lead.leadId);
    expect(ids(byName).length).toBeGreaterThan(0);
    expect(ids(byAlias)).toEqual(ids(byName));
  });
});
