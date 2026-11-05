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
