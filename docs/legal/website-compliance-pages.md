# ArkenEdu — Website Compliance Pages (Publishing Guide)

This document specifies how the three legal documents should be published on **arkenedu.com**: the URL structure, SEO metadata, on-page heading (H1), and the content hierarchy for each page. The page body content is the corresponding document in this folder.

The legal pages must be **publicly accessible without authentication** (app-store reviewers and procurement teams need to reach them directly), linked from the website footer on every page, linked from the mobile app store listings, and linked from within the app (e.g., a "Legal" section in settings and on the sign-in screen).

---

## URL structure

| Page | Canonical URL |
|---|---|
| Privacy Policy | `https://arkenedu.com/privacy-policy` |
| Terms of Service | `https://arkenedu.com/terms-of-service` |
| Data Processing Agreement | `https://arkenedu.com/data-processing-agreement` |

Recommended supporting routes:
- `https://arkenedu.com/legal` — an index page linking to all three documents, sub-processor list, and contact.
- `https://arkenedu.com/account-deletion` — a public page describing how to request account and data deletion (referenced by Google Play). May redirect to `privacy-policy#deleting-your-account-and-data`.

Each page should set a self-referencing `<link rel="canonical">`, render server-side or be pre-rendered for crawlers, expose the "Last updated" date, and serve over HTTPS only.

---

## 1. Privacy Policy page

- **Route:** `/privacy-policy`
- **SEO Title (≤60 chars):** `Privacy Policy | ArkenEdu School ERP`
- **Meta Description (≤155 chars):** `How ArkenEdu's school ERP collects, uses, secures, and retains student, parent, teacher, and staff data — built for Indian schools and the DPDP Act.`
- **H1:** `ArkenEdu Privacy Policy`
- **Open Graph:** `og:title` = "ArkenEdu Privacy Policy"; `og:type` = "website"; `og:url` = canonical; `og:description` = meta description.

**Content hierarchy (H2 sections):**
1. Introduction (Our role; Laws we work under)
2. Summary at a glance
3. Who the Platform is for, and our policy on children
4. The accounts and identities on the Platform
5. Personal data we process (student / parent / staff / admin / automatic)
6. Why we process personal data (purposes and legal basis)
7. Authentication and session management
8. Mobile application — permissions and notifications
9. Analytics, logs, and diagnostics
10. How we protect data (security measures)
11. Third-party service providers (sub-processors)
12. Hosting and data location
13. Data retention
14. Your rights
15. Deleting your account and data *(anchor: `#deleting-your-account-and-data`)*
16. Cookies and similar technologies
17. Grievance redressal
18. How to contact us
19. Changes to this Policy

---

## 2. Terms of Service page

- **Route:** `/terms-of-service`
- **SEO Title (≤60 chars):** `Terms of Service | ArkenEdu School ERP`
- **Meta Description (≤155 chars):** `The terms governing use of ArkenEdu's school management platform — accounts, acceptable use, data ownership, liability, and governing law (India).`
- **H1:** `ArkenEdu Terms of Service`
- **Open Graph:** `og:title` = "ArkenEdu Terms of Service"; `og:type` = "website"; `og:url` = canonical.

**Content hierarchy (H2 sections):**
1. Definitions
2. The Service and the parties' relationship
3. Accounts, account ownership, and access
4. Acceptable use
5. Prohibited activities
6. Intellectual property
7. School Data and data ownership
8. Subscription, fees, and the service relationship
9. Software updates and feature changes
10. Support and maintenance
11. Service availability disclaimer
12. Suspension
13. Term, termination, and effect of termination
14. Warranty disclaimer
15. Limitation of liability
16. Indemnity
17. Confidentiality
18. Third-party services
19. Governing law and dispute resolution
20. Changes to these Terms
21. General
22. Contact

---

## 3. Data Processing Agreement page

- **Route:** `/data-processing-agreement`
- **SEO Title (≤60 chars):** `Data Processing Agreement (DPA) | ArkenEdu`
- **Meta Description (≤155 chars):** `ArkenEdu's DPA for schools: data controller/processor roles, security, sub-processors, breach notification, and deletion under India's DPDP Act.`
- **H1:** `ArkenEdu Data Processing Agreement`
- **Open Graph:** `og:title` = "ArkenEdu Data Processing Agreement"; `og:type` = "website"; `og:url` = canonical.

**Content hierarchy (H2 sections):**
1. Roles of the parties
2. Definitions
3. Scope and details of processing
4. ArkenEdu's processing obligations
5. Data minimisation and accuracy
6. Confidentiality
7. Security measures
8. Sub-processors *(include the sub-processor table; consider a live `/legal/sub-processors` page)*
9. Data Principal rights
10. Data export rights
11. Data retention
12. Data deletion procedures
13. Personal Data Breach — incident response and notification
14. Termination and exit
15. Audit and demonstrating compliance
16. School responsibilities (summary)
17. ArkenEdu responsibilities (summary)
18. General

---

## Implementation notes

- ✅ **Footer links (implemented):** a reusable `LegalLinks` component renders Privacy / Terms / DPA / Account Deletion and is wired into the Landing page footer (`frontend/src/features/legal/components/LegalLinks.tsx`). Reuse it in the authenticated dashboard footers as well.
- **Sign-in screen:** add a line such as "By signing in you agree to our Terms and Privacy Policy" with links, on both web and mobile.
- **Mobile app store listings:** the Privacy Policy URL field on both Google Play and the App Store must point to `https://arkenedu.com/privacy-policy`.
- **Structured data:** optionally add `WebPage`/`Organization` JSON-LD with `publisher` = ArkenEdu and `dateModified` = the "Last updated" date.
- **Accessibility:** ensure heading order is correct (single H1, sequential H2/H3), sufficient contrast, and that the documents are readable without JavaScript for crawlers and reviewers.
