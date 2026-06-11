import LegalPage from '../components/LegalPage';

export default function AccountDeletion() {
  return (
    <LegalPage
      seoTitle="Account & Data Deletion | ArkenEdu"
      seoDescription="How to request deletion of your ArkenEdu account and associated data, what is deleted, what may be retained, and how long it takes."
      canonicalPath="/account-deletion"
      h1="Account & Data Deletion"
      lastUpdated="10 June 2026"
      intro={
        <p className="lead">
          This page explains how to request deletion of your ArkenEdu account and the personal data
          associated with it, what is deleted, what may be retained, and how long it takes. It applies
          to both the ArkenEdu web application and the ArkenEdu mobile app
          (<code>com.arkenedu.mobile</code>).
        </p>
      }
    >
      <h2 id="who-can-delete">1. How accounts work on ArkenEdu</h2>
      <p>
        ArkenEdu is a school-management platform. Accounts are <strong>provisioned and controlled by
        your School</strong> (the Data Fiduciary), not created by public self-service sign-up. Your
        School can deactivate or remove accounts and records directly in the Platform. Deletion
        requests are therefore actioned by your School, or by ArkenEdu acting on the School’s behalf
        as its Data Processor.
      </p>

      <h2 id="how-to-request">2. How to request deletion</h2>
      <p>You can request deletion of your account and associated personal data in any of these ways:</p>
      <ul>
        <li>
          <strong>In the ArkenEdu app or web portal:</strong> open <em>Profile</em> and choose{' '}
          <em>Request account deletion</em>. Your School administrator reviews and approves the request
          (a Super Administrator reviews administrator requests); once approved, the account is
          deactivated and access is removed.
        </li>
        <li>
          <strong>Through your School:</strong> ask your School administrator to delete your account
          and records. The administrator can do this directly in the Platform.
        </li>
        <li>
          <strong>By email to ArkenEdu:</strong> write to{' '}
          <a href="mailto:privacy@arkenedu.com">privacy@arkenedu.com</a> with the subject{' '}
          <strong>“Account Deletion Request”</strong>. Include the name on the account, the School’s
          name, and the role (parent/student, teacher, or administrator) so we can verify and route
          the request. Do not include passwords.
        </li>
      </ul>
      <p>We may need to verify your identity before acting on a request to protect against unauthorised deletion.</p>

      <h2 id="what-is-deleted">3. What is deleted</h2>
      <p>
        On completion of a verified request, we delete or irreversibly anonymise the personal data
        associated with the account, including: your profile and contact details; your account
        credentials and authentication/session data; your push-notification token and device
        registration; and, where you are the data subject, the records held against your account
        (subject to section 4).
      </p>
      <p>
        Because ArkenEdu is used by Schools to maintain official educational and financial records,
        some records may be owned and retained by the <strong>School</strong> (for example a student’s
        academic history, examination results, or fee/payment records). Where the School is the Data
        Fiduciary for those records, their deletion is decided by the School in line with its own
        retention obligations and applicable law. We will coordinate with the School and action what
        the School instructs.
      </p>

      <h2 id="what-is-retained">4. What may be retained, and for how long</h2>
      <ul>
        <li>
          <strong>Legal/regulatory retention:</strong> data we are required to retain by applicable
          law (for example certain financial records) is kept only for as long as required, then
          deleted.
        </li>
        <li>
          <strong>Backups:</strong> residual copies may persist in routine encrypted backups for a
          limited period until those backups are cycled out on their normal schedule, after which the
          data is no longer recoverable from backups.
        </li>
        <li>
          <strong>Security/audit:</strong> limited records needed to resolve disputes, prevent abuse,
          or enforce agreements may be retained for a limited, defined period.
        </li>
      </ul>

      <h2 id="timeline">5. Timeline</h2>
      <p>
        We acknowledge deletion requests promptly and aim to complete verified deletions within
        <strong> 30 days</strong>, subject to identity verification and coordination with your School.
        Residual backup copies are removed as backups are cycled out, as described above. On request,
        we will confirm completion of deletion, except where retention is required by law.
      </p>

      <h2 id="contact">6. Contact</h2>
      <ul>
        <li>Account deletion &amp; privacy: <a href="mailto:privacy@arkenedu.com">privacy@arkenedu.com</a></li>
        <li>Grievance Officer: <a href="mailto:grievance@arkenedu.com">grievance@arkenedu.com</a></li>
        <li>Data protection point of contact: <a href="mailto:dpo@arkenedu.com">dpo@arkenedu.com</a></li>
      </ul>

      <hr />
      <p>
        For full details of how we handle your data, see our{' '}
        <a href="/privacy-policy">Privacy Policy</a> (section 15) and the{' '}
        <a href="/data-processing-agreement">Data Processing Agreement</a> (sections 12 and 14).
      </p>
    </LegalPage>
  );
}
