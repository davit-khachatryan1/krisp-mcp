# Using another CSV file, folder or Google Sheet (no code)

Read when the user wants to run on different data. Both tools take one optional `source`.

| Want | Do |
|---|---|
| A CSV with another name | Put it in `data/` and pass `source: "march_leads.csv"` to both tools (or ask Claude "use march_leads.csv"). |
| Make that file the default | Put its name first in `config/sources.json` → `default_sources`. |
| A different folder | Set `LEADS_DIR` (relative = from the project root) in the Claude config `"env"`. |
| A Google Sheet | Share it as "Anyone with the link can view", pass the link as `source`. A `#gid=` tab is kept. |
| Different header names | Add them to `config/icp.json` → `column_aliases`; the error message lists the headers it found. |

## Facts to know
- Only a `.csv` file **name** directly in the data folder is accepted (no `../`, no absolute paths).
- Only `https://docs.google.com/spreadsheets/d/<ID>/…` links are fetched; private sheets give a clear
  "not shared" error; 10-second timeout.
- No `source` → `config/sources.json` defaults in order (now `leads.csv`, then the team sheet).
  `summary.skippedSources` says if one was skipped.
- The source is read on every call – a new file or an edited sheet needs no restart.
- Files attached in the Claude chat are **not** visible to the server.
- `find_leads` and `draft_email` must get the **same** `source`, or the lead ids may not match.

## Check
`npm run demo -- march_leads.csv` (or a sheet link) runs the real MCP tools on that source and writes
`output/drafts.md`. If headers are not recognised, the error says which alias to add.
