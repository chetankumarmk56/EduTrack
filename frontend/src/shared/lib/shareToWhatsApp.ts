import toast from 'react-hot-toast';

interface ShareOptions {
  blob: Blob;
  filename: string;
  title?: string;
  text: string;
}

type ShareResult =
  | { method: 'native'; ok: true }
  | { method: 'native'; ok: false; reason: 'cancelled' }
  | { method: 'fallback'; ok: true }
  | { method: 'error'; ok: false; reason: string };

/**
 * Best-effort PDF share to WhatsApp.
 *
 * Strategy:
 *   1. If the browser supports the Web Share API with file attachments
 *      (`navigator.canShare({ files })`), invoke the native share sheet so
 *      the user can pick WhatsApp (or any other target). This is the only
 *      browser-safe way to attach a file to a WhatsApp message.
 *   2. Otherwise, fall back to: download the PDF locally, then open
 *      `wa.me/?text=...` so the user can pick a chat and manually attach
 *      the file that just landed in their downloads folder.
 *
 * Mobile Safari, Chrome on Android, and recent desktop Chrome/Edge support
 * the native path. Firefox and older browsers hit the fallback.
 */
export async function shareToWhatsApp({
  blob,
  filename,
  title,
  text,
}: ShareOptions): Promise<ShareResult> {
  const file = new File([blob], filename, { type: blob.type || 'application/pdf' });
  const canShareFiles =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] });

  if (canShareFiles) {
    try {
      await navigator.share({ files: [file], title, text });
      return { method: 'native', ok: true };
    } catch (err) {
      const name = (err as Error)?.name;
      if (name === 'AbortError') {
        return { method: 'native', ok: false, reason: 'cancelled' };
      }
      // Any other failure → fall through to download + wa.me.
    }
  }

  // Fallback: trigger a download and open wa.me with a hint.
  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    const fullText = `${text}\n\n(PDF "${filename}" has been downloaded — attach it from your downloads.)`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(fullText)}`,
      '_blank',
      'noopener,noreferrer',
    );
    toast(
      'PDF downloaded. Attach it manually in the WhatsApp chat that just opened.',
      { icon: 'ℹ️', duration: 6000 },
    );
    return { method: 'fallback', ok: true };
  } catch (err) {
    return {
      method: 'error',
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
