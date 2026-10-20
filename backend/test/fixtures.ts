import { crc32, deflateSync } from 'node:zlib';

/** A real, decodable PNG (RGB, all black) built from scratch. */
export function makePng(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 3 + 1) * height);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A complete `about` page content (every field filled), labelled so it is recognisable in a test database. */
export function aboutContent(label: string) {
  const item = (n: number) => ({
    title: `${label} title ${n}`,
    text: `${label} text ${n}`,
  });
  return {
    hero: { title: `${label} About`, lead: `${label} lead` },
    purpose: {
      eyebrow: `${label} eyebrow`,
      title: `${label} purpose`,
      intro: `${label} intro`,
    },
    vision: {
      label: 'Vision',
      quote: `${label} quote`,
      goalTitle: `${label} goal`,
      goalText: `${label} goal text`,
      markets: [{ name: 'Singapore', flag: '🇸🇬' }],
    },
    mission: {
      label: 'Mission',
      title: `${label} mission`,
      text: `${label} mission text`,
      highlights: [item(1)],
    },
    values: { title: `${label} values`, items: [item(1), item(2)] },
    team: {
      eyebrow: `${label} team eyebrow`,
      title: `${label} team`,
      intro: `${label} team intro`,
      members: [
        {
          name: 'Test Person',
          role: 'Founder',
          badge: '10 Years',
          bio: `${label} bio`,
          specialties: ['Trade'],
        },
      ],
      closingTitle: `${label} closing`,
      closingText: `${label} closing text`,
      ctaLabel: 'Partner with us',
    },
  };
}
