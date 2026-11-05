// Text and addresses on their way into a group description, which the server
// sanitizes: see `sanitizer.test.ts` for what gets through.

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The sanitizer compares schemes as they are written, so they go lowercase. */
function withLowercaseScheme(address: string): string {
  return address.replace(/^[a-z]+:/i, (scheme) => scheme.toLowerCase());
}

/** A link's address: an address without a scheme gets https. '' when it is no link at all. */
export function safeHref(value: string): string {
  const address = value.trim();
  if (/\s/.test(address)) return '';
  if (/^(https?:\/\/|mailto:)./i.test(address)) return withLowercaseScheme(address);
  if (/^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)+([/?#].*)?$/u.test(address)) return `https://${address}`;
  return '';
}

/** A picture's address: on the web, or the picture of a group here. */
export function safeImage(value: string): string {
  const address = value.trim();
  if (/^https?:\/\/\S+$/i.test(address)) return withLowercaseScheme(address);
  if (/^\/avatar\/group\/\d+(\?\w+=\w+)?$/.test(address)) return address;
  return '';
}

function anchor(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
}

export function hostOf(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

type TextOptions = {
  /** Off on a colored card, where the page's link color has nothing to stand on. */
  links?: boolean;
};

const INLINE = /\[([^\]\n]+)\]\(([^)\s]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|(https?:\/\/[^\s<>]+)/g;

/** Text with `**bold**`, `*italic*`, `[a link](address)` and bare addresses. */
export function inline(text: string, { links = true }: TextOptions = {}): string {
  let html = '';
  let last = 0;

  for (const match of text.matchAll(INLINE)) {
    const [whole, label, href, bold, italic, bare] = match;
    html += escapeHtml(text.slice(last, match.index));
    last = match.index + whole.length;

    if (bold !== undefined) {
      html += `<strong>${escapeHtml(bold)}</strong>`;
    } else if (italic !== undefined) {
      html += `<em>${escapeHtml(italic)}</em>`;
    } else if (label !== undefined) {
      const address = safeHref(href);
      html += !address ? escapeHtml(whole) : links ? anchor(address, label) : escapeHtml(label);
    } else {
      // A sentence ends after the address, not in it.
      const end = bare.match(/[.,;:!?)]+$/)?.[0] ?? '';
      const address = bare.slice(0, bare.length - end.length);
      html += (links ? anchor(address, address) : escapeHtml(address)) + escapeHtml(end);
    }
  }

  return html + escapeHtml(text.slice(last));
}

/** Blocks of text as paragraphs: an empty line starts a new one. */
export function paragraphs(text: string, style = '', options: TextOptions = {}): string {
  const opening = style ? `<p style="${style}">` : '<p>';

  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block !== '')
    .map((block) => `${opening}${inline(block, options).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/** The name of a group is at most 120 characters. */
export function clip(text: string, length = 120): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= length ? clean : `${clean.slice(0, length - 1).trimEnd()}…`;
}
