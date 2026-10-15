import {
  LayoutDashboard,
  Layers,
  Boxes,
  Sparkles,
  ShieldCheck,
  FileText,
  Newspaper,
  Image as ImageIcon,
  Compass,
  Languages,
  SearchCode,
  Send,
  Users,
  Settings,
  ListTodo,
  type LucideIcon,
} from "lucide-react";
import type { Permission } from "@/modules/auth/queries/use-session";

export interface NavItemConfig {
  id: string;
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
  /** Permission required (if any) from session RBAC */
  permission?: Permission;
  /** True only if route actually exists and works in Next.js App Router */
  isActiveRoute: boolean;
  /** Description for roadmap documentation */
  roadmapDescription?: string;
  targetMilestone?: string;
}

export interface NavGroupConfig {
  id: string;
  label: string;
  items: NavItemConfig[];
}

/**
 * Target Enterprise Information Architecture (IA) for HMV Global CMS.
 * Represents the complete product vision.
 */
export const TARGET_NAVIGATION_IA: NavGroupConfig[] = [
  {
    id: "workspace",
    label: "WORKSPACE",
    items: [
      {
        id: "overview",
        title: "Tổng quan",
        href: "/",
        icon: LayoutDashboard,
        isActiveRoute: true,
      },
      {
        id: "tasks",
        title: "Việc cần xử lý",
        href: "/workspace/tasks",
        icon: ListTodo,
        isActiveRoute: false,
        roadmapDescription: "Danh sách công việc chờ duyệt, nội dung cần phản hồi và thông báo tác vụ cá nhân.",
        targetMilestone: "Milestone Q3-Workflow",
      },
    ],
  },
  {
    id: "supply-chain",
    label: "CHUỖI CUNG ỨNG",
    items: [
      {
        id: "stages",
        title: "Hành trình chuỗi cung ứng",
        href: "/supply-chain/stages",
        icon: Layers,
        isActiveRoute: true,
      },
      {
        id: "commodities",
        title: "Nông sản & sản phẩm",
        href: "/supply-chain/commodities",
        icon: Boxes,
        isActiveRoute: true,
      },
      {
        id: "capabilities",
        title: "Năng lực chế biến",
        href: "/supply-chain/capabilities",
        icon: Sparkles,
        isActiveRoute: false,
        roadmapDescription: "Hồ sơ đối tác chế biến công nghệ cao và cụm nhà máy liên kết vùng trồng.",
        targetMilestone: "Milestone Q3-Processing",
      },
      {
        id: "quality",
        title: "Chất lượng & tiêu chuẩn",
        href: "/supply-chain/quality",
        icon: ShieldCheck,
        isActiveRoute: false,
        roadmapDescription: "Hệ thống chứng chỉ GlobalGAP, HACCP, ISO và kiểm nghiệm chất lượng xuất khẩu.",
        targetMilestone: "Milestone Q3-Quality",
      },
    ],
  },
  {
    id: "website-content",
    label: "NỘI DUNG WEBSITE",
    items: [
      {
        id: "pages",
        title: "Trang website",
        href: "/content/pages",
        icon: FileText,
        isActiveRoute: true,
      },
      {
        id: "articles",
        title: "EcoNews",
        href: "/content/articles",
        icon: Newspaper,
        permission: "article:read",
        isActiveRoute: true,
      },
      {
        id: "media",
        title: "Thư viện media",
        href: "/content/media",
        icon: ImageIcon,
        permission: "media:read",
        isActiveRoute: true,
      },
      {
        id: "navigation",
        title: "Menu website",
        href: "/content/navigation",
        icon: Compass,
        isActiveRoute: false,
        roadmapDescription: "Cấu hình cấu trúc Mega Menu Header, Footer links và Call-To-Action toàn trang.",
        targetMilestone: "Milestone Q4-SiteNav",
      },
    ],
  },
  {
    id: "publishing-quality",
    label: "XUẤT BẢN & CHẤT LƯỢNG",
    items: [
      {
        id: "publishing",
        title: "Phê duyệt & xuất bản",
        href: "/global/publishing",
        icon: Send,
        isActiveRoute: false,
        roadmapDescription: "Hội đồng kiểm duyệt biên tập, release calendar và lịch xuất bản tự động.",
        targetMilestone: "Milestone Q4-GovPublish",
      },
      {
        id: "localization",
        title: "Đa ngôn ngữ",
        href: "/global/localization",
        icon: Languages,
        isActiveRoute: false,
        roadmapDescription: "Từ điển thuật ngữ nông nghiệp song ngữ EN/VI và kiểm tra tính hoàn chỉnh bản dịch.",
        targetMilestone: "Milestone Q4-Localization",
      },
      {
        id: "seo",
        title: "SEO",
        href: "/global/seo",
        icon: SearchCode,
        isActiveRoute: false,
        roadmapDescription: "Quản trị sitemap XML, robots.txt, schema.org và open-graph metadata.",
        targetMilestone: "Milestone Q4-SEOEngine",
      },
    ],
  },
  {
    id: "system",
    label: "HỆ THỐNG",
    items: [
      {
        id: "users",
        title: "Người dùng & phân quyền",
        href: "/admin/users",
        icon: Users,
        isActiveRoute: false,
        roadmapDescription: "Quản trị danh sách nhân sự, phân nhóm quyền RBAC và lịch sử hoạt động.",
        targetMilestone: "Milestone Q4-AdminRBAC",
      },
      {
        id: "settings",
        title: "Cài đặt",
        href: "/admin/settings",
        icon: Settings,
        isActiveRoute: false,
        roadmapDescription: "Cấu hình tên miền, email service, webhook và cache purge.",
        targetMilestone: "Milestone Q4-Settings",
      },
    ],
  },
];

/**
 * Filtered navigation groups that only include items with ACTIVE, operational routes.
 * Prevents 404s, fake interfaces, or decorative dead clicks.
 */
export const ACTIVE_NAVIGATION_GROUPS: NavGroupConfig[] = TARGET_NAVIGATION_IA
  .map((group) => ({
    ...group,
    items: group.items.filter((item) => item.isActiveRoute),
  }))
  .filter((group) => group.items.length > 0);

/**
 * All roadmap features documented for transparency & handover.
 */
export const ROADMAP_FEATURES = TARGET_NAVIGATION_IA.flatMap((group) =>
  group.items
    .filter((item) => !item.isActiveRoute)
    .map((item) => ({
      groupLabel: group.label,
      title: item.title,
      plannedRoute: item.href,
      description: item.roadmapDescription,
      milestone: item.targetMilestone,
    }))
);
