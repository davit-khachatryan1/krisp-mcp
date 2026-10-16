# Adding a find_leads filter (or another tool parameter)

Read when the request needs a new way to narrow the list ("only regulated industries", "only leads with a
name", "exclude a country"). First check it doesn't exist already – `find_leads` has `industries`, `countries`
(understands aliases like "USA"), `functions`, `min_headcount`, `max_headcount`, `limit`, `min_score`,
`max_per_company`, `source`.

## Steps (example: `regulated_only: boolean`)
1. **Core** – `src/core.ts`:
   - `interface Filters`: add `regulatedOnly?: boolean;`
   - `findLeads()`: copy it into the `filters` object (`regulatedOnly: opts.regulatedOnly`).
   - `applyFilters()`: add one check that pushes a readable reason, e.g.
     `if (f.regulatedOnly && !lead.regulatedIndustry) failed.push("industry is not regulated");`
   Filters only narrow **candidates**; failing leads become `filtered_out` with the reason.
2. **Tool** – `src/server.ts`, `find_leads` `inputSchema`: add
   `regulated_only: z.boolean().optional().describe("Keep only regulated industries (finance, health, legal …).")`,
   map it in the handler (`regulatedOnly: args.regulated_only`), and mention it in `FIND_LEADS_DESCRIPTION`
   ("Filters (…) only narrow the candidates").
3. **README** – add it to the filter list under "Change the rules or the data".

## Test
In `tests/core.test.ts` (real data, no new files):
```ts
const result = await findLeads({ regulatedOnly: true });
expect(result.selected.length).toBeGreaterThan(0);
expect(result.selected.every((lead) => /financ|insur|health|legal|bank/i.test(lead.industry))).toBe(true);
```
The default top-10 test must still pass (filters are off by default).
Then `npm run build` – a tool change needs a rebuild and a Claude Desktop restart; Claude only sees the new
parameter after the restart.
