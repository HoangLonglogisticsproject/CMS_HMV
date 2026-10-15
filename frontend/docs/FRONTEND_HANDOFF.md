# HMV Global CMS — Frontend Handoff & Architecture Contract
*Updated for Final Stack: shadcn/ui + Tailwind CSS + TanStack Query + TanStack Table v8 + React Hook Form + Zod*

## 1. Vai Trò & Phân Định Trách Nhiệm

- **Antigravity (Principal Frontend Architect & Studio Designer)**:
  - Sở hữu độc quyền thư mục `frontend/`.
  - Triển khai toàn diện stack hiện đại: shadcn/ui primitives, Tailwind CSS (B2B SaaS Blue Ocean theme), TanStack Query (@tanstack/react-query), TanStack Table (@tanstack/react-table v8), React Hook Form và Zod schemas.
  - Thiết kế và hoàn thiện Premium Content Management Workspace: Supply Chain Story Editor 3-panel, Commodities Table & Drawer Editor, Pages Management, Modern Executive Dashboard.
  - Đảm bảo strict type safety (`tsc --noEmit`), zero hydration issues, zero React/Next.js overlay warnings, và production build thành công.
- **Claude (Backend & Integration Lead)**:
  - Sở hữu `backend/`, NestJS API, PostgreSQL, Prisma ORM, Authentication session/cookies, RBAC authorization.
  - Sẽ cung cấp các REST API endpoints chính thức theo contracts đã định hình dưới đây để thay thế adapter mock layer.

---

## 2. Frontend State Architecture & TanStack Query Keys

Kiến trúc phân tách state rõ ràng:
- **Server State**: Quản lý bởi `@tanstack/react-query` thông qua QueryClient Provider tại root layout (`staleTime: 3m`, `gcTime: 10m`).
- **Form State**: Quản lý bởi `react-hook-form` kết hợp `zodResolver(schema)`. Tách biệt hoàn toàn khỏi query cache để tránh mất dirty state khi switch tab/locale.
- **UI State**: React local state (active stage selection, drawer open/close, column filters).

### Query Key Factory (`src/lib/api/query-keys.ts`)

```typescript
export const queryKeys = {
  dashboard: {
    all: ['dashboard'] as const,
    metrics: () => [...queryKeys.dashboard.all, 'metrics'] as const,
    activities: () => [...queryKeys.dashboard.all, 'activities'] as const,
  },
  supplyChain: {
    all: ['supply-chain'] as const,
    stages: (locale: string) => [...queryKeys.supplyChain.all, 'stages', locale] as const,
    stageDetail: (id: string, locale: string) => [...queryKeys.supplyChain.all, 'stages', id, locale] as const,
    commodities: (filters?: Record<string, unknown>) => [...queryKeys.supplyChain.all, 'commodities', filters] as const,
    commodityDetail: (id: string) => [...queryKeys.supplyChain.all, 'commodities', id] as const,
  },
  content: {
    all: ['content'] as const,
    pages: (filters?: Record<string, unknown>) => [...queryKeys.content.all, 'pages', filters] as const,
    pageDetail: (id: string) => [...queryKeys.content.all, 'pages', id] as const,
    articles: (filters?: Record<string, unknown>) => [...queryKeys.content.all, 'articles', filters] as const,
  },
};
```

---

## 3. Data Contracts & Adapter Boundaries

> **Trạng thái tích hợp (14/10/2026, Claude):** Đăng nhập, EcoNews (Articles) và Thư viện Media đã chạy với NestJS API
> thật + PostgreSQL. Hợp đồng và bản đồ mã nguồn: `docs/api/admin-integration-contract.md`. Dashboard, Pages,
> Commodities và Supply Chain Stages vẫn dùng mock adapter cho tới khi có API. Mock cho Articles/Media đã được xoá để
> không trộn dữ liệu demo với dữ liệu thật. Các mục 3.5 và 3.6 bên dưới là đề xuất ban đầu, không còn là hợp đồng.

Tất cả các module kết nối dữ liệu qua Data Access Layer:
```
UI Components (Story Studio, Commodities, Pages, Dashboard)
    ↓
Feature Query Hooks (useQuery, useMutation)
    ↓
Data Adapter (src/lib/mocks/adapter.ts)
    ↓
In-Memory Store (src/lib/mocks/fixtures.ts)
```

Khi Claude tích hợp NestJS API thật, chỉ cần cập nhật các method trong `src/lib/mocks/adapter.ts` (hoặc switch sang `src/lib/api/http-client.ts`) để gửi HTTP requests tới backend. Toàn bộ logic invalidation, UI rendering và form handling đã sẵn sàng 100%.

### 3.1. Supply Chain Story Editor (`/supply-chain/stages`)

**Domain Model (Chuẩn hóa 6 công đoạn thực tế):**
1. `ORIGIN`: Vùng Nguyên Liệu Bản Địa (Agricultural Origins)
2. `RAW_MATERIALS`: Thu Gom & Sơ Chế Nguyên Liệu (Raw Material Sourcing)
3. `PROCESSING`: Chế Biến & Đóng Gói Tiêu Chuẩn (Processing & Manufacturing)
4. `QUALITY`: Kiểm Định Chất Lượng & Chứng Nhận (Quality & Specifications)
5. `TRADE`: Thương Mại Quốc Tế & Logistics (International Trade)
6. `GLOBAL_DELIVERY`: Giao Hàng Toàn Cầu & Khách Hàng Quốc Tế (Global Delivery)

*Lưu ý kiến trúc:* Các công nghệ chế biến sâu (Freeze-drying, Supercritical CO2) được định nghĩa là **Processing Pathways / Capability Tiers** (`DIRECT_OPERATION`, `STRATEGIC_PARTNER`, `IN_DEVELOPMENT`), không phải stage thứ sáu.

**Expected Endpoints:**
- `GET /api/v1/admin/supply-chain/stages?locale=vi|en`
  - Response: `Array<SupplyChainStageViewModel>`
- `PUT /api/v1/admin/supply-chain/stages/:id`
  - Body:
    ```json
    {
      "title": "string",
      "subtitle": "string",
      "description": "string",
      "capabilityTier": "DIRECT_OPERATION" | "STRATEGIC_PARTNER" | "IN_DEVELOPMENT",
      "highlightMetric": "string",
      "status": "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "ARCHIVED",
      "locale": "vi" | "en"
    }
    ```
  - Response: Updated `SupplyChainStageViewModel`

### 3.2. Commodities & Product Variants (`/supply-chain/commodities`)

**Bảng dữ liệu:** Quản lý bằng TanStack Table v8 với client-side filtering, column sorting và pagination.
**Modal/Sheet:** Slide-over Drawer biên tập nhanh (tên, vùng nguyên liệu, quy cách xuất khẩu, tiêu chuẩn chất lượng).

**Expected Endpoints:**
- `GET /api/v1/admin/commodities?page=1&limit=20&search=`
  - Response: `{ items: Commodity[], total: number }`
- `PUT /api/v1/admin/commodities/:id`
  - Body: `Partial<Commodity>`
  - Response: Updated `Commodity`

### 3.3. Content Pages & Section Studio Management (`/content/pages` & `/content/pages/:id`)

**Bảng dữ liệu:** Quản lý toàn diện các landing page chính bằng TanStack Table v8:
- Metric strip thống kê số lượng trang, trạng thái xuất bản, độ phủ song ngữ và SEO Readiness TB.
- Bộ lọc kết hợp: Search keyword (title, slug, systemKey), Content Type (`LANDING`, `SUPPLY_CHAIN`, `CATALOG`, `STANDARDS`), Publication Status.
- Kiểm định SEO dựa trên checklist chuẩn 5 tiêu chí kỹ thuật (không dùng điểm số tùy tiện).

**Page Editor Workspace (`/content/pages/[id]`):**
- Sticky Top Toolbar: Breadcrumb, tiêu đề trang, bộ chuyển ngữ độc lập VI/EN (không làm mất draft state khi chuyển tab), unsaved dirty indicator, Reset, Xem trước (Internal Template Preview) và Lưu bản nháp (Demo).
- Section Studio: Quản lý danh sách các khối nội dung có thứ tự, Reorder Up/Down, Thêm mới khối (Proposed Schema: `HERO`, `STORY_INTRO`, `CAPABILITY_GRID`, `METRICS_STRIP`, `CTA_BANNER`), biên tập Heading, Subtitle, Description, CTA text/url, Media image reference.
- Contextual Inspector: Rule-based SEO checklist (Meta Title 25-65 ký tự, Meta Description 50-160 ký tự, Canonical URL, OG Image, Keywords), Localization health (% hoàn thiện VI và EN), System metadata.

**Expected Endpoints:**
- `GET /api/v1/admin/pages?locale=vi|en`
  - Response: `Array<PageContentItem>`
- `GET /api/v1/admin/pages/:id`
  - Response: `PageContentItem`
- `PUT /api/v1/admin/pages/:id`
  - Body:
    ```json
    {
      "titleVi": "string",
      "titleEn": "string",
      "slugVi": "string",
      "slugEn": "string",
      "contentType": "LANDING" | "SUPPLY_CHAIN" | "CATALOG" | "STANDARDS" | "EDITORIAL",
      "status": "DRAFT" | "IN_REVIEW" | "APPROVED" | "PUBLISHED" | "ARCHIVED",
      "sections": [
        {
          "id": "string",
          "sectionType": "HERO" | "STORY_INTRO" | "CAPABILITY_GRID" | "METRICS_STRIP" | "CTA_BANNER",
          "titleVi": "string",
          "titleEn": "string",
          "subtitleVi": "string",
          "subtitleEn": "string",
          "descriptionVi": "string",
          "descriptionEn": "string",
          "ctaTextVi": "string",
          "ctaTextEn": "string",
          "ctaUrl": "string",
          "mediaUrl": "string",
          "mediaAlt": "string",
          "order": 1,
          "isActive": true
        }
      ],
      "seo": {
        "metaTitleVi": "string",
        "metaTitleEn": "string",
        "metaDescriptionVi": "string",
        "metaDescriptionEn": "string",
        "canonicalUrl": "string",
        "ogImageUrl": "string",
        "keywords": ["string"]
      }
    }
    ```
  - Response: Updated `PageContentItem`

### 3.4. Executive Dashboard (`/`)

**Expected Endpoints:**
- `GET /api/v1/admin/dashboard/metrics`
  - Response:
    ```json
    {
      "publishedPages": 14,
      "draftArticles": 8,
      "pendingReview": 3,
      "missingTranslations": 5,
      "seoWarnings": 2,
      "mediaAssets": 142
    }
    ```
- `GET /api/v1/admin/dashboard/activities?limit=10`
  - Response: `Array<ActivityLogItem>`

### 3.5. EcoNews & Article Management (`/content/articles` & `/content/articles/:id`)

> Đã tích hợp API thật. Hợp đồng hiện hành: `docs/api/admin-integration-contract.md` §4 (không còn `status` dropdown, `contentJsonVi/En`, `PUT`/`DELETE`).

**Bảng dữ liệu & Studio:** Quản lý các bài viết chuyên môn phân tích chuỗi cung ứng theo 6 nhóm chuyên mục chính thức:
1. `SUPPLY_CHAIN_INSIGHTS` ("Supply Chain Insights" / "Thông Tin Chuỗi Cung Ứng")
2. `QUALITY_STANDARDS` ("Quality & Agricultural Standards" / "Tiêu Chuẩn Nông Sản & Chất Lượng")
3. `COLD_CHAIN_INTEL` ("Cold Chain Intelligence" / "Bảo Quản & Chuỗi Lạnh")
4. `GLOBAL_TRADE_INVESTMENT` ("Global Trade & Investment" / "Thương Mại & Đầu Tư Quốc Tế")
5. `LOGISTICS_OPERATIONS` ("Trade & Logistics Operations" / "Vận Hành Logistics")
6. `SUSTAINABILITY_ENERGY` ("Sustainability & Renewable Energy" / "Phát Triển Bền Vững & Năng Lượng")

**Article Editor Workspace:**
- Tích hợp **Tiptap Rich-Text Editor**: Soạn thảo headings, paragraphs, lists, quotes, links và chèn ảnh minh họa.
- Lưu trữ nội dung song ngữ độc lập (`contentJsonVi`, `contentJsonEn`) dưới dạng structured **ProseMirror JSON document format**.
- Tích hợp **Media Picker**: Chọn ảnh cover và ảnh chèn nội dung trực tiếp từ thư viện Media Hub.
- Contextual Inspector: SEO checklist (không dùng meta keywords bắt buộc), tiến độ dịch thuật VI/EN, thiết lập thời gian đọc và bài viết nổi bật.

**Expected Endpoints:**
- `GET /api/v1/admin/articles?category=&status=&locale=`
  - Response: `Array<ArticleItem>`
- `GET /api/v1/admin/articles/:id`
  - Response: `ArticleItem`
- `POST /api/v1/admin/articles`
  - Body: `Partial<ArticleItem>`
  - Response: `ArticleItem`
- `PUT /api/v1/admin/articles/:id`
  - Body: `Partial<ArticleItem>`
  - Response: Updated `ArticleItem`
- `DELETE /api/v1/admin/articles/:id`
  - Response: `{ success: true }`

### 3.6. Reusable Media Hub & Picker (`/content/media` & `MediaPickerDialog`)

> Đã tích hợp API thật. Hợp đồng hiện hành: `docs/api/admin-integration-contract.md` §5–6 (upload multipart, alt text theo locale, ảnh Tiptap dùng `mediaId`).

**Kho Media dùng chung:**
- Hỗ trợ xem dạng lưới, lọc theo 5 danh mục: `COMMODITY`, `FACILITY`, `LOGISTICS`, `CERTIFICATE`, `EVENT`.
- Xem trước chi tiết file, kích thước, dung lượng, định dạng và chỉnh sửa Alt text song ngữ VI/EN.
- Component dialog tái sử dụng (`MediaPickerDialog`) có thể gọi từ Article Editor, Page Editor và Commodity Editor.

**Expected Endpoints:**
- `GET /api/v1/admin/media?category=&search=`
  - Response: `Array<MediaAssetItem>`
- `POST /api/v1/admin/media/upload` (Multipart Form-Data)
  - Payload: `file`, `title`, `category`, `altVi`, `altEn`
  - Response: `MediaAssetItem`

---

## 4. Rich Content Data Architecture (ProseMirror JSON)

Nội dung chuyên sâu của bài viết được lưu trữ dưới dạng cấu trúc JSON cây (ProseMirror Schema) thay vì chuỗi raw HTML tiềm ẩn rủi ro:
```json
{
  "type": "doc",
  "content": [
    {
      "type": "heading",
      "attrs": { "level": 2 },
      "content": [{ "type": "text", "text": "Tiêu đề phân tích chuyên sâu" }]
    },
    {
      "type": "paragraph",
      "content": [
        { "type": "text", "text": "Nội dung phân tích thực trạng..." }
      ]
    },
    {
      "type": "blockquote",
      "content": [
        { "type": "paragraph", "content": [{ "type": "text", "text": "Trích dẫn cam kết chất lượng..." }] }
      ]
    },
    {
      "type": "image",
      "attrs": { "src": "https://...", "alt": "Mô tả hình ảnh" }
    }
  ]
}
```
**Quy tắc cho Claude Backend:**
- Trường `contentJsonVi` và `contentJsonEn` lưu dưới dạng cột kiểu `Json` trong Prisma/PostgreSQL.
- Khi render ra frontend công khai hoặc API công cộng, backend có thể trả về JSON trực tiếp hoặc chuyển đổi sang sanitized HTML an toàn.

---

## 5. Verification & Quality Gates Passed

Toàn bộ frontend đã hoàn thành kiểm thử nghiêm ngặt:
1. **Dependency Pinning:** `@tanstack/react-table@8.21.2` (--save-exact) đã được chuẩn hóa trong `package.json` và `pnpm-lock.yaml`.
2. **Type Check:** `tsc --noEmit` ➔ 0 errors.
3. **ESLint:** `eslint --quiet` ➔ 0 errors.
4. **Production Build:** `next build` ➔ Compiled successfully, 100% routes (9/9 routes) statically/dynamically prerendered:
   - `/` (Executive Dashboard)
   - `/supply-chain/stages` (3-Panel Supply Chain Story Studio)
   - `/supply-chain/commodities` (Commodity Management Table)
   - `/content/pages` (Pages & Sections Management)
   - `/content/pages/[id]` (Page Editor Studio)
   - `/content/articles` (EcoNews Article Studio Listing)
   - `/content/articles/[id]` (Premium Article Editor with Tiptap)
   - `/content/media` (Shared Media Hub Gallery)
5. **Interactive Browser Testing:**
   - Hoàn thành trọn vẹn luồng tạo bài viết mới, biên tập Tiptap rich text, chọn ảnh bằng Reusable Media Picker, chuyển đổi song ngữ VI/EN, lưu nháp demo và đồng bộ danh sách.

---

## 6. Việc UI chuyển lại cho Antigravity (từ milestone tích hợp API)

Claude chỉ thêm phần UI tối thiểu để tích hợp chạy được. Các hạng mục sau cần Antigravity thiết kế/hoàn thiện:

1. **Login & các dialog mới**: trang `/login`, dialog "Phiên đăng nhập đã hết hạn" (đăng nhập lại tại chỗ), dialog xung đột
   phiên bản (`RevisionConflictDialog`) — hiện dùng component sẵn có, cần rà soát thẩm mỹ.
2. **Panel quy trình xuất bản** (`ArticleWorkflowPanel`, thay cho dropdown trạng thái trong tab Cài Đặt): trạng thái, huy hiệu
   duyệt theo VI/EN, nút Duyệt/Xuất bản/Lưu trữ/Bỏ lưu trữ. Cần thiết kế lại cho rõ ràng (có thể tách thành khu vực riêng).
3. **Hiển thị lỗi theo trường**: hiện chỉ có dòng lỗi đỏ dưới Tiêu đề và Slug; các lỗi khác hiện qua toast.
4. **Sắp xếp danh sách bài viết**: đã bỏ sắp xếp theo tiêu đề (chỉ sắp xếp được trong trang hiện tại). API hỗ trợ
   `updatedAt`, `createdAt`, `lastPublishedAt` — cần control sắp xếp.
5. **Phân trang thư viện Media**: hiện tải tối đa 100 ảnh mới nhất (có dòng thông báo). Cần phân trang/infinite scroll; bộ lọc
   thiếu danh mục `EVENT`.
6. **Bản xem trước bài viết**: renderer trong `ArticlePreviewDialog` chưa hiển thị danh sách, in đậm/nghiêng, liên kết, code,
   đường kẻ ngang.
7. **Trường chỉ đọc**: "Thời Gian Đọc" (tự tính từ nội dung đã lưu) và "Canonical URL" (tự tạo từ slug) giờ là ô chỉ đọc —
   nên trình bày dạng thông tin thay vì ô nhập.
8. **Khu vực còn dữ liệu demo**: Dashboard, Pages, Commodities, Stages vẫn là mock; badge "CMS Demo Workspace" trên header nên
   chỉ rõ phần nào là demo.
9. **Cảnh báo rời trang khi chưa lưu** (unsaved changes guard) cho trình soạn thảo.
10. **Danh sách bài viết**: cột "Bản Dịch" mới có tooltip trạng thái duyệt; cân nhắc hiển thị trực quan (Đã duyệt / Đang công khai).

