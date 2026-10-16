# Part B – Deliverability

**Domains**
- Don't send cold emails from krisp.ai. Use 2–3 separate domains, so if something goes wrong, the main domain is safe.
- Use real people's names in the mailboxes, not "sales@".
- krisp.ai already sends important emails to existing users (sign-in, billing, support). Cold outreach must never put those at risk.

**SPF / DKIM / DMARC**
- Set up all three on every new domain before sending anything. Gmail and Yahoo require them.
- SPF says who can send from our domain. DKIM proves the email was not changed. DMARC says what to do if those checks fail.
- Start DMARC in watch-only mode (p=none), check the reports, then make it stricter.
- Krisp is a known brand, so new look-alike domains without authentication look like phishing. Our targets (banks, insurance, IT teams) have strict email filters. And Krisp sells security and privacy, so its own emails should pass security checks.

**Warm-up**
- New domains have no reputation. Warm them up for 2–3 weeks before cold emails.
- Start with a few emails a day and increase slowly.
- This is a new outbound launch on new domains, so there is no sending history yet. Rushing it would waste the first, best leads.

**Volume**
- Max ~30–50 cold emails per day per mailbox. Need more? Add mailboxes.
- Start with the best leads (our top 10) and watch bounces, spam complaints and replies before sending more.
- Our MCP already removes bad and shared (info@, sales@) emails — that keeps bounces low.
- Krisp sells to specific roles (sales, CS, ops, IT leaders), not to everyone. Fewer, better-targeted emails get more replies and fewer complaints, which builds a good reputation from day one.
