# Krisp leads – MCP server

A small MCP server that turns a leads CSV into a ranked shortlist and drafts first emails.
Claude calls the tools, explains the result and polishes the drafts. **Nothing is ever sent.**

| Tool | What it does |
|---|---|
| `find_leads` | Scores leads with the ICP rules in `config/icp.json`, picks the best contact per company, and returns each lead with a status and a reason. |
| `draft_email` | Drafts a short first email for one `lead_id`. Draft only – the server cannot send email. |

## Run it

Requires Node 22.12+.

```bash
npm install
npm run build
npm test
npm run demo        # calls both tools over MCP, writes output/drafts.md
```

## Connect to Claude

**Claude Code:** `claude mcp add krisp-leads -- node /ABSOLUTE/PATH/krisp-mcp/dist/server.js`

**Claude Desktop:** add to `claude_desktop_config.json` (macOS `~/Library/Application Support/Claude/`), then restart Claude:

```json
{ "mcpServers": { "krisp-leads": { "command": "/ABSOLUTE/PATH/TO/node", "args": ["/ABSOLUTE/PATH/krisp-mcp/dist/server.js"] } } }
```

Use the full path to `node` (`which node`).

**Example prompt:**
> Use the krisp-leads tools. Find the top 10 leads and tell me in one line why each was picked. List the leads that need human review and why. Then draft an email for each of the 10 and polish it, keep the facts, stay under 120 words, and never send anything.

## How it works

**ICP.** Krisp improves calls and meetings, so the best buyers are leaders of call-heavy teams (sales, customer success, operations), with IT as the approver.

**Score.**
```
score = 100 × (0.6 × authority × call relevance  +  0.4 × company fit)
```
- *Authority* – can they buy? (C-level 1.0, VP 0.9, Head/Director 0.8, Manager 0.5, junior 0)
- *Call relevance* – does their team live on calls? (sales/CS 1.0, ops 0.8, IT 0.7, finance 0.2), adjusted by company type
- *Company fit* – industry and company size

Example: a CFO is senior but not on calls (1.0 × 0.2), so they rank below a VP of Sales (0.9 × 1.0).

**Selection.** One contact per company – the best fit. Colleagues are kept as backups for follow-up.

**Data quality.** The data is checked before scoring:
- invalid emails and junior roles are excluded;
- shared mailboxes (`info@`, `sales@`), missing titles and conflicting records go to human review instead of being guessed;
- missing company data is filled from colleagues at the same company;
- different column names, delimiters and number formats are handled, so other CSV exports also work.

**Emails.** The angle depends on the person's role. Drafts are short plain text with one question and an opt-out line, and use only name, company, role and industry.

## Changing things

- **ICP rules** (weights, industries, contacts per company): edit `config/icp.json`. No restart needed.
- **Another CSV:** put it in `data/` and ask Claude *"use new_leads.csv"*.
- **Google Sheets (optional):** share as "Anyone with the link can view" and ask *"use this sheet: <link>"*.
- **Code** (`src/`): `npm run build`, then restart Claude.

## Result

Top 10: **L001, L006, L014, L044, L047, L008, L017, L040, L042, L003** – 10 different companies.

## Limitations

- The weights are a hypothesis and should be tuned on real reply data.
- No enrichment – the server only knows what is in the file.
- Unusual job titles go to review rather than being guessed.

## How I used Claude

- **Thinking:** I analyzed the leads file manually and found the cases the code must cover (conflicting records, shared mailboxes, missing data, title variants). Then I researched Krisp's product and outbound best practices, and with Claude decided the ICP, the scoring and how to handle unclear records.
- **Building:** wrote a plan with the expected result, and Claude Code built the server against it.
- **Reviewing:** I reviewed the code myself, and Claude Code audited it as well. I kept the important fixes and rejected changes that only added complexity.
- **Using:** Claude used the MCP to pick the top 10 and polish the drafts. I reviewed the drafts and changed the rules so emails never expose data such as company size.

## Part B

Deliverability plan: [`PART_B_deliverability.md`](PART_B_deliverability.md)
