# ArkenEdu — Mobile App Store Compliance Analysis

**Last updated:** 10 June 2026
**Scope:** the ArkenEdu mobile application built with React Native / Expo, distributed on **Google Play** and the **Apple App Store**.

> **Branding (resolved).** The mobile app now ships as **ArkenEdu** — display name `ArkenEdu`, slug `arkenedu`, and identifiers `com.arkenedu.mobile` (Android package and iOS bundle identifier) — matching the product and website (arkenedu.com). In-app strings (splash, login, profile, notification channel) and the API service name were rebranded to ArkenEdu. When you submit, ensure the **store listing name, developer name, and linked Privacy Policy** all read "ArkenEdu" so reviewers' cross-checks pass. *(Note: because the EAS `projectId` is retained, running `eas build`/`eas update` may prompt to re-confirm the slug — accept it. Changing the bundle ID/package mints a fresh app identity, which is correct pre-launch.)*

---

## 1. What the app actually does on the device

Determined from the app configuration and code, the mobile app:

- **Requests the notifications permission** and registers an **Expo push token** (using `expo-notifications` and `expo-device`) to deliver school notifications.
- **Stores the authentication session securely on the device** using `expo-secure-store` (Keychain on iOS, Keystore-backed storage on Android). No user-facing permission prompt.
- **Communicates over the network (HTTPS)** with ArkenEdu's backend to display the user's school data (attendance, marks/analytics, fees due, announcements, etc.).
- **Does not** request camera, photo library, microphone, contacts, location, calendar, or general file-storage permissions. There is **no** `expo-image-picker`, `expo-document-picker`, or media-library module in the build.
- **Does not perform in-app file uploads or in-app payments.** The Fees screen is **read-only** and deep-links the parent to the **web** portal for UPI payment (UTR + optional screenshot upload), where any upload occurs.
- **Does not** bundle an advertising SDK, attribution SDK, or third-party behavioural-analytics SDK. There is **no advertising identifier (AAID/IDFA) collection** and **no App Tracking Transparency tracking**.
- The iOS configuration declares **`ITSAppUsesNonExemptEncryption = false`** (standard HTTPS only), which is correct for export-compliance.

Server-side, the backend logs requests and uses **Sentry** for error/diagnostic tracking. Because store privacy disclosures cover data the app **collects and transmits off the device** (including via the backend it calls), the disclosures below treat account, app-activity, and diagnostic data as **collected**, even though most of it is processed server-side rather than by an on-device SDK.

---

## 2. Permission-by-permission disclosure analysis

| Capability | Used by the app? | Disclosure required? | Notes |
|---|---|---|---|
| **Push notifications** | Yes (`expo-notifications`) | **Yes** | Register push token + device info via Expo → APNs/FCM. Declare in privacy policy and store data forms. Android 13+ requires the runtime `POST_NOTIFICATIONS` permission. |
| **Storage access** | No (mobile) | No (mobile) | No media-library/file permissions in the build. Web portal handles uploads. |
| **File uploads** | No (mobile) | No (mobile) | Upload flows are web-only; disclose at platform level in the Privacy Policy, not as a mobile permission. |
| **Camera access** | No | No | No camera plugin/permission. Do **not** declare a camera permission you don't use — reviewers reject unused sensitive permissions. |
| **User authentication** | Yes | **Yes** | Account credentials and session token (stored via SecureStore). Disclose as account data used for app functionality. |
| **Analytics (behavioural/ads)** | No | No 3rd-party ad/behavioural analytics | "Mastery analytics" is academic analytics computed from school data — a feature, not tracking. |
| **Crash reporting / diagnostics** | Yes (server-side Sentry) | **Yes** | Disclose diagnostics/crash data (errors, technical context). |
| **Device identifiers** | Yes (push token, device model/OS) | **Yes** | Functional identifiers for push + diagnostics. **No advertising ID.** |
| **Session tracking** | Yes (auth session) | **Yes (functional)** | First-party session to keep the user signed in and enforce RBAC. Not cross-app tracking. |
| **Usage analytics** | Operational only | **Yes (functional/diagnostics)** | Server logs of app activity for operating and securing the Service; not advertising. |

**Key compliance posture:** all data collection is for **App Functionality** and **Diagnostics**. There is **no tracking** (in Apple's sense) and **no data sharing for advertising**. This is the correct posture for an education app that processes children's data.

---

## 3.A Google Play — Data Safety form guidance

Complete the Data Safety section as follows. Across the form: **Is data encrypted in transit?** → **Yes** (HTTPS/TLS). **Do you provide a way to request data deletion?** → **Yes** (link `https://arkenedu.com/account-deletion`; deletion via School admin or privacy@arkenedu.com). **Do you collect/share data for advertising or marketing?** → **No**. **Do you use data for tracking across apps/websites?** → **No**.

For each data type the app handles:

| Data type (Play taxonomy) | Collected? | Shared? | Purpose(s) | Required or optional |
|---|---|---|---|---|
| **Name** | Yes | No | App functionality, Account management | Required |
| **Email address** | Yes | No | App functionality, Account management | Required |
| **Phone number** | Yes (where the School records it) | No | App functionality, Communications | Required |
| **User IDs** (account/student ID) | Yes | No | App functionality, Account management | Required |
| **Address** (where recorded) | Yes | No | App functionality | Optional (School-configured) |
| **Other personal info** (class/section, profile) | Yes | No | App functionality | Required |
| **Financial info — payment/fee info** | Yes (dues, payment status/reference; **viewed** in app, **submitted** on web) | No | App functionality | Optional |
| **Photos** (profile/record media, where shown) | Yes (display) | No | App functionality | Optional |
| **Files and docs** (documents shown in app) | Yes (display) | No | App functionality | Optional |
| **Messages** (in-app announcements/notifications) | Yes | No | App functionality, Communications | Required |
| **App interactions / activity** | Yes | No | App functionality, Diagnostics | Required |
| **Crash logs** | Yes (Sentry) | No | Diagnostics | Required |
| **Diagnostics / performance** | Yes | No | Diagnostics | Required |
| **Device or other IDs** (push token, device model/OS) | Yes | No | App functionality (push), Diagnostics | Required for notifications |
| **Approximate/precise location** | **No** | No | — | — |
| **Contacts (device)** | **No** | No | — | — |
| **Calendar** | **No** | No | — | — |
| **Microphone / Audio** | **No** | No | — | — |
| **Health & fitness** | **No** | No | — | — |
| **Web browsing history** | **No** | No | — | — |
| **Advertising ID** | **No** | No | — | — |

**Families / children:** because the app processes data of students who may be minors and is used in a school context, complete Play's content-rating and target-audience questionnaire accurately. The app is an **administrative/education tool provisioned by schools**, not a self-service consumer app aimed at children, and contains **no ads**. If the listing targets ages that include children, comply with Google Play's **Families** policy (no ads SDK, no collection of AAID from children, appropriate disclosures). Ensure the Privacy Policy URL is set and reachable.

---

## 3.B Apple App Store — App Privacy ("nutrition label") guidance

In App Store Connect → App Privacy, declare the following. **Tracking:** declare **"Data Not Used to Track You"** (no ATT prompt needed, as no cross-app/advertising tracking occurs). For every type below, **Linked to the user = Yes** (data is tied to a school account) and **Used for Tracking = No**.

| Apple data type | Collected? | Linked to user? | Used for Tracking? | Purpose(s) |
|---|---|---|---|---|
| **Contact Info — Name** | Yes | Yes | No | App Functionality |
| **Contact Info — Email Address** | Yes | Yes | No | App Functionality |
| **Contact Info — Phone Number** | Yes | Yes | No | App Functionality |
| **Contact Info — Physical Address** (where recorded) | Yes | Yes | No | App Functionality |
| **Financial Info — Payment/fee info** | Yes (viewed in app) | Yes | No | App Functionality |
| **User Content — Photos/Videos** (displayed) | Yes | Yes | No | App Functionality |
| **User Content — Other (documents)** | Yes | Yes | No | App Functionality |
| **User Content — Customer Support / messages** | Yes | Yes | No | App Functionality |
| **Identifiers — User ID** | Yes | Yes | No | App Functionality |
| **Identifiers — Device ID** (push token, device model) | Yes | Yes | No | App Functionality |
| **Usage Data — Product Interaction** | Yes | Yes | No | App Functionality, Analytics (first-party, non-tracking) |
| **Diagnostics — Crash Data** | Yes | Yes | No | App Functionality (Diagnostics) |
| **Diagnostics — Performance Data** | Yes | Yes | No | App Functionality (Diagnostics) |
| **Location** | No | — | — | — |
| **Contacts (device)** | No | — | — | — |
| **Health & Fitness** | No | — | — | — |
| **Sensitive Info** | No | — | — | — |
| **Browsing/Search History** | No | — | — | — |
| **Advertising Data / IDFA** | No | — | — | — |

**Apple review notes:**
- Provide a reachable **Privacy Policy URL** in App Store Connect (`https://arkenedu.com/privacy-policy`).
- Provide a **demo/reviewer account** (the app is gated behind school-provisioned login; Apple will reject if reviewers cannot sign in). Supply working credentials for a seeded demo school covering parent, teacher, and admin roles, plus any necessary instructions, in App Review notes.
- Apple **Guideline 5.1.4 (Kids)**: if you target the Kids category you must not include third-party analytics/ads and must obtain parental consent — ArkenEdu is positioned as a school-administration app, not a Kids-category app; choose the appropriate category (e.g., Education) and an age rating consistent with the content. Do not enrol in the Kids Category unless intended, as it imposes stricter rules.
- Account deletion: Apple **Guideline 5.1.1(v)** requires apps that support account creation to also support **in-app account deletion / a deletion path**. Because accounts are school-provisioned, surface an in-app "Request account deletion" action that initiates the request (to the School admin / privacy@arkenedu.com) and document it; do not rely solely on an external page.
- `ITSAppUsesNonExemptEncryption = false` is already set (standard HTTPS) — correct.

---

## 4. Pre-submission checklist

- [x] **App name/identifiers aligned** to ArkenEdu (`com.arkenedu.mobile`, slug `arkenedu`) with in-app strings rebranded (R1 done). Confirm the **store listing name and developer name** also read "ArkenEdu".
- [ ] Privacy Policy live at `https://arkenedu.com/privacy-policy` and linked in both store listings.
- [ ] Public account-deletion page live at `https://arkenedu.com/account-deletion`; in-app deletion-request action present (iOS 5.1.1(v)).
- [ ] Google Play Data Safety form completed per Section 3.A; content rating/target-audience questionnaire completed accurately.
- [ ] Apple App Privacy completed per Section 3.B; "Data Not Used to Track You" selected.
- [ ] Reviewer demo accounts (parent/teacher/admin) provided in review notes for both stores.
- [ ] No unused sensitive permissions declared in `app.json` / native manifests.
- [ ] Notifications permission requested with clear in-context rationale before the OS prompt.
- [ ] In-app links to Terms and Privacy on the sign-in screen and in settings.
