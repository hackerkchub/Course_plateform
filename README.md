# Course Platform Backend API

Production-ready, highly secure RESTful API backend for the online course platform, built with **Node.js**, **Express**, native **ES Modules (ESM)**, and **MariaDB / MySQL**.

---

## 1. Architecture & Design Principles

- **Runtime & Modules:** Node.js (v18+) with native ES Modules (`"type": "module"`).
- **Layered Architecture:** 
  $$\text{Routes} \longrightarrow \text{Controller} \longrightarrow \text{Service} \longrightarrow \text{Repository} \longrightarrow \text{Database}$$
- **Validation:** Strict, type-safe schema validation using **Zod** for all request bodies, queries, and parameters.
- **Database:** Raw parameterized SQL queries with `mysql2/promise` (zero ORM overhead, full control over performance and transactions).
- **Database Engine & Encoding:** InnoDB, `utf8mb4` character set, `utf8mb4_unicode_ci` collation across all 33 business tables.
- **Immutability & Audit Trails:** Database-level BEFORE UPDATE and BEFORE DELETE triggers prevent modification or deletion of `audit_logs`.
- **Security:**
  - Google OAuth ID token verification with audience and issuer verification.
  - JWT access tokens (15m expiry) and rotating refresh tokens (30d expiry) with automatic token replay detection and session revocation.
  - Role-Based Access Control (RBAC) across 5 distinct roles: `guest`, `user`, `counsellor`, `admin`, and `super_admin`.
  - Magic byte file inspection for uploads (prevents extension spoofing).
  - Cryptographically signed download URLs with HMAC and timestamped expiry for private student course materials.
  - CSV formula injection protection (neutralizing `=`, `+`, `-`, `@`, `\t`, `\r`).
  - Honeypot bot traps and layered IP rate limiting (`generalRateLimiter`, `loginRateLimiter`, `demoFormRateLimiter`, `courseViewRateLimiter`).

---

## 2. Dedicated Database Isolation

> [!IMPORTANT]
> **Strict Isolation Boundary:** This application must connect **ONLY** to its dedicated database: `course_platform_db`. Never connect to or execute commands against `g9expert` or any other external database.

---

## 3. Prerequisites & Installation

### Prerequisites
- **Node.js:** v18.0.0 or higher (v22.x LTS recommended)
- **Database:** MariaDB 10.4.32+ or MySQL 8.0+ running on `localhost:3306`

### Installation
1. Clone the repository and navigate to the backend directory:
   ```bash
   cd D:\Course_plateform\backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables:
   ```bash
   copy .env.example .env
   ```
   Edit `.env` to match your local database credentials and Google OAuth client ID.

---

## 4. Database Setup & Migration Commands

All database migrations are forward-only, transactional, and tracked in `schema_migrations`.

1. **Verify database connection and character set:**
   ```bash
   npm run check-db
   ```
2. **Execute pending migrations:**
   ```bash
   npm run migrate
   ```
   *The migration runner safely inspects `schema_migrations` and applies only new SQL files.*
3. **Seed initial super admin account:**
   ```bash
   npm run seed
   ```

---

## 5. Running the Application

- **Development Mode (with native file watcher):**
  ```bash
  npm run dev
  ```
- **Production Mode:**
  ```bash
  npm start
  ```
- **Health Check Endpoint:**
  ```bash
  curl http://localhost:5000/api/health
  ```

---

## 6. Automated Testing

The project utilizes the native Node.js Test Runner (`node:test`) and `supertest`.

- **Run complete regression test suite:**
  ```bash
  npm test
  ```
- **Run individual domain test suites:**
  ```bash
  node --test tests/auth.test.js
  node --test tests/catalog.test.js
  node --test tests/course_content.test.js
  node --test tests/uploads_materials.test.js
  node --test tests/demo_classes.test.js
  node --test tests/eligibility.test.js
  node --test tests/schema.test.js
  node --test tests/esm-import.test.js
  ```

---

## 7. Role & Access Control Matrix

| Capability / Action | `guest` | `user` | `counsellor` | `admin` | `super_admin` |
|---|:---:|:---:|:---:|:---:|:---:|
| Browse catalog & course details | ✅ | ✅ | ✅ | ✅ | ✅ |
| Track course page views | ✅ | ✅ | ✅ | ✅ | ✅ |
| Submit demo booking request | ❌ | ✅ | ✅ | ✅ | ✅ |
| Check course eligibility | ❌ | ✅ | ✅ | ✅ | ✅ |
| View personal demo requests & eligibility | ❌ | ✅ (own) | ✅ (own) | ✅ (own) | ✅ (own) |
| Access enrolled private course materials | ❌ | ✅ (enrolled) | ❌ | ✅ (all) | ✅ (all) |
| View & manage demo leads | ❌ | ❌ | ✅ | ✅ | ✅ |
| View student eligibility submissions | ❌ | ❌ | ✅ | ✅ | ✅ |
| Manage catalog, pricing, batches & rules | ❌ | ❌ | ❌ | ✅ | ✅ |
| Convert demo leads to enrollments | ❌ | ❌ | ❌ | ✅ | ✅ |
| Export demo leads to CSV | ❌ | ❌ | ❌ | ✅ | ✅ |
| Manage roles, audit logs & system admin | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 8. Core API Endpoints

### 8.1 Authentication (`/api/auth`)
- `POST /api/auth/google` — Sign in / register via Google ID token.
- `POST /api/auth/refresh` — Rotate refresh token and issue fresh access token.
- `POST /api/auth/logout` — Revoke active refresh token and clear auth cookies.
- `GET /api/auth/me` — Retrieve authenticated user profile and roles.

### 8.2 Catalog & Hierarchy (`/api/categories`, `/api/courses`)
- `GET /api/categories` — List active categories.
- `GET /api/categories/:catSlug/subcategories` — List subcategories under category.
- `GET /api/courses` — Search and filter published courses.
- `GET /api/courses/:slug` — Full course details including curriculum, pricing, offers, FAQs, and benefits.

### 8.3 Uploads & Materials (`/api/courses`, `/api/admin/uploads`, `/api/admin/materials`)
- `POST /api/admin/uploads` — Upload course thumbnail/brochure (magic byte validated).
- `GET /api/courses/:id/materials` — List course materials (public preview for guests; private signed URLs for enrolled students/admins).
- `GET /api/courses/:id/materials/:materialId/download` — Stream material file using cryptographic signed URL or active student enrollment.

### 8.4 Demo Classes & Free Trials (`/api/courses`, `/api/me`, `/api/admin/demo-requests`)
- `GET /api/courses/:id/demo-settings` — Public course demo settings and time slots.
- `POST /api/courses/:id/demo-requests` — Student demo request submission (transactional, concurrency-safe, duplicate check, rate limited).
- `GET /api/me/demo-requests` — Student's personal submitted demo requests.
- `PATCH /api/me/demo-requests/:id/cancel` — Cancel own pending demo request.
- `GET /api/admin/demo-requests` — Staff leads dashboard with filters and pagination.
- `PATCH /api/admin/demo-requests/:id` — Update lead status and schedule.
- `POST /api/admin/demo-requests/:id/convert` — Convert lead into active course enrollment.
- `GET /api/admin/demo-requests/export` — RFC 4180 CSV export with formula injection neutralization.

### 8.5 Course Eligibility (`/api/courses`, `/api/me`, `/api/admin/courses`)
- `GET /api/courses/:id/eligibility` — Public eligibility form criteria (answer keys scrubbed).
- `POST /api/courses/:id/eligibility-checks` — Submit answers for server-side rule evaluation.
- `GET /api/me/courses/:id/eligibility-result` — Retrieve personal latest check result.
- `GET /api/admin/courses/:id/eligibility-rules` — Admin fetch eligibility configuration.
- `PUT /api/admin/courses/:id/eligibility-rules` — Admin upsert eligibility criteria with audit logging.
- `GET /api/admin/courses/:id/eligibility-checks` — Staff view student check history with pagination and status filters.

---

## 9. Deployment & Production Considerations

1. **Environment Variables:** Set `NODE_ENV=production`, configure a strong 64-character `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`, and configure HTTPS `FRONTEND_URL`.
2. **Reverse Proxy:** Run behind Nginx or Cloudflare with TLS termination and pass standard `X-Forwarded-For` and `X-Forwarded-Proto` headers.
3. **Process Management:** Use PM2 or systemd with cluster mode.
4. **File Storage:** Ensure `UPLOAD_DIR` has appropriate read/write OS permissions and is excluded from web server public directory listings.
5. **Database Backups:** Use `mysqldump` with `--single-transaction` against `course_platform_db`.
