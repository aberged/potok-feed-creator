import { describe, expect, it } from 'vitest';
import { decodePost, encodePost, hashOf } from './post';
import { TEMPLATES, type PostFields, type TemplateId } from './templates';

const post = (template: TemplateId, fields: PostFields) => ({ template, fields });

describe('encodePost', () => {
  it('names the group after the post and writes HTML', () => {
    const { name, descriptionFormat } = encodePost(post('quote', { quote: 'Reka nosi sve.' }));

    expect(name).toBe('Reka nosi sve.');
    expect(descriptionFormat).toBe('html');
  });

  it('puts what it was made from in a comment on the first line', () => {
    const { description } = encodePost(post('question', { question: 'Zašto?' }));

    expect(description.startsWith('<!--potok-post {')).toBe(true);
    expect(description.split('\n')[0].endsWith('}-->')).toBe(true);
    expect(description.split('\n')[1]).toContain('Zašto?');
  });

  it('writes free text as it is, in its own format', () => {
    const fields = { title: 'Naslov', source: '# Tekst' };

    expect(encodePost(post('text', fields))).toEqual({
      name: 'Naslov',
      description: '# Tekst',
      descriptionFormat: 'markdown',
    });

    expect(encodePost(post('text', fields), 'html').descriptionFormat).toBe('html');
  });

  it('leaves nothing in the comment that could end it', () => {
    const { description } = encodePost(post('quote', { quote: 'kraj --> <script>alert(1)</script> --!> ---' }));
    const comment = description.split('\n')[0].slice('<!--'.length, -'-->'.length);

    expect(comment).not.toContain('--');
    expect(comment).not.toContain('>');
    expect(comment).not.toContain('<');
  });
});

describe('the card of a shared link', () => {
  const cardOf = (template: TemplateId, fields: PostFields) =>
    encodePost(post(template, fields)).description.match(/<meta name="description" content="([^"]*)">/)?.[1];

  it('takes the lead of an article, with nothing of its kicker or caption', () => {
    const card = cardOf('article', {
      kicker: 'Iz kraja',
      title: 'Desilo se čudo',
      lead: 'Dunavom plivaju zmajevi.',
      caption: 'chatgpt',
      body: 'Pred zalazak sunca izronio je zmaj.',
    });

    expect(card).toBe('Dunavom plivaju zmajevi.');
  });

  it('falls back on the text of an article without a lead', () => {
    expect(cardOf('article', { kicker: 'Iz kraja', title: 'Naslov', body: 'Prvi pasus.\n\nDrugi pasus.' })).toBe(
      'Prvi pasus. Drugi pasus.',
    );
  });

  it('says what each format has to say', () => {
    expect(cardOf('photo', { title: 'Jutro', about: 'Pre izlaska sunca.' })).toBe('Pre izlaska sunca.');
    expect(cardOf('quote', { quote: 'Reka', author: 'Izreka', source: 'Stara knjiga' })).toBe('Izreka, Stara knjiga');
    expect(cardOf('list', { title: 'Tri', intro: 'Za vikend.', items: ['a', 'b'] })).toBe('Za vikend.');
    expect(cardOf('list', { title: 'Tri', items: ['Pijaca', ' ', 'Obala'] })).toBe('Pijaca, Obala');
    expect(cardOf('link', { title: 'Vredi', address: 'https://www.example.com/a' })).toBe('example.com');
    expect(cardOf('link', { title: 'Vredi', address: 'https://a.b', about: 'Kratko.' })).toBe('Kratko.');
    expect(cardOf('notice', { level: 'urgent', title: 'Voda', body: 'Od 8 do 12.' })).toBe('Hitno: Od 8 do 12.');
    expect(cardOf('notice', { title: 'Voda' })).toBe('Obaveštenje');
    expect(cardOf('question', { question: 'Zašto?', about: 'Javi nam se.' })).toBe('Javi nam se.');
  });

  it('says when and where an event is', () => {
    const fields = { title: 'Čišćenje', date: '2026-11-14', time: '10:00', place: 'Kod mosta', about: 'Ponesi rukavice.' };

    expect(cardOf('event', fields)).toBe('subota, 14. novembar 2026. u 10:00 · Kod mosta · Ponesi rukavice.');
  });

  it('writes nothing where there is nothing to say', () => {
    expect(cardOf('question', { question: 'Zašto?' })).toBeUndefined();
    expect(cardOf('article', { kicker: 'Iz kraja', title: 'Naslov' })).toBeUndefined();
    expect(cardOf('photo', { title: 'Jutro' })).toBeUndefined();
  });

  it('leaves free text to Potok', () => {
    expect(encodePost(post('text', { title: 'Naslov', source: '# Tekst' })).description).toBe('# Tekst');
  });

  it('takes the marks out of the text', () => {
    expect(cardOf('photo', { title: 'a', about: '**Jako**, *tiho* i [link](https://a.b) na https://c.d.' })).toBe(
      'Jako, tiho i link na https://c.d.',
    );
  });

  it('cuts a long text between words', () => {
    const card = cardOf('photo', { title: 'a', about: 'reč '.repeat(100) })!;

    expect(card.length).toBeLessThanOrEqual(200);
    expect(card.endsWith('reč…')).toBe(true);
  });

  it('cannot break out of the tag', () => {
    expect(cardOf('photo', { title: 'a', about: '"><script>alert(1)</script>' })).toBe(
      '&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  it('counts as part of the post, so nothing looks changed by hand', () => {
    const original = post('article', { title: 'Naslov', lead: 'Uvod.' });
    const { description, descriptionFormat } = encodePost(original);

    expect(decodePost(description, descriptionFormat)).toEqual({ kind: 'post', post: original });
  });

  it('leaves a post made before it as it was', () => {
    const fields = { title: 'Naslov', lead: 'Uvod.' };
    const html = '<article><h1>Naslov</h1></article>';
    const old = `<!--potok-post ${JSON.stringify({ v: 1, template: 'article', fields, hash: hashOf(html) })}-->\n${html}`;

    expect(decodePost(old, 'html')).toEqual({ kind: 'post', post: post('article', fields) });
  });
});

describe('decodePost', () => {
  it('brings every format back from its description', () => {
    for (const template of TEMPLATES.filter(({ id }) => id !== 'text')) {
      const original = post(template.id, template.sample);
      const { description, descriptionFormat } = encodePost(original);

      expect(decodePost(description, descriptionFormat)).toEqual({ kind: 'post', post: original });
    }
  });

  it('keeps every character, also those the comment had to hide', () => {
    const fields = { quote: 'a --> b <c> "d" \\e\\ --- ćčžšđ 🌊\nnovi red' };
    const { description, descriptionFormat } = encodePost(post('quote', fields));

    expect(decodePost(description, descriptionFormat)).toEqual({ kind: 'post', post: post('quote', fields) });
  });

  it('takes no offense at the line endings of a form', () => {
    const { description, descriptionFormat } = encodePost(post('quote', { quote: 'Reka' }));

    expect(decodePost(description.replace(/\n/g, '\r\n'), descriptionFormat).kind).toBe('post');
    expect(decodePost(`${description}\r\n`, descriptionFormat).kind).toBe('post');
  });

  it('notices a text changed by hand, and offers the fields and the new text', () => {
    const original = post('quote', { quote: 'Reka' });
    const { description, descriptionFormat } = encodePost(original);
    const changed = `${description}<p>Dodato.</p>`;

    expect(decodePost(changed, descriptionFormat)).toEqual({
      kind: 'changed',
      post: original,
      source: changed.split('\n').slice(1).join('\n'),
    });
  });

  it('treats a description from elsewhere as free text', () => {
    expect(decodePost('# Tekst', 'markdown')).toEqual({ kind: 'free', source: '# Tekst', format: 'markdown' });
  });

  it('treats a broken or foreign comment as free text', () => {
    for (const description of [
      '<!--potok-post {nije json}-->\n<p>a</p>',
      '<!--potok-post {"template":"no-such","fields":{}}-->\n<p>a</p>',
      '<!--potok-post {"template":"quote"}-->\n<p>a</p>',
      '<!-- other -->\n<p>a</p>',
    ]) {
      expect(decodePost(description, 'html')).toEqual({ kind: 'free', source: description, format: 'html' });
    }
  });
});

describe('hashOf', () => {
  it('ignores line endings and outer spaces, and nothing else', () => {
    expect(hashOf('a\r\nb')).toBe(hashOf('a\nb'));
    expect(hashOf('  a\n')).toBe(hashOf('a'));
    expect(hashOf('a b')).not.toBe(hashOf('a  b'));
  });

  it('tells letters apart beyond the first byte', () => {
    expect(hashOf('č')).not.toBe(hashOf('ć'));
    expect(hashOf('🌊')).toMatch(/^[0-9a-f]{8}$/);
  });
});
