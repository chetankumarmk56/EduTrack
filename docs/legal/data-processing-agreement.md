# ArkenEdu Data Processing Agreement (DPA)

**Effective date:** 10 June 2026
**Last updated:** 10 June 2026

This Data Processing Agreement ("**DPA**") forms part of the agreement between the School ("**Customer**", "**School**", or "**Data Fiduciary**") and **ArkenEdu** ("**ArkenEdu**", "**Processor**", or "**Data Processor**") for the provision of the ArkenEdu school-management platform (the "**Service**"), as governed by the [Terms of Service](terms-of-service.md) (the "**Agreement**"). It records the parties' obligations in respect of the processing of personal data carried out by ArkenEdu on behalf of the School.

This DPA is designed to support the parties' compliance with the **Digital Personal Data Protection Act, 2023 (DPDP Act)**, the **Information Technology Act, 2000** and the **Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011 (SPDI Rules)**, and other applicable data-protection laws.

In case of conflict between this DPA and the Agreement on data-protection matters, this DPA prevails.

---

## 1. Roles of the parties

1.1 The **School is the Data Fiduciary / Data Controller**: it determines the purposes and means of processing School Personal Data and is responsible for the lawfulness of the data and of its instructions, including obtaining all consents and notices required by law (including verifiable parental consent for children's data under the DPDP Act).

1.2 **ArkenEdu is the Data Processor**: it processes School Personal Data only on behalf of, and on the documented instructions of, the School to provide the Service.

1.3 This DPA does not transfer ownership of School Personal Data. **The School owns all School Personal Data.**

---

## 2. Definitions

2.1 "**School Personal Data**" means personal data within School Data (as defined in the Agreement) that ArkenEdu processes on behalf of the School.

2.2 "**Processing**", "**Data Principal**", "**Data Fiduciary**", and "**Data Processor**" have the meanings given in the DPDP Act. "**Sensitive Personal Data or Information**" has the meaning given in the SPDI Rules.

2.3 "**Sub-processor**" means a third party engaged by ArkenEdu to process School Personal Data in connection with the Service.

2.4 "**Personal Data Breach**" means a breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to, School Personal Data.

2.5 Other capitalised terms have the meanings given in the Agreement.

---

## 3. Scope and details of processing

3.1 **Subject matter.** Provision of the ArkenEdu school-management Service to the School.

3.2 **Duration.** For the term of the Agreement, plus the wind-down period in Section 14.

3.3 **Nature and purpose.** Hosting, storage, organisation, retrieval, display, transmission, backup, securing, and support of School Personal Data, and delivery of the Service's modules and communications, all to enable the School to administer its operations.

3.4 **Categories of Data Principals.** Students; parents and guardians; teachers; staff; school owners, principals, and administrators; and other individuals whose records the School maintains in the Service.

3.5 **Categories of School Personal Data.** As configured by the School, including:

(a) **Student records** — identity and profile, class/section, enrolment and academic-year records, photographs;
(b) **Parent / guardian records** — names, relationship, contact details, address, emergency contacts;
(c) **Staff records** — teacher and staff identity, role, contact details, and assignments;
(d) **Attendance data** — attendance status and related notes;
(e) **Academic data** — homework, assignments, lesson and academic content, timetable;
(f) **Examination data** — marks, grades, assessment results, report cards, and derived analytics;
(g) **Financial data** — fee structures, invoices, dues and arrears, payment status, and payment references (such as UPI/UTR references) and proof-of-payment files;
(h) **Uploaded documents** — files and media stored against records or for the School;
(i) **User accounts** — credentials (stored as salted hashes), roles, and authentication/session data; and
(j) **Communication records** — announcements, notifications, messages, and delivery logs.

3.6 **Special categories.** The Service is not designed for health, biometric, or government-identity data. To the extent the School chooses to store data that is Sensitive Personal Data or Information (for example passwords or financial information), ArkenEdu will apply the safeguards in this DPA, and the School is responsible for the lawful basis to store it.

---

## 4. ArkenEdu's processing obligations

4.1 **Processing only on instructions.** ArkenEdu will process School Personal Data only on the School's documented instructions — including those set out in this DPA, the Agreement, the configuration of the Service, and support requests — and to comply with law. If ArkenEdu is required by law to process beyond those instructions, it will, where lawful, inform the School first.

4.2 **No other use.** ArkenEdu will not sell School Personal Data, will not use it for advertising or to build advertising profiles, and will not use it for its own purposes other than to provide, secure, support, and improve the Service in a de-identified/aggregated manner that does not identify any Data Principal or School.

4.3 **Children's data.** ArkenEdu will not undertake tracking, behavioural monitoring, or targeted advertising directed at children, consistent with the DPDP Act. The School is responsible for obtaining and recording verifiable parental consent where required.

4.4 **Lawfulness of instructions.** ArkenEdu will inform the School if, in its opinion, an instruction infringes applicable data-protection law (without obligation to provide legal advice).

4.5 **Assistance to the School.** Taking into account the nature of processing, ArkenEdu will provide reasonable assistance to enable the School to (a) respond to Data Principal rights requests (Section 9); (b) meet its security, breach-notification, and (where applicable) data-protection-impact obligations; and (c) demonstrate compliance.

---

## 5. Data minimisation and accuracy

5.1 ArkenEdu processes only the School Personal Data necessary to provide the Service and does not require the School to provide more than is needed for the features it uses.

5.2 The **School controls what data is entered** and is responsible for its accuracy, relevance, and minimisation. ArkenEdu provides tools enabling the School to correct, update, and delete records.

5.3 ArkenEdu's AI-assisted academic tools are intended for academic content and should not be supplied with student personal data; ArkenEdu's Documentation reflects this minimisation expectation.

---

## 6. Confidentiality

6.1 ArkenEdu will keep School Personal Data confidential and will ensure that personnel authorised to process it are bound by appropriate confidentiality obligations and are trained on their responsibilities.

6.2 ArkenEdu limits access to School Personal Data to personnel who need it to provide or support the Service, on a least-privilege basis.

---

## 7. Security measures

7.1 ArkenEdu implements and maintains appropriate technical and organisational measures designed to ensure a level of security appropriate to the risk, including:

(a) **Encryption in transit** (HTTPS/TLS) for all client–server communication, and encryption at rest for stored data and backups;
(b) **Access control** through role-based access control (RBAC) for users, and least-privilege, need-to-know administrative access to production systems;
(c) **Authentication security**, including salted one-way password hashing, secure session management with HttpOnly, role-keyed cookies on the web, and secure on-device token storage in the mobile app;
(d) **Time-limited file access** — documents and media in object storage are served via short-lived pre-signed URLs (default expiry within one hour) and are not publicly listable;
(e) **Network and application hardening**, logging, monitoring, and error/diagnostic tracking;
(f) **Backups** and recovery procedures to support availability and integrity;
(g) **Segregation** of customers' data within the multi-tenant Service through application-level controls; and
(h) **Vendor security** — contractual security and confidentiality commitments from sub-processors.

7.2 ArkenEdu may update its security measures over time, provided that the overall level of protection is not materially reduced.

7.3 The parties acknowledge that security is a shared responsibility. The School is responsible for managing user roles and access appropriately, safeguarding credentials, configuring the Service correctly, and promptly reporting suspected compromise.

---

## 8. Sub-processors

8.1 **General authorisation.** The School authorises ArkenEdu to engage Sub-processors to process School Personal Data to provide the Service.

8.2 **Flow-down obligations.** ArkenEdu will impose on each Sub-processor, by written contract, data-protection and security obligations no less protective than those in this DPA, to the extent applicable to the Sub-processor's services, and remains responsible to the School for its Sub-processors' performance of those obligations.

8.3 **Current Sub-processors.** As at the Effective date, ArkenEdu's Sub-processors are:

| Sub-processor | Purpose | Data involved | Location |
|---|---|---|---|
| **Amazon Web Services (AWS)** | Cloud hosting/compute (EC2) and object storage (S3) for uploads, documents, media, and proof-of-payment files | All categories of School Personal Data | AWS India regions for Indian Schools' production data |
| **Cloudinary** *(legacy)* | Historic media hosting; some older records may reference Cloudinary URLs | Uploaded media referenced by legacy records | As per provider |
| **OpenAI** | AI generation for Question Bank and Lesson Plan tools | Teacher-submitted academic content (not intended to include student personal data) | As per provider |
| **Google (Generative AI / Gemini)** | AI generation for academic tools | Teacher-submitted academic content (not intended to include student personal data) | As per provider |
| **Expo** (with Apple Push Notification service and Firebase Cloud Messaging) | Push-notification delivery | Push token, device information, notification content | As per provider |
| **Twilio** | Outbound voice communications (e.g., automated calls to parents) | Recipient phone number and message content | As per provider |
| **Sentry** | Application error and diagnostics tracking | Technical/diagnostic data and limited identifiers | As per provider |

8.4 **Changes to Sub-processors.** ArkenEdu will maintain an up-to-date list of Sub-processors and will give the School reasonable prior notice of the addition or replacement of a Sub-processor that processes School Personal Data. The School may object on reasonable data-protection grounds within the notice period; the parties will work in good faith to address the objection, and if it cannot be resolved, the School may terminate the affected part of the Service as set out in the Agreement.

8.5 **AWS hosting considerations.** The Service runs on AWS infrastructure. Production data for Indian Schools is hosted in AWS India regions. AWS acts as a Sub-processor for hosting and storage and operates under its own security certifications and the shared-responsibility model, under which ArkenEdu is responsible for securing the application and data it deploys on AWS, and AWS is responsible for the security of the underlying cloud infrastructure.

---

## 9. Data Principal rights

9.1 The Service provides the School with controls to access, correct, update, export, and delete records, enabling the School to respond directly to requests from Data Principals (students, parents, staff, and others) to exercise their rights under the DPDP Act, including access, correction and completion, erasure, withdrawal of consent, nomination, and grievance redressal.

9.2 If ArkenEdu receives a request directly from a Data Principal relating to School Personal Data, ArkenEdu will, where lawful, promptly refer the request to the School and will not respond directly except to confirm that the School is the Data Fiduciary, unless the School instructs otherwise or the law requires.

9.3 Taking into account the nature of processing, ArkenEdu will provide the School with reasonable assistance (including through Service functionality) to fulfil such requests.

---

## 10. Data export rights

10.1 During the term, the School may access and export School Personal Data through the Service's features in a commonly used, machine-readable format.

10.2 On request, and at exit (Section 14), ArkenEdu will make School Personal Data available for export, and will provide reasonable assistance with bulk export, subject to the Agreement.

---

## 11. Data retention

11.1 ArkenEdu retains School Personal Data for the term of the Agreement and as needed to provide the Service. Academic records are stamped to an academic year and are designed to be retained across years to support longitudinal records and arrears carry-over.

11.2 The School controls retention of its records and may correct, archive, or delete data using the Service.

11.3 Operational data that ArkenEdu controls — logs, diagnostics, and backups — is retained for limited, defined periods appropriate to its purpose and then deleted or overwritten in the ordinary course.

---

## 12. Data deletion procedures

12.1 During the term, deletion actions taken by the School (or requested of ArkenEdu) remove the relevant records from the active Service.

12.2 Deleted data may persist in backups for a limited period until those backups are cycled out on their normal schedule, after which the data is no longer recoverable from backups.

12.3 At exit, ArkenEdu will delete or irreversibly anonymise School Personal Data as set out in Section 14.

12.4 ArkenEdu will, on request, confirm completion of deletion, except where retention is required by law.

---

## 13. Personal Data Breach — incident response and notification

13.1 **Detection and response.** ArkenEdu maintains procedures to detect, investigate, and respond to security incidents affecting School Personal Data.

13.2 **Notification to the School.** ArkenEdu will notify the affected School **without undue delay** after becoming aware of a Personal Data Breach affecting that School's Personal Data, and in any event within the timeframe required by applicable law.

13.3 **Contents of notice.** The notification will include, to the extent known and as it becomes available: the nature of the breach, the categories and approximate volume of data and Data Principals affected, the likely consequences, and the measures taken or proposed to address it and mitigate harm.

13.4 **Cooperation.** ArkenEdu will reasonably cooperate with the School and take reasonable steps to mitigate the breach and prevent recurrence, and will assist the School with the School's own notification obligations (for example to affected Data Principals and to the Data Protection Board of India, where applicable). The School, as Data Fiduciary, is responsible for any notifications it is legally required to make.

13.5 ArkenEdu's notification is not an acknowledgement of fault or liability.

---

## 14. Termination and exit

14.1 On expiry or termination of the Agreement, ArkenEdu will, at the School's choice, make School Personal Data available for export for a period of **30 days** (or such longer period as agreed in an Order).

14.2 After the export window, ArkenEdu will **delete or irreversibly anonymise** School Personal Data in the active Service, and such data will be removed from backups as they are cycled out, except to the extent retention is required by applicable law.

14.3 On the School's written request, ArkenEdu will confirm completion of deletion.

14.4 The obligations in this DPA that by their nature should survive termination (including confidentiality and security obligations relating to retained data) survive until the data is deleted or anonymised.

---

## 15. Audit and demonstrating compliance

15.1 ArkenEdu will make available to the School information reasonably necessary to demonstrate compliance with this DPA, including a description of its technical and organisational measures and, where available, third-party reports or certifications of ArkenEdu or its key Sub-processors (such as AWS).

15.2 Where the School reasonably requires further verification, the School may, on reasonable prior written notice (and no more than once per year unless a regulator requires otherwise or a Personal Data Breach has occurred), conduct an audit through a mutually agreed, independent, and confidentiality-bound assessor. Audits will be conducted during business hours, in a manner that does not disrupt the Service or compromise the security or confidentiality of other customers' data, and at the School's cost (unless the audit reveals material non-compliance by ArkenEdu).

15.3 ArkenEdu will reasonably cooperate with inquiries from a competent data-protection authority, including the Data Protection Board of India, relating to its processing under this DPA.

---

## 16. School responsibilities (summary)

The School will:

16.1 ensure it has a lawful basis and all required consents and notices for the School Personal Data it provides, including verifiable parental consent for children's data;

16.2 configure the Service, assign roles, and manage Authorised Users responsibly, applying data minimisation;

16.3 keep School Personal Data accurate and up to date and action Data Principal requests using the Service;

16.4 safeguard credentials and promptly report suspected security incidents; and

16.5 not store special-category data (health, biometric, government identifiers) in the Service unless it has a lawful basis and accepts responsibility for doing so.

---

## 17. ArkenEdu responsibilities (summary)

ArkenEdu will:

17.1 process School Personal Data only on the School's documented instructions and to comply with law;

17.2 maintain the security measures in Section 7 and impose flow-down obligations on Sub-processors;

17.3 keep School Personal Data confidential and limit access on a least-privilege basis;

17.4 assist the School with Data Principal rights, security, and breach matters as set out above;

17.5 notify the School of Personal Data Breaches without undue delay; and

17.6 return/delete School Personal Data on exit.

---

## 18. General

18.1 This DPA is governed by the laws of **India** and is subject to the governing-law and dispute-resolution provisions of the Agreement.

18.2 If any provision of this DPA is found unenforceable, the remainder continues in effect.

18.3 ArkenEdu may update this DPA to reflect changes in law, Sub-processors, or the Service, provided that such updates do not materially reduce the protections afforded to School Personal Data; material updates will be notified to Schools.

18.4 Data-protection and security contact: **dpo@arkenedu.com** / **grievance@arkenedu.com**.

---

*This DPA supplements and forms part of the [Terms of Service](terms-of-service.md) and should be read together with the [Privacy Policy](privacy-policy.md).*
