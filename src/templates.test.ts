import { describe, expect, it } from 'vitest';
import { LEVEL_OPTIONS, MAX_ITEMS, missingFields, TEMPLATES, templateOf, WAITING_IMAGE } from './templates';

describe('the formats', () => {
  it('are between five and ten, each with its own id', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(5);
    expect(TEMPLATES.length).toBeLessThanOrEqual(10);
    expect(new Set(TEMPLATES.map(({ id }) => id)).size).toBe(TEMPLATES.length);
  });

  it('each ask for something, so that a group gets a name', () => {
    for (const template of TEMPLATES) {
      expect(template.fields.some(({ required }) => required)).toBe(true);
      expect(template.title(template.sample)).not.toBe('');
    }
  });

  it('each show their sample, which fills every field they require', () => {
    for (const template of TEMPLATES) {
      expect(missingFields(template, template.sample)).toEqual([]);
    }
  });

  it('turn no field into markup', () => {
    const hostile = '<img src=x onerror=alert(1)>';

    for (const template of TEMPLATES.filter(({ id }) => id !== 'text')) {
      const fields = Object.fromEntries(
        template.fields.map(({ key, kind }) => [key, kind === 'items' ? [hostile] : hostile]),
      );
      const html = template.render(fields);

      expect(html).not.toContain('<img src=x');
      expect(html).not.toContain('<script');
    }
  });

  it('leave out what is empty', () => {
    const html = templateOf('article').render({ title: 'Naslov' });

    expect(html).not.toContain('<img');
    expect(html).not.toContain('<figure');
    expect(html).not.toContain('<span');
  });
});

describe('article', () => {
  it('shows a picture with its caption', () => {
    const html = templateOf('article').render({ title: 'Naslov', image: WAITING_IMAGE, caption: 'Foto: Ana' });

    expect(html).toContain(`<img src="${WAITING_IMAGE}" alt="Naslov">`);
    expect(html).toContain('<figcaption>Foto: Ana</figcaption>');
  });

  it('leaves out a picture from nowhere', () => {
    expect(templateOf('article').render({ title: 'N', image: 'javascript:alert(1)' })).not.toContain('<img');
  });

  it('breaks the text into paragraphs, with links', () => {
    const html = templateOf('article').render({ title: 'N', body: 'prvi\n\n[drugi](https://a.rs)' });

    expect(html).toContain('>prvi</p>');
    expect(html).toContain('<a href="https://a.rs"');
  });
});

describe('quote', () => {
  it('names the author and the source', () => {
    expect(templateOf('quote').render({ quote: 'Q', author: 'Ana', source: 'Pisma' })).toContain('Ana, Pisma');
  });

  it('keeps no link on its colored card', () => {
    expect(templateOf('quote').render({ quote: '[a](https://a.rs)' })).not.toContain('<a ');
  });
});

describe('event', () => {
  it('spells the date', () => {
    const html = templateOf('event').render({ title: 'N', date: '2026-11-14', time: '10:00', place: 'Most' });

    expect(html).toContain('subota, 14. novembar 2026. u 10:00');
    expect(html).toContain('>14</span>');
    expect(html).toContain('>nov</span>');
    expect(html).toContain('Most');
  });

  it('does without a date', () => {
    const html = templateOf('event').render({ title: 'N', time: '10:00' });

    expect(html).toContain('u 10:00');
    expect(html).not.toContain('background-color');
  });

  it('ignores a date that does not exist', () => {
    expect(templateOf('event').render({ title: 'N', date: '2026-02-31' })).not.toContain('februar');
  });

  it('links to more', () => {
    expect(templateOf('event').render({ title: 'N', more: 'example.com' })).toContain('href="https://example.com"');
  });
});

describe('list', () => {
  it('numbers the items and skips the empty ones', () => {
    const html = templateOf('list').render({ title: 'N', items: ['prva', ' ', 'druga'] });

    expect(html).toContain('>1</td>');
    expect(html).toContain('>2</td>');
    expect(html).not.toContain('>3</td>');
  });

  it('stops at the limit', () => {
    const items = Array.from({ length: MAX_ITEMS + 3 }, (_, index) => `stavka ${index}`);
    const html = templateOf('list').render({ title: 'N', items });

    expect(html).toContain(`>${MAX_ITEMS}</td>`);
    expect(html).not.toContain(`>${MAX_ITEMS + 1}</td>`);
  });
});

describe('link', () => {
  it('names the site and leads to it', () => {
    const html = templateOf('link').render({ title: 'N', address: 'https://www.example.com/a' });

    expect(html).toContain('>example.com</p>');
    expect(html).toContain('href="https://www.example.com/a"');
  });
});

describe('notice', () => {
  it('has a look for every level, and the plainest for a level it does not know', () => {
    const looks = LEVEL_OPTIONS.map(({ value }) => templateOf('notice').render({ title: 'N', level: value }));

    expect(new Set(looks).size).toBe(LEVEL_OPTIONS.length);
    expect(templateOf('notice').render({ title: 'N', level: 'x' })).toBe(templateOf('notice').render({ title: 'N' }));
    expect(templateOf('notice').render({ title: 'N' })).toBe(looks[0]);
  });
});

describe('question', () => {
  it('leads to the chat', () => {
    expect(templateOf('question').render({ question: 'Zašto?' })).toContain('Odgovori u chatu');
  });
});

describe('missingFields', () => {
  it('names what is required and empty', () => {
    expect(missingFields(templateOf('photo'), { title: ' ' })).toEqual(['Slika', 'Naslov']);
  });

  it('wants one real item in a list', () => {
    expect(missingFields(templateOf('list'), { title: 'N', items: [' '] })).toEqual(['Stavke']);
    expect(missingFields(templateOf('list'), { title: 'N', items: ['a'] })).toEqual([]);
  });
});
