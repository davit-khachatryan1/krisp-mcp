# Changing the email wording, tone or length

Read when the request is about the drafts: shorter, friendlier, more formal, different subject, different CTA,
mention something new. **One file: `src/drafting.ts`.**

## Where
- `TEMPLATES` – one `{ subject, hook, value }` per angle: sales, customer_success, remote_work, operations,
  operations_bpo, general_management, it, engineering, people, default.
- `CTA` – the single call to action with the opt-out line (shared by all angles).
- `pickAngle()` – which template a lead gets (function + industry). Change only if the request is about routing.
- `draft()` – greeting, regulated-industry privacy line, signature, `personalizationNotes`, warnings.

Placeholder: `{company}` only.

## Rules the drafts must keep
- **Never expose the data we hold.** Use only what the prospect expects us to know: first name, company, role,
  industry. Never headcount or size labels ("140-person"), country, scores or statuses, and don't guess their
  tools (say "your CRM", not a vendor). `tests/drafting.test.ts` checks this for the top 10.
- ≤ 120 words (hook + value + CTA; `wordCount` reports it), plain text, **no links or images**, one CTA,
  an opt-out ("just reply 'no'").
- Only claims Krisp can back up: noise/echo removal, accent conversion, AI notes & summaries, CRM sync,
  on-device audio, SSO/SCIM. No invented numbers, customers or facts about the prospect.
- Role mailboxes greet "Hi {company} team"; review leads get a warning; excluded leads get no draft.
- Claude polishes drafts at run time – keep templates factual and plain, not clever.

## Check
1. `npx vitest run tests/drafting.test.ts` – checks L017 (BPO angle, "Hi Noah,", ≤ 120 words, `sent: false`),
   L002 (team greeting), L048 (no draft), no links in templates.
2. `npm run demo` and read 2–3 drafts in `output/drafts.md`; the word counts are in the console table.
3. `npm run build` – a code change needs a rebuild and a Claude Desktop restart.
