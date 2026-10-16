// Tests that need real lead data skip (with a clear title) until the file is added.
// No lead data is generated for tests.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "../src/config.js";
import { decodeBytes } from "../src/source.js";

export const LEADS_CSV = path.join(PROJECT_ROOT, "data", "leads.csv");

export const hasLeads = existsSync(LEADS_CSV);

export const leadsTitle = (name: string) =>
  hasLeads ? name : `${name} (skipped: data/leads.csv not found – add it to run)`;

export const readCsv = (file: string) => decodeBytes(readFileSync(file));
