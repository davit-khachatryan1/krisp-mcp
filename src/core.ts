// Glue between the MCP tools and the plain functions:
// config -> source -> loader -> analyze -> (filters) -> select -> result / draft.
// Config and data are re-read on every call, so edits apply without a restart.

import { loadConfig, type IcpConfig } from "./config.js";
import { draft } from "./drafting.js";
import { loadLeads, normalizeCountry } from "./loader.js";
import { analyze, select } from "./scoring.js";
import { readSource } from "./source.js";
import type { Fn, Lead, Status } from "./types.js";

export interface Filters {
  industries?: string[];
  countries?: string[];
  functions?: Fn[];
  minHeadcount?: number;
  maxHeadcount?: number;
}

export interface FindLeadsOptions extends Filters {
  limit?: number;
  minScore?: number;
  maxPerCompany?: number;
  source?: string;
}

async function loadAndAnalyze(source?: string) {
  const config = loadConfig();
  const { text, sourceLabel, skipped } = await readSource(source);
  const { leads, report } = loadLeads(text, config);
  analyze(leads, config);
  return { config, leads, report, sourceLabel, skipped };
}

export async function findLeads(opts: FindLeadsOptions = {}) {
  const { config, leads, report, sourceLabel, skipped } = await loadAndAnalyze(opts.source);
  const limit = opts.limit ?? config.selection.default_limit;
  const minScore = opts.minScore ?? config.selection.min_score;
  const maxPerCompany = opts.maxPerCompany ?? config.selection.max_per_company;
  const filters: Filters = {
    industries: opts.industries,
    countries: opts.countries,
    functions: opts.functions,
    minHeadcount: opts.minHeadcount,
    maxHeadcount: opts.maxHeadcount,
  };

  applyFilters(leads, filters, config);
  select(leads, config, minScore, maxPerCompany, limit);

  const withStatus = (status: Status) => leads.filter((lead) => lead.status === status);
  return {
    summary: {
      sourceLabel,
      skippedSources: skipped, // default sources that could not be read, e.g. a missing data/leads.csv
      ...report,
      statusCounts: countStatuses(leads),
      rules: { limit, minScore, maxPerCompany, filters },
      howScoreWorks: howScoreWorks(config),
    },
    selected: withStatus("selected")
      .sort((a, b) => a.rank! - b.rank!)
      .map((lead) => ({
        rank: lead.rank,
        leadId: lead.leadId,
        name: fullName(lead),
        title: lead.title,
        company: lead.company,
        industry: lead.industry,
        headcount: lead.headcount,
        country: lead.country,
        email: lead.email,
        score: lead.score,
        persona: lead.persona,
        reasons: lead.reasons,
        warnings: lead.warnings,
        backupsAtSameCompany: lead.backups ?? [],
      })),
    needsReview: withStatus("review").map(brief),
    backupContacts: withStatus("backup").map(brief),
    qualifiedNotInTop: withStatus("qualified_not_in_top").sort((a, b) => b.score - a.score).map(brief),
    lowFit: withStatus("low_fit").map(brief),
    excluded: withStatus("excluded").map(brief),
    filteredOut: withStatus("filtered_out").map((lead) => lead.leadId),
  };
}

/** No ranking here: the draft only needs the data checks (excluded -> no draft, review -> warning). */
export async function draftEmail(leadId: string, senderName?: string, senderTitle?: string, source?: string) {
  const { config, leads } = await loadAndAnalyze(source);
  const wanted = leadId.trim().toLowerCase();
  const lead = leads.find((l) => l.leadId.toLowerCase() === wanted);
  if (!lead) return { error: `lead_id '${leadId}' not found` };
  return draft(lead, config, senderName, senderTitle);
}

/** Filters only narrow the candidates; leads already in review/excluded keep their status. */
function applyFilters(leads: Lead[], f: Filters, config: IcpConfig): void {
  const lower = (values: string[]) => values.map((value) => value.toLowerCase());
  // Same country aliases as the data, so "USA" finds leads stored as "United States".
  const countries = lower((f.countries ?? []).map((country) => normalizeCountry(country, config.country_aliases)));
  for (const lead of leads.filter((l) => l.status === "candidate")) {
    const failed: string[] = [];
    const industry = lead.industry.toLowerCase();
    if (f.industries?.length && !lower(f.industries).some((keyword) => industry.includes(keyword))) {
      failed.push(`industry '${lead.industry}' not in ${f.industries.join("/")}`);
    }
    if (countries.length > 0 && !countries.includes(lead.country.toLowerCase())) {
      failed.push(`country '${lead.country}' not in ${f.countries!.join("/")}`);
    }
    if (f.functions?.length && !(lead.persona.function && f.functions.includes(lead.persona.function))) {
      failed.push(`function '${lead.persona.function ?? "unknown"}' not in ${f.functions.join("/")}`);
    }
    if (f.minHeadcount !== undefined && (lead.headcount === null || lead.headcount < f.minHeadcount)) {
      failed.push(`headcount ${lead.headcount ?? "unknown"} below ${f.minHeadcount}`);
    }
    if (f.maxHeadcount !== undefined && (lead.headcount === null || lead.headcount > f.maxHeadcount)) {
      failed.push(`headcount ${lead.headcount ?? "unknown"} above ${f.maxHeadcount}`);
    }
    if (failed.length > 0) {
      lead.status = "filtered_out";
      lead.reasons.push(`filtered out: ${failed.join("; ")}`);
    }
  }
}

function brief(lead: Lead) {
  return {
    leadId: lead.leadId,
    name: fullName(lead),
    title: lead.title,
    company: lead.company,
    score: lead.score,
    reasons: lead.reasons,
  };
}

function fullName(lead: Lead): string {
  return [lead.firstName, lead.lastName].filter(Boolean).join(" ");
}

function countStatuses(leads: Lead[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const lead of leads) counts[lead.status!] = (counts[lead.status!] ?? 0) + 1;
  return counts;
}

function howScoreWorks(config: IcpConfig): string {
  const w = config.score_weights;
  return `100 * (${w.persona} * authority x call_relevance + ${w.company} * avg(industry fit, headcount fit)); see config/icp.json`;
}
