
# ArkenEdu — School Operations, Simplified

**A complete school-management platform for 50–2,000 student schools.**
Web portals for admins and teachers. A mobile app for parents. One backend that ties it all together.

---

## The problem

Indian schools today run on **WhatsApp groups, paper attendance registers, and Excel fee sheets**. Parents miss announcements, admins lose hours to fee chasing, and teachers spend more time on paperwork than teaching.

The existing alternatives are either **₹2–5 lakh/year enterprise ERPs** built for 5,000+ student chains, or **single-feature point apps** that don't talk to each other.

---

## What ArkenEdu does

A single platform that covers the day-to-day workflows a school actually runs on:

| Workflow                | What it replaces                          |
| ----------------------- | ----------------------------------------- |
| **Attendance**          | Paper register, manual SMS to parents     |
| **Marks & report cards**| Excel sheets, printed mark cards          |
| **Fee collection**      | Bank deposits + chasing on WhatsApp       |
| **Announcements**       | WhatsApp groups + bounced emails          |
| **Homework tracking**   | Notebook diaries with parent signatures   |
| **Bus tracking**        | Calls to the driver, no live ETA          |
| **Lesson planning**     | Word docs shared over email               |
| **Timetable**           | Printed sheet pinned to the staff-room wall |

**Three surfaces, one source of truth.**
- **Admin web** — manage classes, students, teachers, fees, transport routes.
- **Teacher web** — attendance, marks, announcements, homework, AI lesson plans.
- **Parent mobile (iOS + Android)** — daily attendance, marks, fee status, announcements, bus location, push notifications.

---

## What makes it different

- **UPI-first fee collection with admin verification.** Parents pay into the school's UPI ID or bank account using their own banking app, then submit the UTR (and optional screenshot) in the portal. Admins approve in one tap; admin-recorded cash entries and approved UPI submissions post to the same finance ledger.
- **Real multi-tenancy from day one.** Every query is scoped by institution at the JWT layer — schools share infrastructure but never see each other's data. Onboarding a new school is a 5-minute admin task, not a deployment.
- **AI where it matters.** Teachers generate lesson plans and question banks in seconds (Google Gemini + OpenAI). Not a chatbot gimmick — output is editable, exportable to PDF/PPTX/DOCX, and graded against the school's existing rubric.
- **Built like production software, not a college project.** 100+ automated tests on the backend. CI on every PR. JWT + HttpOnly cookies + bcrypt + rate limiting + structured logs + Sentry. The kind of plumbing that should be invisible but usually isn't.

---

## Tech stack (for the technically inclined)

- **Backend** — Python 3.11, FastAPI, async SQLAlchemy 2, PostgreSQL, Redis.
- **Web** — React 19, Vite, TypeScript, Tailwind v4.
- **Mobile** — Expo SDK 54, React Native 0.81.
- **Infra** — AWS: EC2 (Docker Compose) + RDS Postgres + S3, behind nginx/certbot; full deployment runbook included.
- **Security** — HttpOnly cookies, bcrypt off the event loop, account lockout, CSP + HSTS, rate limiting, gitleaks in CI.

---

## Pricing (illustrative)

| Tier        | Students | Per student / month | Includes                                                |
| ----------- | -------- | ------------------- | ------------------------------------------------------- |
| **Starter** | up to 200| ₹15                 | All web features, mobile app, email support             |
| **Growth**  | 200–800  | ₹12                 | + voice-call reminders, AI lesson plans, priority support |
| **Pro**     | 800–2000 | ₹10                 | + dedicated S3 bucket, custom domain, SLA               |

> Pricing is per active student. No setup fee, no per-teacher fee. Cancel anytime.

---

## Who is this for

**Yes, today:**
- K-12 schools with 50–2,000 students in India.
- School chains piloting digital transformation in 1–3 campuses.
- Edtech consultants white-labeling under their own brand.

**Not yet:**
- Schools requiring SOC 2 / FERPA / GDPR procurement paperwork.
- 5,000+ student multi-country chains (we can scale to the load — just not the compliance ask).

---

## The team

[Your name] — founder, full-stack engineer. Previously [your prior role / experience]. Reach out at **[your email]** or **[+91 XXXXXXXXXX]**.

---

## Try it

- **Live demo:** [https://demo.edutrack.app](#) — login as `demo-admin@edutrack.app` / `demo`.
- **2-minute video walkthrough:** [https://edutrack.app/demo](#).
- **Source / architecture review:** available on request under NDA.

---

*ArkenEdu — built by someone who's actually shipped to schools.*
