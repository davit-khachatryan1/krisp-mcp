#!/usr/bin/env node
// Checks the Claude Code skills of this project.
//   node .claude/skills/create-skill/scripts/validate-skill.mjs                       # every skill
//   node .claude/skills/create-skill/scripts/validate-skill.mjs .claude/skills/verify # one skill
// Prints ✅/❌ per skill and exits 1 if any skill has a problem.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const target = path.resolve(process.argv[2] ?? ".claude/skills");
const skillDirs = existsSync(path.join(target, "SKILL.md"))
  ? [target]
  : readdirSync(target).map((name) => path.join(target, name)).filter((dir) => statSync(dir).isDirectory());

let failed = 0;
for (const dir of skillDirs) {
  const problems = checkSkill(dir);
  console.log(`${problems.length === 0 ? "✅" : "❌"} ${path.basename(dir)}`);
  for (const problem of problems) console.log(`   - ${problem}`);
  if (problems.length > 0) failed++;
}
process.exit(failed > 0 ? 1 : 0);

function checkSkill(dir) {
  const file = path.join(dir, "SKILL.md");
  if (!existsSync(file)) return ["SKILL.md is missing"];

  const match = readFileSync(file, "utf8").match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return ["SKILL.md must start with a frontmatter block between --- lines"];
  const [, frontmatter, body] = match;
  const field = (key) =>
    (frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2");

  const problems = [];
  const folder = path.basename(dir);
  const name = field("name");
  const description = field("description");

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    problems.push(`name '${name}' must be kebab-case and at most 64 characters`);
  }
  if (name !== folder) problems.push(`name '${name}' must equal the folder name '${folder}'`);
  if (description.length < 50 || description.length > 1024) {
    problems.push(`description is ${description.length} characters; use 50–1024`);
  }
  if (!/"[^"]+"/.test(description)) {
    problems.push('description needs quoted trigger phrases users would say, e.g. "create a skill"');
  }

  const bodyLines = body.trim() ? body.trim().split("\n").length : 0;
  if (bodyLines === 0) problems.push("body is empty");
  if (bodyLines > 300) problems.push(`body is ${bodyLines} lines; move details to references/`);

  // Every file the instructions mention must exist: the skill's own references/, scripts/, assets/
  // (relative to the skill) and other .claude/… paths (relative to the project root).
  const projectRoot = path.resolve(dir, "../../..");
  const ownFiles = body.match(/(?<![\w./-])(?:references|scripts|assets)\/[\w.\-/]*\w/g) ?? [];
  const projectFiles = body.match(/(?<![\w/-])\.claude\/[\w.\-/]*\w/g) ?? [];
  for (const mentioned of new Set(ownFiles)) {
    if (!existsSync(path.join(dir, mentioned))) problems.push(`mentions ${mentioned}, which does not exist`);
  }
  for (const mentioned of new Set(projectFiles)) {
    if (mentioned.includes("<")) continue;
    if (!existsSync(path.join(projectRoot, mentioned))) problems.push(`mentions ${mentioned}, which does not exist`);
  }
  return problems;
}
