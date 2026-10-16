// First-touch email drafts from fixed templates. DRAFT ONLY – this module cannot send anything.
// Claude polishes the wording afterwards; the templates keep the facts honest.

import type { IcpConfig } from "./config.js";
import type { Fn, Lead } from "./types.js";

export type Angle = Exclude<Fn, "finance" | "marketing" | "product" | "design" | "admin"> | "operations_bpo" | "default";

interface Template {
  subject: string;
  hook: string;
  value: string;
}

// Placeholder: {company}. Drafts use only what the prospect expects us to know (name, company, role, industry) –
// never headcount/size, country, scores or statuses, so they don't reveal that we hold a data file about them.
export const TEMPLATES: Record<Angle, Template> = {
  sales: {
    subject: "{company}'s sales calls",
    hook: "Your reps spend most of the day on calls, and two things quietly cost deals: background noise on either side of the line, and the time spent typing notes afterwards.",
    value: "Krisp removes noise and echo on both ends of any call app, and writes the call notes and follow-ups for the rep, synced to your CRM.",
  },
  customer_success: {
    subject: "Clearer customer calls at {company}",
    hook: "For a customer-facing team, the call itself is the product experience - and it is hard to control when people work from home or busy offices.",
    value: "Krisp keeps every customer call clear on any call app and turns each call into a summary with action items, so nothing gets lost between handoffs.",
  },
  remote_work: {
    subject: "Remote calls at {company}",
    hook: "With a distributed team, people take calls from kitchens, cafés and co-working spaces, and half the meeting is spent on 'can you mute?'.",
    value: "Krisp removes background noise and voices on Zoom, Teams, Meet or any other app, and captures notes so people who missed the call can catch up in two minutes.",
  },
  operations: {
    subject: "Meetings across {company}",
    hook: "Running operations at {company} means a lot of calls, and a lot of decisions that live only in someone's memory afterwards.",
    value: "Krisp cleans up audio on any call app and automatically captures notes and action items - without a bot joining the meeting.",
  },
  operations_bpo: {
    subject: "Agent call quality at {company}",
    hook: "On a busy contact floor, background noise and accent friction show up directly in handle time and customer satisfaction.",
    value: "Krisp removes noise on both ends of the line on any softphone, and can convert accents in real time so customers understand agents the first time.",
  },
  general_management: {
    subject: "A question about calls at {company}",
    hook: "At {company}, a big share of the week probably happens on calls - with customers, candidates and each other.",
    value: "Krisp makes those calls clearer on any app and turns them into notes and action items automatically, so teams spend less time in follow-up.",
  },
  it: {
    subject: "Call audio + notes for {company}, IT-friendly",
    hook: "When teams ask for an AI note-taker, IT usually inherits the questions: which apps, where the audio goes, and how to manage it.",
    value: "Krisp works as one virtual mic/speaker across every call app (no per-app plugins), processes audio on the device, and supports SSO/SCIM with central admin controls.",
  },
  engineering: {
    subject: "Stand-ups and incident calls at {company}",
    hook: "Engineering teams live on stand-ups, design reviews and incident calls, and the decisions from those calls rarely make it into writing.",
    value: "Krisp removes noise on any call app and captures notes and action items automatically, so the 'what did we decide?' thread disappears.",
  },
  people: {
    subject: "Interviews and 1:1s at {company}",
    hook: "Interviews, 1:1s and all-hands are a big part of a people team's week, and good notes are usually the first thing to slip.",
    value: "Krisp keeps those calls clear wherever people join from, and writes the notes and action items automatically.",
  },
  default: {
    subject: "Calls at {company}",
    hook: "Most teams at {company} probably spend a large part of the week on calls.",
    value: "Krisp removes background noise on any call app and writes notes and action items automatically.",
  },
};

const CTA = "Would a 15-minute look next week be useful? If this isn't on your radar, just reply 'no' and I won't follow up.";
const BPO_KEYWORDS = ["bpo", "outsourcing", "call center", "contact center"];
const DEFAULT_ANGLE_FUNCTIONS: Fn[] = ["finance", "marketing", "product", "design", "admin"];

export interface Draft {
  leadId: string;
  to: string;
  toName: string;
  subject: string;
  body: string;
  wordCount: number;
  angle: Angle;
  dataStatus: "ok" | "review"; // the data check only; ranking (selected, backup …) is find_leads' job
  personalizationNotes: string[];
  warnings: string[];
  sent: false;
}

export interface DraftError {
  leadId: string;
  error: string;
  reasons: string[];
}

export function pickAngle(lead: Lead): Angle {
  const fn = lead.persona.function;
  const industry = lead.industry.toLowerCase();
  if (fn === "operations" && BPO_KEYWORDS.some((keyword) => industry.includes(keyword))) return "operations_bpo";
  if (fn === null || DEFAULT_ANGLE_FUNCTIONS.includes(fn)) return "default";
  return fn as Angle;
}

export function draft(
  lead: Lead,
  config: IcpConfig,
  senderName = "[Your name]",
  senderTitle = "[Your title], Krisp",
): Draft | DraftError {
  if (lead.status === "excluded") {
    return { leadId: lead.leadId, error: "lead is excluded - no draft created", reasons: lead.reasons };
  }

  // Only data problems warn here. Ranking (backup, low_fit, top N) depends on the find_leads rules.
  const warnings: string[] = [];
  if (lead.status === "review") {
    warnings.push(`lead is in REVIEW – a human should confirm before this draft is used: ${lead.reasons.join("; ")}`);
  }
  warnings.push(...lead.warnings);

  const angle = pickAngle(lead);
  const fill = (text: string) => text.replaceAll("{company}", lead.company);
  const template = TEMPLATES[angle];

  const localPart = lead.email.slice(0, lead.email.indexOf("@"));
  const roleMailbox = config.role_based_local_parts.includes(localPart);
  const greeting = lead.firstName && !roleMailbox
    ? `Hi ${lead.firstName},`
    : lead.company ? `Hi ${lead.company} team,` : "Hi there,";

  const hook = fill(template.hook);
  const regulatedLine = lead.regulatedIndustry
    ? ` Audio is processed on the device, which tends to matter for ${lead.industry.toLowerCase()} teams.`
    : "";
  const value = fill(template.value) + regulatedLine;
  const body = [greeting, hook, value, CTA, `${senderName}\n${senderTitle}`].join("\n\n");

  return {
    leadId: lead.leadId,
    to: lead.email,
    toName: (!roleMailbox && [lead.firstName, lead.lastName].filter(Boolean).join(" ")) || `${lead.company} team`,
    subject: fill(template.subject),
    body,
    wordCount: countWords(`${hook} ${value} ${CTA}`),
    angle,
    dataStatus: lead.status === "review" ? "review" : "ok",
    // What Claude reads before polishing: only the facts the prospect expects us to know, plus the rules.
    personalizationNotes: [
      `Facts you may use: first name "${lead.firstName}", company "${lead.company}", role "${lead.title}", industry "${lead.industry}".`,
      "Use only: first name, company name, role, industry. Never mention headcount, company size numbers, country, scores or statuses.",
      "Add ONE personal line about their role or industry, and let it REPLACE the template's first sentence – do not stack two intro paragraphs.",
      "Do not invent facts about the company (funding, news, growth, tools they use).",
      "Only claim what Krisp actually does: noise/echo removal, accent conversion, AI notes & summaries, CRM sync, on-device audio, SSO/SCIM.",
      "Keep it under ~120 words, one CTA, plain text, no links or images in a first touch.",
    ],
    warnings,
    sent: false,
  };
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
