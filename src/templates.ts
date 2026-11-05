import { clip, escapeHtml, hostOf, inline, paragraphs, safeHref, safeImage } from './html';

// The formats of a post. Each turns its fields into the HTML of a group
// description, and that HTML has to stand on its own: the sanitizer keeps no
// `class`, so the look travels in `style`, and only with what it lets through
// (`sanitizer.test.ts` checks every template against its rules). No `flex`,
// `max-width`, `var()` or shadows, and `display` knows only `block`.
//
// The page's dark and light themes reach the text but not a color written
// here, so a colored surface always sets its background and its text together,
// and takes no links, whose color comes from the theme.

export type TemplateId =
  | 'article'
  | 'photo'
  | 'quote'
  | 'event'
  | 'list'
  | 'link'
  | 'notice'
  | 'question'
  | 'text';

export type FieldKind = 'text' | 'textarea' | 'url' | 'image' | 'date' | 'time' | 'level' | 'items';

export type Field = {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  hint?: string;
  required?: boolean;
};

export type PostFields = Record<string, string | string[]>;

export type Template = {
  id: TemplateId;
  name: string;
  /** What the format is for, on the list to choose from. */
  purpose: string;
  fields: Field[];
  /** Fills the picture of the format on that list. */
  sample: PostFields;
  /** The name of the group. */
  title: (fields: PostFields) => string;
  render: (fields: PostFields) => string;
  /** What the card of a shared link says under the name. Nothing leaves it to Potok. */
  card: (fields: PostFields) => string;
};

export const MAX_ITEMS = 10;

/** Stands for a picture from the device until the group has an address for it. */
export const WAITING_IMAGE = 'https://potok.invalid/picture-on-its-way';

export type NoticeLevel = 'info' | 'important' | 'urgent';

const LEVELS: Record<NoticeLevel, { label: string; background: string; text: string; line: string }> = {
  info: { label: 'Obaveštenje', background: '#dbeafe', text: '#1e3a8a', line: '#2563eb' },
  important: { label: 'Važno', background: '#fef3c7', text: '#78350f', line: '#f59e0b' },
  urgent: { label: 'Hitno', background: '#fee2e2', text: '#7f1d1d', line: '#dc2626' },
};

export const LEVEL_OPTIONS = (Object.entries(LEVELS) as [NoticeLevel, { label: string }][]).map(
  ([value, { label }]) => ({ value, label }),
);

const MONTHS = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar'];
const WEEKDAYS = ['nedelja', 'ponedeljak', 'utorak', 'sreda', 'četvrtak', 'petak', 'subota'];

const text = (fields: PostFields, key: string): string => {
  const value = fields[key];
  return typeof value === 'string' ? value.trim() : '';
};

const items = (fields: PostFields, key: string): string[] => {
  const value = fields[key];
  return Array.isArray(value) ? value.map((item) => item.trim()).filter((item) => item !== '') : [];
};

const levelOf = (fields: PostFields) => LEVELS[text(fields, 'level') as NoticeLevel] ?? LEVELS.info;

/** What sets a title apart from `.rich-content`, which underlines an h1 and an h2. */
const HEADING = 'border: none; padding: 0;';

function picture(fields: PostFields, alt: string): string {
  const address = safeImage(text(fields, 'image'));
  return address ? `<img src="${escapeHtml(address)}" alt="${escapeHtml(alt)}">` : '';
}

function figure(fields: PostFields, alt: string, caption: string): string {
  const image = picture(fields, alt);
  if (!image) return '';

  const note = caption ? `<figcaption>${inline(caption)}</figcaption>` : '';
  return `<figure style="margin: 16px 0 0;">${image}${note}</figure>`;
}

function article(fields: PostFields): string {
  const kicker = text(fields, 'kicker');
  const title = text(fields, 'title');
  const lead = text(fields, 'lead');

  return [
    '<article>',
    kicker &&
      `<p style="margin: 0 0 10px;"><span style="background-color: #1e3a8a; color: #ffffff; font-size: 13px; font-weight: bold; padding: 3px 10px; border-radius: 99px;">${escapeHtml(kicker)}</span></p>`,
    `<h1 style="${HEADING} font-size: 32px; line-height: 1.15; margin: 0;">${escapeHtml(title)}</h1>`,
    lead && `<p style="font-size: 19px; line-height: 1.45; font-weight: bold; margin: 12px 0 0;">${inline(lead)}</p>`,
    figure(fields, title, text(fields, 'caption')),
    paragraphs(text(fields, 'body'), 'margin: 14px 0 0;'),
    '</article>',
  ].join('');
}

function photo(fields: PostFields): string {
  const title = text(fields, 'title');
  const about = text(fields, 'about');

  return [
    `<figure style="margin: 0;">${picture(fields, title)}</figure>`,
    `<h2 style="${HEADING} font-size: 24px; line-height: 1.2; margin: 12px 0 0;">${escapeHtml(title)}</h2>`,
    paragraphs(about, 'font-size: 17px; margin: 6px 0 0;'),
  ].join('');
}

function quote(fields: PostFields): string {
  const source = [text(fields, 'author'), text(fields, 'source')].filter(Boolean).join(', ');

  return [
    '<blockquote style="background-color: #1e3a8a; color: #ffffff; border: none; border-radius: 20px; padding: 28px 24px; margin: 0;">',
    '<p style="color: #93c5fd; font-size: 60px; font-weight: bold; line-height: 0.8; margin: 0;">“</p>',
    paragraphs(text(fields, 'quote'), 'font-size: 25px; font-weight: bold; line-height: 1.3; margin: 0 0 10px;', {
      links: false,
    }),
    source && `<p style="color: #bfdbfe; font-size: 16px; margin: 16px 0 0;">${escapeHtml(source)}</p>`,
    '</blockquote>',
  ].join('');
}

function eventDate(value: string): { day: number; month: string; weekday: string; year: number } | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime()) || date.getMonth() !== month - 1) return null;

  return { day, month: MONTHS[month - 1], weekday: WEEKDAYS[date.getDay()], year };
}

function eventWhen(fields: PostFields): string {
  const date = eventDate(text(fields, 'date'));
  const time = text(fields, 'time');

  return [date ? `${date.weekday}, ${date.day}. ${date.month} ${date.year}.` : '', time && `u ${time}`]
    .filter(Boolean)
    .join(' ');
}

function event(fields: PostFields): string {
  const date = eventDate(text(fields, 'date'));
  const place = text(fields, 'place');
  const more = safeHref(text(fields, 'more'));
  const when = eventWhen(fields);

  // In a div: a table cell takes no `border-radius` with `border-collapse: collapse`,
  // and the sanitizer does not know `separate`.
  const badge = date
    ? `<td style="border: none; padding: 0; vertical-align: middle; width: 76px;"><div style="background-color: #1e3a8a; color: #ffffff; border-radius: 16px; padding: 12px 8px; text-align: center;"><span style="display: block; font-size: 32px; font-weight: bold; line-height: 1;">${date.day}</span><span style="display: block; font-size: 14px; margin-top: 4px;">${date.month.slice(0, 3)}</span></div></td>`
    : '';

  return [
    '<table style="display: block; margin: 0; width: 100%;"><tbody><tr>',
    badge,
    `<td style="border: none; padding: 0 0 0 ${date ? 16 : 0}px; vertical-align: middle;">`,
    `<h1 style="${HEADING} font-size: 25px; line-height: 1.2; margin: 0;">${escapeHtml(text(fields, 'title'))}</h1>`,
    when && `<p style="font-weight: bold; margin: 6px 0 0;">${escapeHtml(when)}</p>`,
    place && `<p style="margin: 2px 0 0;">${escapeHtml(place)}</p>`,
    '</td></tr></tbody></table>',
    paragraphs(text(fields, 'about'), 'margin: 16px 0 0;'),
    more &&
      `<p style="margin: 14px 0 0;"><a href="${escapeHtml(more)}" target="_blank" rel="noopener">Više o događaju</a></p>`,
  ].join('');
}

function list(fields: PostFields): string {
  const rows = items(fields, 'items')
    .slice(0, MAX_ITEMS)
    .map(
      (item, index) =>
        `<tr><td style="background-color: transparent; border: none; color: #3b82f6; font-size: 30px; font-weight: bold; line-height: 1.1; padding: 8px 14px 8px 0; text-align: right; vertical-align: top; width: 44px;">${index + 1}</td><td style="background-color: transparent; border: none; font-size: 18px; line-height: 1.4; padding: 10px 0; vertical-align: top;">${inline(item)}</td></tr>`,
    )
    .join('');

  return [
    `<h1 style="${HEADING} font-size: 28px; line-height: 1.2; margin: 0;">${escapeHtml(text(fields, 'title'))}</h1>`,
    paragraphs(text(fields, 'intro'), 'margin: 10px 0 0;'),
    rows && `<table style="display: block; margin: 10px 0 0; width: 100%;"><tbody>${rows}</tbody></table>`,
  ].join('');
}

function link(fields: PostFields): string {
  const address = safeHref(text(fields, 'address'));
  const host = hostOf(address);
  const image = picture(fields, text(fields, 'title'));

  return [
    '<div style="border: 1px solid #9ca3af; border-radius: 18px; padding: 16px;">',
    image && `<p style="margin: 0 0 12px;">${image}</p>`,
    host && `<p style="font-size: 14px; font-weight: bold; margin: 0 0 4px;">${escapeHtml(host)}</p>`,
    `<h2 style="${HEADING} font-size: 24px; line-height: 1.2; margin: 0;">${escapeHtml(text(fields, 'title'))}</h2>`,
    paragraphs(text(fields, 'about'), 'margin: 8px 0 0;'),
    address &&
      `<p style="font-weight: bold; margin: 12px 0 0;"><a href="${escapeHtml(address)}" target="_blank" rel="noopener">Pročitaj više</a></p>`,
    '</div>',
  ].join('');
}

function notice(fields: PostFields): string {
  const level = levelOf(fields);

  return [
    `<section style="background-color: ${level.background}; color: ${level.text}; border-left: 6px solid ${level.line}; border-radius: 14px; padding: 20px;">`,
    `<p style="font-size: 14px; font-weight: bold; margin: 0;">${level.label}</p>`,
    `<h1 style="${HEADING} font-size: 25px; line-height: 1.2; margin: 4px 0 0;">${escapeHtml(text(fields, 'title'))}</h1>`,
    paragraphs(text(fields, 'body'), 'margin: 10px 0 0;', { links: false }),
    '</section>',
  ].join('');
}

function question(fields: PostFields): string {
  return [
    '<div style="background-color: #134e4a; color: #ffffff; border-radius: 20px; padding: 32px 24px; text-align: center;">',
    `<h1 style="${HEADING} font-size: 29px; line-height: 1.25; margin: 0;">${escapeHtml(text(fields, 'question'))}</h1>`,
    paragraphs(text(fields, 'about'), 'color: #ccfbf1; font-size: 17px; margin: 12px 0 0;', { links: false }),
    '<p style="color: #99f6e4; font-size: 15px; font-weight: bold; margin: 20px 0 0;">Odgovori u chatu</p>',
    '</div>',
  ].join('');
}

export const TEMPLATES: Template[] = [
  {
    id: 'article',
    name: 'Vest',
    purpose: 'Naslov, uvod, slika i tekst.',
    fields: [
      { key: 'kicker', label: 'Nadnaslov', kind: 'text', placeholder: 'Iz kraja' },
      { key: 'title', label: 'Naslov', kind: 'text', required: true },
      { key: 'lead', label: 'Uvod', kind: 'textarea', hint: 'Jedna ili dve rečenice koje se prve čitaju.' },
      { key: 'image', label: 'Slika', kind: 'image' },
      { key: 'caption', label: 'Potpis uz sliku', kind: 'text' },
      { key: 'body', label: 'Tekst', kind: 'textarea', hint: 'Prazan red počinje novi pasus.' },
    ],
    sample: {
      kicker: 'Iz kraja',
      title: 'Most na potoku ponovo otvoren',
      lead: 'Posle dva meseca radova kraj je radovima.',
      image: WAITING_IMAGE,
      body: 'Radovi su završeni pre roka.',
    },
    title: (fields) => clip(text(fields, 'title')),
    render: article,
    card: (fields) => text(fields, 'lead') || text(fields, 'body'),
  },
  {
    id: 'photo',
    name: 'Slika',
    purpose: 'Velika slika i nekoliko reči.',
    fields: [
      { key: 'image', label: 'Slika', kind: 'image', required: true },
      { key: 'title', label: 'Naslov', kind: 'text', required: true },
      { key: 'about', label: 'Opis', kind: 'textarea' },
    ],
    sample: { image: WAITING_IMAGE, title: 'Jutro na obali', about: 'Snimljeno pre izlaska sunca.' },
    title: (fields) => clip(text(fields, 'title')),
    render: photo,
    card: (fields) => text(fields, 'about'),
  },
  {
    id: 'quote',
    name: 'Citat',
    purpose: 'Rečenica koja staje na ceo ekran.',
    fields: [
      { key: 'quote', label: 'Citat', kind: 'textarea', required: true },
      { key: 'author', label: 'Autor', kind: 'text' },
      { key: 'source', label: 'Izvor', kind: 'text' },
    ],
    sample: { quote: 'Reka nosi sve što joj se da.', author: 'Stara izreka' },
    title: (fields) => clip(text(fields, 'quote')),
    render: quote,
    card: (fields) => [text(fields, 'author'), text(fields, 'source')].filter(Boolean).join(', '),
  },
  {
    id: 'event',
    name: 'Događaj',
    purpose: 'Šta, kada i gde.',
    fields: [
      { key: 'title', label: 'Naziv', kind: 'text', required: true },
      { key: 'date', label: 'Datum', kind: 'date' },
      { key: 'time', label: 'Vreme', kind: 'time' },
      { key: 'place', label: 'Mesto', kind: 'text' },
      { key: 'about', label: 'Opis', kind: 'textarea' },
      { key: 'more', label: 'Link za više', kind: 'url' },
    ],
    sample: { title: 'Čišćenje obale', date: '2026-11-14', time: '10:00', place: 'Kod starog mosta' },
    title: (fields) => clip(text(fields, 'title')),
    render: event,
    card: (fields) =>
      [eventWhen(fields), text(fields, 'place'), text(fields, 'about')].filter(Boolean).join(' · '),
  },
  {
    id: 'list',
    name: 'Lista',
    purpose: 'Stavke sa brojevima, do deset.',
    fields: [
      { key: 'title', label: 'Naslov', kind: 'text', required: true },
      { key: 'intro', label: 'Uvod', kind: 'textarea' },
      { key: 'items', label: 'Stavke', kind: 'items', required: true },
    ],
    sample: { title: 'Tri stvari za vikend', items: ['Prošetaj uz potok', 'Poseti pijacu', 'Javi se komšiji'] },
    title: (fields) => clip(text(fields, 'title')),
    render: list,
    card: (fields) => text(fields, 'intro') || items(fields, 'items').slice(0, MAX_ITEMS).join(', '),
  },
  {
    id: 'link',
    name: 'Link',
    purpose: 'Preporuka sa kratkim opisom.',
    fields: [
      { key: 'address', label: 'Adresa', kind: 'url', required: true, placeholder: 'https://' },
      { key: 'title', label: 'Naslov', kind: 'text', required: true },
      { key: 'about', label: 'Opis', kind: 'textarea' },
      { key: 'image', label: 'Slika', kind: 'image' },
    ],
    sample: { address: 'https://example.com/clanak', title: 'Vredi pročitati', about: 'Kratak tekst o našem kraju.' },
    title: (fields) => clip(text(fields, 'title')),
    render: link,
    card: (fields) => text(fields, 'about') || hostOf(safeHref(text(fields, 'address'))),
  },
  {
    id: 'notice',
    name: 'Obaveštenje',
    purpose: 'Traka u boji, od običnog do hitnog.',
    fields: [
      { key: 'level', label: 'Važnost', kind: 'level' },
      { key: 'title', label: 'Naslov', kind: 'text', required: true },
      { key: 'body', label: 'Tekst', kind: 'textarea' },
    ],
    sample: { level: 'important', title: 'Nema vode u utorak', body: 'Od 8 do 12 časova.' },
    title: (fields) => clip(text(fields, 'title')),
    render: notice,
    card: (fields) => [levelOf(fields).label, text(fields, 'body')].filter(Boolean).join(': '),
  },
  {
    id: 'question',
    name: 'Pitanje',
    purpose: 'Pozovi članove na razgovor.',
    fields: [
      { key: 'question', label: 'Pitanje', kind: 'textarea', required: true },
      { key: 'about', label: 'Dodatak', kind: 'textarea' },
    ],
    sample: { question: 'Šta bi promenio u našem kraju?', about: 'Javi nam se.' },
    title: (fields) => clip(text(fields, 'question')),
    render: question,
    card: (fields) => text(fields, 'about'),
  },
  {
    id: 'text',
    name: 'Slobodan tekst',
    purpose: 'Sve ostalo, u markdownu.',
    fields: [
      { key: 'title', label: 'Naslov', kind: 'text', required: true, hint: 'Ime grupe. Ne ispisuje se u tekstu.' },
      { key: 'source', label: 'Tekst', kind: 'textarea', required: true },
    ],
    sample: { title: 'Slobodan tekst', source: 'Pišeš kako želiš.' },
    title: (fields) => clip(text(fields, 'title')),
    render: (fields) => text(fields, 'source'),
    card: () => '',
  },
];

export const templateOf = (id: TemplateId): Template =>
  TEMPLATES.find((template) => template.id === id) ?? TEMPLATES[0];

export function isTemplateId(value: unknown): value is TemplateId {
  return TEMPLATES.some((template) => template.id === value);
}

/** The required fields left empty, by their labels. */
export function missingFields(template: Template, fields: PostFields): string[] {
  return template.fields
    .filter(({ required, key }) => {
      if (!required) return false;
      const value = fields[key];
      return Array.isArray(value) ? value.every((item) => item.trim() === '') : !value?.trim();
    })
    .map(({ label }) => label);
}
