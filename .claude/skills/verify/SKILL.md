---
name: verify
description: This skill should be used when the user asks to "verify", "check everything", "run the checks", "is it ready", "did I break anything", or after any change to src/, config/ or tests/ in krisp-mcp. It builds, runs the tests and the MCP demo, checks the top 10 and the stdout rule, and reports in a few lines.
---

# Verify krisp-mcp

Done = a short report the user can trust: what passed, what failed (with the error), and what changed.

## Steps (run from the project root; stop at the first hard failure and report it)

1. **Build**: `npm run build` – must exit 0. A type error here means `dist/` (what Claude Desktop runs) is stale.
2. **Tests**: `npm test` – report `passed / failed / skipped`. Skipped must be 0.
   On failure, show the failing test name and the expected vs received lines.
3. **Real MCP run**: `npm run demo` – starts `dist/server.js`, calls `find_leads` and `draft_email` like Claude
   would, and writes `output/drafts.md`. Check:
   - the ranked table matches `L001, L006, L014, L044, L047, L008, L017, L040, L042, L003`
     (unless the user changed the ranking on purpose – then it must match the updated `TOP_10` in
     `tests/scoring.test.ts`);
   - every draft has `words` ≤ 120.
4. **Stdout rule**: `grep -rn "console.log" src/` must print nothing.
5. **What changed**: list files modified recently, e.g.
   `find src config tests data .claude -newer package.json -type f`, so the user sees the scope of the change.

## Report (5 lines max, failures first)
```
❌/✅ build   – …
❌/✅ tests   – 100 passed, 0 failed, 0 skipped
❌/✅ demo    – top 10 matches / differs: …
❌/✅ stdout  – no console.log in src/
changed: src/drafting.ts, tests/drafting.test.ts
```
If something failed, end with the one most likely fix. Don't fix it unless the user asks.
