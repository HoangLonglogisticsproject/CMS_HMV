import { loadConfig } from './config';

describe('loadConfig: production refuses development defaults', () => {
  const prod = {
    NODE_ENV: 'production',
    CORS_ORIGIN: 'https://cms.hmvglobal.com',
    MEDIA_PUBLIC_BASE_URL: 'https://media.hmvglobal.com',
  };

  it('accepts explicit https, non-local origins', () => {
    const config = loadConfig(prod);
    expect(config).toMatchObject({
      isProduction: true,
      corsOrigins: ['https://cms.hmvglobal.com'],
    });
  });

  it.each([
    [{ CORS_ORIGIN: undefined }, 'CORS_ORIGIN'],
    [{ CORS_ORIGIN: 'http://localhost:3000' }, 'CORS_ORIGIN'],
    [{ CORS_ORIGIN: 'http://cms.hmvglobal.com' }, 'CORS_ORIGIN'],
    [
      { CORS_ORIGIN: 'https://cms.hmvglobal.com,https://127.0.0.1' },
      'CORS_ORIGIN',
    ],
    [{ MEDIA_PUBLIC_BASE_URL: undefined }, 'MEDIA_PUBLIC_BASE_URL'],
    [
      { MEDIA_PUBLIC_BASE_URL: 'http://localhost:4000/media-files' },
      'MEDIA_PUBLIC_BASE_URL',
    ],
  ])('rejects %o', (override, variable) => {
    expect(() => loadConfig({ ...prod, ...override })).toThrow(variable);
  });

  it('keeps the localhost defaults for development and tests', () => {
    expect(loadConfig({ NODE_ENV: 'development' }).corsOrigins).toEqual([
      'http://localhost:3000',
    ]);
    expect(loadConfig({ NODE_ENV: 'test' }).isProduction).toBe(false);
  });
});
