# Part B – Deliverability

In this order, before the first email:

**1. Domains**
- Don't send cold email from krisp.ai – it sends sign-in, billing and support emails to existing users, and those must never be at risk. Use 2–3 separate domains instead.
- Use mailboxes with real people's names, not "sales@".

**2. SPF / DKIM / DMARC**
- Set up all three on every new domain. Gmail and Yahoo require them for bulk senders.
- SPF says who can send from our domain, DKIM proves the email was not changed, DMARC says what to do if those checks fail.
- Start DMARC in watch-only mode (p=none), check the reports, then make it stricter.
- For Krisp this matters even more: a new look-alike domain of a known brand looks like phishing without it, and our targets (financial services, insurance, IT teams) have strict filters.

**3. Warm-up**
- New domains have no reputation. Warm them up for 2–3 weeks, starting with a few emails a day.
- Rushing it would waste the first, best leads.

**4. Volume**
- Max ~30–50 cold emails per day per mailbox. Need more? Add mailboxes.
- Start with our top 10 and watch bounces, spam complaints and replies before sending more.
- The MCP helps: it excludes invalid emails, sends shared mailboxes (info@, sales@) to review, and picks one contact per company.