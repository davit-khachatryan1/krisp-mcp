import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SENIORITIES, type Fn, type IndustryTier, type Seniority } from "./types.js";

// src/ (tsx, vitest) and dist/ (node) are both one level below the project root.
// Never use process.cwd(): Claude Desktop starts the server from an unpredictable folder.
export const PROJECT_ROOT = fileURLToPath(new URL("..", import.meta.url));

export interface IcpConfig {
  selection: { min_score: number; min_company_fit: number; default_limit: number; max_per_company: number };
  score_weights: { persona: number; company: number };
  authority: Record<Seniority, number>;
  function_relevance: Partial<Record<Fn, number>>;
  industry_overrides: Record<string, Partial<Record<Fn, number>>>; // industry keyword -> function -> relevance
  industries: { strong: string[]; medium: string[]; weak: string[]; scores: Record<IndustryTier, number> };
  headcount: { bands: { max: number | null; score: number }[]; unknown_score: number };
  regulated_industries: string[];
  role_based_local_parts: string[];
  free_email_domains: string[];
  column_aliases: Record<string, string[]>; // canonical field -> accepted header names
  country_aliases: Record<string, string>;
}

const REQUIRED_SECTIONS: (keyof IcpConfig)[] = [
  "selection", "score_weights", "authority", "function_relevance", "industry_overrides", "industries",
  "headcount", "regulated_industries", "role_based_local_parts", "free_email_domains", "column_aliases",
  "country_aliases",
];

/** Reads the ICP rules on every call (env ICP_CONFIG or config/icp.json), so edits apply without a restart. */
export function loadConfig(configPath = process.env.ICP_CONFIG || "config/icp.json"): IcpConfig {
  const fullPath = path.resolve(PROJECT_ROOT, configPath);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(fullPath, "utf8"));
  } catch (err) {
    throw new Error(`Cannot read ICP config ${fullPath}: ${(err as Error).message}`);
  }
  const config = dropComments(raw) as Record<string, unknown>;
  const missing = REQUIRED_SECTIONS.filter((key) => config[key] === undefined);
  if (missing.length > 0) {
    throw new Error(`ICP config ${fullPath} is missing: ${missing.join(", ")}`);
  }
  const label = fullPath.startsWith(PROJECT_ROOT) ? path.relative(PROJECT_ROOT, fullPath) : fullPath;
  validateConfig(config as unknown as IcpConfig, label);
  return config as unknown as IcpConfig;
}

/**
 * Checks every value the code relies on, so a typo in icp.json gives one clear error
 * (listing all problems) instead of a crash or NaN scores.
 */
export function validateConfig(config: IcpConfig, label = "config/icp.json"): void {
  const problems: string[] = [];
  const number = (where: string, value: unknown, rule: { min?: number; max?: number; whole?: boolean } = {}) => {
    const ok =
      typeof value === "number" && Number.isFinite(value) &&
      (!rule.whole || Number.isInteger(value)) &&
      (rule.min === undefined || value >= rule.min) &&
      (rule.max === undefined || value <= rule.max);
    if (!ok) {
      const range = rule.max !== undefined ? ` between ${rule.min} and ${rule.max}` : rule.min !== undefined ? ` ≥ ${rule.min}` : "";
      problems.push(`${where} must be ${rule.whole ? "a whole number" : "a number"}${range} (got ${JSON.stringify(value)})`);
    }
  };
  const wordList = (where: string, value: unknown) => {
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
      problems.push(`${where} must be a list of words (got ${JSON.stringify(value)})`);
    }
  };

  const { selection, score_weights, industries, headcount } = config;
  number("selection.min_score", selection.min_score, { min: 0, max: 100 });
  number("selection.min_company_fit", selection.min_company_fit, { min: 0, max: 1 });
  number("selection.default_limit", selection.default_limit, { min: 1, whole: true });
  number("selection.max_per_company", selection.max_per_company, { min: 1, whole: true });
  number("score_weights.persona", score_weights.persona, { min: 0 });
  number("score_weights.company", score_weights.company, { min: 0 });
  for (const seniority of SENIORITIES) number(`authority.${seniority}`, config.authority[seniority], { min: 0 });
  for (const [fn, value] of Object.entries(config.function_relevance)) number(`function_relevance.${fn}`, value, { min: 0 });
  for (const [keyword, overrides] of Object.entries(config.industry_overrides)) {
    for (const [fn, value] of Object.entries(overrides)) number(`industry_overrides.${keyword}.${fn}`, value, { min: 0 });
  }
  for (const tier of ["strong", "medium", "weak"] as const) wordList(`industries.${tier}`, industries[tier]);
  for (const tier of ["strong", "medium", "weak", "unknown"] as const) {
    number(`industries.scores.${tier}`, industries.scores?.[tier], { min: 0 });
  }
  if (!Array.isArray(headcount.bands) || headcount.bands.length === 0) {
    problems.push("headcount.bands must be a non-empty list");
  } else {
    headcount.bands.forEach((band, i) => {
      number(`headcount.bands[${i}].score`, band.score, { min: 0 });
      if (band.max !== null) number(`headcount.bands[${i}].max (or null)`, band.max, { min: 0 });
    });
  }
  number("headcount.unknown_score", headcount.unknown_score, { min: 0 });
  wordList("regulated_industries", config.regulated_industries);
  wordList("role_based_local_parts", config.role_based_local_parts);
  wordList("free_email_domains", config.free_email_domains);
  wordList("column_aliases.email", config.column_aliases.email);
  wordList("column_aliases.company", config.column_aliases.company);

  if (problems.length > 0) throw new Error(`${label} is invalid:\n- ${problems.join("\n- ")}`);
}

/**
 * Ordered default sources from config/sources.json, used when a tool call gives no source.
 * Read on every call. Without the file, the default is just data/leads.csv.
 */
export function loadDefaultSources(sourcesPath = "config/sources.json"): string[] {
  const fullPath = path.resolve(PROJECT_ROOT, sourcesPath);
  if (!existsSync(fullPath)) return ["leads.csv"];
  let list: unknown;
  try {
    list = JSON.parse(readFileSync(fullPath, "utf8")).default_sources;
  } catch (err) {
    throw new Error(`Cannot read ${fullPath}: ${(err as Error).message}`);
  }
  if (!Array.isArray(list) || list.length === 0 || !list.every((entry) => typeof entry === "string" && entry.trim())) {
    throw new Error(`${fullPath}: "default_sources" must be a non-empty list of .csv file names or Google Sheets links.`);
  }
  return list;
}

// Keys starting with "_" are notes for humans ("_comment"), not rules.
function dropComments(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropComments);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !key.startsWith("_"))
        .map(([key, inner]) => [key, dropComments(inner)]),
    );
  }
  return value;
}
