# HMV Global CMS — Architecture Overview

## 1. Domain & Business Model
HMV Global operates as an **Integrated Agricultural Supply Chain & Global Trading** platform in Vietnam, orchestrating:
- Raw agricultural material sourcing (Coffee, Rice, Cashew, Spices, Fruits).
- Processing capabilities (Tier-categorized: Direct Operation, Strategic Partner, In Development).
- Quality standards & export certifications (GlobalGAP, HACCP, ISO, Organic, Halal).
- Supply chain storytelling & stages (from farm to international port).

## 2. Monorepo Topology
```
CMS_HMV/
├── frontend/                # Next.js App Router (Bright Blue Ocean Enterprise Admin)
│   ├── src/
│   │   ├── app/             # Routing, layouts, composition
│   │   ├── modules/         # Feature business UI (supply-chain, content, media, publishing)
│   │   ├── components/      # UI primitives & layouts
│   │   └── lib/             # API client, auth, utils
├── backend/                 # NestJS modular architecture
│   ├── src/
│   │   ├── modules/         # auth, articles, media, health (supply-chain, pages: not built yet)
│   │   ├── infrastructure/  # Database (Prisma), object storage (local / Cloudflare R2)
│   │   ├── common/          # Errors, DTO helpers, audit
│   │   └── scripts/         # OpenAPI export, user provisioning CLI
│   └── prisma/              # Prisma schema & versioned migrations
└── docs/                    # Architecture, API contracts (openapi-spec.json), decision records
```

## 3. Core Principles
1. **Frontend-Backend Decoupling**: Frontend communicates strictly via typed REST APIs (`/api/v1/*`) to the NestJS backend. Direct database access from Next.js is prohibited.
2. **Supply Chain as Central Content Domain**: Commodities, product variants, and processing capabilities are structured supply chain entities, not generic blog posts or isolated e-commerce products.
3. **Draft Safety & Dual-Gated Publishing**: Public APIs expose strictly `PUBLISHED` content with valid locale translation. Drafts and pending revisions are inaccessible without authentication.
