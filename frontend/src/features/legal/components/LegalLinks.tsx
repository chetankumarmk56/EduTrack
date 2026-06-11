import { Link } from 'react-router-dom';

/**
 * Website footer compliance links. Reused by the public legal pages and by the
 * Landing page footer so every page exposes Privacy / Terms / DPA / Account
 * Deletion (required for app-store review and enterprise procurement).
 */
const LEGAL_LINKS = [
  { to: '/privacy-policy', label: 'Privacy Policy' },
  { to: '/terms-of-service', label: 'Terms of Service' },
  { to: '/data-processing-agreement', label: 'Data Processing Agreement' },
  { to: '/account-deletion', label: 'Account Deletion' },
] as const;

interface LegalLinksProps {
  className?: string;
  linkClassName?: string;
}

export default function LegalLinks({
  className = 'flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500',
  linkClassName = 'transition-colors hover:text-slate-900',
}: LegalLinksProps) {
  return (
    <nav aria-label="Legal and compliance" className={className}>
      {LEGAL_LINKS.map((link) => (
        <Link key={link.to} to={link.to} className={linkClassName}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
