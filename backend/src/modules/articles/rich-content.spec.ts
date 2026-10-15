import {
  collectMediaIds,
  countWords,
  hydrateContent,
  isSafeHref,
  stableStringify,
  validateRichContent,
} from './rich-content';

const MEDIA_ID = '0199f3a0-0000-7000-8000-000000000001';
const doc = (...content: unknown[]) => ({ type: 'doc', content });
const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (t: string, marks?: unknown[]) =>
  marks ? { type: 'text', text: t, marks } : { type: 'text', text: t };
const link = (href: string, extra: Record<string, unknown> = {}) => ({
  type: 'link',
  attrs: { href, ...extra },
});

function issues(input: unknown) {
  const r = validateRichContent(input);
  return r.ok ? [] : r.issues;
}

describe('validateRichContent', () => {
  it('accepts what the CMS editor emits (Tiptap StarterKit + Link + Image defaults)', () => {
    const input = doc(
      { type: 'heading', attrs: { level: 2 }, content: [text('Tiêu đề')] },
      p(
        text('Xem '),
        text('báo cáo', [
          { type: 'bold' },
          link('https://hmv.example/r', {
            target: '_blank',
            rel: 'noopener noreferrer nofollow',
            class: 'text-[#087EC2] underline',
            title: null,
          }),
        ]),
      ),
      { type: 'blockquote', content: [p(text('Trích dẫn'))] },
      {
        type: 'bulletList',
        content: [{ type: 'listItem', content: [p(text('Một'))] }],
      },
      {
        type: 'orderedList',
        attrs: { start: 1, type: null },
        content: [{ type: 'listItem', content: [p(text('Hai'))] }],
      },
      {
        type: 'image',
        attrs: {
          src: 'https://cdn.example/x.jpg',
          alt: 'Cà phê',
          title: null,
          width: null,
          height: null,
          mediaId: MEDIA_ID,
        },
      },
      {
        type: 'codeBlock',
        attrs: { language: null },
        content: [text('x = 1')],
      },
      { type: 'horizontalRule' },
      p(),
    );
    const r = validateRichContent(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.mediaIds).toEqual([MEDIA_ID]);
    const image = (r.doc.content as any[])[5];
    expect(image.attrs.src).toBeUndefined(); // src is re-resolved from mediaId, never stored
    const linkMark = (r.doc.content as any[])[1].content[1].marks[1];
    expect(linkMark.attrs.class).toBeUndefined();
    expect(linkMark.attrs.href).toBe('https://hmv.example/r');
  });

  it.each([
    ['javascript:alert(1)'],
    ['JaVaScRiPt:alert(1)'],
    ['java\tscript:alert(1)'],
    [' javascript:alert(1)'],
    ['data:text/html;base64,PHNjcmlwdD4='],
    ['vbscript:msgbox(1)'],
    ['//evil.example/x'],
    ['relative/path'],
  ])('rejects unsafe link href %j', (href) => {
    expect(issues(doc(p(text('x', [link(href)]))))[0].path).toBe(
      '.content[0].content[0].marks[0].attrs.href',
    );
  });

  it.each([
    ['https://a.example'],
    ['http://a.example/x?y=1'],
    ['mailto:sales@hmv.example'],
    ['tel:+84123'],
    ['/vi/tin-tuc'],
    ['#section'],
  ])('accepts safe href %j', (href) => expect(isSafeHref(href)).toBe(true));

  it('rejects unknown node types, marks, attributes and fields with a path', () => {
    expect(
      issues(doc({ type: 'script', content: [text('alert(1)')] })),
    ).toEqual([
      { path: '.content[0]', message: 'Node type "script" is not supported' },
    ]);
    expect(issues(doc(p(text('x', [{ type: 'highlight' }]))))[0].path).toBe(
      '.content[0].content[0].marks[0]',
    );
    expect(
      issues(doc({ type: 'paragraph', attrs: { onclick: 'x' } }))[0].path,
    ).toBe('.content[0].attrs.onclick');
    expect(issues(doc({ type: 'paragraph', html: '<b>x</b>' }))[0].path).toBe(
      '.content[0].html',
    );
  });

  it('enforces structure', () => {
    expect(issues({ type: 'paragraph' })[0].message).toMatch(
      /not allowed here/,
    );
    expect(issues(doc())[0].message).toMatch(/at least 1/);
    expect(
      issues(
        doc({ type: 'heading', attrs: { level: 1 }, content: [text('H1')] }),
      )[0].path,
    ).toBe('.content[0].attrs.level');
    expect(issues(doc(p({ type: 'paragraph' })))[0].message).toMatch(
      /not allowed here/,
    );
    expect(issues(doc(p(text(''))))[0].path).toBe(
      '.content[0].content[0].text',
    );
    expect(
      issues(doc({ type: 'horizontalRule', content: [text('x')] }))[0].path,
    ).toBe('.content[0].content');
  });

  it('requires images to reference the media library', () => {
    expect(
      issues(
        doc({
          type: 'image',
          attrs: { src: 'https://tracker.example/pixel.gif' },
        }),
      ),
    ).toEqual([
      {
        path: '.content[0].attrs.mediaId',
        message: 'Attribute "mediaId" is required',
      },
    ]);
    expect(
      issues(doc({ type: 'image', attrs: { mediaId: 'not-a-uuid' } }))[0].path,
    ).toBe('.content[0].attrs.mediaId');
  });

  it('limits size and depth', () => {
    expect(issues(doc(p(text('x'.repeat(300 * 1024)))))[0].message).toMatch(
      /exceeds/,
    );
    let deep: unknown = p(text('x'));
    for (let i = 0; i < 40; i++) deep = { type: 'blockquote', content: [deep] };
    expect(issues(doc(deep)).some((i) => /nested deeper/.test(i.message))).toBe(
      true,
    );
  });
});

describe('content helpers', () => {
  const stored = doc(p(text('Một hai ba')), {
    type: 'image',
    attrs: { mediaId: MEDIA_ID, alt: null },
  });

  it('counts words and collects media', () => {
    expect(countWords(stored)).toBe(3);
    expect(collectMediaIds(stored)).toEqual([MEDIA_ID]);
  });

  it('hydrates image src and default alt without mutating the stored doc', () => {
    const out = hydrateContent(stored, () => ({
      url: 'https://cdn/x.png',
      alt: 'Mặc định',
    })) as any;
    expect(out.content[1].attrs).toEqual({
      mediaId: MEDIA_ID,
      alt: 'Mặc định',
      src: 'https://cdn/x.png',
    });
    expect((stored.content[1] as any).attrs.src).toBeUndefined();
  });

  it('stableStringify ignores key order', () => {
    expect(
      stableStringify({ b: 1, a: { d: [1, { y: 2, x: 1 }], c: null } }),
    ).toBe(stableStringify({ a: { c: null, d: [1, { x: 1, y: 2 }] }, b: 1 }));
  });
});
