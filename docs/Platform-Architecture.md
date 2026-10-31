# CROWDFUNDING PLATFORM ARCHITECTURE & TECH STACK

_Kiến trúc tối ưu cho crowdfunding platform - Lessons learned từ Giveth + Modern Stack_

## 🏗️ SYSTEM ARCHITECTURE OVERVIEW

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   FRONTEND      │    │    BACKEND       │    │   BLOCKCHAIN    │
│                 │    │                  │    │                 │
│ Next.js 15      │◄──►│ Strapi 5.15+     │◄──►│ Ethereum/Polygon│
│ Tailwind Plus   │    │ PostgreSQL       │    │ Smart Contracts │
│ Catalyst UI Kit │    │ Redis Cache      │    │ Web3 Integration│
│ React Context   │    │ Cloudinary       │    │ (Modular)       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   CDN/ASSETS    │    │    MONITORING    │    │   DEPLOYMENT    │
│                 │    │                  │    │                 │
│ Cloudinary      │    │ Sentry + Logs    │    │ Vercel + Railway│
│ File Storage    │    │ Performance      │    │ Docker Compose  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🎯 CORE TECHNOLOGY STACK

### Backend Stack (Strapi-based)

```yaml
Framework: Strapi 5.15+ (Headless CMS)
Language: TypeScript
Database: PostgreSQL 17+ chạy trong docker contain tên DB
Cache: Redis 7+
File Upload: Cloudinary Integration
Authentication: Strapi Users & Permissions Plugin
API: REST + GraphQL (Auto-generated)
Payment: Stripe Plugin + Custom Blockchain Module
Email: Strapi Email Plugin (SendGrid/Mailgun)
Admin Panel: Strapi Admin (Built-in)
```

### Frontend Stack (Next.js + Tailwind Plus)

```yaml
Framework: Next.js 15 (App Router)
Language: TypeScript
Styling: Tailwind CSS + Tailwind Plus License
UI Components: Catalyst UI Kit (Migrated)
State Management: React Context + SWR
Forms: React Hook Form + Zod
API Client: SWR (REST) + Apollo Client (GraphQL optional)
Wallet Integration: Wagmi + Viem (Modular)
Icons: Heroicons + Lucide React
Testing: Playwright + Jest
```

### Infrastructure & DevOps

```yaml
Containerization: Docker + Docker Compose
Database: PostgreSQL (primary) + Redis (cache)
File Storage: Cloudinary (images/videos)
Deployment:
  - Frontend: Vercel (Next.js optimized)
  - Backend: Railway/Render (Strapi hosting)
Monitoring: Sentry + Uptime Robot
CI/CD: GitHub Actions
Domain: Custom domain + SSL
```

## 🔴 LESSONS LEARNED FROM GIVETH

### ❌ Giveth Problems We're Avoiding:

**1. Performance Issues**

```typescript
// Giveth Problem: GraphQL N+1 queries, 60+ second timeouts
// Our Solution: Strapi optimized queries + caching
const strapiOptimization = {
  queryOptimization: "Built-in population control",
  caching: "Redis + Strapi cache middleware",
  pagination: "Automatic pagination support",
  relations: "Efficient relation loading",
}
```

**2. Technical Debt**

```typescript
// Giveth Problem: Complex codebase, hard to maintain
// Our Solution: Clean architecture with Strapi
const cleanArchitecture = {
  contentTypes: "Schema-first development",
  adminPanel: "Auto-generated admin interface",
  apiGeneration: "Automatic REST + GraphQL APIs",
  plugins: "Modular plugin system",
}
```

**3. Environment Setup Complexity**

```typescript
// Giveth Problem: 2+ weeks setup time, dependency conflicts
// Our Solution: Docker + proven stack
const simpleSetup = {
  docker: "One-command environment setup",
  strapi: "Stable, well-documented framework",
  nextjs: "Proven frontend framework",
  tailwindPlus: "Professional component library",
}
```

### ✅ Giveth Strengths We're Adopting:

**1. Database Schema Excellence**

```typescript
// Adopting Giveth's proven entity relationships
interface ContentTypes {
  User: {
    email: string
    username: string
    walletAddress?: string
    reputation: number
    role: "user" | "verified" | "moderator" | "admin"
  }

  Project: {
    title: string
    description: string
    targetAmount: number
    raisedAmount: number
    category: Relation<Category>
    owner: Relation<User>
    status: "draft" | "active" | "completed" | "cancelled"
  }

  Donation: {
    amount: number
    currency: string
    project: Relation<Project>
    donor: Relation<User>
    paymentMethod: "stripe" | "crypto"
    transactionId: string
  }
}
```

**2. Authentication & Authorization Patterns**

```typescript
// Strapi implementation of Giveth's auth patterns
const authConfig = {
  providers: ["email", "google", "github", "wallet"],
  roles: ["authenticated", "verified", "moderator", "admin"],
  permissions: "Granular permission system",
  jwt: "Secure token management",
}
```

## 📊 STRAPI CONTENT TYPES DESIGN

### Core Content Types

```typescript
// User Management (Extended Strapi User)
interface User {
  // Strapi built-in fields
  id: number
  username: string
  email: string
  confirmed: boolean
  blocked: boolean
  role: Role

  // Custom fields
  fullName?: string
  bio?: string
  avatar?: Media
  walletAddress?: string
  reputation: number
  isVerified: boolean

  // Relations
  projects: Project[]
  donations: Donation[]
  comments: Comment[]
}

// Project Management
interface Project {
  id: number
  title: string
  slug: string
  description: string
  shortDescription: string
  coverImage: Media
  gallery: Media[]

  // Financial
  targetAmount: number
  raisedAmount: number
  currency: string

  // Categorization
  category: Category
  tags: Tag[]

  // Status & Workflow
  status: "draft" | "review" | "active" | "completed" | "cancelled"
  featured: boolean
  trending: boolean

  // SEO
  seo: SEO

  // Relations
  owner: User
  donations: Donation[]
  updates: ProjectUpdate[]
  comments: Comment[]

  // Timestamps (Strapi auto-generated)
  createdAt: Date
  updatedAt: Date
  publishedAt: Date
}

// Donation System (Giver-focused branding)
interface Donation {
  id: number
  amount: number
  currency: string

  // Payment Details
  paymentMethod: "stripe" | "crypto"
  paymentId: string
  paymentStatus: "pending" | "completed" | "failed" | "refunded"

  // Giver Information (Give platform branding)
  isAnonymous: boolean
  giverName?: string
  message?: string

  // Relations
  project: Project
  giver?: User // Renamed from 'donor' to 'giver'

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

// Category System
interface Category {
  id: number
  name: string
  slug: string
  description: string
  icon?: string
  color?: string

  // Hierarchy
  parent?: Category
  children: Category[]

  // Relations
  projects: Project[]
}
```

## 🏷️ TAG & CATEGORY ARCHITECTURE RESEARCH

_Research findings từ major crowdfunding platforms và industry best practices_

### 🔍 Research Findings từ Major Platforms

**Kickstarter & Indiegogo Analysis:**

- **Kickstarter**: 15 fixed categories (Film & Video, Music, Technology, Games, etc.)
- **Indiegogo**: 28 categories, more flexible but still structured
- **No user-generated tags** - chỉ có structured categories
- **Focus on analytics và filtering** rather than discovery tags

**E-commerce Platform Patterns:**

- **Separate table approach** là industry standard
- **Hierarchical categories** + **flexible tags**
- **EAV model** cho complex product attributes
- **Many-to-many relationships** cho flexibility

### 🎯 Recommended Architecture

**Hybrid Approach - Best of Both Worlds:**

```typescript
// Main Categories (Enum với i18n support)
enum ProjectCategory {
  TECHNOLOGY = "technology",
  ARTS = "arts",
  COMMUNITY = "community",
  EDUCATION = "education",
  ENVIRONMENT = "environment",
  HEALTH = "health",
  SOCIAL_IMPACT = "social-impact",
}

// Flexible Tags (Separate Table)
interface Tag {
  id: number
  name: string
  slug: string
  color?: string
  description?: string
  isActive: boolean
  usageCount: number

  // Relations
  projects: Project[]

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

// Updated Project Interface
interface Project {
  // ... existing fields ...

  // Category (Single, Required)
  category: ProjectCategory

  // Tags (Multiple, Optional)
  tags: Tag[]

  // ... rest of fields ...
}
```

### 🏆 Architecture Benefits

**Categories (Enum):**

- ✅ **Structured analytics** - Easy reporting và filtering
- ✅ **i18n support** - Strapi supports enum localization
- ✅ **Admin control** - Prevent category proliferation
- ✅ **SEO friendly** - Clean URL structure
- ✅ **Performance** - No joins needed

**Tags (Separate Table):**

- ✅ **User flexibility** - Dynamic tag creation
- ✅ **Discovery** - Rich tagging for search
- ✅ **Analytics** - Usage tracking và trending
- ✅ **Admin management** - Merge/delete unused tags
- ✅ **Scalability** - Handle thousands of tags

### 🔧 Implementation Strategy

1. **Phase 1**: Implement enum categories với i18n
2. **Phase 2**: Add separate Tag content type
3. **Phase 3**: Build tag management UI
4. **Phase 4**: Add tag analytics và trending

### Strapi Configuration

```typescript
// config/database.ts
export default ({ env }) => ({
  connection: {
    client: "postgres",
    connection: {
      host: env("DATABASE_HOST", "localhost"),
      port: env.int("DATABASE_PORT", 5432),
      database: env("DATABASE_NAME", "crowdfunding"),
      user: env("DATABASE_USERNAME", "postgres"),
      password: env("DATABASE_PASSWORD", "password"),
      ssl: env.bool("DATABASE_SSL", false),
      pool: {
        min: env.int("DATABASE_POOL_MIN", 2),
        max: env.int("DATABASE_POOL_MAX", 20),
      },
    },
  },
})

// config/plugins.ts
export default ({ env }) => ({
  // File Upload
  upload: {
    config: {
      provider: "cloudinary",
      providerOptions: {
        cloud_name: env("CLOUDINARY_NAME"),
        api_key: env("CLOUDINARY_KEY"),
        api_secret: env("CLOUDINARY_SECRET"),
      },
    },
  },

  // Email
  email: {
    config: {
      provider: "sendgrid",
      providerOptions: {
        apiKey: env("SENDGRID_API_KEY"),
      },
      settings: {
        defaultFrom: env("DEFAULT_FROM_EMAIL"),
        defaultReplyTo: env("DEFAULT_REPLY_TO_EMAIL"),
      },
    },
  },

  // Redis Cache
  redis: {
    config: {
      connections: {
        default: {
          connection: {
            host: env("REDIS_HOST", "localhost"),
            port: env.int("REDIS_PORT", 6379),
            db: 0,
          },
          settings: {
            debug: false,
          },
        },
      },
    },
  },
})
```

## 🎨 FRONTEND ARCHITECTURE (Next.js + Tailwind Plus)

### Project Structure

```
apps/web/
├── src/
│   ├── app/                    # Next.js 15 App Router
│   │   ├── (auth)/            # Auth routes group
│   │   ├── (dashboard)/       # Dashboard routes group
│   │   ├── projects/          # Project pages
│   │   ├── users/             # User profiles
│   │   └── layout.tsx         # Root layout
│   ├── components/
│   │   ├── catalyst/          # Migrated Catalyst UI Kit
│   │   ├── forms/             # Form components
│   │   ├── layout/            # Layout components
│   │   └── ui/                # Base UI components
│   ├── lib/
│   │   ├── strapi.ts          # Strapi client
│   │   ├── auth.ts            # Authentication
│   │   ├── utils.ts           # Utilities
│   │   └── validations.ts     # Zod schemas
│   ├── hooks/                 # Custom React hooks
│   ├── contexts/              # React contexts
│   └── types/                 # TypeScript types
├── public/                    # Static assets
└── tailwind.config.js         # Tailwind + Plus config
```

### State Management Strategy

```typescript
// Using React Context + SWR instead of complex state management
// contexts/AuthContext.tsx
interface AuthContextType {
  user: User | null
  login: (credentials: LoginCredentials) => Promise<void>
  logout: () => void
  register: (data: RegisterData) => Promise<void>
  isLoading: boolean
}

// hooks/useProjects.ts - SWR for data fetching
export function useProjects(filters?: ProjectFilters) {
  const { data, error, mutate } = useSWR(
    `/api/projects?${new URLSearchParams(filters)}`,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // 1 minute
    }
  )

  return {
    projects: data?.data || [],
    isLoading: !error && !data,
    isError: error,
    mutate,
  }
}
```

### Tailwind Plus Integration

```typescript
// tailwind.config.js - Leveraging Tailwind Plus
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Tailwind Plus custom configurations
      colors: {
        brand: {
          50: "#f0f9ff",
          500: "#3b82f6",
          900: "#1e3a8a",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/typography"),
    require("@tailwindcss/aspect-ratio"),
  ],
}

// components/catalyst/ - Migrated components
export { Button } from "./button"
export { Input } from "./input"
export { Card } from "./card"
export { Modal } from "./modal"
export { Table } from "./table"
// ... all Catalyst components
```

## 💰 PAYMENT INTEGRATION ARCHITECTURE

### Stripe Integration (Primary)

```typescript
// lib/stripe.ts
import Stripe from "stripe"

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
})

// Strapi webhook handler
export async function handleStripeWebhook(event: Stripe.Event) {
  switch (event.type) {
    case "payment_intent.succeeded":
      await updateDonationStatus(event.data.object.id, "completed")
      await notifyProjectOwner(event.data.object.metadata.projectId)
      break
    case "payment_intent.payment_failed":
      await updateDonationStatus(event.data.object.id, "failed")
      break
  }
}
```

### Blockchain Module (Modular)

```typescript
// lib/blockchain/index.ts - Separate module
export interface BlockchainService {
  connectWallet(): Promise<string>
  donate(projectId: string, amount: string, token: string): Promise<string>
  getTransactionStatus(txHash: string): Promise<TransactionStatus>
}

// Implementation can be swapped easily
export class EthereumService implements BlockchainService {
  // Implementation
}

export class PolygonService implements BlockchainService {
  // Implementation
}
```

## 🔍 SEARCH & FILTERING ARCHITECTURE

### Strapi Search Implementation

```typescript
// Leveraging Strapi's built-in search capabilities
export async function searchProjects(query: SearchParams) {
  const response = await strapi.find("projects", {
    filters: {
      $or: [
        { title: { $containsi: query.search } },
        { description: { $containsi: query.search } },
        { tags: { name: { $containsi: query.search } } },
      ],
      category: query.category ? { slug: query.category } : undefined,
      status: "active",
    },
    populate: {
      owner: { fields: ["username", "avatar"] },
      category: { fields: ["name", "slug"] },
      coverImage: true,
    },
    sort: query.sort || "createdAt:desc",
    pagination: {
      page: query.page || 1,
      pageSize: query.limit || 12,
    },
  })

  return response
}
```

## 🚀 PERFORMANCE OPTIMIZATION STRATEGY

### Caching Layers

```typescript
// Multi-layer caching strategy
const cachingStrategy = {
  // 1. Strapi built-in caching
  strapi: {
    middleware: "cache",
    ttl: 300, // 5 minutes
    routes: ["/api/projects", "/api/categories"],
  },

  // 2. Redis caching
  redis: {
    projectStats: 3600, // 1 hour
    userProfiles: 1800, // 30 minutes
    categories: 86400, // 24 hours
  },

  // 3. Next.js caching
  nextjs: {
    staticGeneration: {
      projects: 300, // 5 minutes
      categories: 3600, // 1 hour
      userProfiles: 1800, // 30 minutes
    },
  },
}
```

### Database Optimization

```sql
-- Critical indexes for performance (PostgreSQL)
CREATE INDEX idx_projects_status_featured ON projects (status, featured);
CREATE INDEX idx_projects_category_status ON projects (category_id, status);
CREATE INDEX idx_donations_project_created ON donations (project_id, created_at DESC);
CREATE INDEX idx_projects_search ON projects USING gin(to_tsvector('english', title || ' ' || description));

-- Materialized view for project statistics
CREATE MATERIALIZED VIEW project_stats AS
SELECT
  p.id,
  p.title,
  p.target_amount,
  COALESCE(SUM(d.amount), 0) as raised_amount,
  COUNT(d.id) as donation_count,
  AVG(d.amount) as avg_donation,
  MAX(d.created_at) as last_donation
FROM projects p
LEFT JOIN donations d ON p.id = d.project_id
WHERE d.payment_status = 'completed'
GROUP BY p.id, p.title, p.target_amount;

-- Auto-refresh trigger
CREATE OR REPLACE FUNCTION refresh_project_stats()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY project_stats;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_refresh_project_stats
  AFTER INSERT OR UPDATE OR DELETE ON donations
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_project_stats();
```

## 🔐 SECURITY ARCHITECTURE

### Strapi Security Configuration

```typescript
// config/security.ts
export default ({ env }) => ({
  cors: {
    enabled: true,
    origin: ["http://localhost:3000", "https://yourdomain.com"],
  },

  // Rate limiting
  rateLimit: {
    enabled: true,
    interval: 60000, // 1 minute
    max: 100, // requests per interval
  },

  // Content Security Policy
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "connect-src": ["'self'", "https:"],
      "img-src": ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
      "media-src": ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
    },
  },
})

// Input validation with Zod
export const projectSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().min(10).max(5000),
  targetAmount: z.number().positive().max(1000000),
  categoryId: z.number().positive(),
})
```

## 📱 MOBILE-FIRST RESPONSIVE DESIGN

### Tailwind Plus Responsive Strategy

```typescript
// Responsive breakpoints strategy
const responsiveDesign = {
  mobile: 'sm:max-w-sm', // 640px and below
  tablet: 'md:max-w-2xl', // 768px - 1023px
  desktop: 'lg:max-w-4xl', // 1024px - 1279px
  wide: 'xl:max-w-6xl', // 1280px and above
}

// Component example with Tailwind Plus
export function ProjectCard({ project }: { project: Project }) {
  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-200">
      <div className="aspect-w-16 aspect-h-9">
        <img
          src={project.coverImage.url}
          alt={project.title}
          className="w-full h-48 sm:h-56 md:h-64 object-cover"
        />
      </div>
      <div className="p-4 sm:p-6">
        <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
          {project.title}
        </h3>
        <p className="text-sm sm:text-base text-gray-600 mb-4 line-clamp-2">
          {project.shortDescription}
        </p>
        {/* Progress bar, funding info, etc. */}
      </div>
    </div>
  )
}
```

## 🚀 DEPLOYMENT ARCHITECTURE

### Development Environment

```yaml
# docker-compose.dev.yml
version: "3.8"
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_DB: crowdfunding_dev
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  strapi:
    build:
      context: ./apps/strapi
      dockerfile: Dockerfile.dev
    ports:
      - "1337:1337"
    environment:
      DATABASE_CLIENT: postgres
      DATABASE_HOST: postgres
      DATABASE_PORT: 5432
      DATABASE_NAME: crowdfunding_dev
      DATABASE_USERNAME: postgres
      DATABASE_PASSWORD: password
      REDIS_HOST: redis
      REDIS_PORT: 6379
    depends_on:
      - postgres
      - redis
    volumes:
      - ./apps/strapi:/app
      - /app/node_modules

  nextjs:
    build:
      context: ./apps/web
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_STRAPI_URL: http://localhost:1337
    volumes:
      - ./apps/web:/app
      - /app/node_modules

volumes:
  postgres_data:
  redis_data:
```

### Production Deployment

```yaml
# Production deployment strategy
production:
  frontend:
    platform: Vercel
    features:
      - Automatic deployments from Git
      - Edge functions for API routes
      - Image optimization
      - Global CDN

  backend:
    platform: Railway/Render
    features:
      - PostgreSQL database
      - Redis cache
      - Automatic scaling
      - Health checks

  monitoring:
    - Sentry for error tracking
    - Uptime Robot for availability
    - Vercel Analytics for performance
    - Custom dashboards
```

## 🎯 SUCCESS METRICS & MONITORING

### Performance KPIs

```typescript
const performanceTargets = {
  frontend: {
    firstContentfulPaint: "< 1.5s",
    largestContentfulPaint: "< 2.5s",
    cumulativeLayoutShift: "< 0.1",
    firstInputDelay: "< 100ms",
  },

  backend: {
    apiResponseTime: "< 200ms average",
    databaseQueryTime: "< 50ms average",
    cacheHitRate: "> 80%",
    uptime: "> 99.9%",
  },

  business: {
    conversionRate: "> 2%",
    averageSessionDuration: "> 5 minutes",
    bounceRate: "< 40%",
    userRetention: "> 60% monthly",
  },
}
```

## 💡 KEY ADVANTAGES OF THIS ARCHITECTURE

### ✅ Lessons Learned Applied:

- **Avoid Giveth pitfalls**: No technical debt, performance-first approach
- **Proven tech stack**: Strapi stability + Next.js 15 features + Tailwind Plus
- **Component reuse**: Catalyst UI Kit already implemented và tested
- **Modular design**: Easy to maintain, test, và scale

### ✅ Strapi Benefits:

- **Rapid development**: Admin panel + APIs auto-generated
- **Content management**: Non-technical users can manage content
- **Plugin ecosystem**: Rich functionality out-of-the-box
- **TypeScript support**: Full type safety across the stack
- **Performance**: Built-in caching và optimization

### ✅ Next.js 15 + Tailwind Plus Benefits:

- **Modern React**: App Router, Server Components, streaming
- **Professional UI**: Tailwind Plus components, consistent design
- **Performance**: Automatic optimization, image optimization, caching
- **SEO**: Built-in SEO optimization, meta tags, sitemaps
- **Developer Experience**: Hot reload, TypeScript, debugging tools

---

_Architecture này được thiết kế dựa trên lessons learned từ Giveth project, tối ưu cho performance, maintainability, và scalability. Mỗi component đều có thể phát triển độc lập và dễ dàng thay thế khi cần thiết._
