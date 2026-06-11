import { useEffect } from 'react';

/**
 * Lightweight per-page SEO for the public legal pages. This is a client-side
 * SPA, so we set the document <title>, meta description, Open Graph tags, and
 * a canonical link on mount and restore the previous title on unmount.
 *
 * For crawler/preview fidelity, the same values should also be emitted at
 * build/SSR/prerender time — see docs/legal/website-compliance-pages.md.
 */
const SITE_ORIGIN = 'https://arkenedu.com';

interface DocumentSeo {
  title: string;
  description: string;
  /** Path only, e.g. "/privacy-policy". Used for the canonical + og:url. */
  canonicalPath?: string;
}

function upsertMeta(key: string, attr: 'name' | 'property', content: string) {
  const selector = `meta[${attr}="${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export function useDocumentSeo({ title, description, canonicalPath }: DocumentSeo) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    upsertMeta('description', 'name', description);
    upsertMeta('og:title', 'property', title);
    upsertMeta('og:description', 'property', description);
    upsertMeta('og:type', 'property', 'website');

    if (canonicalPath) {
      const url = `${SITE_ORIGIN}${canonicalPath}`;
      upsertCanonical(url);
      upsertMeta('og:url', 'property', url);
    }

    return () => {
      document.title = previousTitle;
    };
  }, [title, description, canonicalPath]);
}
