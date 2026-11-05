import { escapeHtml, summary } from './html';
import type { PotokContentFormat } from './potok';
import { isTemplateId, templateOf, type PostFields, type TemplateId } from './templates';

// A post's source and the description of its group. The description is what a
// feed shows, so it has to be HTML that stands alone. What it was made from
// travels in a comment on the first line: the group keeps it, and the sanitizer
// takes it out of everything a viewer gets.
//
//   <!--potok-post {"v":1,"template":"quote","fields":{...},"hash":"1a2b3c4d"}-->
//   <meta name="description" content="..."><blockquote style="...">...</blockquote>
//
// `hash` is that of the HTML below it, which tells if someone changed the text
// by hand in the group's settings. A form built from `fields` would undo that.
//
// The meta tag is what the card of a shared link says. Potok reads it, as its own
// reading of the HTML would run a kicker, a caption and the text together, and
// the sanitizer keeps it from viewers too.

export type Post = { template: TemplateId; fields: PostFields };

export type Description = {
  name: string;
  description: string;
  descriptionFormat: PotokContentFormat;
};

export type Decoded =
  /** Made here and untouched since. */
  | { kind: 'post'; post: Post }
  /** Made here, then changed by hand. */
  | { kind: 'changed'; post: Post; source: string }
  /** Never made here, or free text. */
  | { kind: 'free'; source: string; format: PotokContentFormat };

const MARKER = /^<!--potok-post (\{[\s\S]*?\})-->\n?/;

/** FNV-1a. Line endings and outer spaces do not count: a form sends `\r\n` back. */
export function hashOf(html: string): string {
  let hash = 0x811c9dc5;

  for (const unit of html.replace(/\r/g, '').trim()) {
    hash ^= unit.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** JSON that no comment can end inside of. Those characters stand only in its strings. */
function commentSafe(json: string): string {
  return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/--/g, '-\\u002d');
}

function cardTag(text: string): string {
  const content = summary(text);
  return content ? `<meta name="description" content="${escapeHtml(content)}">` : '';
}

export function encodePost({ template, fields }: Post, format: PotokContentFormat = 'markdown'): Description {
  const { title, render, card } = templateOf(template);
  const name = title(fields);

  // Free text is the description itself, and needs nothing to come back from.
  if (template === 'text') {
    return { name, description: render(fields), descriptionFormat: format };
  }

  const html = `${cardTag(card(fields))}${render(fields)}`;
  const marker = commentSafe(JSON.stringify({ v: 1, template, fields, hash: hashOf(html) }));

  return { name, description: `<!--potok-post ${marker}-->\n${html}`, descriptionFormat: 'html' };
}

function parseMarker(json: string): { post: Post; hash: unknown } | null {
  try {
    const { template, fields, hash } = JSON.parse(json);
    if (!isTemplateId(template) || !fields || typeof fields !== 'object') return null;

    return { post: { template, fields }, hash };
  } catch {
    return null;
  }
}

export function decodePost(description: string, format: PotokContentFormat): Decoded {
  const match = description.match(MARKER);
  const marker = match && parseMarker(match[1]);

  if (!match || !marker) return { kind: 'free', source: description, format };

  const source = description.slice(match[0].length);

  return hashOf(source) === marker.hash
    ? { kind: 'post', post: marker.post }
    : { kind: 'changed', post: marker.post, source };
}
