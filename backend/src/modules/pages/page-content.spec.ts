import 'reflect-metadata'; // class-transformer decorators need it; Nest loads it in the app
import { aboutContent } from '../../../test/fixtures';
import { missingFields, validatePageContent } from './page-content.dto';

describe('validatePageContent (about)', () => {
  it('accepts a complete page and an incomplete draft', async () => {
    expect(
      await validatePageContent('about', aboutContent('T'), 'content'),
    ).toEqual([]);
    const draft = aboutContent('');
    draft.hero.title = '';
    draft.team.members = [];
    expect(await validatePageContent('about', draft, 'content')).toEqual([]);
  });

  it('rejects unknown fields, wrong types, oversized text and long lists with exact paths', async () => {
    const bad = aboutContent('T') as Record<string, any>;
    bad.layout = 'grid';
    bad.hero.html = '<b>x</b>';
    bad.vision.quote = 42;
    bad.purpose.title = 'x'.repeat(161);
    bad.values.items = Array.from({ length: 9 }, () => ({
      title: 'a',
      text: 'b',
    }));
    bad.team.members[0].specialties = [1];
    const paths = (await validatePageContent('about', bad, 'content')).map(
      (i) => i.path,
    );
    expect(paths).toEqual(
      expect.arrayContaining([
        'content.layout',
        'content.hero.html',
        'content.vision.quote',
        'content.purpose.title',
        'content.values.items',
        'content.team.members.0.specialties',
      ]),
    );
  });

  it('requires every section', async () => {
    const { team: _team, ...rest } = aboutContent('T');
    expect(
      (await validatePageContent('about', rest, 'c')).map((i) => i.path),
    ).toContain('c.team');
  });

  it('has no content type for unknown pages', async () => {
    expect(await validatePageContent('home', {}, 'c')).toEqual([
      { path: 'c', message: 'No content type for page "home"' },
    ]);
  });
});

describe('missingFields', () => {
  it('is empty for a complete page', () => {
    expect(missingFields(aboutContent('T'))).toEqual([]);
  });

  it('lists blank text and empty lists', () => {
    const c = aboutContent('T');
    c.hero.title = '   ';
    c.vision.markets = [];
    c.team.members[0].specialties = [''];
    expect(missingFields(c)).toEqual([
      { path: 'content.hero.title', message: 'Required' },
      { path: 'content.vision.markets', message: 'Add at least one item' },
      { path: 'content.team.members[0].specialties[0]', message: 'Required' },
    ]);
  });
});
