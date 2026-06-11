import LegalPage from '../components/LegalPage';

export default function PrivacyPolicy() {
  return (
    <LegalPage
      seoTitle="Privacy Policy | ArkenEdu School ERP"
      seoDescription="How ArkenEdu's school ERP collects, uses, secures, and retains student, parent, teacher, and staff data — built for Indian schools and the DPDP Act."
      canonicalPath="/privacy-policy"
      h1="Privacy Policy"
      effectiveDate="10 June 2026"
      lastUpdated="10 June 2026"
      intro={
        <p className="lead">
          This Privacy Policy applies to the ArkenEdu web application at{' '}
          <a href="https://arkenedu.com">arkenedu.com</a>, the ArkenEdu mobile application
          (distributed on Google Play and the Apple App Store), and all related interfaces,
          back-end services, and communications operated by ArkenEdu.
        </p>
      }
    >
      <h2 id="introduction">1. Introduction</h2>
      <p>
        ArkenEdu (<strong>“ArkenEdu”</strong>, <strong>“we”</strong>, <strong>“us”</strong>, or{' '}
        <strong>“our”</strong>) provides a School Enterprise Resource Planning (ERP) and
        school-management platform (the <strong>“Platform”</strong>) to private schools, K–12
        institutions, and other educational institutions in India (each, a{' '}
        <strong>“School”</strong>). The Platform helps Schools manage admissions, student records,
        attendance, examinations and report cards, academic records, timetables, homework and
        assignments, communication and announcements, fee and finance management, document storage,
        and related operations, with web and mobile access for school owners, principals,
        administrators, teachers, staff, students, and parents.
      </p>

      <h3>1.1 Our role: who controls your data</h3>
      <p>
        Almost all of the personal data on the Platform is uploaded, generated, or entered by a
        School and by the users the School authorises.
      </p>
      <ul>
        <li>
          <strong>The School is the Data Fiduciary / Data Controller.</strong> The School decides
          which records to maintain, who may access them, and the purposes for which they are used.
          The School is responsible for collecting any consent required from students, parents,
          staff, and others, and for the lawfulness of the instructions it gives us.
        </li>
        <li>
          <strong>ArkenEdu is the Data Processor.</strong> We process personal data on behalf of and
          under the documented instructions of the School, principally to operate, maintain, secure,
          and support the Platform. Our processing of School data is governed by our{' '}
          <a href="/data-processing-agreement">Data Processing Agreement</a> (“DPA”) with each
          School.
        </li>
      </ul>
      <p>
        For a limited set of data — for example the contact and billing details of the individuals
        who administer a School’s subscription, and Platform-operations data such as security logs —
        ArkenEdu acts as a <strong>Data Fiduciary / Controller</strong> in its own right. This Policy
        identifies where that is the case. If you are a student, parent, teacher, or member of staff
        and you have questions about how your School uses your data, please contact your School in
        the first instance.
      </p>

      <h3>1.2 Laws we work under</h3>
      <p>
        We design the Platform to support Schools in meeting their obligations under, and process
        personal data in accordance with, the{' '}
        <strong>Digital Personal Data Protection Act, 2023 (DPDP Act)</strong> and rules made under
        it; the <strong>Information Technology Act, 2000</strong> and the{' '}
        <strong>Information Technology (Reasonable Security Practices and Procedures and Sensitive
        Personal Data or Information) Rules, 2011 (SPDI Rules)</strong>; and other applicable Indian
        laws governing the records that Schools are required to maintain.
      </p>

      <h2 id="summary">2. Summary at a glance</h2>
      <table>
        <thead>
          <tr>
            <th>Question</th>
            <th>Answer</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Do we sell personal data?</td><td><strong>No.</strong> We never sell personal data.</td></tr>
          <tr><td>Do we use personal data for advertising?</td><td><strong>No.</strong> The Platform contains no advertising and no ad networks.</td></tr>
          <tr><td>Do we track users across other apps and websites?</td><td><strong>No.</strong> We do not perform cross-app or cross-site behavioural tracking.</td></tr>
          <tr><td>Do we profile children or run behavioural monitoring of students?</td><td><strong>No.</strong> No behavioural monitoring or targeted advertising directed at children.</td></tr>
          <tr><td>Do we use third-party advertising or behavioural-analytics SDKs?</td><td><strong>No.</strong></td></tr>
          <tr><td>Where is data hosted?</td><td>On <strong>Amazon Web Services (AWS)</strong>, in AWS regions located in India for Indian Schools’ production data.</td></tr>
          <tr><td>Who owns the School’s data?</td><td>The <strong>School</strong>. ArkenEdu does not claim ownership of School data.</td></tr>
          <tr><td>Can data be exported and deleted?</td><td><strong>Yes.</strong> See sections 13, 14, and 15.</td></tr>
        </tbody>
      </table>

      <h2 id="children">3. Who the Platform is for, and our policy on children</h2>
      <p>
        The Platform is an administrative tool used by Schools and the users a School authorises. It
        is not directed to the general public and is not an ad-supported consumer service. Many users
        are children (students under 18). We treat student data with heightened care:
      </p>
      <ul>
        <li>
          Student accounts and records are created and managed by the School, not by children signing
          up independently. We do not knowingly establish a direct, consumer-style relationship with
          a child outside the School context.
        </li>
        <li>
          Where the law requires verifiable consent of a parent or lawful guardian for processing a
          child’s personal data, <strong>the School (as Data Fiduciary) is responsible for obtaining
          and recording that consent</strong> before the child’s data is entered.
        </li>
        <li>
          Consistent with the DPDP Act, we do not undertake tracking, behavioural monitoring, or
          targeted advertising directed at children, and we do not process children’s personal data
          in a way likely to cause a detrimental effect on their well-being.
        </li>
        <li>
          In many Schools, a parent accesses the Platform using the student’s login. Where this is
          the case, the parent and student share the same account, and the data visible there is
          governed by the School’s configuration.
        </li>
      </ul>

      <h2 id="accounts">4. The accounts and identities on the Platform</h2>
      <h3>4.1 Account provisioning</h3>
      <p>
        Accounts are provisioned by the School, not by self-service public sign-up. A School
        administrator creates accounts for principals, administrators, teachers, staff, students, and
        (where applicable) parents, and assigns each a role. Access is governed by{' '}
        <strong>role-based access control (RBAC)</strong> — what a user can see and do depends on the
        role the School assigns.
      </p>
      <h3>4.2 The shared parent/student login model</h3>
      <p>
        For many Schools, ArkenEdu operates a model in which a parent accesses the Platform using
        their child’s student login rather than holding a separate parent account. In these cases the
        parent and student use the same credentials and see the same account; a separate “parent”
        record may not exist; and the data shown reflects the student’s records as configured by the
        School. Because of this model, references to “parent data” and “student data” may relate to
        the same shared account.
      </p>

      <h2 id="data-we-process">5. Personal data we process</h2>
      <p>
        Most data is provided by the School or its users; some is generated automatically.{' '}
        <strong>The specific fields maintained for any individual are configured by the School.</strong>
      </p>
      <h3>5.1 Student data</h3>
      <p>
        Identity and profile (name, photograph, date of birth, gender, student/admission/roll number,
        class and section, academic-year and enrolment records); links to parent/guardian and
        emergency contacts; attendance status and notes; academic and examination data (marks, grades,
        results, report cards, mastery analytics, homework and assignment status); timetable;
        communications addressed to the account; documents uploaded against the student record; and
        financial data (fee structure, invoices, dues/arrears including arrears carried over between
        years, payment status, and payment references such as a UPI/UTR reference with any associated
        proof-of-payment file).
      </p>
      <h3>5.2 Parent / guardian data</h3>
      <p>
        Name, relationship, phone number(s), email, postal address, and emergency-contact details as
        recorded by the School; activity associated with the shared student login where applicable;
        fee-payment information submitted through the parent portal; and communication/notification
        preferences and delivery records.
      </p>
      <h3>5.3 Teacher and staff data</h3>
      <p>
        Identity and profile (name, photograph, employee identifier, role/designation, subjects and
        classes, contact details); account credentials and authentication data; work product entered
        into the Platform (attendance, marks, homework and lesson content, announcements, documents,
        and academic content submitted to AI-assisted tools); and activity/audit records.
      </p>
      <h3>5.4 School owner / principal / administrator data</h3>
      <p>
        Name, role, official email and phone, and the School(s) and scope each administrator may
        manage. Where the individual administers the subscription or billing, we also process their
        contact and billing-administration details <strong>as a Data Fiduciary in our own right</strong>{' '}
        to manage our service relationship with the School.
      </p>
      <h3>5.5 Data generated automatically</h3>
      <ul>
        <li><strong>Authentication and session data</strong> used to keep you signed in and enforce RBAC.</li>
        <li><strong>Device and technical data</strong> — IP address, browser/OS/device type, app version, language, time-zone; for the mobile app, device model and OS version used to register and deliver push notifications.</li>
        <li><strong>Push-notification identifiers</strong> — the push token issued for your device.</li>
        <li><strong>Logs and diagnostics</strong> — server access logs, application logs, and error/diagnostic events.</li>
        <li><strong>Usage data</strong> needed to operate features. We do not operate third-party advertising or behavioural-analytics SDKs.</li>
      </ul>
      <h3>5.6 Sensitive personal data</h3>
      <p>
        Some data may be “sensitive personal data or information” under the SPDI Rules — for example
        passwords and financial information. We apply heightened safeguards. The Platform is not
        designed to be a repository for health records, biometric data, or government identity
        numbers; Schools should avoid uploading such data unless their own legal basis requires it and
        remain responsible for any such data they store.
      </p>

      <h2 id="purposes">6. Why we process personal data (purposes and legal basis)</h2>
      <p>
        As a Data Processor, we process School data only to provide and support the Platform under the
        School’s instructions, including to: create and administer accounts and enforce RBAC; operate
        the modules the School uses; deliver communications, announcements, and push notifications;
        generate AI-assisted academic materials when a teacher uses those tools; secure the Platform
        and maintain audit trails; provide support; back up and restore data; and meet legal
        obligations applicable to us as a processor. The legal basis — including any consent required
        from students, parents, and staff, and any verifiable parental consent for children’s data —
        is established and maintained by the <strong>School as Data Fiduciary</strong>. We do not use
        School data to build advertising profiles, and we do not sell personal data.
      </p>

      <h2 id="authentication">7. Authentication and session management</h2>
      <ul>
        <li><strong>Credentials.</strong> Passwords are stored using salted one-way hashing; we do not store plaintext passwords.</li>
        <li><strong>Web sessions.</strong> Maintained using HttpOnly cookies keyed to the user’s role and used to enforce role-based access; authorisation decisions are derived from signed session claims.</li>
        <li><strong>Transport security.</strong> All traffic is encrypted in transit over HTTPS/TLS.</li>
        <li><strong>Mobile sessions.</strong> Authentication tokens are stored on the device using the operating system’s secure storage (Keychain on iOS, Keystore-backed storage on Android).</li>
        <li><strong>Session handling.</strong> Sessions expire after inactivity or on sign-out; transient server-side session/cache state may be held in Redis.</li>
      </ul>

      <h2 id="mobile">8. Mobile application — permissions and notifications</h2>
      <p>The ArkenEdu mobile application (app identifier <code>com.arkenedu.mobile</code>) requests only the device capabilities it needs:</p>
      <ul>
        <li><strong>Notifications permission</strong> — to deliver push notifications about school activity. You may decline or disable it in device settings; the rest of the app keeps working.</li>
        <li><strong>Network/Internet access</strong> — to communicate securely with our servers.</li>
        <li><strong>Secure device storage</strong> — to store your authentication session securely (no user-facing prompt).</li>
      </ul>
      <p>
        The current mobile application does not request camera, photo-library, microphone, contacts,
        location, or general file-storage permissions. Where a flow requires uploading a file (for
        example proof of a fee payment), it directs you to the secure web portal, where the upload
        takes place.
      </p>
      <h3>8.1 Push notifications</h3>
      <p>
        Push notifications are delivered through the Expo push-notification service, which uses Apple
        Push Notification service (iOS) and Firebase Cloud Messaging (Android). To register your
        device we process a push token and basic device information (such as device model and OS
        version). We use this only to deliver Platform notifications, never for advertising. You can
        turn notifications off at any time in your device settings.
      </p>

      <h2 id="analytics">9. Analytics, logs, and diagnostics</h2>
      <ul>
        <li><strong>In-product analytics.</strong> Features such as “mastery analytics” and academic reports are computed from the School’s own academic data — Platform functionality, not third-party tracking.</li>
        <li><strong>Operational logs.</strong> Server access and application logs (IP address, timestamps, request metadata, error information) to operate, secure, debug, and audit the Platform.</li>
        <li><strong>Error and crash diagnostics.</strong> We use Sentry to capture application errors; our configuration is oriented to error reporting (performance tracing disabled or sampled at zero by default).</li>
        <li><strong>No advertising analytics.</strong> We integrate no advertising, attribution, or behavioural-analytics SDKs and build no advertising profiles of any user, including children.</li>
      </ul>

      <h2 id="security">10. How we protect data (security measures)</h2>
      <ul>
        <li><strong>Encryption in transit</strong> (HTTPS/TLS) and encryption at rest for stored data and backups.</li>
        <li><strong>Role-based access control</strong> for users and least-privilege administrative access for ArkenEdu personnel.</li>
        <li><strong>Secure credential handling</strong> (salted password hashing, secure session/token management).</li>
        <li><strong>Time-limited, signed access</strong> to stored files — documents and media are served via short-lived pre-signed URLs (default expiry within one hour) and are not publicly listable.</li>
        <li><strong>Network and platform hardening</strong>, logging, monitoring, and error tracking.</li>
        <li><strong>Backups</strong> for recovery and continuity, and <strong>vendor controls</strong> over sub-processors.</li>
      </ul>
      <p>
        No method of transmission or storage is perfectly secure; we cannot guarantee absolute
        security. Schools and users share responsibility — for example by safeguarding credentials,
        managing roles responsibly, and promptly reporting suspected compromise.
      </p>

      <h2 id="sub-processors">11. Third-party service providers (sub-processors)</h2>
      <p>
        These vendors process data only to provide their service to us, under contractual
        confidentiality, security, and data-protection terms, and are not permitted to use the data
        for their own purposes:
      </p>
      <ul>
        <li><strong>Amazon Web Services (AWS)</strong> — cloud hosting/compute (EC2) and object storage (S3) for uploaded documents, media, announcement attachments, teacher file libraries, and proof-of-payment files.</li>
        <li><strong>Cloudinary</strong> (legacy) — historically used for media hosting; some older records may still reference Cloudinary URLs. New uploads are stored on AWS S3.</li>
        <li><strong>OpenAI</strong> and <strong>Google (Generative AI / Gemini)</strong> — used by the optional Question Bank and Lesson Plan generation features. Teacher-submitted academic content is sent to the provider to generate questions or lesson plans, under API terms configured so submitted content is not used to train the provider’s general models. These tools are intended for academic content, not student personal data.</li>
        <li><strong>Expo</strong> (push delivery via Apple Push Notification service and Firebase Cloud Messaging).</li>
        <li><strong>Twilio</strong> — outbound voice communications (for example automated calls to parents); the recipient’s phone number and message content are processed to place the call.</li>
        <li><strong>Sentry</strong> — application error and diagnostics tracking.</li>
      </ul>
      <p>
        A current, itemised sub-processor list is maintained for Schools under the DPA, and we inform
        Schools of intended changes so they may object. We may also disclose data where required by
        law or valid legal process, to enforce our agreements, to protect rights and safety, or in a
        corporate reorganisation, merger, or acquisition (subject to the protections of this Policy
        and the DPA).
      </p>

      <h2 id="hosting">12. Hosting and data location</h2>
      <p>
        The Platform is hosted on Amazon Web Services (AWS). Production data for Indian Schools is
        hosted in AWS regions located in India. Where any processing or sub-processor operates outside
        India (for example certain AI or communications providers), transfers are made under
        appropriate contractual safeguards and only to the extent necessary to provide the relevant
        feature, consistent with applicable Indian law.
      </p>

      <h2 id="retention">13. Data retention</h2>
      <ul>
        <li><strong>While active.</strong> We retain School data while the School maintains an active relationship and as needed to provide the Platform. Academic records are stamped to an academic year and designed to be retained across years (including arrears carry-over and student promotion).</li>
        <li><strong>On instruction.</strong> Schools control retention and may instruct us to correct, export, or delete records, subject to the DPA and law.</li>
        <li><strong>After termination.</strong> We retain School data for a limited wind-down period to allow export, then delete or irreversibly anonymise it per the DPA, except where retention is required by law.</li>
        <li><strong>Operational data we control.</strong> Logs, diagnostics, and backups are retained for limited, defined periods and then deleted or overwritten.</li>
      </ul>

      <h2 id="your-rights">14. Your rights</h2>
      <p>
        Subject to applicable law (including the DPDP Act and SPDI Rules) and the School’s role as
        Data Fiduciary, individuals may have the right to: access their personal data and information
        about its processing; correct, complete, or update it; erase it where there is no longer a
        lawful basis to retain it; withdraw consent where processing is based on consent; nominate
        another individual to exercise their rights in the event of death or incapacity; and obtain
        grievance redressal, including escalation to the <strong>Data Protection Board of India</strong>{' '}
        where applicable.
      </p>
      <p>
        <strong>How to exercise these rights.</strong> Because the School is the Data Fiduciary for
        almost all Platform data, most requests should be made to your School, which controls the
        records. If you contact ArkenEdu directly about School data, we will refer or assist the
        School as a processor. For data where ArkenEdu is the Data Fiduciary, contact us directly
        (section 18). We may need to verify your identity and may decline or limit requests where
        permitted by law.
      </p>

      <h2 id="deleting-your-account-and-data">15. Deleting your account and data</h2>
      <p>
        Because accounts are provisioned by Schools, account deletion is normally handled by your
        School, which can deactivate or remove accounts and records directly. To request deletion of
        your account and associated personal data, you may (1) ask your School administrator, or (2)
        contact ArkenEdu at <a href="mailto:privacy@arkenedu.com">privacy@arkenedu.com</a> with the
        subject “Account Deletion Request”. We will verify the request, coordinate with the relevant
        School where we act as processor, and action the deletion in accordance with sections 13 and
        14. See our <a href="/account-deletion">Account Deletion</a> page for the full procedure.
        Certain data may be retained after deletion where required by law, to resolve disputes, to
        enforce agreements, or in routine backups that are cycled out on a defined schedule.
      </p>

      <h2 id="cookies">16. Cookies and similar technologies</h2>
      <p>The web application uses cookies and similar technologies that are strictly necessary to provide the service:</p>
      <ul>
        <li><strong>Authentication/session cookies</strong> — HttpOnly, role-keyed cookies used to keep you signed in and enforce RBAC.</li>
        <li><strong>Security cookies</strong> — to protect against unauthorised use and request forgery.</li>
        <li><strong>Preference storage</strong> — to remember basic interface settings.</li>
      </ul>
      <p>
        We do not use advertising or third-party tracking cookies. Because our cookies are strictly
        necessary, disabling them will prevent you from signing in and using the service.
      </p>

      <h2 id="grievance">17. Grievance redressal</h2>
      <p>
        In accordance with the SPDI Rules and the DPDP Act, ArkenEdu maintains a grievance-redressal
        channel. If you have a concern or complaint about how your personal data is handled by
        ArkenEdu, contact our Grievance Officer / Data Protection point of contact at{' '}
        <a href="mailto:grievance@arkenedu.com">grievance@arkenedu.com</a> (data protection queries:{' '}
        <a href="mailto:dpo@arkenedu.com">dpo@arkenedu.com</a>). We will acknowledge grievances
        promptly and aim to resolve them within the timeframes required by law, coordinating with your
        School where it is the Data Fiduciary. You may also escalate unresolved matters to the Data
        Protection Board of India.
      </p>

      <h2 id="contact">18. How to contact us</h2>
      <ul>
        <li>Privacy and data requests: <a href="mailto:privacy@arkenedu.com">privacy@arkenedu.com</a></li>
        <li>Grievance Officer: <a href="mailto:grievance@arkenedu.com">grievance@arkenedu.com</a></li>
        <li>Data protection point of contact: <a href="mailto:dpo@arkenedu.com">dpo@arkenedu.com</a></li>
        <li>General support: <a href="mailto:support@arkenedu.com">support@arkenedu.com</a></li>
        <li>Website: <a href="https://arkenedu.com">arkenedu.com</a></li>
      </ul>

      <h2 id="changes">19. Changes to this Policy</h2>
      <p>
        We may update this Policy to reflect changes in the Platform, our practices, or the law. When
        we make material changes we will update the “Last updated” date above and, where appropriate,
        notify Schools through the Platform or by email. Continued use after an update constitutes
        acknowledgement of the revised Policy, to the extent permitted by law.
      </p>

      <hr />
      <p>
        This Privacy Policy works in conjunction with the{' '}
        <a href="/terms-of-service">Terms of Service</a> and the{' '}
        <a href="/data-processing-agreement">Data Processing Agreement</a>. In the event of a conflict
        between this Policy and a signed DPA with a School regarding that School’s data, the DPA
        governs.
      </p>
    </LegalPage>
  );
}
