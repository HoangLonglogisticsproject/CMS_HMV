export const queryKeys = {
  // Real API (NestJS). The whole cache is cleared on login/logout/session expiry, so keys need no user id.
  auth: {
    session: ["auth", "session"] as const,
  },
  articles: {
    all: ["articles"] as const,
    lists: ["articles", "list"] as const,
    list: (params: Record<string, unknown>) => ["articles", "list", params] as const,
    stats: ["articles", "stats"] as const,
    detail: (id: string) => ["articles", "detail", id] as const,
    preview: (id: string, locale: string) => ["articles", "preview", id, locale] as const,
    categories: ["articles", "categories"] as const,
  },
  media: {
    all: ["media"] as const,
    lists: ["media", "list"] as const,
    list: (params: Record<string, unknown>) => ["media", "list", params] as const,
    usages: (id: string) => ["media", "usages", id] as const,
  },

  // Still served by the mock adapter (no backend API yet).
  dashboard: {
    metrics: ["dashboard", "metrics"] as const,
    activities: ["dashboard", "activities"] as const,
  },
  commodities: {
    all: ["commodities"] as const,
    list: (filters: { search?: string; locale?: string }) =>
      ["commodities", "list", filters] as const,
    detail: (id: string, locale: string) =>
      ["commodities", "detail", id, locale] as const,
  },
  stages: {
    all: ["supply-chain", "stages"] as const,
    list: (locale: string) => ["supply-chain", "stages", locale] as const,
    detail: (id: string, locale: string) =>
      ["supply-chain", "stages", id, locale] as const,
  },
  pages: {
    all: ["pages"] as const,
    list: (locale: string) => ["pages", "list", locale] as const,
    detail: (id: string, locale: string) => ["pages", "detail", id, locale] as const,
  },
};
