# Changing ICP rules (config only)

Read when the request is about weights, industries, industry overrides, headcount bands, the minimum score,
the company-fit gate, or how many contacts per company. **These are config edits – no code change.**

## Where in `config/icp.json`
| Request | Key |
|---|---|
| "Weigh the person more than the company" | `score_weights.persona` / `score_weights.company` |
| "VPs count as much as C-level" | `authority.<seniority>` |
| "Marketing teams are on calls a lot" | `function_relevance.<function>` |
| "Engineering matters more in software" | `industry_overrides.<industry keyword>.<function>` |
| "Add/move an industry" (e.g. add "cybersecurity" as strong) | `industries.strong / medium / weak` (keyword lists) |
| "Small companies are fine" | `headcount.bands` (inclusive `max`, last band `max: null`) |
| "Show more / fewer leads" | `selection.default_limit` (or the `limit` tool param) |
| "Allow 2 contacts per company" | `selection.max_per_company` (or the `max_per_company` tool param) |
| "Be stricter" | `selection.min_score`, `selection.min_company_fit` |

Score = `100 × (persona_weight × authority × call_relevance + company_weight × avg(industry fit, headcount fit))`.
Industry and override matching is "keyword contained in the industry text", first tier wins.

## After the edit
1. Config is re-read on every tool call, and `validateConfig()` rejects bad values (e.g. `max_per_company: 0`)
   with a clear error – read it and fix the value.
2. Run `npm test`. These tests hard-code results of the **default** config and will fail if the ranking changes:
   - `tests/scoring.test.ts`: `TOP_10`, the status counts, and the score/fit numbers in
     "rules leads.csv does not trigger" (e.g. `[52, 83.2, 94]`, `company fit 0.15 below 0.3`).
   If the request is meant to change the ranking, update those expectations and say which leads moved and why.
3. Texts that quote the default numbers – update them if a default changed:
   - `src/server.ts` – the `find_leads` description (`0.6 * persona + 0.4 * company`, "C-level 1.0, VP 0.9 …")
     and the `limit` / `min_score` / `max_per_company` describe() texts ("default 10/50/1").
   - README "How scoring works" table and "Result on data/leads.csv".
4. To try a variant without touching the real config: copy it and run with `ICP_CONFIG=<copy> npm run demo`.
