---
name: create-skill
description: This skill should be used when the user asks to "create a skill", "add a skill", "make a new skill", "write a skill for", "turn this into a skill", or wants a repeatable krisp-mcp workflow saved as a Claude Code skill in .claude/skills/. It writes the SKILL.md (and any references or scripts) in this project's format and validates it.
---

# Create a project skill

A skill is a short, reusable playbook Claude loads when its description matches the request.
Done = a new folder in `.claude/skills/<name>/` that passes the validator and triggers on the right requests.

## Steps

1. **Clarify** (ask only what is unclear):
   - What task does it cover, and what does "done" look like?
   - 3–5 phrases a user would actually type that should trigger it.
   - Inputs and outputs (files touched, commands run, what is reported back).
2. **Check for overlap**: list `.claude/skills/`. If an existing skill covers most of it
   (e.g. `live-change` for code/config changes), add a reference file to that skill instead of a new skill.
3. **Name it**: kebab-case, verb first, short (`add-filter`, `review-drafts`). Folder name = `name`.
4. **Write SKILL.md** from `assets/SKILL.template.md`:
   - `description`: third person ("This skill should be used when …"), with the quoted trigger phrases,
     50–1024 characters. Avoid `: ` and ` #` inside it (they break YAML).
   - Body: imperative steps with exact files and commands; sections When / Steps / Checks / Don't.
   - End with a verify step (the `verify` skill) if the skill changes code or config.
5. **Keep it lean (progressive disclosure)**:
   - Details only needed sometimes → `references/<topic>.md`, linked from the steps with "read when …".
   - Code that would be rewritten every time → `scripts/<name>.mjs` (plain Node, no dependencies).
   - Files copied into output → `assets/`.
   - SKILL.md stays well under 300 lines; never repeat the same text in SKILL.md and a reference.
6. **Validate**:
   ```bash
   node .claude/skills/create-skill/scripts/validate-skill.mjs .claude/skills/<name>
   ```
   Fix every ❌ (name/folder mismatch, description length or missing trigger phrases, missing referenced files).
7. **Sanity-check triggering**: write down one request that should load the skill and one that should not,
   and make sure the description separates them.
8. Tell the user the skill is loaded in new sessions (or after restarting Claude Code), and how to call it
   directly: `/<name>`.

## Project rules every skill must respect
Read `.claude/skills/live-change/references/project-rules.md` before writing steps that touch code:
drafts are never sent, no `console.log` in `src/`, no mock lead data files, rules live in `config/icp.json`.

## Don't
- Don't create a skill for a one-off task – just do the task.
- Don't put secrets, personal data or lead data in a skill.
- For skills that need evals and benchmarking, use the installed `skill-creator` plugin instead of this one.
