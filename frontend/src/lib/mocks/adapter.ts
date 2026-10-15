import {
  MOCK_DASHBOARD_METRICS,
  MOCK_RECENT_ACTIVITIES,
  MOCK_COMMODITIES,
  MOCK_SUPPLY_CHAIN_STAGES,
  MOCK_PAGES,
} from "./fixtures";
import {
  DashboardMetrics,
  RecentContentActivity,
  CommodityItem,
  SupplyChainStageItem,
  PageContentItem,
} from "./types";

// In-memory persistent state during client session
const currentStages = [...MOCK_SUPPLY_CHAIN_STAGES];
const currentCommodities = [...MOCK_COMMODITIES];
const currentPages = [...MOCK_PAGES];

export const cmsMockApi = {
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    return new Promise((resolve) => setTimeout(() => resolve(MOCK_DASHBOARD_METRICS), 40));
  },

  async getRecentActivities(): Promise<RecentContentActivity[]> {
    return new Promise((resolve) => setTimeout(() => resolve(MOCK_RECENT_ACTIVITIES), 40));
  },

  async getCommodities(): Promise<CommodityItem[]> {
    return new Promise((resolve) => setTimeout(() => resolve([...currentCommodities]), 40));
  },

  async updateCommodity(id: string, payload: Partial<CommodityItem>): Promise<CommodityItem> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const idx = currentCommodities.findIndex((c) => c.id === id);
        if (idx === -1) return reject(new Error("Commodity not found"));
        currentCommodities[idx] = { ...currentCommodities[idx], ...payload, updatedAt: "Vừa xong" };
        resolve(currentCommodities[idx]);
      }, 80);
    });
  },

  async getSupplyChainStages(): Promise<SupplyChainStageItem[]> {
    return new Promise((resolve) => setTimeout(() => resolve([...currentStages]), 40));
  },

  async updateSupplyChainStage(
    id: string,
    payload: Partial<SupplyChainStageItem>
  ): Promise<SupplyChainStageItem> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const idx = currentStages.findIndex((s) => s.id === id);
        if (idx === -1) return reject(new Error("Stage not found"));
        currentStages[idx] = { ...currentStages[idx], ...payload };
        resolve(currentStages[idx]);
      }, 80);
    });
  },

  async getPages(): Promise<PageContentItem[]> {
    return new Promise((resolve) => setTimeout(() => resolve([...currentPages]), 40));
  },

  async getPageById(id: string): Promise<PageContentItem | null> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const page = currentPages.find((p) => p.id === id);
        resolve(page ? JSON.parse(JSON.stringify(page)) : null);
      }, 40);
    });
  },

  async updatePage(id: string, payload: Partial<PageContentItem>): Promise<PageContentItem> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const idx = currentPages.findIndex((p) => p.id === id);
        if (idx === -1) return reject(new Error("Page not found"));
        currentPages[idx] = {
          ...currentPages[idx],
          ...payload,
          updatedAt: "Vừa xong",
        };
        resolve(JSON.parse(JSON.stringify(currentPages[idx])));
      }, 80);
    });
  },
};
