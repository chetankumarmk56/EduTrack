import LegalPage from '../components/LegalPage';

export default function DataProcessingAgreement() {
  return (
    <LegalPage
      seoTitle="Data Processing Agreement (DPA) | ArkenEdu"
      seoDescription="ArkenEdu's DPA for schools: data controller/processor roles, security, sub-processors, breach notification, and deletion under India's DPDP Act."
      canonicalPath="/data-processing-agreement"
      h1="Data Processing Agreement"
      effectiveDate="10 June 2026"
      lastUpdated="10 June 2026"
      intro={
        <p className="lead">
          This Data Processing Agreement (“DPA”) forms part of the agreement between the School
          (“Customer”, “School”, or “Data Fiduciary”) and ArkenEdu (“Processor” or “Data Processor”)
          for the provision of the ArkenEdu school-management platform (the “Service”), as governed by
          the <a href="/terms-of-service">Terms of Service</a>. It is designed to support compliance
          with the Digital Personal Data Protection Act, 2023 (DPDP Act), the Information Technology
          Act, 2000, and the SPDI Rules, 2011. In case of conflict between this DPA and the Agreement
          on data-protection matters, this DPA prevails.
        </p>
      }
    >
      <h2 id="roles">1. Roles of the parties</h2>
      <p>
        <strong>1.1</strong> The School is the Data Fiduciary / Data Controller: it determines the
        purposes and means of processing and is responsible for the lawfulness of the data and its
        instructions, including obtaining all consents and notices required by law (including
        verifiable parental consent for children’s data under the DPDP Act).
      </p>
      <p><strong>1.2</strong> ArkenEdu is the Data Processor: it processes School Personal Data only on behalf of, and on the documented instructions of, the School to provide the Service.</p>
      <p><strong>1.3</strong> This DPA does not transfer ownership of School Personal Data. <strong>The School owns all School Personal Data.</strong></p>

      <h2 id="definitions">2. Definitions</h2>
      <p>“School Personal Data” means personal data within School Data that ArkenEdu processes on behalf of the School. “Processing”, “Data Principal”, “Data Fiduciary”, and “Data Processor” have the meanings given in the DPDP Act; “Sensitive Personal Data or Information” has the meaning given in the SPDI Rules. “Sub-processor” means a third party engaged by ArkenEdu to process School Personal Data. “Personal Data Breach” means a breach of security leading to accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to, School Personal Data.</p>

      <h2 id="scope">3. Scope and details of processing</h2>
      <p><strong>3.1 Subject matter.</strong> Provision of the ArkenEdu school-management Service to the School.</p>
      <p><strong>3.2 Duration.</strong> For the term of the Agreement, plus the wind-down period in section 14.</p>
      <p><strong>3.3 Nature and purpose.</strong> Hosting, storage, organisation, retrieval, display, transmission, backup, securing, and support of School Personal Data, and delivery of the Service’s modules and communications.</p>
      <p><strong>3.4 Categories of Data Principals.</strong> Students; parents and guardians; teachers; staff; school owners, principals, and administrators; and other individuals whose records the School maintains.</p>
      <p><strong>3.5 Categories of School Personal Data</strong> (as configured by the School): (a) student records — identity/profile, class/section, enrolment and academic-year records, photographs; (b) parent/guardian records — names, relationship, contact details, address, emergency contacts; (c) staff records — identity, role, contact details, assignments; (d) attendance data; (e) academic data — homework, assignments, lesson and academic content, timetable; (f) examination data — marks, grades, results, report cards, derived analytics; (g) financial data — fee structures, invoices, dues and arrears, payment status, payment references (such as UPI/UTR) and proof-of-payment files; (h) uploaded documents and media; (i) user accounts — credentials (stored as salted hashes), roles, authentication/session data; and (j) communication records — announcements, notifications, messages, delivery logs.</p>
      <p><strong>3.6 Special categories.</strong> The Service is not designed for health, biometric, or government-identity data. To the extent the School chooses to store data that is Sensitive Personal Data or Information, ArkenEdu applies the safeguards in this DPA, and the School is responsible for the lawful basis to store it.</p>

      <h2 id="processing-obligations">4. ArkenEdu’s processing obligations</h2>
      <p><strong>4.1 Processing only on instructions.</strong> ArkenEdu processes School Personal Data only on the School’s documented instructions (including this DPA, the Agreement, Service configuration, and support requests) and to comply with law; where required by law to process beyond those instructions, it will, where lawful, inform the School first.</p>
      <p><strong>4.2 No other use.</strong> ArkenEdu will not sell School Personal Data, use it for advertising or to build advertising profiles, or use it for its own purposes other than to provide, secure, support, and improve the Service in a de-identified/aggregated manner that does not identify any Data Principal or School.</p>
      <p><strong>4.3 Children’s data.</strong> ArkenEdu will not undertake tracking, behavioural monitoring, or targeted advertising directed at children, consistent with the DPDP Act. The School is responsible for obtaining and recording verifiable parental consent where required.</p>
      <p><strong>4.4 Lawfulness of instructions.</strong> ArkenEdu will inform the School if, in its opinion, an instruction infringes applicable data-protection law (without obligation to provide legal advice).</p>
      <p><strong>4.5 Assistance.</strong> Taking into account the nature of processing, ArkenEdu will reasonably assist the School to (a) respond to Data Principal rights requests; (b) meet security, breach-notification, and impact-assessment obligations; and (c) demonstrate compliance.</p>

      <h2 id="minimisation">5. Data minimisation and accuracy</h2>
      <p>ArkenEdu processes only the School Personal Data necessary to provide the Service. The School controls what data is entered and is responsible for its accuracy, relevance, and minimisation; ArkenEdu provides tools to correct, update, and delete records. ArkenEdu’s AI-assisted academic tools are intended for academic content and should not be supplied with student personal data.</p>

      <h2 id="confidentiality">6. Confidentiality</h2>
      <p>ArkenEdu keeps School Personal Data confidential, ensures personnel authorised to process it are bound by appropriate confidentiality obligations and are trained, and limits access to personnel who need it on a least-privilege basis.</p>

      <h2 id="security">7. Security measures</h2>
      <p>ArkenEdu implements and maintains appropriate technical and organisational measures appropriate to the risk, including: (a) encryption in transit (HTTPS/TLS) and at rest for stored data and backups; (b) role-based access control for users and least-privilege administrative access to production; (c) salted password hashing, HttpOnly role-keyed session cookies on the web, and secure on-device token storage in the mobile app; (d) short-lived pre-signed URLs (default expiry within one hour) for documents and media, which are not publicly listable; (e) network and application hardening, logging, monitoring, and error/diagnostics tracking; (f) backups and recovery; (g) segregation of customers’ data via application-level controls; and (h) contractual security and confidentiality commitments from sub-processors. ArkenEdu may update its measures provided the overall level of protection is not materially reduced. Security is a shared responsibility: the School manages roles and access, safeguards credentials, configures the Service correctly, and promptly reports suspected compromise.</p>

      <h2 id="sub-processors">8. Sub-processors</h2>
      <p><strong>8.1 General authorisation.</strong> The School authorises ArkenEdu to engage Sub-processors to provide the Service.</p>
      <p><strong>8.2 Flow-down.</strong> ArkenEdu imposes on each Sub-processor, by written contract, data-protection and security obligations no less protective than those in this DPA (to the extent applicable), and remains responsible to the School for its Sub-processors’ performance.</p>
      <p><strong>8.3 Current Sub-processors</strong> (as at the Effective date):</p>
      <table>
        <thead>
          <tr><th>Sub-processor</th><th>Purpose</th><th>Data involved</th><th>Location</th></tr>
        </thead>
        <tbody>
          <tr><td>Amazon Web Services (AWS)</td><td>Cloud hosting/compute (EC2) and object storage (S3) for uploads, documents, media, and proof-of-payment files</td><td>All categories of School Personal Data</td><td>AWS India regions for Indian Schools’ production data</td></tr>
          <tr><td>Cloudinary (legacy)</td><td>Historic media hosting; some older records may reference Cloudinary URLs</td><td>Uploaded media referenced by legacy records</td><td>As per provider</td></tr>
          <tr><td>OpenAI</td><td>AI generation for Question Bank and Lesson Plan tools</td><td>Teacher-submitted academic content (not intended to include student personal data)</td><td>As per provider</td></tr>
          <tr><td>Google (Generative AI / Gemini)</td><td>AI generation for academic tools</td><td>Teacher-submitted academic content (not intended to include student personal data)</td><td>As per provider</td></tr>
          <tr><td>Expo (with APNs and Firebase Cloud Messaging)</td><td>Push-notification delivery</td><td>Push token, device information, notification content</td><td>As per provider</td></tr>
          <tr><td>Twilio</td><td>Outbound voice communications (e.g., automated calls to parents)</td><td>Recipient phone number and message content</td><td>As per provider</td></tr>
          <tr><td>Sentry</td><td>Application error and diagnostics tracking</td><td>Technical/diagnostic data and limited identifiers</td><td>As per provider</td></tr>
        </tbody>
      </table>
      <p><strong>8.4 Changes.</strong> ArkenEdu maintains an up-to-date Sub-processor list and gives reasonable prior notice of additions or replacements. The School may object on reasonable data-protection grounds within the notice period; the parties will work in good faith to address it, and if it cannot be resolved, the School may terminate the affected part of the Service per the Agreement.</p>
      <p><strong>8.5 AWS hosting considerations.</strong> The Service runs on AWS, with production data for Indian Schools in AWS India regions. AWS acts as a Sub-processor under its own security certifications and the shared-responsibility model: ArkenEdu secures the application and data it deploys on AWS, and AWS secures the underlying cloud infrastructure.</p>

      <h2 id="rights">9. Data Principal rights</h2>
      <p>The Service provides the School with controls to access, correct, update, export, and delete records, enabling the School to respond directly to Data Principal requests (access, correction/completion, erasure, withdrawal of consent, nomination, and grievance redressal). If ArkenEdu receives a request directly from a Data Principal, it will, where lawful, promptly refer it to the School and not respond directly except to confirm the School is the Data Fiduciary, unless the School instructs otherwise or the law requires. ArkenEdu provides reasonable assistance (including through Service functionality) to fulfil such requests.</p>

      <h2 id="export">10. Data export rights</h2>
      <p>During the term, the School may access and export School Personal Data through the Service in a commonly used, machine-readable format. On request, and at exit (section 14), ArkenEdu will make School Personal Data available for export and provide reasonable assistance with bulk export.</p>

      <h2 id="retention">11. Data retention</h2>
      <p>ArkenEdu retains School Personal Data for the term and as needed to provide the Service. Academic records are stamped to an academic year and designed to be retained across years to support longitudinal records and arrears carry-over. The School controls retention and may correct, archive, or delete data using the Service. Operational data ArkenEdu controls — logs, diagnostics, and backups — is retained for limited, defined periods and then deleted or overwritten.</p>

      <h2 id="deletion">12. Data deletion procedures</h2>
      <p>During the term, deletion actions remove the relevant records from the active Service. Deleted data may persist in backups for a limited period until those backups are cycled out, after which it is no longer recoverable from backups. At exit, ArkenEdu deletes or irreversibly anonymises School Personal Data per section 14, and will, on request, confirm completion of deletion except where retention is required by law.</p>

      <h2 id="breach">13. Personal Data Breach — incident response and notification</h2>
      <p><strong>13.1</strong> ArkenEdu maintains procedures to detect, investigate, and respond to security incidents affecting School Personal Data.</p>
      <p><strong>13.2</strong> ArkenEdu will notify the affected School without undue delay after becoming aware of a Personal Data Breach affecting that School’s Personal Data, and in any event within the timeframe required by law.</p>
      <p><strong>13.3</strong> The notification will include, to the extent known and as it becomes available: the nature of the breach, the categories and approximate volume of data and Data Principals affected, the likely consequences, and the measures taken or proposed to address it and mitigate harm.</p>
      <p><strong>13.4</strong> ArkenEdu will reasonably cooperate with the School, take reasonable steps to mitigate and prevent recurrence, and assist the School with its own notification obligations (for example to affected Data Principals and to the Data Protection Board of India, where applicable). The School, as Data Fiduciary, is responsible for any notifications it is legally required to make. Notification is not an acknowledgement of fault or liability.</p>

      <h2 id="exit">14. Termination and exit</h2>
      <p>On expiry or termination, ArkenEdu will, at the School’s choice, make School Personal Data available for export for 30 days (or such longer period as agreed). After the export window, ArkenEdu will delete or irreversibly anonymise School Personal Data in the active Service, and such data will be removed from backups as they are cycled out, except where retention is required by law. On written request, ArkenEdu confirms completion of deletion. Obligations that by their nature survive (including confidentiality and security relating to retained data) survive until the data is deleted or anonymised.</p>

      <h2 id="audit">15. Audit and demonstrating compliance</h2>
      <p>ArkenEdu will make available information reasonably necessary to demonstrate compliance, including a description of its technical and organisational measures and, where available, third-party reports or certifications of ArkenEdu or its key Sub-processors (such as AWS). Where the School reasonably requires further verification, it may, on reasonable prior written notice (and no more than once per year unless a regulator requires otherwise or a breach has occurred), conduct an audit through a mutually agreed, independent, confidentiality-bound assessor, during business hours, without disrupting the Service or compromising other customers’ data, and at the School’s cost (unless the audit reveals material non-compliance by ArkenEdu). ArkenEdu will reasonably cooperate with inquiries from a competent authority, including the Data Protection Board of India.</p>

      <h2 id="school-responsibilities">16. School responsibilities (summary)</h2>
      <p>The School will: (16.1) ensure it has a lawful basis and all required consents and notices, including verifiable parental consent for children’s data; (16.2) configure the Service, assign roles, and manage Authorised Users responsibly, applying data minimisation; (16.3) keep School Personal Data accurate and action Data Principal requests using the Service; (16.4) safeguard credentials and promptly report suspected security incidents; and (16.5) not store special-category data (health, biometric, government identifiers) unless it has a lawful basis and accepts responsibility.</p>

      <h2 id="arkenedu-responsibilities">17. ArkenEdu responsibilities (summary)</h2>
      <p>ArkenEdu will: (17.1) process School Personal Data only on the School’s documented instructions and to comply with law; (17.2) maintain the section 7 security measures and impose flow-down obligations on Sub-processors; (17.3) keep School Personal Data confidential and limit access on a least-privilege basis; (17.4) assist the School with Data Principal rights, security, and breach matters; (17.5) notify the School of Personal Data Breaches without undue delay; and (17.6) return/delete School Personal Data on exit.</p>

      <h2 id="general">18. General</h2>
      <p>This DPA is governed by the laws of India and is subject to the governing-law and dispute-resolution provisions of the Agreement. If any provision is unenforceable, the remainder continues in effect. ArkenEdu may update this DPA to reflect changes in law, Sub-processors, or the Service, provided such updates do not materially reduce the protections afforded to School Personal Data; material updates will be notified to Schools. Data-protection and security contact: <a href="mailto:dpo@arkenedu.com">dpo@arkenedu.com</a> / <a href="mailto:grievance@arkenedu.com">grievance@arkenedu.com</a>.</p>

      <hr />
      <p>This DPA supplements and forms part of the <a href="/terms-of-service">Terms of Service</a> and should be read together with the <a href="/privacy-policy">Privacy Policy</a>.</p>
    </LegalPage>
  );
}
