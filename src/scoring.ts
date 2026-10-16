// analyze(): data checks + scores, gives every lead a status and reasons.
// select():  per-company pick and top-N ranking of the remaining candidates.
// All weights and keywords come from config/icp.json.

import type { IcpConfig } from "./config.js";
import { isValidEmail } from "./loader.js";
import { parseTitle } from "./titles.js";
import type { Lead, Status } from "./types.js";

const TIERS = ["strong", "medium", "weak"] as const;

// ---------- score ----------

/** Fills persona, companyFit, score and regulatedIndustry on the lead. */
export function scoreLead(lead: Lead, config: IcpConfig): void {
  const { seniority, function: fn } = parseTitle(lead.title);
  const industry = lead.industry.toLowerCase();

  const authority = seniority === null ? 0 : (config.authority[seniority] ?? 0);
  let callRelevance = fn === null ? 0 : (config.function_relevance[fn] ?? 0.3);
  if (fn !== null) {
    for (const [keyword, overrides] of Object.entries(
      config.industry_overrides,
    )) {
      const override = overrides[fn];
      if (industry.includes(keyword) && override !== undefined)
        callRelevance = Math.max(callRelevance, override);
    }
  }

  const industryTier =
    TIERS.find((tier) =>
      config.industries[tier].some((keyword) => industry.includes(keyword)),
    ) ?? "unknown";
  const industryScore = config.industries.scores[industryTier];
  const headcountScore =
    lead.headcount === null
      ? config.headcount.unknown_score
      : (config.headcount.bands.find(
          (band) => band.max === null || lead.headcount! <= band.max,
        )?.score ?? config.headcount.unknown_score);

  lead.persona = { seniority, function: fn, authority, callRelevance };
  lead.companyFit = { industryTier, industryScore, headcountScore };
  const weights = config.score_weights;
  lead.score = round1(
    100 *
      (weights.persona * authority * callRelevance +
        weights.company * companyFit(lead)),
  );
  lead.regulatedIndustry = config.regulated_industries.some((keyword) =>
    industry.includes(keyword),
  );
}

/** 0..1, the average of industry fit and headcount fit. */
export function companyFit(lead: Lead): number {
  return (lead.companyFit.industryScore + lead.companyFit.headcountScore) / 2;
}

// ---------- status ----------

const STRENGTH: Partial<Record<Status, number>> = {
  candidate: 1,
  review: 2,
  excluded: 3,
};

/** Status precedence excluded > review > candidate: never downgrade, always keep the reason. */
function mark(
  lead: Lead,
  status: "candidate" | "review" | "excluded",
  reason?: string,
): void {
  if (
    (STRENGTH[status] ?? 0) > (lead.status ? (STRENGTH[lead.status] ?? 0) : 0)
  )
    lead.status = status;
  if (reason) lead.reasons.push(reason);
}

// ---------- analyze ----------

export function analyze(leads: Lead[], config: IcpConfig): Lead[] {
  // 1. Company identity by email domain: colleagues on one work domain are one company.
  //    Leads without a company are skipped here (they go to review in step 5).
  const firstOnDomain = new Map<string, Lead>();
  for (const lead of leads) {
    if (
      !lead.companyKey ||
      !isValidEmail(lead.email) ||
      config.free_email_domains.includes(lead.domain)
    )
      continue;
    const first = firstOnDomain.get(lead.domain);
    if (!first) {
      firstOnDomain.set(lead.domain, lead);
    } else if (first.companyKey !== lead.companyKey) {
      lead.warnings.push(
        `company name '${lead.company}' differs from colleagues on ${lead.domain} ('${first.company}'); treated as same company`,
      );
      lead.companyKey = first.companyKey;
    }
  }

  // 2. Headcount is a company fact: fill empty values from colleagues (most common known value).
  for (const [companyKey, members] of groupBy(
    leads,
    (lead) => lead.companyKey,
  )) {
    if (!companyKey) continue;
    const known = members.filter((lead) => lead.headcount !== null);
    if (known.length === 0) continue;
    const counts = new Map<number, number>();
    for (const lead of known)
      counts.set(lead.headcount!, (counts.get(lead.headcount!) ?? 0) + 1);
    let best = known[0].headcount!; // ties -> first seen
    for (const [value, count] of counts)
      if (count > counts.get(best)!) best = value;
    const from = known.find((lead) => lead.headcount === best)!;

    for (const lead of members) {
      if (lead.headcount === null) {
        lead.headcount = best;
        lead.warnings.push(
          `headcount was empty, filled with ${best} from ${from.leadId} (same company)`,
        );
      } else if (counts.size > 1) {
        lead.warnings.push(
          `headcount differs between colleagues (${[...counts.keys()].join(", ")}); most common is ${best}`,
        );
      }
    }
  }

  // 3. Duplicates by email.
  for (const [email, group] of groupBy(leads, (lead) => lead.email)) {
    if (!email || group.length < 2) continue;
    const personas = group.map((lead) => parseTitle(lead.title));
    const samePersona = personas.every(
      (p) =>
        p.seniority === personas[0].seniority &&
        p.function === personas[0].function,
    );
    if (samePersona) {
      for (const duplicate of group.slice(1))
        mark(duplicate, "excluded", `exact duplicate of ${group[0].leadId}`);
    } else {
      const records = group
        .map((lead) => `${lead.leadId} '${lead.title}'`)
        .join(", ");
      for (const lead of group) {
        mark(
          lead,
          "review",
          `same email used by conflicting records: ${records} – cannot tell which role is current`,
        );
      }
    }
  }

  // 4. Same name at the same company with a different email: maybe the same person twice.
  //    Same name at a different company is a different person (identity = email).
  const named = leads.filter(
    (lead) => lead.firstName && lead.lastName && lead.status !== "excluded",
  );
  for (const [, group] of groupBy(named, (lead) =>
    `${lead.firstName} ${lead.lastName}|${lead.companyKey}`.toLowerCase(),
  )) {
    for (const later of group.slice(1)) {
      if (later.email !== group[0].email)
        mark(later, "review", `possible duplicate of ${group[0].leadId}`);
    }
  }

  // 5. Per lead: score, then the hard stops and the human checks.
  for (const lead of leads) {
    scoreLead(lead, config);
    if (lead.status === "excluded") continue; // exact duplicate: already explained
    checkContact(lead, config);
  }
  return leads;
}

/** Hard stops -> excluded; doubts -> review; otherwise candidate. Non-excluded leads get the score explained. */
function checkContact(lead: Lead, config: IcpConfig): void {
  // Hard stops.
  if (!lead.email) mark(lead, "excluded", "no email address");
  else if (!isValidEmail(lead.email))
    mark(lead, "excluded", `invalid email '${lead.emailRaw}'`);
  if (lead.persona.seniority === "junior")
    mark(lead, "excluded", `no buying power ('${lead.title}')`);
  if (lead.status === "excluded") return;

  // A human must look first.
  const localPart = lead.email.slice(0, lead.email.indexOf("@"));
  if (config.role_based_local_parts.includes(localPart)) {
    const mismatch = lead.title
      ? `; title says '${lead.title}', so the mailbox does not match the person`
      : "";
    mark(
      lead,
      "review",
      `shared role mailbox '${localPart}@' – not a personal inbox${mismatch}`,
    );
  }
  if (config.free_email_domains.includes(lead.domain)) {
    mark(
      lead,
      "review",
      `personal email domain (${lead.domain}), not a work address`,
    );
  }
  if (!lead.title) mark(lead, "review", "title is empty – cannot judge role");
  else if (lead.persona.function === null)
    mark(
      lead,
      "review",
      `title '${lead.title}' not recognised – check function manually`,
    );
  if (!lead.firstName && !lead.lastName)
    mark(lead, "review", "no contact name");
  if (!lead.companyKey) mark(lead, "review", "company is empty");

  lead.reasons.push(explainScore(lead));
  mark(lead, "candidate");
}

/** "score 94: vp x sales (authority 0.9 x call relevance 1.0); industry 'Software' = strong, headcount 1400" */
function explainScore(lead: Lead): string {
  const p = lead.persona;
  return (
    `score ${lead.score}: ${p.seniority ?? "unknown seniority"} x ${p.function ?? "unknown function"} ` +
    `(authority ${decimal(p.authority)} x call relevance ${decimal(p.callRelevance)}); ` +
    `industry '${lead.industry}' = ${lead.companyFit.industryTier}, headcount ${lead.headcount ?? "unknown"}`
  );
}

// ---------- select ----------

export function select(
  leads: Lead[],
  config: IcpConfig,
  minScore = config.selection.min_score,
  maxPerCompany = config.selection.max_per_company,
  limit = config.selection.default_limit,
): Lead[] {
  // 1. Company and score thresholds.
  const minFit = config.selection.min_company_fit;
  const byCompany = new Map<string, Lead[]>();
  for (const lead of leads.filter((l) => l.status === "candidate")) {
    const fit = companyFit(lead);
    if (fit < minFit) {
      lead.status = "low_fit";
      lead.reasons.push(
        `company fit ${round2(fit)} below ${minFit} (industry/size not ICP), even if the person is senior`,
      );
    } else if (lead.score < minScore) {
      lead.status = "low_fit";
      lead.reasons.push(`score ${lead.score} below the minimum ${minScore}`);
    } else {
      byCompany.set(lead.companyKey, [
        ...(byCompany.get(lead.companyKey) ?? []),
        lead,
      ]);
    }
  }

  // 2. Best maxPerCompany contacts per company; colleagues become backups.
  const kept: Lead[] = [];
  for (const group of byCompany.values()) {
    group.sort(
      (a, b) =>
        b.score - a.score ||
        b.persona.authority - a.persona.authority ||
        compareIds(a, b),
    );
    const top = group.slice(0, maxPerCompany);
    const rest = group.slice(maxPerCompany);
    for (const backup of rest) {
      backup.status = "backup";
      backup.reasons.push(
        `colleague ${top[0].leadId} at ${top[0].company} is a better fit (score ${top[0].score}); keep as follow-up contact`,
      );
    }
    for (const lead of top) lead.backups = rest.map((backup) => backup.leadId);
    kept.push(...top);
  }

  // 3. Rank: the first `limit` are selected, the rest stay qualified.
  kept.sort((a, b) => b.score - a.score || compareIds(a, b));
  kept.forEach((lead, index) => {
    if (index < limit) {
      lead.status = "selected";
      lead.rank = index + 1;
    } else {
      lead.status = "qualified_not_in_top";
      lead.reasons.push(
        `qualifies, but ranked ${index + 1} – outside the top ${limit}`,
      );
    }
  });
  return leads;
}

// ---------- helpers ----------

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items)
    groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

function compareIds(a: Lead, b: Lead): number {
  return a.leadId < b.leadId ? -1 : a.leadId > b.leadId ? 1 : 0;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const decimal = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n)); // 1 -> "1.0", 0.9 -> "0.9"
