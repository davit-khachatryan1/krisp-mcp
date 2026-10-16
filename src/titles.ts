// Job title -> { seniority, function }. Pure keyword rules, checked in a fixed order.
//
// Matching rule for every keyword list below: whole words only, case-insensitive.
// A trailing "*" means "any ending": "financ*" matches finance/financial, "design*" matches designer.
// (Plain prefix matching would turn "Chief Executive Officer" into admin via "office".)

import type { Fn, Seniority } from "./types.js";

export interface ParsedTitle {
  seniority: Seniority | null;
  function: Fn | null;
}

function words(...keywords: string[]): RegExp {
  const parts = keywords.map((keyword) =>
    keyword.endsWith("*")
      ? escapeRegExp(keyword.slice(0, -1)) + "\\w*"
      : escapeRegExp(keyword),
  );
  return new RegExp(`\\b(?:${parts.join("|")})\\b`);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// 1. Checked first, so "Executive Assistant to the CEO" is not C-level.
//    ("student" is not here: a "Student Success Manager" is a manager.)
const JUNIOR_GUARD = words("assistant to", "intern", "trainee", "junior", "jr", "apprentice");

// 2. C-level abbreviations. cso/cco/cpo are ambiguous (security? sales? strategy?) -> function null -> review.
//    Skipped for assistants: a "CEO Assistant" works for the CEO.
const ASSISTANT = words("assistant");
const C_LEVEL_ABBREVIATIONS: [RegExp, Fn | null][] = [
  [words("ceo"), "general_management"],
  [words("coo"), "operations"],
  [words("cfo"), "finance"],
  [words("cto"), "engineering"],
  [words("cio", "ciso"), "it"],
  [words("cro"), "sales"],
  [words("cmo"), "marketing"],
  [words("chro"), "people"],
  [words("cso", "cco", "cpo"), null],
];

// 3. Seniority, first match wins.
//    "president" only when it is not "vice president"; "owner" not as "Product Owner" and similar;
//    "partner" only as a firm title ("Partner", "Managing Partner"), not "HR Business Partner".
const OWNER = /(?<!\b(?:product|process|project|account|data|system) )\bowner\b/;
const FIRM_PARTNER = /^partner\b|\b(?:managing|senior) partner\b/;
const SENIORITY_PATTERNS: [Seniority, RegExp][] = [
  ["c_level", new RegExp(`\\b(?:chief|founder|co-founder|managing director)\\b|(?<!vice[ -])\\bpresident\\b|${OWNER.source}`)],
  ["vp", new RegExp(`${words("vp", "svp", "evp", "avp", "vice president", "vice-president").source}|${FIRM_PARTNER.source}`)],
  ["head", words("head")],
  ["director", words("director")],
  ["manager", words("manager", "mgr")],
  ["lead", words("lead", "supervisor", "team leader")],
  ["junior", words("junior", "jr", "intern", "trainee", "assistant", "apprentice", "student", "receptionist")],
];

// 4. Function, first match wins.
const FUNCTION_PATTERNS: [Fn, RegExp][] = [
  ["customer_success", words("customer success", "customer experience", "cx", "support", "customer service",
    "client services", "account management", "contact cent*", "customer")],
  ["sales", words("sales", "revenue", "business development", "bdr", "sdr", "account executive", "commercial")],
  ["remote_work", words("remote", "hybrid", "workplace", "future of work", "distributed")],
  ["operations", words("operations", "operating", "ops")],
  ["it", words("it", "information technology", "infrastructure", "security", "systems", "helpdesk", "information")],
  ["engineering", words("engineering", "engineer*", "developer*", "technology", "r&d", "software")],
  ["people", words("people", "hr", "human resources", "talent", "recruit*")],
  ["marketing", words("marketing", "growth", "brand*")],
  ["finance", words("financ*", "accounting", "controller*", "treasur*")],
  ["product", words("product")],
  ["design", words("design*", "creative")],
  ["admin", words("office", "admin*")],
];

// 5. Founders, owners, presidents and "chief executive" run the company.
const GENERAL_MANAGEMENT = /\b(?:founder|co-founder|owner|president|managing director|chief executive)\b/;

export function parseTitle(title: string): ParsedTitle {
  const text = title.toLowerCase().trim();
  if (!text) return { seniority: null, function: null };

  if (JUNIOR_GUARD.test(text)) return { seniority: "junior", function: findFunction(text) };

  if (!ASSISTANT.test(text)) {
    for (const [pattern, fn] of C_LEVEL_ABBREVIATIONS) {
      if (pattern.test(text)) return { seniority: "c_level", function: fn };
    }
  }

  const seniority = SENIORITY_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? "individual";
  let fn = findFunction(text);
  if (fn === null && seniority === "c_level" && GENERAL_MANAGEMENT.test(text)) fn = "general_management";
  return { seniority, function: fn };
}

function findFunction(text: string): Fn | null {
  return FUNCTION_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] ?? null;
}
