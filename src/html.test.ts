import { describe, expect, it } from 'vitest';
import { clip, escapeHtml, hostOf, inline, paragraphs, safeHref, safeImage } from './html';

describe('escapeHtml', () => {
  it('leaves no markup and no way out of an attribute', () => {
    expect(escapeHtml('<script>"&"</script>')).toBe('&lt;script&gt;&quot;&amp;&quot;&lt;/script&gt;');
  });
});

describe('safeHref', () => {
  it('keeps web and mail addresses, with the scheme in lowercase as the sanitizer wants it', () => {
    expect(safeHref(' https://example.com/a?b=1 ')).toBe('https://example.com/a?b=1');
    expect(safeHref('HTTP://example.com')).toBe('http://example.com');
    expect(safeHref('mailto:a@example.com')).toBe('mailto:a@example.com');
  });

  it('gives an address without a scheme https', () => {
    expect(safeHref('example.com/put')).toBe('https://example.com/put');
    expect(safeHref('www.čačak.rs')).toBe('https://www.čačak.rs');
  });

  it('refuses what is not a link', () => {
    expect(safeHref('javascript:alert(1)')).toBe('');
    expect(safeHref('data:text/html,x')).toBe('');
    expect(safeHref('nije adresa')).toBe('');
    expect(safeHref('')).toBe('');
  });
});

describe('safeImage', () => {
  it('takes pictures on the web and the picture of a group', () => {
    expect(safeImage('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(safeImage('/avatar/group/12?p=1730000000')).toBe('/avatar/group/12?p=1730000000');
  });

  it('refuses the rest, which the sanitizer would take out anyway', () => {
    expect(safeImage('data:image/png;base64,AAAA')).toBe('');
    expect(safeImage('/files/12')).toBe('');
    expect(safeImage('javascript:alert(1)')).toBe('');
  });
});

describe('inline', () => {
  it('escapes everything it does not know', () => {
    expect(inline('a <b> & c')).toBe('a &lt;b&gt; &amp; c');
  });

  it('marks bold and italic', () => {
    expect(inline('**jako** i *malo*')).toBe('<strong>jako</strong> i <em>malo</em>');
  });

  it('makes links, and leaves the end of a sentence out of a bare address', () => {
    expect(inline('[ovde](example.com)')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener">ovde</a>',
    );
    expect(inline('Vidi https://example.com/a.')).toBe(
      'Vidi <a href="https://example.com/a" target="_blank" rel="noopener">https://example.com/a</a>.',
    );
  });

  it('keeps a link that goes nowhere as plain text', () => {
    expect(inline('[klik](javascript:alert)')).toBe('[klik](javascript:alert)');
  });

  it('drops links on a colored card, and keeps the words', () => {
    expect(inline('[ovde](https://example.com) i https://a.rs', { links: false })).toBe('ovde i https://a.rs');
  });

  it('escapes what is inside the marks too', () => {
    expect(inline('**<b>**')).toBe('<strong>&lt;b&gt;</strong>');
    expect(inline('[<b>](https://a.rs)')).toContain('>&lt;b&gt;</a>');
  });
});

describe('paragraphs', () => {
  it('starts a paragraph at an empty line and a line break at a new line', () => {
    expect(paragraphs('prvi\nred\n\n  \n\ndrugi')).toBe('<p>prvi<br>red</p><p>drugi</p>');
  });

  it('gives each one the style', () => {
    expect(paragraphs('a\n\nb', 'margin: 0;')).toBe('<p style="margin: 0;">a</p><p style="margin: 0;">b</p>');
  });

  it('makes nothing of nothing', () => {
    expect(paragraphs('  \n ')).toBe('');
  });
});

describe('clip', () => {
  it('fits the name of a group', () => {
    const name = clip('a'.repeat(200));

    expect(name).toHaveLength(120);
    expect(name.endsWith('…')).toBe(true);
  });

  it('leaves a short text on one line', () => {
    expect(clip('  prvi\n drugi ')).toBe('prvi drugi');
  });
});

describe('hostOf', () => {
  it('names the site', () => {
    expect(hostOf('https://www.example.com/a')).toBe('example.com');
    expect(hostOf('')).toBe('');
  });
});
