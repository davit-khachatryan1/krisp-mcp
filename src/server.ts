// MCP wiring only: two tools that call core.ts. Logs go to stderr – stdout is the MCP protocol.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { draftEmail, findLeads } from "./core.js";
import { FUNCTIONS } from "./types.js";

const SOURCE_HELP = `source (optional) – where the leads come from:
- empty: the default sources in config/sources.json, tried in order (data/leads.csv, then the team Google Sheet); summary.skippedSources says if one was skipped and why
- a file name such as "new_leads.csv": that file in the server's data folder (file names only, .csv only)
- a Google Sheets link (https://docs.google.com/spreadsheets/d/...): its CSV export; the sheet must be shared as "Anyone with the link can view"
Files attached in the chat are NOT visible to this server (it runs on the user's machine): ask the user to save the CSV in the data folder or share a sheet link. The source is read fresh on every call.`;

const FIND_LEADS_DESCRIPTION = `Load the leads CSV, clean it, score every lead against Krisp's ICP rules (config/icp.json) and pick the best contact per company. Every decision comes with human-readable reasons. Read-only: nothing is sent or changed.

Score 0-100 = 100 * (0.6 * persona + 0.4 * company)
- persona = authority x call relevance. Authority = buying power from seniority (C-level 1.0, VP 0.9, Head/Director 0.8, Manager 0.5 ...). Call relevance = how much the person's team lives on calls (sales/customer success 1.0, remote work 0.9, operations 0.8 ... finance 0.2); some industries raise it (e.g. engineering in software, operations in BPO).
- company = average of industry fit (strong/medium/weak/unknown) and headcount fit.
These are the default weights; summary.howScoreWorks shows the formula from the current config.

Every lead ends in exactly one status:
- selected: in the top N, with rank
- backup: qualifies, but a colleague at the same company ranks higher (follow-up contact)
- qualified_not_in_top: qualifies, but ranked below the top N
- low_fit: company fit (industry/size) or score below the ICP threshold
- review: a human must check first (shared mailbox like sales@, personal email, empty or unrecognised title, conflicting records on one email, possible duplicate person, no name, empty company)
- excluded: never contacted (missing/invalid email, junior role without buying power, exact duplicate)
- filtered_out: removed by this call's filters

Filters (industries, countries, functions, min_headcount, max_headcount) only narrow the candidates.

${SOURCE_HELP}

Next: call draft_email for each selected lead_id. Report needs_review leads to the user with their reasons; do not draft for them without saying why.`;

const DRAFT_EMAIL_DESCRIPTION = `DRAFT ONLY – nothing is sent. This server has no way to send email.

Drafts a short first-touch email (under ~120 words, plain text, one call to action) for one lead_id from find_leads. The angle comes from the person's role and industry: sales, customer_success, remote_work, operations, operations_bpo, general_management, it, engineering, people, or default.

Returns to, toName, subject, body, wordCount, angle, dataStatus, personalizationNotes, warnings and sent: false.
- excluded lead: an error, no draft
- review lead: a draft plus a warning – tell the user a human must confirm it first
dataStatus is the data check only: ok or review (excluded leads return an error). Ranking (selected, backup, low_fit) is find_leads' job.

You may polish the wording, but keep the facts: only claim what Krisp does (noise/echo removal, accent conversion, AI notes & summaries, CRM sync, on-device audio, SSO/SCIM), and never invent numbers, customer names or facts about the prospect. Personalise with name, company, role and industry only; never expose data such as headcount, company size, country, scores or statuses.

Use the same source as in find_leads.
${SOURCE_HELP}`;

const INSTRUCTIONS =
  "Call find_leads first; it cleans the data, scores leads and explains every decision. " +
  "Then call draft_email for each selected lead_id. Drafts are never sent. " +
  "Do not draft for leads in needs_review without telling the user why. " +
  "To use another CSV in the data folder or a Google Sheets link, pass the same `source` to both tools.";

const server = new McpServer({ name: "krisp-leads", version: "1.0.0" }, { instructions: INSTRUCTIONS });

server.registerTool(
  "find_leads",
  {
    title: "Find and rank leads",
    description: FIND_LEADS_DESCRIPTION,
    annotations: { readOnlyHint: true, openWorldHint: true }, // reads a file or a sheet, changes nothing
    inputSchema: {
      limit: z.number().int().min(1).optional().describe("How many top leads to select (default 10, from config)."),
      min_score: z.number().min(0).max(100).optional().describe("Minimum score to qualify (default 50, from config)."),
      industries: z.array(z.string()).optional().describe("Keep only candidates whose industry contains one of these words, e.g. [\"software\", \"bpo\"]."),
      countries: z.array(z.string()).optional().describe("Keep only candidates in these countries (exact name, case-insensitive), e.g. [\"United States\"]."),
      functions: z.array(z.enum(FUNCTIONS)).optional().describe("Keep only candidates with these job functions."),
      min_headcount: z.number().int().min(0).optional().describe("Keep only companies with at least this many employees."),
      max_headcount: z.number().int().min(0).optional().describe("Keep only companies with at most this many employees."),
      max_per_company: z.number().int().min(1).optional().describe("Contacts to keep per company (default 1, from config)."),
      source: z.string().optional().describe("Empty = defaults from config/sources.json (data/leads.csv, then the team sheet); a .csv file name in the data folder; or a Google Sheets link."),
    },
  },
  async (args) =>
    respond(() =>
      findLeads({
        limit: args.limit,
        minScore: args.min_score,
        industries: args.industries,
        countries: args.countries,
        functions: args.functions,
        minHeadcount: args.min_headcount,
        maxHeadcount: args.max_headcount,
        maxPerCompany: args.max_per_company,
        source: args.source,
      }),
    ),
);

server.registerTool(
  "draft_email",
  {
    title: "Draft a first email (never sent)",
    description: DRAFT_EMAIL_DESCRIPTION,
    annotations: { readOnlyHint: true, openWorldHint: true }, // returns text only, sends nothing
    inputSchema: {
      lead_id: z.string().min(1).describe("lead_id from find_leads, e.g. \"L017\" (case-insensitive)."),
      sender_name: z.string().optional().describe("Signature name (default \"[Your name]\")."),
      sender_title: z.string().optional().describe("Signature title (default \"[Your title], Krisp\")."),
      source: z.string().optional().describe("Same source as used in find_leads (empty = the defaults from config/sources.json)."),
    },
  },
  async (args) => respond(() => draftEmail(args.lead_id, args.sender_name, args.sender_title, args.source)),
);

/** JSON text result; a thrown error or an { error } result is returned with isError instead of crashing. */
async function respond(run: () => Promise<object>) {
  try {
    const result = await run();
    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], isError: "error" in result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[krisp-leads] ${message}`);
    return { content: [{ type: "text" as const, text: JSON.stringify({ error: message }, null, 2) }], isError: true };
  }
}

await server.connect(new StdioServerTransport());
console.error("[krisp-leads] MCP server running on stdio");
