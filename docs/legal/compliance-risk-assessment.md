# ArkenEdu — Compliance & Legal Risk Assessment

**Prepared:** 10 June 2026
**Audience:** ArkenEdu founders/operators preparing for app-store review, school onboarding, enterprise sales, and scale across India.

This assessment is based on ArkenEdu's actual platform structure, user roles, data flows, authentication model, and sub-processors. It identifies gaps, objections, and review risks, and gives prioritised, actionable recommendations. It is operational guidance, not legal advice; have the published documents reviewed by Indian counsel before relying on them (see N1).

> **Update — code remediation applied (10 June 2026).** The code-addressable P0 items have been fixed: the mobile app was rebranded EduTrack → **ArkenEdu** (`com.arkenedu.mobile`); the Privacy Policy, Terms, DPA, and Account-Deletion pages are now live React routes linked from the website footer; and an in-app "Request Account Deletion" action was added to the mobile parent and teacher profile screens. Remaining items are **operational** (appoint a DPO, seed demo accounts, verify the AWS region) or **product work** (consent records, AI minimisation) that cannot be closed by editing code alone. Status is tracked in the matrix below.

> **Update — 11 June 2026.** The in-app "Request Account Deletion" action has been **removed** from the mobile parent/teacher profiles and the web profile + admin/super-admin approval screens, and the backing `account_deletion_requests` table was dropped (migration `a4c6e8b0d2f5`). The ArkenEdu app has **no account self-registration**, so iOS Guideline 5.1.1(v) does not require an in-app deletion path. Account/data deletion is now **administrative only** — users contact their School Administrator, who can escalate to ArkenEdu support — and is documented on the public, login-free page `https://arkenedu.com/account-deletion`. R4 remains satisfied by that public page.

---

## 1. Priority matrix

| ID | Risk | Severity | Priority | Status |
|---|---|---|---|---|
| R1 | Mobile app brand/identifier mismatch (was "EduTrack") | High | P0 | ✅ **Resolved in code** — renamed to ArkenEdu (`com.arkenedu.mobile`, slug `arkenedu`); confirm store listing + developer name |
| R2 | No legal pages published / linked (web or app) | High | P0 | ✅ **Resolved in code** — `/privacy-policy`, `/terms-of-service`, `/data-processing-agreement`, `/account-deletion` routes + footer links |
| R3 | No reviewer demo accounts + login-gated app | High | P0 | ⬜ **Operational** — seed parent/teacher/admin demo logins; add to both stores' review notes |
| R4 | Account-deletion path not exposed | High | P0 | ✅ **Resolved in code** — public, login-free `/account-deletion` page documenting the administrative deletion process (no in-app self-service action; the app has no self-registration, so iOS 5.1.1(v) does not require one) |
| R5 | Children's data / DPDP parental-consent flow not evidenced | High | P1 | ⬜ **Product work** — add per-student consent record + parent acknowledgement |
| R6 | AI tools may receive student PII (teacher free-text) | Med–High | P1 | ⬜ **Product work** — in-UI warning + org disable toggle + confirm no-training terms |
| R7 | Signed DPA + sub-processor list not packaged | Med | P1 | ◐ **Partial** — DPA page live; add a signable DPA + maintained `/legal/sub-processors` |
| R8 | Data-residency (AWS India region) unverified | Med | P1 | ⬜ **Verify** — confirm the AWS region matches the "AWS India" statement |
| R9 | Grievance Officer / DPO not named | Med | P1 | ⬜ **Appoint** — name an individual; role emails (grievance@/dpo@) are already wired |
| R10 | Financial data (UPI/UTR + screenshots) handling not documented | Med | P2 | ⬜ **Document** — access controls + retention for payment proofs |
| R11 | Shared parent/student login weakens per-individual consent | Med | P2 | ⬜ **Roadmap** — offer distinct parent accounts as an option |
| R12 | Sub-processors outside India — transfer posture | Med | P2 | ◐ **Documented** in Privacy/DPA; confirm contractual safeguards |
| R13 | No security/trust, responsible-disclosure, or incident-runbook docs | Med | P2 | ⬜ **Produce** — trust page, security@ disclosure policy, runbook |
| R14 | Retention stated qualitatively, not as schedules | Low–Med | P3 | ⬜ **Convert** to a concrete retention schedule |
| R15 | Legacy Cloudinary media URLs still served | Low | P3 | ⬜ **Plan** migration off Cloudinary to consolidate on S3 |

---

## 2. Missing legal / compliance documents and artifacts

- ✅ **Published Privacy Policy, Terms of Service, and DPA** — now live React routes (`/privacy-policy`, `/terms-of-service`, `/data-processing-agreement`) linked from the website footer. *(R2 done; ensure the store listings also link `https://arkenedu.com/privacy-policy`.)*
- ✅ **Public account-deletion page** (`/account-deletion`) documenting the administrative deletion process — School Administrators action deletions and can escalate to ArkenEdu support; there is no in-app self-service action (the app has no self-registration). *(R4 done.)*
- **Sub-processor list page** (`/legal/sub-processors`) kept current — required for enterprise procurement and DPA Section 8. *(R7)*
- **Named Grievance Officer / Data Protection point of contact** with contact details published, as expected under the SPDI Rules and DPDP Act. The documents use role-based contacts (grievance@ / dpo@arkenedu.com); appoint and name an individual. *(R9)*
- **Security overview / trust page** for sales (encryption, RBAC, hosting, backups, incident response) and a **responsible-disclosure policy**. *(R13)*
- **Cookie notice** on the web app (even though only strictly-necessary cookies are used, a short notice is good practice). *(R2)*
- **Data-retention schedule** with concrete periods for logs, backups, and post-termination deletion. *(R14)*
- **Internal incident-response runbook** referenced by the DPA's breach-notification clause. *(R13)*

---

## 3. Potential school objections (and how the documents answer them)

| Likely objection | Where addressed |
|---|---|
| "Who owns our students' data?" | The School owns all data; ArkenEdu is processor only — Privacy Policy §1.1, ToS §7, DPA §1/§3. |
| "Can we get our data out if we leave?" | Export rights + 30-day exit window — ToS §13, DPA §10/§14. |
| "Will our students be tracked or advertised to?" | No ads, no tracking, no behavioural monitoring of children — Privacy Policy §2/§3/§9. |
| "Is data stored in India?" | AWS India regions for production data — Privacy Policy §12, DPA §8.5 *(verify — R8)*. |
| "What happens in a breach?" | Notification without undue delay + cooperation — DPA §13. |
| "Can we audit you?" | Audit rights + compliance evidence — DPA §15. |
| "Who else touches our data?" | Sub-processor table with purpose/location — DPA §8. |

Residual objection risk: schools with strict procurement may push back on **AI sub-processors processing academic content abroad** (R6/R12) and on **shared parent/student logins** (R11). Pre-empt with the minimisation guidance and an option to disable AI tools.

---

## 4. Privacy concerns to address in the product (not just on paper)

- **R5 — Children's data & verifiable parental consent.** The DPDP Act requires verifiable parental consent for processing a child's (under-18) personal data and prohibits tracking/behavioural monitoring/targeted advertising of children. The documents place this obligation on the School (correct), but the **product should help Schools evidence consent** — e.g., a consent record/flag per student, a parent-acknowledgement step at onboarding, and an admin report of consent status. Without this, Schools bear undocumented risk and may hesitate in procurement.
- **R6 — AI minimisation.** Question Bank and Lesson Plan tools send teacher-entered text to OpenAI/Google. If teachers paste student names or PII, that data leaves the platform to a foreign sub-processor. Mitigations: in-UI warning ("do not include student personal data"), optional PII scrubbing, an org-level toggle to disable AI features, and confirmation that provider API terms exclude training on submitted content.
- **R11 — Shared parent/student login.** One credential for parent + student weakens per-individual consent, auditability ("who did what"), and the ability to honour individual rights requests. Document it clearly (done) and consider offering distinct parent accounts as an upgrade path; at minimum, ensure password-reset and session controls are robust.
- **R10 — Financial data.** Parents submit UPI transaction references and proof-of-payment screenshots on the web portal (stored in S3 via short-lived pre-signed URLs). Document who can view these, retention, and access controls; ensure screenshots (which may reveal bank details) are access-restricted and purged per a schedule.

---

## 5. Enterprise / procurement concerns

- Provide the **DPA as a signable artifact** (PDF/clickwrap), plus a **sub-processor list**, **security overview**, and answers to a standard **VAPT / security questionnaire** (encryption, RBAC, password hashing, backups, MFA roadmap, pen-test cadence). *(R7, R13)*
- Many institutional buyers expect **MFA for admin/staff**, **audit logs**, **IP allow-listing**, and **role-scoped exports**. Note current state and roadmap honestly.
- Be ready to state **uptime expectations** and whether an **SLA** is available for larger contracts (ToS §10/§11 currently disclaim guarantees — acceptable for SMB, but enterprise will ask).
- **Insurance** (cyber/professional indemnity) and a **named DPO** materially de-risk enterprise deals. *(R9)*

---

## 6. Google Play review risks

- **R3 — Login-gated app without demo credentials** is a top rejection reason (still open). Provide a working seeded demo account in the Play Console test instructions.
- ✅ **R4 — Data deletion:** the required public web URL now exists at `/account-deletion` (works without installing the app); set it as the data-deletion URL in the Data Safety form.
- **Data Safety form** must match reality (see mobile-app-compliance §3.A). Mismatches (e.g., declaring a permission you don't use, or omitting the push token/diagnostics) cause rejections or enforcement.
- **Target-audience & content rating:** answer the children/families questionnaire accurately; the app has **no ads SDK** and **no AAID collection**, which keeps it compliant if children are in scope.
- ✅ **R1 — Listing/app-name and Privacy Policy now consistent** (app is ArkenEdu / `com.arkenedu.mobile`); confirm the Play listing name + developer name read "ArkenEdu".

## 7. Apple review risks

- **R3 — Demo account** required (Guideline 2.1) — same as Play (still open).
- ✅ **R4 — Account deletion** (Guideline 5.1.1(v)): the app offers **no account self-registration**, so an in-app deletion path is not required. Deletion is administrative (via the School Administrator, escalating to ArkenEdu support) and documented on the public, login-free `/account-deletion` page. State this in App Review notes.
- **App Privacy labels** must match the data flows (mobile-app-compliance §3.B); declare **"Data Not Used to Track You."**
- **Kids Category (5.1.4):** do **not** enrol unless intended; position as Education. If enrolled, third-party analytics/ads are prohibited and parental gating is required.
- **Guideline 5.1.1 / 5.1.2 (data collection & storage):** ensure consent and purpose strings are clear; the notifications permission should be requested in context.
- ✅ **R1 — Bundle ID/name now match ArkenEdu branding** (`com.arkenedu.mobile`); ensure a reachable Privacy Policy URL in App Store Connect.

---

## 8. Security items that should be documented (for trust & RFPs)

Already implemented and worth documenting: HTTPS/TLS everywhere; salted password hashing; HttpOnly role-keyed session cookies with JWT-claim RBAC; SecureStore token storage on mobile; short-lived (≤1h) pre-signed S3 URLs (not publicly listable); Sentry error tracking; AWS-hosted with the shared-responsibility model.

Gaps/roadmap worth disclosing honestly: **MFA** for privileged roles; **audit logging** surfaced to admins; **periodic penetration testing / VAPT**; **backup restore testing**; **key-rotation and secrets management**; **rate-limiting/abuse protection**; **data-retention automation**; and a **responsible-disclosure** channel (security@arkenedu.com).

---

## 9. Prioritised recommendations

**P0 — before app-store submission and first paid onboarding**
1. ✅ **R1 (done in code):** mobile app renamed to ArkenEdu (`com.arkenedu.mobile`, slug `arkenedu`), in-app strings + API name rebranded. **Remaining manual step:** ensure the Play / App Store **listing name and developer name** read "ArkenEdu".
2. ✅ **R2 (done in code):** `/privacy-policy`, `/terms-of-service`, `/data-processing-agreement`, and `/account-deletion` are live routes linked from the website footer. **Remaining manual step:** set the Privacy Policy URL in both store listings and add a "Terms/Privacy" line to sign-in screens.
3. ⬜ **R3 (operational):** create seeded **reviewer demo accounts** (parent, teacher, admin) and add credentials to Play and App Store review notes.
4. ✅ **R4 (done in code):** public, login-free `/account-deletion` page documenting the administrative deletion process (no in-app self-service action; the app has no self-registration, so iOS 5.1.1(v) does not require one). **Remaining manual step:** set the deletion URL in the Play Data Safety form.

**P1 — before/while onboarding real schools**
5. **R9:** Appoint and **name a Grievance Officer / DPO** with published contact details.
6. **R8:** **Verify the AWS region** and make the residency statement accurate (Privacy Policy §12, DPA §8.5).
7. **R5:** Add a **per-student consent record** and parent-acknowledgement step to evidence DPDP parental consent.
8. **R6:** Add **AI-minimisation safeguards** (in-UI warnings, optional disable toggle, confirm no-training API terms).
9. **R7:** Package the **DPA for signature** and publish a maintained **sub-processor list**.

**P2 — for enterprise readiness and scale**
10. **R10/R11:** Document and tighten **financial-data** access/retention; offer **distinct parent accounts** as an option.
11. **R12:** State the **cross-border transfer posture** for non-India sub-processors and confirm contractual safeguards.
12. **R13:** Produce a **security/trust page**, **responsible-disclosure policy** (security@arkenedu.com), and an **incident-response runbook**; plan **MFA** and **audit-log** features.

**P3 — hygiene**
13. **R14:** Convert retention language into a concrete **retention schedule**.
14. **R15:** Plan **migration off Cloudinary** to consolidate storage on AWS S3 and reduce sub-processor surface.

---

## Notes

- **N1 — Legal review.** These documents are drafted specifically for ArkenEdu's architecture and the Indian regulatory context, but they are not a substitute for advice from qualified Indian counsel. Have them reviewed and have the company-specific details (registered legal entity name, registered office address, jurisdiction/seat city, and named Grievance Officer/DPO) confirmed before publication.
- **N2 — Keep documents in sync with reality.** When sub-processors, regions, permissions, or features change, update the Privacy Policy, DPA sub-processor table, and the store privacy forms together.
