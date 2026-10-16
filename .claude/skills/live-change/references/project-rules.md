# Project rules (krisp-mcp)

These hold for every change. If a request conflicts with one, say so before doing it.

1. **Nothing is ever sent.** `draft_email` returns text with `sent: false`. Never add SMTP, email APIs or any
   other way to send or post.
2. **No `console.log` in `src/`.** The server talks MCP over stdio, so stdout is the protocol. Log with
   `console.error`. (A hook in `.claude/settings.json` flags this after every edit.)
3. **Rules live in `config/icp.json`.** Weights, keywords, thresholds and aliases are config. `src/` reads them;
   it never hard-codes them. `validateConfig()` in `src/config.ts` rejects bad values with a clear message.
4. **No mock lead data files.** The only lead data is `data/leads.csv` (a copy of the team Google Sheet).
   Tests build edge cases by editing that file's text in memory (see `tests/scoring.test.ts`).
5. **Top-10 invariant.** With the default config the top 10 is
   `L001, L006, L014, L044, L047, L008, L017, L040, L042, L003`, with counts
   selected 10, review 4, excluded 8, backup 15, qualified_not_in_top 13. Tests assert this. Only change these
   expectations when the user's request is meant to change the ranking – and say so.
6. **Every lead gets one status with human-readable reasons.** New rules must add a reason, never drop a lead
   silently. Unknown values go to review or get a neutral score.
7. **Tool changes are three edits:** the zod schema and the description in `src/server.ts`, and the README.
8. **Keep it explainable.** Small diffs, plain code, one idea per change – every line should be easy to explain.

## Where things are
| File | What it does |
|---|---|
| `src/server.ts` | MCP wiring: the 2 tools, their zod params and descriptions |
| `src/core.ts` | Glue: config → source → loader → analyze → filters → select; `findLeads`, `draftEmail` |
| `src/config.ts` | Loads and validates `config/icp.json`; default sources from `config/sources.json` |
| `src/source.ts` | Where the CSV text comes from (data folder file or Google Sheet) |
| `src/loader.ts` | CSV text → clean `Lead[]` (aliases, delimiter, BOM, headcount, country) |
| `src/titles.ts` | Title → seniority + function (keyword rules) |
| `src/scoring.ts` | `analyze()` checks + score, `select()` per-company pick and top N |
| `src/drafting.ts` | Email templates by angle → draft |
| `src/types.ts` | Shared types (`Lead`, `Fn`, `Seniority`, `Status`) |
