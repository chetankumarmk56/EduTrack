import LegalPage from '../components/LegalPage';

export default function TermsOfService() {
  return (
    <LegalPage
      seoTitle="Terms of Service | ArkenEdu School ERP"
      seoDescription="The terms governing use of ArkenEdu's school management platform — accounts, acceptable use, data ownership, liability, and governing law (India)."
      canonicalPath="/terms-of-service"
      h1="Terms of Service"
      effectiveDate="10 June 2026"
      lastUpdated="10 June 2026"
      intro={
        <>
          <p className="lead">
            These Terms of Service (“Terms”) govern access to and use of the ArkenEdu
            school-management platform — the web application at{' '}
            <a href="https://arkenedu.com">arkenedu.com</a>, the ArkenEdu mobile application, and all
            related services and interfaces (the “Platform” or “Service”), provided by ArkenEdu.
          </p>
          <p>
            <strong>Please read these Terms carefully.</strong> By subscribing to, accessing, or using
            the Service, you agree to be bound by them. If you are entering into these Terms on behalf
            of a school or institution, you represent that you are authorised to bind that institution,
            and “you” and “Customer” refer to that institution.
          </p>
        </>
      }
    >
      <h2 id="definitions">1. Definitions</h2>
      <ul>
        <li><strong>“School” / “Customer”</strong> — the educational institution that subscribes to the Service.</li>
        <li><strong>“Authorised User”</strong> — an individual the School permits to access the Service, including school owners, principals, administrators, teachers, staff, students, and parents/guardians.</li>
        <li><strong>“School Data”</strong> — all data, content, records, and files the School or its Authorised Users submit to, upload to, or generate within the Service.</li>
        <li><strong>“Subscription”</strong> — the School’s paid or agreed right to access the Service for a defined term and scope.</li>
        <li><strong>“Documentation”</strong> — the user guides, help materials, and policies for the Service, including the <a href="/privacy-policy">Privacy Policy</a> and <a href="/data-processing-agreement">DPA</a>.</li>
        <li><strong>“Order”</strong> — the ordering document, plan selection, or written arrangement setting out term, scope, fees, and commercial terms.</li>
      </ul>

      <h2 id="service">2. The Service and the parties’ relationship</h2>
      <p>
        <strong>2.1 What the Service is.</strong> ArkenEdu is a Software-as-a-Service (SaaS) school
        ERP that the School uses to administer its operations — admissions, student management,
        attendance, examinations and report cards, academic records, timetable, homework and
        assignments, communication and announcements, parent and teacher portals, finance and fee
        management, document storage, analytics and reporting, and a companion mobile application with
        push notifications.
      </p>
      <p><strong>2.2 A tool, not the record-keeper of last resort.</strong> The Service helps Schools maintain their own records. The School remains responsible for the accuracy, legality, and completeness of School Data and for its own compliance with applicable laws.</p>
      <p><strong>2.3 Data roles.</strong> The School is the Data Fiduciary / Controller and ArkenEdu is the Data Processor, as set out in the <a href="/privacy-policy">Privacy Policy</a> and the DPA, which forms part of these Terms.</p>
      <p><strong>2.4 Order of precedence.</strong> If there is a conflict: a signed agreement or Order; then the DPA (for data-processing matters); then these Terms; then the Documentation.</p>

      <h2 id="accounts">3. Accounts, account ownership, and access</h2>
      <p><strong>3.1 Account ownership.</strong> The School owns and controls its account. Administrators provision Authorised Users, assign roles, and manage access through RBAC. The School is responsible for all activity under its account and its Authorised Users’ credentials.</p>
      <p><strong>3.2 Provisioning of users.</strong> Accounts are created by the School, not by public self-service sign-up. The School ensures each Authorised User is entitled to the access granted and promptly removes access when it is no longer appropriate.</p>
      <p><strong>3.3 Shared parent/student login.</strong> For some Schools, parents access the Service using the student’s login. The School is responsible for configuring and communicating this arrangement and any consent it requires.</p>
      <p><strong>3.4 Credential security.</strong> You must keep credentials confidential, use the Service only through your own account, and notify us promptly at <a href="mailto:support@arkenedu.com">support@arkenedu.com</a> of suspected unauthorised access.</p>
      <p><strong>3.5 Eligibility and minors.</strong> Where students are minors, the School is responsible for obtaining any consent required by law (including verifiable parental consent under the DPDP Act) before student data is entered or a student is given access.</p>

      <h2 id="acceptable-use">4. Acceptable use</h2>
      <p>You and your Authorised Users may use the Service only (a) for the School’s legitimate educational and administrative purposes; (b) in accordance with these Terms, the Documentation, and applicable law; and (c) within the scope of the Subscription. You are responsible for your Authorised Users’ compliance.</p>

      <h2 id="prohibited">5. Prohibited activities</h2>
      <p>You and your Authorised Users must not:</p>
      <ul>
        <li>access or use the Service without authorisation, or attempt to circumvent role-based access controls, authentication, rate limits, or other security or usage controls;</li>
        <li>upload, store, or transmit content that is unlawful, infringing, defamatory, obscene, harmful to minors, or that you do not have the right to provide;</li>
        <li>upload malware or material designed to disrupt, damage, or gain unauthorised access to the Service or any data;</li>
        <li>use the Service to send unlawful, harassing, or unsolicited communications, or to impersonate any person or misrepresent an affiliation;</li>
        <li>probe, scan, or test the vulnerability of the Service, or breach or circumvent security or authentication measures, except under a security-testing arrangement expressly authorised by ArkenEdu in writing;</li>
        <li>reverse engineer, decompile, or disassemble the Service, except to the extent this restriction is prohibited by law;</li>
        <li>copy, resell, sublicense, rent, lease, or provide the Service to third parties outside the School, or use it to build or benchmark a competing product;</li>
        <li>use automated means to access the Service or extract data in a manner that imposes an unreasonable load or interferes with the Service, except through interfaces we expressly provide;</li>
        <li>submit personal data of children, students, or others to the Service’s AI-assisted tools where the Documentation indicates those tools are intended for academic content only; or</li>
        <li>use the Service in violation of any applicable law or in any manner not authorised by these Terms.</li>
      </ul>

      <h2 id="ip">6. Intellectual property</h2>
      <p><strong>6.1 ArkenEdu’s IP.</strong> As between the parties, ArkenEdu and its licensors own all rights in the Service — software, design, interfaces, features, documentation, trademarks, and all related intellectual property and improvements. Except for the limited right to use the Service under these Terms, no rights are granted to you.</p>
      <p><strong>6.2 Licence to the School.</strong> ArkenEdu grants the School a non-exclusive, non-transferable, non-sublicensable right to access and use the Service during the Subscription term, solely for the School’s internal operations.</p>
      <p><strong>6.3 Feedback.</strong> If you give us suggestions or feedback, you grant ArkenEdu a perpetual, royalty-free licence to use it to improve the Service.</p>

      <h2 id="data-ownership">7. School Data and data ownership</h2>
      <p><strong>7.1 The School owns its data.</strong> As between the parties, the School owns all School Data. ArkenEdu claims no ownership.</p>
      <p><strong>7.2 Licence to operate.</strong> The School grants ArkenEdu a limited, non-exclusive licence to host, store, process, transmit, back up, and display School Data solely to provide, secure, support, and maintain the Service, in accordance with these Terms, the Privacy Policy, and the DPA.</p>
      <p><strong>7.3 Processing on instructions.</strong> ArkenEdu processes personal data within School Data as a Data Processor on the School’s documented instructions, per the DPA.</p>
      <p><strong>7.4 Responsibility for content.</strong> The School is responsible for the accuracy, quality, legality, and appropriateness of School Data, for having the necessary rights and consents, and for its Authorised Users’ use of the Service.</p>
      <p><strong>7.5 Aggregated/anonymised data.</strong> ArkenEdu may generate aggregated, de-identified statistics that do not identify any individual or School and may use them to operate, secure, and improve the Service. ArkenEdu will not sell School Data and will not publish data identifying a School without its consent.</p>
      <p><strong>7.6 Export and deletion.</strong> Export and deletion rights are set out in section 13 and the DPA.</p>

      <h2 id="subscription">8. Subscription, fees, and the service relationship</h2>
      <p><strong>8.1</strong> Access is provided on a subscription basis for the term and scope in the applicable Order, for the School’s internal use only unless otherwise agreed.</p>
      <p><strong>8.2 Fees and taxes.</strong> The School agrees to pay the fees in the Order. Unless stated otherwise, fees are exclusive of applicable taxes (including GST) and are non-refundable except as expressly stated or required by law.</p>
      <p><strong>8.3 Changes to fees.</strong> We may revise fees for a renewal term on reasonable advance notice before renewal.</p>
      <p><strong>8.4 Non-payment.</strong> If undisputed fees are overdue, we may suspend the Service after reasonable notice (section 12).</p>
      <p><strong>8.5</strong> Purchases are based on the Service as currently available, not on future features or statements.</p>

      <h2 id="updates">9. Software updates and feature changes</h2>
      <p>ArkenEdu continuously develops the Service and may add, modify, or remove features and deploy updates, while aiming to avoid materially reducing the core functionality a School relies on during a term. The mobile application may require updates to remain compatible and secure. Some features rely on third-party services and may change if those third parties change their offerings.</p>

      <h2 id="support">10. Support and maintenance</h2>
      <p>We provide support through <a href="mailto:support@arkenedu.com">support@arkenedu.com</a> and the channels described in the Documentation, during normal support hours and per any Order. We may perform scheduled and emergency maintenance, using reasonable efforts to minimise disruption and, where practical, to notify Schools of significant planned downtime. No guaranteed response or resolution times apply except where expressly set out in an Order or separate SLA.</p>

      <h2 id="availability">11. Service availability disclaimer</h2>
      <p>We aim to keep the Service available and reliable but do not warrant that it will be uninterrupted, error-free, or available at any particular time or location. The Service may be unavailable due to maintenance, updates, factors outside our reasonable control, or force majeure (including failures of internet, telecommunications, hosting, or third-party providers; power outages; natural events; and governmental actions). Certain features depend on third-party services (AWS hosting and storage, Expo/APNs/FCM push delivery, Twilio voice, and AI providers); interruptions to those services may affect the corresponding features.</p>

      <h2 id="suspension">12. Suspension</h2>
      <p>We may suspend all or part of the Service, or an Authorised User’s access, where (a) we reasonably believe the Service is being used in violation of these Terms; (b) suspension is needed to protect the security, integrity, or availability of the Service or other customers’ data; (c) required by law or a lawful order; or (d) undisputed fees remain overdue after notice. Where practical and lawful, we will give notice and an opportunity to remedy before suspending, limit the scope and duration to what is reasonably necessary, and restore access promptly once the cause is resolved.</p>

      <h2 id="termination">13. Term, termination, and effect of termination</h2>
      <p><strong>13.1 Term.</strong> These Terms apply while the School has an active Subscription or otherwise accesses the Service, and survive termination to the extent relevant.</p>
      <p><strong>13.2 Termination for convenience.</strong> Either party may choose not to renew at the end of a term per the Order. Termination during a paid term is governed by the Order.</p>
      <p><strong>13.3 Termination for cause.</strong> Either party may terminate for material breach uncured 30 days after written notice. We may terminate or suspend immediately for serious breaches affecting security, legality, or the rights of others.</p>
      <p><strong>13.4 Data export on exit.</strong> For 30 days after termination (unless a longer period is agreed), the School may request export of School Data in a commonly used, machine-readable format, as described in the DPA.</p>
      <p><strong>13.5 Deletion after exit.</strong> After the export window, ArkenEdu will delete or irreversibly anonymise School Data per the DPA, except where retention is required by law; routine backups are cycled out on a defined schedule.</p>
      <p><strong>13.6 Effect.</strong> On termination, access rights end. Provisions that by their nature survive — intellectual property, data ownership, confidentiality, disclaimers, limitations of liability, and governing law — survive termination.</p>

      <h2 id="warranty">14. Warranty disclaimer</h2>
      <p>The Service and all related materials are provided “as is” and “as available”, without warranties of any kind, whether express, implied, or statutory, to the maximum extent permitted by law. ArkenEdu disclaims all implied warranties, including merchantability, fitness for a particular purpose, title, and non-infringement, and does not warrant that the Service will meet every requirement, that defects will be corrected, or that AI-assisted outputs will be accurate, complete, or suitable for any particular use. <strong>AI-assisted features are aids to educators and must be reviewed by a qualified person before use.</strong> The School is responsible for verifying records, results, report cards, and financial figures before relying on them.</p>

      <h2 id="liability">15. Limitation of liability</h2>
      <p><strong>15.1</strong> To the maximum extent permitted by law, neither party will be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of profits, revenue, goodwill, or anticipated savings, even if advised of the possibility.</p>
      <p><strong>15.2</strong> To the maximum extent permitted by law, ArkenEdu’s total aggregate liability arising out of or relating to the Service and these Terms will not exceed the total fees paid by the School to ArkenEdu in the twelve (12) months immediately preceding the event giving rise to the claim.</p>
      <p><strong>15.3</strong> These limitations do not apply to liability that cannot be limited or excluded under applicable law. Where the DPA sets out separate provisions governing liability for data-protection matters, those provisions apply to such matters.</p>
      <p><strong>15.4</strong> The School is responsible for maintaining its own independent records as appropriate and for backing up data it cannot afford to lose, in addition to the backups ArkenEdu maintains.</p>

      <h2 id="indemnity">16. Indemnity</h2>
      <p><strong>16.1</strong> The School will defend and indemnify ArkenEdu against third-party claims arising from (a) School Data, including any claim that School Data infringes rights or violates law or that required consents were not obtained; or (b) use of the Service by the School or its Authorised Users in breach of these Terms or applicable law.</p>
      <p><strong>16.2</strong> ArkenEdu will defend the School against third-party claims that the Service, as provided by ArkenEdu and used per these Terms, infringes that third party’s intellectual-property rights, and will indemnify amounts finally awarded, subject to section 15. This does not apply to claims arising from School Data, from modifications not made by ArkenEdu, or from use outside these Terms.</p>
      <p><strong>16.3</strong> The indemnified party must promptly notify the indemnifying party, allow it to control the defence, and provide reasonable cooperation.</p>

      <h2 id="confidentiality">17. Confidentiality</h2>
      <p>Each party will use the other’s confidential information only to perform under these Terms, protect it with at least reasonable care, and not disclose it except to personnel and contractors who need it and are bound by confidentiality obligations. Confidential information excludes information that is or becomes public without breach, was lawfully known before disclosure, or is independently developed. Disclosure required by law is permitted with, where lawful, reasonable advance notice.</p>

      <h2 id="third-party">18. Third-party services</h2>
      <p>The Service integrates third-party services to deliver certain features (AWS hosting and storage, push delivery via Expo/APNs/FCM, voice via Twilio, and AI generation via OpenAI and Google). Use of those features may be subject to the third parties’ own terms. ArkenEdu is not responsible for the acts, omissions, availability, or content of third-party services beyond its contractual arrangements with those providers as sub-processors under the DPA.</p>

      <h2 id="governing-law">19. Governing law and dispute resolution</h2>
      <p><strong>19.1 Governing law.</strong> These Terms are governed by the laws of India, without regard to conflict-of-laws principles.</p>
      <p><strong>19.2 Jurisdiction.</strong> Subject to 19.3, the courts of competent jurisdiction at ArkenEdu’s principal place of business in India have exclusive jurisdiction over disputes arising out of or relating to these Terms.</p>
      <p><strong>19.3 Good-faith resolution and arbitration.</strong> The parties will first attempt to resolve any dispute amicably through good-faith discussions between senior representatives. If unresolved within 30 days, it will be referred to and finally resolved by arbitration under the Arbitration and Conciliation Act, 1996, by a sole arbitrator appointed by mutual agreement. The seat and venue will be at ArkenEdu’s principal place of business in India, the language English, and the award final and binding. Nothing here prevents either party from seeking urgent interim relief from a competent court.</p>

      <h2 id="changes">20. Changes to these Terms</h2>
      <p>We may update these Terms from time to time. When we make material changes, we will update the “Last updated” date and, where appropriate, notify Schools through the Service or by email. Changes take effect on the date stated, and continued use after that date constitutes acceptance, to the extent permitted by law.</p>

      <h2 id="general">21. General</h2>
      <p><strong>21.1 Entire agreement.</strong> These Terms, with the Privacy Policy, the DPA, and any Order, constitute the entire agreement regarding the Service and supersede prior agreements on that subject.</p>
      <p><strong>21.2 Assignment.</strong> The School may not assign these Terms without ArkenEdu’s prior written consent. ArkenEdu may assign in connection with a merger, acquisition, or sale of assets, subject to the protections of the Privacy Policy and DPA.</p>
      <p><strong>21.3 Severability.</strong> If any provision is unenforceable, the remainder remains in effect and the provision is modified to the minimum extent necessary to make it enforceable.</p>
      <p><strong>21.4 Waiver.</strong> Failure to enforce a provision is not a waiver of the right to enforce it later.</p>
      <p><strong>21.5 Notices.</strong> Legal notices to ArkenEdu may be sent to <a href="mailto:legal@arkenedu.com">legal@arkenedu.com</a>; notices to the School to the contact associated with its account.</p>
      <p><strong>21.6 Relationship.</strong> The parties are independent contractors; nothing here creates a partnership, agency, or employment relationship.</p>

      <h2 id="contact">22. Contact</h2>
      <ul>
        <li>Support: <a href="mailto:support@arkenedu.com">support@arkenedu.com</a></li>
        <li>Legal: <a href="mailto:legal@arkenedu.com">legal@arkenedu.com</a></li>
        <li>Privacy: <a href="mailto:privacy@arkenedu.com">privacy@arkenedu.com</a></li>
        <li>Website: <a href="https://arkenedu.com">arkenedu.com</a></li>
      </ul>

      <hr />
      <p>By using ArkenEdu, you acknowledge that you have read and agree to these Terms of Service, the <a href="/privacy-policy">Privacy Policy</a>, and, where applicable, the <a href="/data-processing-agreement">Data Processing Agreement</a>.</p>
    </LegalPage>
  );
}
