// Shared types. The arrays are the single source of truth: the TS types and the
// zod enum in server.ts are both derived from them.

export const SENIORITIES = ["c_level", "vp", "head", "director", "manager", "lead", "individual", "junior"] as const;
export type Seniority = (typeof SENIORITIES)[number];

export const FUNCTIONS = [
  "sales", "customer_success", "remote_work", "operations", "general_management", "it",
  "engineering", "people", "marketing", "finance", "product", "design", "admin",
] as const;
export type Fn = (typeof FUNCTIONS)[number];

export type Status =
  | "candidate"            // passed all checks, waiting for select()
  | "selected"             // in the top N
  | "backup"               // good lead, but a colleague at the same company ranks higher
  | "qualified_not_in_top" // good lead, outside the top N
  | "low_fit"              // company or score below the ICP threshold
  | "review"               // a human must look at it first
  | "excluded"             // hard stop, never contacted
  | "filtered_out";        // removed by a find_leads filter

export type IndustryTier = "strong" | "medium" | "weak" | "unknown";

export interface Persona {
  seniority: Seniority | null;
  function: Fn | null;
  authority: number;
  callRelevance: number;
}

export interface CompanyFit {
  industryTier: IndustryTier;
  industryScore: number;
  headcountScore: number;
}

export interface Lead {
  leadId: string;
  firstName: string;
  lastName: string;
  title: string;
  company: string;
  companyKey: string;
  industry: string;
  headcount: number | null;
  headcountRaw: string;
  country: string;
  email: string;
  emailRaw: string;
  domain: string;
  rowNumber: number;
  // filled by analyze()
  status: Status | null;
  score: number;
  reasons: string[];
  warnings: string[];
  persona: Persona;
  companyFit: CompanyFit;
  regulatedIndustry: boolean;
  rank?: number;
  backups?: string[];
}

export interface LoadReport {
  delimiter: string;
  rows: number;
  columnsMapped: Record<string, string>; // canonical field -> header as written in the file
  columnsMissing: string[];
  unrecognizedHeaders: string[];
}
