import { describe, expect, it } from 'vitest';
import { LEVEL_OPTIONS, TEMPLATES, WAITING_IMAGE, type PostFields, type TemplateId } from './templates';

// What the server keeps of a description, copied from potok-ide:
// lib/potok_ide_web/rich_content_scrubber.ex and, for `style`, the CSS scrubber
// of html_sanitize_ex. A template that breaks these rules looks right in the
// app's own page and loses its look in the feed, so every one is held to them.
// The check against the real server is `previewDescription`, in potok.

const STYLED_TAGS = new Set(
  `abbr article b blockquote caption code dd del details div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 i kbd li mark
   ol p pre s section small span strong sub summary sup table tbody td th thead tr u ul`.split(/\s+/),
);

const PLAIN_TAGS = new Map([
  ['a', new Set(['href', 'target', 'rel', 'name', 'title'])],
  ['img', new Set(['src', 'width', 'height', 'title', 'alt'])],
  ['br', new Set()],
  ['hr', new Set()],
]);

const CSS_PROPERTIES = new Set(
  `background-color border-bottom-color border-collapse border-color border-left-color border-right-color
   border-top-color clear color cursor direction display elevation float font font-family font-size font-style
   font-variant font-weight height letter-spacing line-height overflow text-align text-decoration text-indent
   unicode-bidi vertical-align white-space width background border margin padding`.split(/\s+/),
);

const CSS_PREFIXES = ['background-', 'border-', 'margin-', 'padding-'];

const CSS_KEYWORDS = new Set(
  `auto aqua black block blue bold both bottom brown center collapse dashed dotted fuchsia gray green !important italic
   justify left lime maroon medium middle none navy normal nowrap olive pointer purple red right solid silver teal top
   transparent underline white yellow`.split(/\s+/),
);

const CSS_MEASURE = /^(#[0-9a-f]+|rgb\(\d+%?,\d*%?,?\d*%?\)?|-?\d{0,2}\.?\d{0,2}(cm|em|ex|in|mm|pc|pt|px|%|,|\))?)$/;

function refusedCss(style: string): string[] {
  const refused: string[] = [];

  for (const declaration of style.split(';').map((part) => part.trim()).filter(Boolean)) {
    const colon = declaration.indexOf(':');
    const property = declaration.slice(0, colon).trim();
    const value = declaration.slice(colon + 1).trim();

    if (!CSS_PROPERTIES.has(property) && !CSS_PREFIXES.some((prefix) => property.startsWith(prefix))) {
      refused.push(property);
    }

    for (const token of value.split(/\s+/)) {
      if (!CSS_KEYWORDS.has(token.toLowerCase()) && !CSS_MEASURE.test(token)) refused.push(`${property}: ${token}`);
    }
  }

  return refused;
}

function refusedMarkup(html: string): string[] {
  const refused: string[] = [];

  for (const [, name, attributes] of html.matchAll(/<([a-z][a-z0-9]*)((?:\s+[a-z-]+="[^"]*")*)\s*>/g)) {
    const plain = PLAIN_TAGS.get(name);
    if (!plain && !STYLED_TAGS.has(name)) refused.push(`<${name}>`);

    for (const [, attribute, value] of attributes.matchAll(/([a-z-]+)="([^"]*)"/g)) {
      if (attribute === 'style' && !plain) refused.push(...refusedCss(value));
      else if (!plain?.has(attribute)) refused.push(`${name} ${attribute}`);
    }
  }

  return refused;
}

/** Every field filled, so that every part of a format is in its HTML. */
const FULL: Partial<Record<TemplateId, PostFields>> = {
  article: {
    kicker: 'Iz kraja',
    title: 'Naslov',
    lead: 'Uvod',
    image: WAITING_IMAGE,
    caption: 'Foto',
    body: '**jako** i *malo*\n\n[link](https://a.rs)',
  },
  photo: { image: WAITING_IMAGE, title: 'Naslov', about: 'Opis' },
  quote: { quote: 'Citat', author: 'Ana', source: 'Pisma' },
  event: {
    title: 'Naziv',
    date: '2026-11-14',
    time: '10:00',
    place: 'Most',
    about: 'Opis',
    more: 'https://a.rs',
  },
  list: { title: 'Naslov', intro: 'Uvod', items: ['prva', 'druga'] },
  link: { address: 'https://a.rs/b', title: 'Naslov', about: 'Opis', image: WAITING_IMAGE },
  question: { question: 'Zašto?', about: 'Dodatak' },
};

describe('what the sanitizer lets through', () => {
  for (const template of TEMPLATES.filter(({ id }) => id !== 'text' && id !== 'notice')) {
    it(`keeps all of ${template.name}`, () => {
      expect(refusedMarkup(template.render(FULL[template.id]!))).toEqual([]);
    });
  }

  for (const { value, label } of LEVEL_OPTIONS) {
    it(`keeps all of Obaveštenje, ${label}`, () => {
      const notice = TEMPLATES.find(({ id }) => id === 'notice')!;

      expect(refusedMarkup(notice.render({ level: value, title: 'Naslov', body: 'Tekst' }))).toEqual([]);
    });
  }

  it('is no empty check, and knows what passes too', () => {
    expect(refusedCss('width: 100%; font-weight: 700; border-radius: 99px; line-height: 1.15')).toEqual([]);
    expect(refusedMarkup('<div class="a"></div>')).toEqual(['div class']);
    expect(refusedMarkup('<img style="width: 50%" src="/a">')).toEqual(['img style']);
    expect(refusedMarkup('<video></video>')).toEqual(['<video>']);
    expect(refusedCss('color: #FFFFFF')).toEqual(['color: #FFFFFF']);
    expect(refusedCss('display: flex')).toEqual(['display: flex']);
    expect(refusedCss('display: inline-block')).toEqual(['display: inline-block']);
    expect(refusedCss('overflow: hidden')).toEqual(['overflow: hidden']);
    expect(refusedCss('box-shadow: none')).toEqual(['box-shadow']);
    expect(refusedCss('max-width: 100%')).toEqual(['max-width']);
    expect(refusedCss('background-color: rgba(1,2,3,0.5)')).toEqual(['background-color: rgba(1,2,3,0.5)']);
    expect(refusedCss('color: var(--color-primary)')).toEqual(['color: var(--color-primary)']);
  });

  it('every colored surface sets its text with its background', () => {
    for (const template of TEMPLATES.filter(({ id }) => id !== 'text' && id !== 'notice')) {
      const html = template.render(FULL[template.id]!);

      for (const [, style] of html.matchAll(/style="([^"]*background-color: #[^"]*)"/g)) {
        expect(style).toMatch(/(^|\s)color: #/);
      }
    }
  });
});
