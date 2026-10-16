// PostToolUse hook (see .claude/settings.json): after Claude edits a file, catch the two mistakes
// that break this project silently.
//   - console.log in src/  → stdout is the MCP stdio protocol, so the server breaks in Claude Desktop
//   - invalid JSON in config/ → every tool call fails
// Exit 2 sends the message on stderr back to Claude; exit 0 stays silent.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;

const filePath = JSON.parse(input || "{}").tool_input?.file_path;
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
if (!filePath || !existsSync(filePath)) process.exit(0);

const relative = path.relative(root, path.resolve(root, filePath));
const text = readFileSync(filePath, "utf8");

if (relative.startsWith(`src${path.sep}`) && /\bconsole\.log\s*\(/.test(text)) {
  console.error(`${relative} contains console.log. In this MCP server stdout is the protocol channel – use console.error.`);
  process.exit(2);
}

if (relative.startsWith(`config${path.sep}`) && relative.endsWith(".json")) {
  try {
    JSON.parse(text);
  } catch (err) {
    console.error(`${relative} is not valid JSON: ${err.message}`);
    process.exit(2);
  }
}
