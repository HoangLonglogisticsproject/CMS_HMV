import {
  MOCK_DASHBOARD_METRICS,
  MOCK_RECENT_ACTIVITIES,
  MOCK_COMMODITIES,
  MOCK_SUPPLY_CHAIN_STAGES,
} from "./fixtures";
import {
  DashboardMetrics,
  RecentContentActivity,
  CommodityItem,
  SupplyChainStageItem,
} from "./types";

// In-memory persistent state during client session
const currentStages = [...MOCK_SUPPLY_CHAIN_STAGES];
const currentCommodities = [...MOCK_COMMODITIES];

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
};
