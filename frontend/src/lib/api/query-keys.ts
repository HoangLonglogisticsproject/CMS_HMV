export const queryKeys = {
  // Real API (NestJS). The whole cache is cleared on login/logout/session expiry, so keys need no user id.
  auth: {
    session: ["auth", "session"] as const,
  },
  pages: {
    list: ["pages", "list"] as const,
    detail: (key: string) => ["pages", "detail", key] as const,
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
  users: {
    all: ["users"] as const,
    list: ["users", "list"] as const,
    roles: ["users", "roles"] as const,
    events: ["users", "security-events"] as const,
  },
  inquiries: {
    all: ["inquiries"] as const,
    lists: ["inquiries", "list"] as const,
    list: (params: Record<string, unknown>) => ["inquiries", "list", params] as const,
    stats: ["inquiries", "stats"] as const,
    detail: (id: string) => ["inquiries", "detail", id] as const,
    assignees: ["inquiries", "assignees"] as const,
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
};
