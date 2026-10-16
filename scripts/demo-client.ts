// A real MCP client over stdio: starts dist/server.js, calls find_leads and draft_email
// like Claude would, prints a ranked table and writes output/drafts.md. Nothing is sent.
//
//   npm run build && npm run demo                     # defaults: data/leads.csv, then the team sheet
//   npm run demo -- new_leads.csv                     # another file in the data folder
//   npm run demo -- "https://docs.google.com/spreadsheets/d/<ID>/edit"

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SERVER = path.join(ROOT, "dist", "server.js");
const OUTPUT = path.join(ROOT, "output", "drafts.md");
const source = process.argv[2];

interface Brief { leadId: string; name: string; title: string; company: string; score: number; reasons: string[] }
interface Selected extends Brief { rank: number; email: string; warnings: string[] }
interface Draft { to: string; subject: string; body: string; wordCount: number; angle: string; warnings: string[]; error?: string }
interface Found {
  summary: { sourceLabel: string; skippedSources: string[]; statusCounts: Record<string, number>; howScoreWorks: string };
  selected: Selected[];
  needsReview: Brief[];
  excluded: Brief[];
}

if (!existsSync(SERVER)) {
  console.error("dist/server.js not found – run `npm run build` first.");
  process.exit(1);
}

// Pass the full environment so LEADS_DIR / ICP_CONFIG reach the server (the SDK default passes only a safe subset).
const env = Object.fromEntries(Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined));
const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env });
const client = new Client({ name: "krisp-leads-demo", version: "1.0.0" });
await client.connect(transport);

async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const result = await client.callTool({ name, arguments: args });
  const [first] = result.content as { type: string; text: string }[];
  const parsed = JSON.parse(first.text);
  if (result.isError && !parsed.leadId) throw new Error(`${name}: ${parsed.error}`);
  return parsed as T;
}

try {
  const { tools } = await client.listTools();
  console.log(`Tools: ${tools.map((tool) => tool.name).join(", ")}`);

  const found = await call<Found>("find_leads", source ? { source } : {});

  const drafts: Draft[] = [];
  for (const lead of found.selected) {
    drafts.push(await call<Draft>("draft_email", { lead_id: lead.leadId, ...(source ? { source } : {}) }));
  }

  console.log(`\nSource: ${found.summary.sourceLabel}   ${JSON.stringify(found.summary.statusCounts)}`);
  for (const skipped of found.summary.skippedSources) console.log(`Skipped default source – ${skipped}`);
  console.log();
  console.table(found.selected.map((lead, i) => ({
    rank: lead.rank, lead: lead.leadId, name: lead.name, title: lead.title, company: lead.company,
    score: lead.score, angle: drafts[i].angle, words: drafts[i].wordCount,
  })));

  mkdirSync(path.dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, toMarkdown(found, drafts));
  console.log(`\nDrafts written to ${path.relative(ROOT, OUTPUT)} (nothing was sent).`);
} catch (err) {
  console.error(`Demo failed – ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await client.close();
}

function toMarkdown(found: Found, drafts: Draft[]): string {
  const lines = [
    "# Krisp outbound – top leads and draft emails",
    "",
    "> Drafts only – nothing was sent.",
    "",
    `Source: \`${found.summary.sourceLabel}\` · status counts: ${Object.entries(found.summary.statusCounts).map(([k, v]) => `${k} ${v}`).join(", ")}`,
    "",
    ...found.summary.skippedSources.flatMap((skipped) => [`Skipped default source – ${skipped}`, ""]),
    `Score: \`${found.summary.howScoreWorks}\``,
    "",
  ];
  found.selected.forEach((lead, i) => {
    const draft = drafts[i];
    lines.push(
      `## ${lead.rank}. ${lead.name} – ${lead.title}, ${lead.company} (score ${lead.score})`,
      "",
      `**Why:** ${lead.reasons.join("; ")}`,
      "",
      ...(draft.warnings.length ? [`**Warnings:** ${draft.warnings.join("; ")}`, ""] : []),
      `**To:** ${draft.to}  `,
      `**Subject:** ${draft.subject}  `,
      `**Angle:** ${draft.angle} · ${draft.wordCount} words`,
      "",
      "```text",
      draft.body,
      "```",
      "",
    );
  });
  lines.push("## Needs human review", "");
  for (const lead of found.needsReview) lines.push(`- **${lead.leadId}** ${lead.name || "(no name)"} – ${lead.title || "(no title)"}, ${lead.company}: ${lead.reasons.join("; ")}`);
  lines.push("", "## Excluded", "");
  for (const lead of found.excluded) lines.push(`- **${lead.leadId}** ${lead.name || "(no name)"} – ${lead.title || "(no title)"}, ${lead.company}: ${lead.reasons.join("; ")}`);
  lines.push("");
  return lines.join("\n");
}
