---
name: live-change
description: This skill should be used when the user asks to change how krisp-mcp scores, selects or drafts, such as "change the ICP weights", "add an industry", "allow 2 contacts per company", "add a LinkedIn column", "make the email shorter", "change the email tone", "add a filter", "use another CSV" or "use this sheet". It picks the smallest correct change, makes it, and verifies the top 10 and tests.
---

# Make one small change to krisp-mcp safely

Done = the requested behaviour works, `verify` is green, and the user knows exactly what changed and why.

## Steps

1. **Classify the request and read only the matching reference:**

   | Request | Read |
   |---|---|
   | Weights, industries, overrides, headcount bands, min score, contacts per company | `references/icp-rules.md` |
   | New CSV column (LinkedIn URL, seniority, phone, …) | `references/new-column.md` |
   | Email wording, tone, length, subject, CTA | `references/email-template.md` |
   | New find_leads filter or tool parameter | `references/new-filter.md` |
   | Another CSV file, another folder, a Google Sheet | `references/data-source.md` |

   Always also keep `references/project-rules.md` in mind (it is short).
2. **Say the plan in one line** before editing: what changes, which files, and whether it is config-only.
   Prefer config (`config/icp.json`, `config/sources.json`) over code whenever the reference allows it.
3. **Make the smallest change** that does it. No refactors, no extra features.
4. **Add or adjust a test** for the new behaviour (use the `test-writer` agent for anything non-trivial).
5. **Verify** with the `verify` skill.
6. **If the top 10 or the status counts change on purpose**, update `TOP_10` and the counts in
   `tests/scoring.test.ts` and the README "Result" section, and tell the user which leads moved and why.
   If they change by accident, the change is wrong – fix it instead.
7. **Tell the user how it takes effect**:
   - Config or data change → next tool call, no restart.
   - Code change (`src/`) → `npm run build`, then restart Claude Desktop (or reconnect the server in Claude Code).

## Don't
- Don't edit `data/leads.csv` to make a test pass, and don't create mock lead data files.
- Don't hard-code a weight or keyword in `src/` – it belongs in `config/icp.json`.
- Don't add a tool parameter unless the request needs one; a config value is usually enough.
