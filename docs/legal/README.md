# ArkenEdu — Legal & Compliance Documents

Production-ready legal and compliance documents for **ArkenEdu** (https://arkenedu.com), a School ERP / school-management SaaS for K–12 and private schools in India. Drafted against ArkenEdu's actual architecture (React + FastAPI + PostgreSQL + Redis on AWS) and real sub-processors.

| # | Document | Publish at | Purpose |
|---|---|---|---|
| 1 | [Privacy Policy](privacy-policy.md) | `/privacy-policy` | What data is processed, why, who it's shared with, security, rights, India (DPDP/SPDI) provisions, app-store sections. |
| 2 | [Terms of Service](terms-of-service.md) | `/terms-of-service` | Platform usage, acceptable use, accounts, data ownership, liability, governing law (India). |
| 3 | [Data Processing Agreement](data-processing-agreement.md) | `/data-processing-agreement` | School = Data Fiduciary, ArkenEdu = Processor; security, sub-processors, breach, deletion, audit. |
| 4 | [Website Compliance Pages](website-compliance-pages.md) | — | URL structure, SEO titles, meta descriptions, H1s, content hierarchy for the three pages. |
| 5 | [Mobile App Compliance Analysis](mobile-app-compliance.md) | — | Google Play Data Safety + Apple App Privacy guidance, permission analysis, submission checklist. |
| 6 | [Compliance & Risk Assessment](compliance-risk-assessment.md) | — | Gaps, objections, store-review risks, prioritised P0–P3 recommendations. |

## Company-specific items to confirm before publishing
These are deliberately **not** invented in the documents. Confirm and insert/verify:
1. **Registered legal entity name** and **registered office address** (for the website footer and any signed contracts).
2. **Jurisdiction / arbitration seat city** in India (ToS §19 currently uses "principal place of business").
3. **Named Grievance Officer / DPO** (documents use `grievance@arkenedu.com` / `dpo@arkenedu.com`).
4. **AWS region** actually used (Privacy Policy §12 / DPA §8.5 state AWS India regions).
5. **Brand alignment (resolved in code):** the mobile app now ships as **ArkenEdu** (`com.arkenedu.mobile`, slug `arkenedu`). Confirm the Play / App Store **listing name and developer name** also read "ArkenEdu" before submission.

> These documents are drafted for ArkenEdu's specific context but are not a substitute for review by qualified Indian counsel. **Last updated: 10 June 2026.**
