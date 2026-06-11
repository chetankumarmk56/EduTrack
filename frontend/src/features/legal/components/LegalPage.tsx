import { type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentSeo } from '@/shared/hooks/useDocumentSeo';
import LegalLinks from './LegalLinks';

interface LegalPageProps {
  seoTitle: string;
  seoDescription: string;
  canonicalPath: string;
  h1: string;
  effectiveDate?: string;
  lastUpdated: string;
  /** Optional intro/lede rendered above the main body. */
  intro?: ReactNode;
  children: ReactNode;
}

/**
 * Shared chrome for the public legal pages: SEO tags, a brand header that links
 * home, the document title + dates, the body (styled by `.legal-prose`), and a
 * footer carrying the compliance links.
 */
export default function LegalPage({
  seoTitle,
  seoDescription,
  canonicalPath,
  h1,
  effectiveDate,
  lastUpdated,
  intro,
  children,
}: LegalPageProps) {
  useDocumentSeo({ title: seoTitle, description: seoDescription, canonicalPath });

  return (
    <div className="min-h-screen bg-white text-slate-700">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3.5 sm:px-8">
          <Link to="/" className="text-base font-bold tracking-tight text-slate-900">
            ArkenEdu
          </Link>
          <Link to="/" className="text-sm font-medium text-emerald-700 hover:text-emerald-800">
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{h1}</h1>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
          {effectiveDate && (
            <span>
              <strong className="font-semibold text-slate-700">Effective:</strong> {effectiveDate}
            </span>
          )}
          <span>
            <strong className="font-semibold text-slate-700">Last updated:</strong> {lastUpdated}
          </span>
        </div>

        {intro && <div className="legal-prose mt-6">{intro}</div>}
        <article className="legal-prose mt-6">{children}</article>
      </main>

      <footer className="border-t border-slate-200/70 bg-slate-50">
        <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
          <LegalLinks />
          <p className="mt-4 text-sm text-slate-500">
            Questions about your data? Email{' '}
            <a href="mailto:privacy@arkenedu.com" className="text-emerald-700 hover:text-emerald-800">
              privacy@arkenedu.com
            </a>
            .
          </p>
          <p className="mt-2 text-xs text-slate-400">
            © {new Date().getFullYear()} ArkenEdu. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
