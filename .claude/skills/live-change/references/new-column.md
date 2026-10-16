# Adding a CSV column (e.g. LinkedIn URL, phone, seniority)

Read when a request needs a field the leads don't have yet. A pass-through column touches 4 places;
a column that changes scoring touches 1–2 more.

## Steps (example: `linkedin_url`)
1. **Config** – `config/icp.json` → `column_aliases`: add
   `"linkedin_url": ["linkedin_url", "linkedin", "linkedin_profile", "li_url"]`.
   Header matching normalises names first ("LinkedIn URL" → `linkedin_url`).
2. **Type** – `src/types.ts` → `interface Lead`: add `linkedinUrl: string;`.
3. **Loader** – `src/loader.ts` → `loadLeads()`, inside `leads.push({ … })`: add
   `linkedinUrl: get("linkedin_url"),`. If the column is optional, also add `"linkedin_url"` to
   `OPTIONAL_FIELDS` so a missing column is reported in `columnsMissing`.
4. **Output** – `src/core.ts` → the `selected` mapping in `findLeads()` (and `brief()` if review/excluded lists
   need it): add `linkedinUrl: lead.linkedinUrl`.
5. **Optional, only if asked:**
   - Use it in scoring → `src/scoring.ts` (`scoreLead()` or `checkContact()`), with a reason string.
   - Use it in drafts → `src/drafting.ts` (`personalizationNotes`), never as a link in the email body.
   - A column that overrides title parsing (e.g. `seniority`) → in `scoreLead()`, prefer the column value when
     it is one of `SENIORITIES` (from `src/types.ts`), else fall back to `parseTitle()`.

## Test (no new data files)
In `tests/scoring.test.ts` or `tests/loader.test.ts`, take the real CSV text, append a column in memory and check
the value arrives – and that the top 10 is unchanged:
```ts
const [header, ...rows] = LEADS_TEXT.trimEnd().split("\n");
const text = [`${header},LinkedIn`, ...rows.map((r) => `${r},https://linkedin.com/in/${r.split(",")[0]}`)].join("\n");
const { byId, top } = run(text);
expect(byId.get("L001")!.linkedinUrl).toBe("https://linkedin.com/in/L001");
expect(top).toEqual(TOP_10);
```
Then `npm run build` – a code change needs a rebuild and a Claude Desktop restart.
