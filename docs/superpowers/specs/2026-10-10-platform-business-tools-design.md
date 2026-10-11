# ADsmartschool Business Tools (Design amendment)

**Date:** 2026-10-10
**Status:** Draft for the owner's review. Nothing is built yet.
**Amends:** the multi-school platform spec (`2026-10-09-multi-school-platform-design.md`):
- §5 (admin area) and §6 (your website): extended.
- §10 (build plan): new plans added.
- §11 (out of scope): "Billing and subscriptions" moves into scope.
- §12 (open items): the "Pricing and how schools pay" item is answered here.

---

## 0. In plain words

**In your admin area you get:**
- **Finance.** Your prices and plans. Bills (invoices) for each school. Payments, recorded by hand or paid online by Mobile Money or card. Receipts. Automatic reminders. An option to pause a school that hasn't paid.
- **Statistics.** One page showing how the business is doing: schools, join requests, pupils, real use, money and visitors to your website.
- **Team roles.** Each team member gets only what their job needs: Owner, Finance, Content or Support.
- **Website content.** Gallery photos, articles and tips, comments from schools, questions and answers, and the prices shown on your website.
- **Talking with schools.** Announcements to all or some schools, and support conversations that schools start from their own portal.
- **Download to Excel** for money, statistics and subscriber lists.

**On your own website, visitors get:**
- A **gallery**.
- **Articles and tips** for running and growing a school.
- **Prices**, **comments from schools** and **questions and answers**.
- **Sign-up for new tips** by email, and a **Follow on WhatsApp** button.

**Each school's portal gets:**
- A **Billing** page, where the school can see its bills, pay online and print receipts.
- A **Contact ADsmartschool** page.
- Your **announcements**, shown at the top.

---

## 1. Intent

### 1.1 What the owner asked for (2026-10-10)
- Finance and Statistics in the admin area.
- A gallery on the owner's own website (the landing page).
- A place on the website to publish articles, plus tips to help schools manage and grow.
- "Add them": every suggested addition is included:
  - online Mobile Money and card payments;
  - automatic payment reminders;
  - a prices section;
  - team roles;
  - Excel downloads;
  - comments from schools;
  - FAQ;
  - announcements;
  - support messages;
  - tips by email and WhatsApp;
  - visitor counts.

### 1.2 Decisions made on the owner's behalf (please confirm or change)

| Question | Default chosen | Other option |
|---|---|---|
| What "Finance" covers | Your income from schools (their subscriptions to ADsmartschool) | School fees that parents pay to schools: a separate, later module (§10) |
| Currency | Ghana cedis (GH₵). Amounts are stored as whole pesewas, so there are no rounding errors | — |
| How prices work | **Owner, 2026-10-11:** one **yearly price** per plan, paid in one go. Enterprise shows a starting price ("From GH₵10,000"), and each group's price is agreed | — |
| When bills are due | Once a year, on the anniversary of the day the school's free trial ended | One date a year for every school |
| Changing a price | **Owner, 2026-10-11:** new schools only. Schools already on a plan keep their price until you move them | — |
| Who changes plans and prices | **Owner, 2026-10-11:** Owner and Finance | — |
| Enterprise (school groups) | **Owner, 2026-10-11:** one bill for the whole group, at a price agreed with the group | — |
| Free trial | 30 days, set per plan | No trial |
| Online payments | **Paystack**: MTN MoMo, Telecel Cash, AirtelTigo Money and cards, in cedis | Hubtel |
| Paystack's fee on each payment | You absorb it, so the school pays exactly the bill | The school pays it on top |
| Reminders | 7 days before the due date, on the due date, then 7 and 14 days after | Your own schedule (it's a setting) |
| Pausing a school that hasn't paid | **Off** by default. When on: paused 21 days after the due date, with a final warning 7 days before | Always on |
| Invoices and receipts | Print-friendly pages that can be printed or saved as PDF from any browser | Generated PDF files (needs extra software on the server) |
| "Download to Excel" | CSV files, which open directly in Excel | Native .xlsx files |
| Tips by WhatsApp | A **Follow on WhatsApp** button linking to your WhatsApp Channel. The system sends no WhatsApp messages | Sending through a paid WhatsApp Business provider |
| Visitor counts | A simple count of page visits on **your website only**. No cookies and no personal data | A third-party analytics service |

---

## 2. Team roles in the admin area

Today every team account can do everything. From now on each account has one or more roles:

| Role | Can use |
|---|---|
| **Owner** | Everything, including the Team screen, finance settings and the platform audit log |
| **Finance** | Finance (plans, bills, payments, receipts, reminders), the money figures in Statistics, money downloads |
| **Content** | Gallery, articles and tips, comments from schools, FAQ, the prices section's wording, tip subscribers |
| **Support** | Schools, join requests, support conversations, announcements |

- **Everyone** sees the Statistics page. Money figures appear only to Owner and Finance.
- **Team screen (Owner only):**
  - Add a team member with name, username, mobile, email and roles. They get a one-time password, just like a school's first Administrator.
  - Change their roles, or switch an account off. Accounts are switched off rather than deleted, so their history stays readable.
  - This replaces creating team accounts with `manage.py` (platform spec §5).
- **Safety:**
  - The second sign-in step (a code by SMS or email) stays required for every team account.
  - Every role change is written to the audit log.
  - The last remaining Owner can't be removed or switched off.
- **Existing accounts** (including `devadmin`) become **Owner** when this ships, so nobody loses access.
- **The server enforces every rule.** Hiding a menu item is never the only protection.

---

## 3. Finance

### 3.1 Plans
You create plans in the admin area. A plan has:
- **Name**, e.g. "Starter" or "Standard".
- **What's included:** a short list shown on your website's prices section.
- **Who it's for:** a short line, e.g. "Small schools and newly established private schools".
- **Price per year** in GH₵, paid in one go.
- **"From" price:** when ticked, the website shows "From GH₵…" and a **Talk to us** button, because each customer's price is agreed (Enterprise).
- **Free-trial length** in days (default 30).
- **Show on website:** yes or no.
- **Active:** yes or no. A plan that is switched off can't be given to new schools, but schools already on it keep it.

**Starting plans (owner, 2026-10-11):**

| Plan | Who it's for | Price per year |
|---|---|---|
| Basic | Small schools and newly established private schools | GH₵1,200 |
| Standard | Established basic schools and junior high schools | GH₵2,400 |
| Professional | Larger schools requiring more administrative tools | GH₵4,800 |
| Premium | Large schools requiring extensive features | GH₵7,200 |
| Enterprise | School groups and multiple campuses | From GH₵10,000 |

- **Who can change plans and prices:** Owner and Finance.
- **Features:** plans don't switch features on or off yet. Every school gets everything the system does today; a plan sets the price and the words shown on the website.

### 3.2 Each school's subscription
- **Every school has one subscription:**
  - its plan;
  - **its own yearly price**, copied from the plan when the school joins or is moved. Changing a plan's price affects new schools only (owner, 2026-10-11);
  - its start date;
  - its next billing date (once a year);
  - an optional standing discount (a percentage or a fixed amount, with a reason).
- **School groups (Enterprise):**
  - A group has a name and a billing contact, and owns several schools (its campuses).
  - The group has one subscription at its agreed price and gets **one bill a year** for all its campuses.
  - Each campus still has its own website, records and portal. Its Billing page shows the group's bills.
- **Trial:**
  - A new school starts on trial (status `TRIAL`).
  - Its first bill is issued when the trial ends. After that, a bill comes once a year on that date.
  - Its first payment makes it `ACTIVE`.
- **Changing plan:** takes effect from the next bill. A bill already issued is left as it is.
- **Where it shows:** on the school's page in the admin area, as a new **Billing** tab.

### 3.3 Bills (invoices)
- **Numbering:** `ADS-2026-0001`, `ADS-2026-0002` and so on, with no gaps.
- **When they're made:**
  - automatically, 14 days before each yearly billing date (a setting);
  - or by Finance by hand, for one-off charges.
- **Lines:**
  - the plan and the year it covers, at the subscription's own price (or the group's agreed price);
  - any discount;
  - the total.
- **Due date:** the billing date. The number of days is a setting.
- **Status:** `OPEN`, `PART-PAID`, `PAID` or `CANCELLED`.
  - **Overdue** is shown for an open bill past its due date.
  - A cancelled bill keeps its number and needs a reason. Bills are never deleted.
- **Sending a bill:**
  - The school's Administrators and Proprietor get an email with the amount, due date and a link to their Billing page.
  - They also get a short SMS: "ADsmartschool: bill ADS-2026-0001 for GH₵ X is due on …".
- **What a bill shows:**
  - your business details (name, address, tax number when you have one);
  - how to pay by hand (your MoMo number and bank details, from Finance settings).

### 3.4 Payments
- **Recorded by hand** (Owner or Finance):
  - amount, date and method (MoMo, bank transfer, cash or cheque);
  - the payer's reference and an optional note.
- **Paid online** (§3.5).
- **Part payments** are allowed.
- **Overpayment** becomes a **credit** that is taken off the school's next bill.
- **Corrections:**
  - A payment is never edited or deleted.
  - A mistake is put right with a **reversal**: a second entry that cancels the first, with a reason.
  - A **refund** is recorded the same way (Owner only).
- **Audit:** every money action goes into the audit log.

### 3.5 Online payment (Paystack)
1. On the school's **Billing** page, an Administrator, Proprietor or Accountant presses **Pay now** on a bill.
2. Paystack's secure payment page opens, with MTN MoMo, Telecel Cash, AirtelTigo Money or card.
3. Paystack tells our server the result. Our server then:
   - **checks the message's signature**;
   - **asks Paystack to confirm** the amount and currency;
   - records the payment **once only**, even if Paystack sends the message twice.
4. A receipt is issued and emailed to the payer.

What the payer's browser reports is never trusted on its own. Card and MoMo details are handled only by Paystack and never reach our system.

### 3.6 Receipts
- **Numbering:** `RCT-2026-0001`, and so on.
- **Form:** a print-friendly page, as with bills. Anyone can print it or "Save as PDF" in their browser.
- **What it shows:** the school, the bill it pays, amount, method, reference and date.

### 3.7 Reminders and pausing
- **Reminders** go by email and SMS to the school's Administrators and Proprietor:
  - 7 days before the due date;
  - on the due date;
  - 7 and 14 days after.
  - They stop as soon as the bill is paid.
- **Settings:**
  - The schedule is a setting.
  - Finance can switch reminders off for one school (for example, when you've agreed to wait).
- **Pausing for non-payment** (off by default):
  - When switched on, a school is paused 21 days after the due date if the bill is still unpaid.
  - It gets a final warning 7 days before.
- **While a school is paused for non-payment:**
  - Its website shows the existing "temporarily unavailable" page.
  - Its Administrator, Proprietor and Accountant can still sign in, **to the Billing page only**, so they can pay.
  - Paying the overdue amount in full **un-pauses the school automatically**.
- **Pausing for other reasons** works exactly as today.

### 3.8 Finance screens (Owner and Finance)
- **Overview:**
  - collected this month, this term and this year;
  - outstanding;
  - overdue, and how many schools are overdue;
  - expected in the next 30 days.
- **Bills:** filter by status, school, plan and dates.
- **Payments:** filter by method and dates, including reversals.
- **Plans.**
- **Finance settings** (Owner only):
  - your business details;
  - bank and MoMo details;
  - days before billing that bills are made;
  - the reminder schedule;
  - pausing on or off, with its days;
  - default trial length;
  - who pays the Paystack fee.
- **Downloads:** bills, payments and outstanding balances, as CSV files for Excel.

### 3.9 The school's Billing page (in its own portal)
- **Who sees it:** Administrators, the Proprietor and Accountants. Nobody else.
- **What's on it:**
  - current plan;
  - balance due;
  - bills, each with **Pay now** and **Print**;
  - receipts;
  - how to pay by hand.
- **Privacy:** a school sees only its own bills. This is added to the cross-school test matrix.

---

## 4. Statistics

One **Statistics** page in the admin area.

**Rules:**
- Real numbers only, with an "as of" time.
- Demo records are never counted.
- You can choose the period: this month, last 3 months, this year, or all time.
- **Charts:** every chart has a table view, so the numbers can be read without the picture, including by screen readers.
- **Downloads:** every table can be downloaded as CSV.

| Section | What it shows | Who sees it |
|---|---|---|
| **Schools** | Total; on trial, active and paused; new schools per month (12-month chart); schools paused or lost per month | Everyone |
| **Join requests** | Received per month; by status; how many became schools (%); average days from request to school | Everyone |
| **School sizes** | Total pupils, staff and parents; a table per school with **counts only** | Everyone |
| **Real use** | Per school: people who signed in during the last 30 days. Schools with no sign-ins in 30 days are marked **quiet**, so Support can call them | Everyone |
| **Support** | Open conversations; average time to first reply | Everyone |
| **Money** | Collected per month (12-month chart); outstanding; overdue; expected in the next 30 days; average per school | Owner, Finance |
| **Your website** | Visits per day and month; most-visited pages; most-read articles; join requests per 100 visits; tip subscribers | Everyone |

**Visitor counting:**
- Counts page visits on **your website only**.
- Records just the page and the day, with no cookies, IP addresses or personal data.
- Obvious robots are left out.
- School websites aren't counted in this cycle.

---

## 5. Your website (the landing page)

### 5.1 Page order
The landing page runs top to bottom:
1. Hero (existing).
2. What a school gets (existing).
3. Live schools (existing).
4. **Gallery**.
5. **What schools say**.
6. **Prices**.
7. **Latest articles and tips**.
8. **Questions and answers**.
9. **Get your school online** (existing form), with **tip sign-up** beside it.

**Empty sections stay hidden.** A section with nothing published doesn't appear, so the page never shows empty boxes or made-up content (the platform spec's "truthful" rule).

**Header and footer links:**
- **Header:** Prices, Articles, Get online.
- **Footer** adds Articles, Prices, Questions and **Follow on WhatsApp**.

### 5.2 Gallery
- **In the admin area** (Content role):
  - Upload photos (JPEG, PNG or WebP, up to 10 MB).
  - **Caption** (optional).
  - **Description for blind visitors** (required).
  - Set the order. Up and down buttons work as well as dragging, so the keyboard can do it too.
  - Show or hide each photo.
- **Permission tick, required when a photo shows people:** "I have permission to publish everyone in this photo, including parents' permission for any children." Without it the photo can't be shown.
- **Sizing:** photos are resized automatically into phone-friendly sizes, using the existing image tools.
- **On the website:**
  - Up to 12 photos on the landing page, swipeable on phones.
  - Tapping a photo opens it large. Arrow keys and Esc work, and swiping works on phones.
  - A full **Gallery** page appears when there are more than 12.
  - Photos below the first screen load only when the visitor scrolls to them, keeping the page within its speed budget.

### 5.3 Articles and tips
- **Two kinds:**
  - **News**: about ADsmartschool.
  - **Tips for schools**: running and growing a school, such as admissions, fee collection, keeping parents informed, staff and marketing.
- **Each article has:**
  - title;
  - web address (made from the title);
  - kind;
  - short summary (shown in lists and when shared);
  - cover photo with its description;
  - body;
  - author's name;
  - reading time (worked out automatically).
- **Writing:**
  - A simple editor with buttons for headings, lists, bold, links, quotes and photos, plus a **Preview**.
  - Anything unsafe (for example, scripts) is stripped out.
- **Status:** **draft**, **scheduled** (goes live on a chosen date and time) or **published**. Unpublishing hides an article without deleting it.
- **On publishing:** you can tick "Email tip subscribers" (§5.6).
- **On the website:**
  - The **Articles** page lists everything newest first, with a filter for News or Tips.
  - Each article has its own page with:
    - share buttons (WhatsApp, Facebook, X, copy link), which are plain links with no tracking;
    - 3 related articles;
    - a "Get your school online" box at the end.
- **For Google:** articles appear in the sitemap, with cover images for sharing and article details for Google. They're found by search only once your website is public.
- **Starter tips:** a handful of starter tips can be drafted for you to edit and approve. Nothing is published until you approve it.

### 5.4 Prices section
- **Source:** built from the plans marked "Show on website" (§3.1), so the website and your bills always use the same prices.
- **Content:** each plan's name, who it's for, its price per year (or "From GH₵…" with **Talk to us**), what's included and its free trial, with a **Get your school online** button.
- **Wording:** a short line of text above the plans is editable by Content.
- **Hidden** when no plan is marked to show.

### 5.5 What schools say, and questions and answers
- **Comments from schools:**
  - the quote;
  - the person's name and role;
  - their school, linked to its site when that site is live;
  - an optional photo.
  - **Required tick:** "This person agreed to have their words and name published."
  - Show or hide, and set the order.
  - Up to 3 on the landing page, swipeable on phones.
- **Questions and answers:**
  - Each has a question, a short formatted answer, an order and show or hide.
  - Each answer opens and closes on the page, and works by keyboard and screen reader.
  - They're also marked up so Google can show them in search results.

### 5.6 Tips by email and WhatsApp
- **Signing up:**
  - A sign-up box on the landing page and on every article: email, plus a consent tick.
  - It has the same spam protection as the other forms.
- **Confirming:**
  - A confirmation email is sent first. Nobody is subscribed until they click its link.
  - Every tips email has a **one-click unsubscribe** link.
- **In the admin area:** the subscriber count, and a download of subscribers (Owner and Content only).
- **WhatsApp:**
  - A **Follow on WhatsApp** button links to your WhatsApp Channel. You set its link in the admin area, and the button is hidden until you do.
  - You post to the channel yourself from WhatsApp.

### 5.7 Changes show quickly
When something is published, changed or hidden in the admin area, your website updates within seconds, rather than waiting up to 5 minutes as pages do now.

---

## 6. Talking with schools

### 6.1 Announcements
- **Written by** Owner or Support:
  - title and short formatted message;
  - **who gets it:** all schools, chosen schools, schools on a plan, or schools with a status;
  - **who in each school:** Administrators and Proprietor only, or all staff;
  - show-from and show-until dates.
- **How it reaches the school:**
  - A banner at the top of every portal page for the chosen people. They can mark it as read.
  - Optionally, an email to the school's Administrators.
  - For urgent notices only, optionally a short SMS.
- **Read count:** you see how many schools have read it.

### 6.2 Support conversations
- **In each school's portal**, a **Contact ADsmartschool** page for Administrators, Head Teachers, the Proprietor and Accountants. A message has:
  - a subject;
  - a topic (website, sign-in, billing or other);
  - the message itself;
  - an optional screenshot (an image up to 5 MB).
- **A gentle reminder** on the page: don't paste pupils' personal details into a message.
- **Replying:**
  - Support replies from the admin area.
  - The school sees the reply in its portal and gets an email.
- **Status:** `OPEN`, `WAITING FOR SCHOOL` or `RESOLVED`.
- **Nothing changes about access to records:**
  - Seeing a school's pupil records still needs the school's support permission (platform spec §4).
  - A conversation never opens records by itself.

---

## 7. Rules that apply to everything here

- **Truthful:**
  - Nothing is advertised before it works.
  - Statistics use real records only, never demo ones.
- **Privacy (Ghana Data Protection Act, 2012):**
  - Permission ticks for photos of people and for comments from schools.
  - Double opt-in for tip emails.
  - Visitor counts store no personal data.
  - Schools see only their own bills and conversations.
- **Money safety:**
  - Amounts are stored as whole pesewas.
  - Online payments are confirmed with Paystack before they're recorded, and recorded only once.
  - Payments are never edited or deleted.
  - Every money action is audited.
  - Finance pages need the Owner or Finance role, and the second sign-in step.
- **Audit log entries:**
  - role changes;
  - plan and price changes;
  - bills made or cancelled;
  - payments, reversals and refunds;
  - pauses and un-pauses;
  - publishing and hiding;
  - announcements sent.
- **Speed and access:**
  - The existing standards still apply: Lighthouse 90 or more, about 500 KB on first mobile load, 100% accessibility checks.
  - Light and dark modes, keyboard use and screen readers all work.

---

## 8. Testing additions

- **Roles:** every admin endpoint is tested for each role. A role without access gets 403 and sees nothing. The last Owner can't be removed.
- **Money:**
  - **Bill totals:** base price, per-pupil (demo pupils excluded), discounts and credits.
  - **Numbering:** has no gaps.
  - **Bill status:** part payments, overpayment credit and reversals.
  - **Reminder timing:** on the right days, and stopping when paid.
  - **Pausing for non-payment:** the Billing page still works, and paying in full un-pauses.
- **Paystack**, tested with its test mode and test keys:
  - a valid signature is accepted and a bad one refused;
  - a payment arriving twice is recorded once;
  - a wrong amount or currency is refused.
- **Cross-school:** the Billing, Contact and announcement endpoints are added to the cross-school matrix.
- **Website:**
  - Empty sections stay hidden.
  - Scheduled articles go live on time.
  - Unsafe content is stripped from articles.
  - Photos and comments without permission can't be shown.
  - Subscriptions need confirmation, and unsubscribe works in one click.
- **Statistics:** demo records are excluded and the money figures match the Finance pages.
- **Browser tests:**
  - Finance makes a bill, the school pays it in Paystack test mode, and a receipt appears.
  - Content publishes an article and it appears on the landing page.
  - A support conversation goes there and back.
  - Accessibility is checked in both themes.

---

## 9. Build plan

This work splits into plans, each finished, tested and merged before the next. The earlier "Plan 5B" (schools editing their own websites) moves to the end of the list but can be moved forward whenever you like.

| Plan | Contents |
|---|---|
| **5B** | **Team roles and your website content:** roles and the Team screen; gallery; articles and tips with the editor and scheduling; comments from schools; questions and answers; tip sign-up and WhatsApp button; visitor counting; quick website updates |
| **5C** | **Finance:** plans (with the five starting plans), the prices section on your website, school groups, subscriptions, bills, payments recorded by hand, credits, reversals, receipts, reminders, pausing for non-payment, the school's Billing page, finance settings, CSV downloads |
| **5D** | **Online payments and Statistics:** Paystack Mobile Money and card (test mode until launch); the Statistics page |
| **5E** | **Talking with schools:** announcements and support conversations |
| **5F** | **Schools edit their own websites** (formerly 5B): a Website section in each school's portal, support permission (grants), quick website updates for school sites |
| **6** | **Going live:** hosting, your domain, real SMS and email providers, Paystack live keys, backups (unchanged from the platform spec, plus the Paystack switch) |

---

## 10. Still out of scope

- **School fees** (parents paying schools). This is a separate module for each school's Accountant, designed later.
- Visitor counting on school websites.
- Sending WhatsApp messages from the system.
- Automatic VAT and levy calculations, until you confirm whether they apply (§11).
- Currencies other than the cedi.
- Schools changing their own plan, or signing themselves up. They ask you.
- Comments under articles.

---

## 11. What the owner needs to provide

| Item | Needed for |
|---|---|
| ~~Your plans and prices~~ Provided 2026-10-11 (§3.1). Still to come: what's included in each plan, for the website list | 5C |
| A Paystack business account (needs business registration documents) and its keys | 5D (test keys), 6 (live keys) |
| Whether you must charge VAT and levies on your service. Ask an accountant or the Ghana Revenue Authority | 5C |
| Business details for bills: registered name, address, tax number (TIN), MoMo number and bank details | 5C |
| Your WhatsApp Channel link | 5B |
| Gallery photos, with permission from everyone shown | 5B |
| Comments from schools, with their permission | 5B |
| Approval of the starter tips, or your own articles | 5B |
| Confirm or change the defaults in §1.2 | Before 5B starts |
