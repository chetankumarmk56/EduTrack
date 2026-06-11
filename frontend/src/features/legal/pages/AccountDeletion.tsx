import LegalPage from '../components/LegalPage';

// Support contact is environment-configurable so a deployment can route deletion
// requests to the right inbox without a code change; falls back to the public address.
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@arkenedu.com';

export default function AccountDeletion() {
  return (
    <LegalPage
      seoTitle="ArkenEdu Account and Data Deletion"
      seoDescription="Learn how to request deletion of your ArkenEdu account and personal data."
      canonicalPath="/account-deletion"
      h1="Account and Data Deletion Request"
      lastUpdated="11 June 2026"
      intro={
        <p className="lead">
          This page explains how to request deletion of an ArkenEdu account and the personal data
          associated with it — who can request it, what is deleted, what may need to be retained, and
          how long it takes. It applies to both the ArkenEdu web application and the ArkenEdu mobile
          app (<code>com.arkenedu.mobile</code>).
        </p>
      }
    >
      <h2 id="how-accounts-work">1. How accounts work on ArkenEdu</h2>
      <p>
        ArkenEdu is a school ERP (Enterprise Resource Planning) and school-management platform used by
        schools and educational institutions. <strong>Accounts on ArkenEdu are created and managed by
        each School</strong>, which owns and controls the records held on the Platform (the School is
        the Data Fiduciary / Data Controller; ArkenEdu acts as its Data Processor).
      </p>
      <p>
        There is <strong>no public self-registration</strong>. Teachers, parents, students, and staff
        cannot create their own accounts. Instead, an <strong>authorised School Administrator</strong>{' '}
        provisions each account, assigns its role, and manages it for its whole lifecycle. Because the
        School controls these accounts and the records attached to them, requests to delete an account
        or personal data are actioned by the School, or by ArkenEdu acting on the School’s written
        instruction as its Data Processor.
      </p>

      <h2 id="how-to-request">2. How to request account and data deletion</h2>
      <p>
        <strong>Step 1 — Contact your School Administrator first.</strong> If you are a teacher,
        parent, student, or member of staff and you want your account or personal data deleted, please
        contact your School’s Administrator (for example the school office, the principal, or the staff
        member who set up your account). Your School Administrator manages your account directly in the
        Platform and can deactivate it, revoke access, or remove records in line with the School’s
        records-retention obligations.
      </p>
      <p>
        <strong>Step 2 — School Administrators may submit a request to ArkenEdu support.</strong> A
        School Administrator may submit a deletion request to ArkenEdu support on behalf of their
        institution — for example to delete an account or erase associated personal data held on the
        Platform. Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with the subject{' '}
        <strong>“Account and Data Deletion Request”</strong> and include the School’s name, the name
        and role of the account holder (parent/student, teacher, or staff), and the specific accounts
        or data to be deleted. Please do not include passwords.
      </p>
      <p>
        If you cannot reach your School — for example because you have left the institution — you may
        write to us directly at <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. As we act as
        the School’s Data Processor for these records, we will verify your request and coordinate with
        the relevant School to action it. We may need to verify your identity before acting on a
        request, to protect against unauthorised deletion.
      </p>

      <h2 id="what-is-deleted">3. What data may be deleted</h2>
      <p>
        On completion of a verified request, ArkenEdu and/or the School delete or irreversibly
        anonymise the personal data associated with the account, which may include:
      </p>
      <ul>
        <li>profile and contact details (such as name, photograph, phone number, email, and address);</li>
        <li>account credentials and authentication/session data;</li>
        <li>the mobile push-notification token and device registration;</li>
        <li>communication and notification preferences and delivery records; and</li>
        <li>records held against the account where the School instructs their deletion (subject to section 4).</li>
      </ul>
      <p>
        Because Schools use ArkenEdu to maintain official educational and financial records, some
        records are owned by the <strong>School</strong> (for example a student’s academic history,
        examination results, or fee and payment records). The deletion of those records is decided by
        the School as their controller, in line with its retention obligations and applicable law;
        ArkenEdu actions what the School instructs.
      </p>

      <h2 id="what-is-retained">4. What may need to be retained</h2>
      <p>
        Some data may need to be retained even after an account is closed, where there is a lawful or
        legitimate reason to keep it. This may include data retained for:
      </p>
      <ul>
        <li><strong>Legal and regulatory</strong> obligations that require certain records to be kept for a defined period;</li>
        <li><strong>Academic and school records</strong> the School is required or entitled to maintain (such as enrolment history, results, and transcripts);</li>
        <li><strong>Financial and accounting</strong> records (such as invoices, fee receipts, and payment references) needed for tax, audit, or statutory purposes;</li>
        <li><strong>Auditing, compliance, security, and dispute-resolution</strong> needs, including limited records to prevent abuse or enforce agreements; and</li>
        <li><strong>Backups</strong> — residual copies may persist in routine encrypted backups for a limited period until those backups are cycled out on their normal schedule, after which the data is no longer recoverable from backups.</li>
      </ul>
      <p>
        Retained data is kept only for as long as the relevant purpose or legal requirement applies,
        and is then deleted or irreversibly anonymised.
      </p>

      <h3 id="access-revocation">4.1 Account access can be revoked even when records are retained</h3>
      <p>
        Where certain records must be retained for the reasons above, your <strong>account access can
        still be revoked</strong>. The School Administrator — or ArkenEdu on the School’s instruction —
        can deactivate the account, disable sign-in, and remove the user’s ability to access the
        Platform, while any underlying school record is kept only for as long as required and is no
        longer accessible to the user. Removing account access and erasing personal data are handled
        separately, so access can be revoked promptly even where a record must lawfully remain.
      </p>

      <h2 id="timeline">5. Processing timelines</h2>
      <ul>
        <li><strong>Acknowledgement:</strong> we acknowledge deletion requests sent to ArkenEdu support promptly, typically within 5 business days.</li>
        <li><strong>Access revocation:</strong> where requested, a School Administrator can deactivate an account and revoke access immediately.</li>
        <li><strong>Completion:</strong> we aim to complete verified deletions within <strong>30 days</strong>, subject to identity verification and coordination with the relevant School.</li>
        <li><strong>Backups:</strong> residual copies in routine backups are removed as those backups are cycled out, after which the data is no longer recoverable.</li>
      </ul>
      <p>On request, we will confirm completion of a deletion, except where retention is required by law.</p>

      <h2 id="contact">6. Contact</h2>
      <p>
        To request account or data deletion, or to ask a question about this process, contact ArkenEdu
        support. School Administrators should use the support address to submit requests on behalf of
        their institution.
      </p>
      <ul>
        <li><strong>Support email:</strong> <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></li>
        <li>Privacy and data-protection requests: <a href="mailto:privacy@arkenedu.com">privacy@arkenedu.com</a></li>
        <li>Grievance Officer: <a href="mailto:grievance@arkenedu.com">grievance@arkenedu.com</a></li>
      </ul>

      <hr />
      <p>
        For full details of how we handle personal data, see our{' '}
        <a href="/privacy-policy">Privacy Policy</a> (section 15, “Deleting your account and data”) and
        the <a href="/data-processing-agreement">Data Processing Agreement</a> (sections 12 and 14).
      </p>
    </LegalPage>
  );
}
