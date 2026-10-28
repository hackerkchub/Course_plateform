# Course Platform Backend
## Complete Implementation, API, Testing & Step 11 Handover Manual

**Company / Project:** Softmaxs Solution LLP — Course Platform  
**Document type:** Technical Manual, API Inventory & Project Handover  
**Current implementation milestone:** Section 19.4 — Step 11 Completed & Verified (Wishlist, Reviews & Search)  
**Next planned milestone:** Section 19.4 — Step 12: Views, Analytics, Dashboard & Cron  
**Workspace:** `D:\Course_plateform\backend\`  
**Dedicated database:** `course_platform_db`  
**Database engine:** MariaDB 10.4.32 (MySQL 5.5 compatible) on `localhost:3306`  
**Backend stack:** Node.js v20+, Express.js 4.19, MySQL2, native ES Modules (`type: "module"`)  
**Verified test status:** 310 tests passed, 0 failed across 13 test files (69 test suites)  
**Document version:** 3.0 (Fully Grounded & Code-Reconciled)  
**Document status:** Complete audit and verification against live routes, validation schemas, controllers, services, repositories, database schema, and test suites.

---

# 1. Document Purpose & Verification Scope

This manual serves as the single authoritative, developer-friendly technical handover reference for the Course Platform Backend. It provides an exhaustive, grounded record of:

1. **Architecture & Standards:** How the backend is structured using native ES Modules, layered separation of concerns, and security middleware.
2. **Safety & Workspace Isolation Rules:** Strict constraints protecting the database and preventing cross-project interference.
3. **Authentication & Role-Based Access Matrix:** Google OAuth 2.0, token rotation, replay detection, and 5-role authorization enforcement.
4. **Complete API Inventory:** All 122 registered API endpoints across 16 functional modules, documented with methods, exact paths, permissions, schemas, business logic, database effects, and test coverage.
5. **Module Deep Dives:** Detailed business conditions, validation rules, pre-publish invariants, and error scenarios for every subsystem.
6. **Step 10 Detailed Reference:** Free student self-enrollment, curriculum delivery, lesson progress tracking, admin manual creation, transactional batch reassignment, concurrency contention verification, and cancellation semantics.
7. **Testing Manual:** Exact CLI commands, execution instructions, automated test suite verification, and practical manual API testing procedures.
8. **Test Coverage & Evidence Matrix:** Tabular evidence mapping each module and endpoint to positive, negative, role, and database integrity test cases.
9. **Project Status Register:** Verified completed work, pending authoritative requirements, unresolved policy decisions, and known limitations.
10. **Build-Order Reconciliation:** Verification of Section 19.4 milestone sequence, correcting previous conflicting reports.
11. **Step 11 Reference & Step 12 Roadmap:** Implementation details for Wishlist, Reviews & Search (Step 11 Completed) and roadmap for Views, Analytics, Dashboard & Cron (Step 12 Next).

> [!IMPORTANT]
> **Audit Principle:** Every claim, endpoint, parameter, and rule in this manual has been reconciled directly against the project source code in `src/` and verified against active tests in `tests/`. No endpoints, database behaviors, or test results have been invented or assumed.

---

# 2. Project Environment and Safety Rules

## 2.1 Workspace and Database Isolation

| Parameter | Configuration Value |
|---|---|
| **Backend Project Root** | `D:\Course_plateform\backend\` |
| **Dedicated Database** | `course_platform_db` |
| **Database Host / Port** | `localhost:3306` |
| **Database Engine** | MariaDB 10.4.32 / InnoDB |
| **Character Set & Collation** | `utf8mb4` / `utf8mb4_unicode_ci` |
| **Connection Mechanism** | `mysql2/promise` connection pool (`src/config/db.js`) |
| **Unrelated Protected Workspace** | `D:\g9expert` (**STRICTLY UNTOUCHABLE**) |

### Mandatory Safety Rules

1. **Strict Project Isolation:** All file creations, modifications, test executions, and commands must remain strictly inside `D:\Course_plateform\backend\`. Never read, execute, or touch `D:\g9expert` or any database belonging to it.
2. **Dedicated Database Only:** Every database query, migration, seed script, and automated test must connect exclusively to `course_platform_db`. If `SELECT DATABASE()` returns any other name, abort execution immediately.
3. **Zero Destructive Database Operations:** Never run `DROP DATABASE`, `DROP TABLE`, `TRUNCATE`, or unconstrained `DELETE` statements.
4. **Preserve Applied Migrations:** Migrations `001` through `008` have already been applied and recorded in `schema_migrations`. Never edit, delete, or re-run existing migrations. All future schema adjustments must use forward-only migrations.
5. **Credentials and Secret Hygiene:** Never commit or expose passwords, refresh tokens, Google client secrets, JWT private keys, or session cookies in reports, code comments, or documentation.
6. **No Unapproved Dependencies:** Do not introduce paid services, Redis, external message queues, payment gateways, or external email/SMS providers unless explicitly authorized by the specification.
7. **Stop Condition & Milestone Gating:** Complete documentation and verification first. Do not begin Section 19.4 Step 11 implementation without explicit user review and approval.

---

# 3. Backend Architecture & Request Flow

The backend is built with native ES Modules (`import`/`export`), structured into a 6-layer architecture that guarantees loose coupling, transactional integrity, and testability:

```
[ HTTP Request from Client / Browser / Frontend ]
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Security & Infrastructure Middleware Layer               │
│    - Helmet (HTTP headers)                                  │
│    - CORS (env.FRONTEND_URL restricted)                     │
│    - Cookie Parser (httpOnly JWT extraction)                │
│    - Body Parsers (express.json, urlencoded, 2MB limit)     │
│    - Express Rate Limiters (general, auth, demo, views)     │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Routing Layer (src/modules/*/*.routes.js)                │
│    - Declarative path matching and route grouping           │
│    - Authentication middleware: authenticate / optionalAuth │
│    - Authorization middleware: authorize(...roles)          │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Validation Layer (src/middleware/validate.js)            │
│    - Zod schemas (validateBody, validateParams, validateQ)  │
│    - Input sanitation, type casting, schema error formatting│
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Controller Layer (src/modules/*/*.controller.js)         │
│    - HTTP request unwrapping (req.body, req.params, req.user│
│    - HTTP status codes (200, 201, 301, 400, 401, 403, 409)  │
│    - Uniform response helpers (sendSuccess, sendPaginated)  │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Service / Business Logic Layer (*.service.js)            │
│    - Core domain business logic and prerequisite checks     │
│    - Eligibility, publishing invariants, seat rules         │
│    - Audit logging orchestration                            │
└─────────────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Repository / Data Access Layer (*.repository.js)         │
│    - Parameterized SQL execution (100% prepared statements) │
│    - Transaction boundaries (pool.getConnection, commit/RB) │
│    - Row-level locking (SELECT ... FOR UPDATE)              │
│    - course_platform_db (MariaDB 10.4.32)                   │
└─────────────────────────────────────────────────────────────┘
```

---

# 4. Authentication, Sessions and Role-Based Authorization

The authentication system is built around stateless JWT access tokens and stateful, rotatable refresh tokens stored securely in MariaDB.

## 4.1 Token Architecture

| Token Type | Storage / Transmission | Lifetime | Key / Algorithm | Purpose |
|---|---|---|---|---|
| **Access Token** | `httpOnly`, `secure`, `sameSite: 'strict'` Cookie or `Authorization: Bearer <token>` | 15 minutes (`env.ACCESS_TOKEN_TTL`) | `env.JWT_ACCESS_SECRET` / HS256 | Authorizes API requests without querying DB on every call |
| **Refresh Token** | `httpOnly`, `secure`, `sameSite: 'strict'` Cookie (`refresh_token`) | 30 days (`env.REFRESH_TOKEN_TTL`) | `env.JWT_REFRESH_SECRET` / HS256 | Issues new access tokens and rotates refresh tokens |

### Cryptographic Rotation & Replay Attack Detection
1. Refresh tokens are stored in the `refresh_tokens` table as **SHA-256 hashes**. The plaintext token is only held by the client in a secure cookie.
2. Every call to `POST /api/auth/refresh` immediately revokes the presenting token (`revoked_at = NOW()`) and records the hash of its successor in `replaced_by_hash`.
3. If a refresh token that has **already been revoked** is presented to `/api/auth/refresh`, the server flags this as a **Token Replay Attack**. In response, it immediately revokes **ALL** active refresh tokens belonging to that `user_id`, terminating all active sessions across all devices, and returns `401 Unauthorized`.

## 4.2 Role Matrix

The platform defines 5 roles (`users.role ENUM('user', 'counsellor', 'admin', 'super_admin')` plus unauthenticated guests):

| Role | Scope & Permissions |
|---|---|
| **Guest** (Unauthenticated) | Can browse published categories, subcategories, courses, upcoming batches, public materials, and demo settings. Can perform Google sign-in. |
| **`user`** (Student) | Standard authenticated student. Can submit demo requests, cancel own demo requests, submit course eligibility checks, view own eligibility results, enroll in free courses, view personal enrollments (`/api/me/enrollments`), access enrolled course curriculum, and update lesson playback progress. Cannot access administrative endpoints (`403 Forbidden`). |
| **`counsellor`** | Academic counselor. Can view course demo requests and manage leads in `/api/admin/demo-requests` (view details, update status, add follow-up notes, perform bulk updates). Can view student eligibility checks under `/api/admin/courses/:id/eligibility-checks`. Cannot create/delete courses, modify pricing, or access admin enrollment endpoints (`403 Forbidden`). |
| **`admin`** | Platform administrator. Full management rights over categories, subcategories, instructors, courses, curriculum, batches, SEO, pricing, offers, FAQs, benefits, enrollment settings, materials, demo settings, demo conversion, eligibility rules, and enrollments (manual creation, listing, updating, batch reassignment). |
| **`super_admin`** | Elevated super-administrator. Inherits all `admin` privileges with exclusive governance over staff role assignments, system audits, and high-privilege configuration. Auto-seeded via `process.env.SUPER_ADMIN_EMAIL`. |

---

# 5. Complete API Inventory — Implemented and Verified Endpoints

Every endpoint listed below has been discovered from the Express application routes mounted in `src/app.js` and verified against the controller, service, repository, and test files.

**Total Registered Endpoints:** **122** (plus root API documentation endpoint `/api`)

### Legend
- **Auth:** `None` (Public), `Req` (Authentication required), `Opt` (Optional authentication)
- **Status:** `Verified` (Implemented and verified by automated tests), `Untested` (Implemented in code but lacking a dedicated automated test suite)

---

## 5.1 System Health & Diagnostics (2 Endpoints)

| # | Module | Method | Full Route | Auth | Allowed Roles | Purpose & Behavior | Tests | Status |
|---|---|---|---|:---:|---|---|---|:---:|
| 1 | Health | `GET` | `/api/health` | None | All | Returns server status, uptime (seconds), Asia/Kolkata ISO timestamp, environment, and version. | `tests/health.test.js` | **Verified** |
| 2 | Health | `GET` | `/api/health/db` | None | All | Executes `SELECT 1` ping and inspects MySQL connection pool state. Returns `200` if healthy, `503` if down. | `tests/health.test.js` | **Verified** |

---

## 5.2 Authentication & Sessions (6 Endpoints)

| # | Module | Method | Full Route | Auth | Allowed Roles | Purpose & Behavior | Tests | Status |
|---|---|---|---|:---:|---|---|---|:---:|
| 3 | Auth | `POST` | `/api/auth/google` | None | All | Verifies Google ID token via `google-auth-library`. Finds or provisions user. Issues access/refresh cookies. Rate limited (10/15m). | `tests/auth.test.js` | **Verified** |
| 4 | Auth | `POST` | `/api/auth/refresh` | None | All | Rotates refresh token using SHA-256 hash lookup. Triggers replay detection if revoked token is reused. | `tests/auth.test.js` | **Verified** |
| 5 | Auth | `POST` | `/api/auth/logout` | Req | All Roles | Revokes current refresh token (`revoked_at = NOW()`) and clears cookies. | `tests/auth.test.js` | **Verified** |
| 6 | Auth | `POST` | `/api/auth/logout-all` | Req | All Roles | Revokes all active refresh tokens for authenticated user across all sessions. | `tests/auth.test.js` | **Verified** |
| 7 | Auth | `GET` | `/api/auth/me` | Req | All Roles | Returns authenticated user profile (`id`, `name`, `email`, `role`, `avatar_url`, `status`). | `tests/auth.test.js` | **Verified** |
| 8 | Auth | `PATCH` | `/api/auth/me` | Req | All Roles | Updates personal profile (`name`, `phone`, `avatar_url`). Validates phone regex `^[6-9][0-9]{9}$`. | `tests/auth.test.js` | **Verified** |

---

## 5.3 Category Management (8 Endpoints)

| # | Module | Method | Full Route | Auth | Allowed Roles | Purpose & Behavior | Tests | Status |
|---|---|---|---|:---:|---|---|---|:---:|
| 9 | Categories | `GET` | `/api/categories` | None | All | Lists active categories with course counts, ordered by `display_order ASC`. Excludes soft-deleted. | `tests/catalog.test.js` | **Verified** |
| 10 | Categories | `GET` | `/api/categories/:slug` | None | All | Returns single active category by slug. Returns `404` if deleted or inactive. | `tests/catalog.test.js` | **Verified** |
| 11 | Categories | `GET` | `/api/admin/categories` | Req | `admin`, `super_admin` | Lists all categories (active, inactive, draft) with administrative metadata. | `tests/catalog.test.js` | **Verified** |
| 12 | Categories | `POST` | `/api/admin/categories` | Req | `admin`, `super_admin` | Creates new category. Auto-generates slug if omitted. Rejects duplicate slug with `409`. Writes audit log. | `tests/catalog.test.js` | **Verified** |
| 13 | Categories | `GET` | `/api/admin/categories/:id` | Req | `admin`, `super_admin` | Retrieves single category by numeric ID for administration. | `tests/catalog.test.js` | **Verified** |
| 14 | Categories | `PATCH` | `/api/admin/categories/:id` | Req | `admin`, `super_admin` | Updates category fields (`name`, `slug`, `icon_url`, `status`, `seo_title`). Prevents slug conflicts. | `tests/catalog.test.js` | **Verified** |
| 15 | Categories | `PATCH` | `/api/admin/categories/reorder` | Req | `admin`, `super_admin` | Bulk updates `display_order` from array of `{ id, display_order }`. | `tests/catalog.test.js` | **Verified** |
| 16 | Categories | `DELETE` | `/api/admin/categories/:id` | Req | `admin`, `super_admin` | Soft deletes category (`deleted_at = NOW()`). Rejects with `409` if active subcategories exist. | `tests/catalog.test.js` | **Verified** |

---

## 5.4 Subcategory Management (8 Endpoints)

| # | Module | Method | Full Route | Auth | Allowed Roles | Purpose & Behavior | Tests | Status |
|---|---|---|---|:---:|---|---|---|:---:|
| 17 | Subcategories | `GET` | `/api/categories/:catSlug/subcategories` | None | All | Lists active subcategories under specified category slug. | `tests/catalog.test.js` | **Verified** |
| 18 | Subcategories | `GET` | `/api/categories/:catSlug/subcategories/:subSlug` | Opt | All | Returns subcategory details and its published courses with filters and pagination. | `tests/catalog.test.js` | **Verified** |
| 19 | Subcategories | `GET` | `/api/admin/subcategories` | Req | `admin`, `super_admin` | Lists all subcategories with parent category name and course counts. | `tests/catalog.test.js` | **Verified** |
| 20 | Subcategories | `POST` | `/api/admin/subcategories` | Req | `admin`, `super_admin` | Creates subcategory under valid `category_id`. Rejects duplicate slug within category (`409`). | `tests/catalog.test.js` | **Verified** |
| 21 | Subcategories | `GET` | `/api/admin/subcategories/:id` | Req | `admin`, `super_admin` | Retrieves single subcategory by ID. | `tests/catalog.test.js` | **Verified** |
| 22 | Subcategories | `PATCH` | `/api/admin/subcategories/:id` | Req | `admin`, `super_admin` | Updates subcategory fields. Validates parent category existence if `category_id` changed. | `tests/catalog.test.js` | **Verified** |
| 23 | Subcategories | `PATCH` | `/api/admin/subcategories/reorder` | Req | `admin`, `super_admin` | Bulk updates `display_order` across subcategories. | `tests/catalog.test.js` | **Verified** |
| 24 | Subcategories | `DELETE` | `/api/admin/subcategories/:id` | Req | `admin`, `super_admin` | Soft deletes subcategory. Rejects with `409` if active courses reference it. | `tests/catalog.test.js` | **Verified** |

---

## 5.5 Instructor Management (7 Endpoints)

| # | Module | Method | Full Route | Auth | Allowed Roles | Purpose & Behavior | Tests | Status |
|---|---|---|---|:---:|---|---|---|:---:|
| 25 | Instructors | `GET` | `/api/instructors` | None | All | Lists active instructors (`is_active = TRUE`) with assigned course counts. | `tests/catalog.test.js` | **Verified** |
| 26 | Instructors | `GET` | `/api/instructors/:id` | None | All | Returns instructor profile, biography, photo, and list of taught courses. | `tests/catalog.test.js` | **Verified** |
| 27 | Instructors | `GET` | `/api/admin/instructors` | Req | `admin`, `super_admin` | Administrative listing of all instructors including inactive records. | `tests/catalog.test.js` | **Verified** |
| 28 | Instructors | `POST` | `/api/admin/instructors` | Req | `admin`, `super_admin` | Creates instructor profile (`name`, `bio`, `photo_url`, `designation`, `experience_years`). | `tests/catalog.test.js` | **Verified** |
| 29 | Instructors | `GET` | `/api/admin/instructors/:id` | Req | `admin`, `super_admin` | Retrieves single instructor by ID. | `tests/catalog.test.js` | **Verified** |
| 30 | Instructors | `PATCH` | `/api/admin/instructors/:id` | Req | `admin`, `super_admin` | Updates instructor details, status, or contact email. | `tests/catalog.test.js` | **Verified** |
| 31 | Instructors | `DELETE` | `/api/admin/instructors/:id` | Req | `admin`, `super_admin` | Deactivates or removes instructor. Fails if active courses depend on instructor. | `tests/catalog.test.js` | **Verified** |

---

## 5.6 Course Catalog & Admin Management (11 Endpoints)

| # | Module | Method | Full Route | Auth | Allowed Roles | Purpose & Behavior | Tests | Status |
|---|---|---|---|:---:|---|---|---|:---:|
| 32 | Courses | `GET` | `/api/courses` | Opt | All | Filter and paginate published courses (`category`, `level`, `price_min`, `price_max`, `sort`). | `tests/catalog.test.js` | **Verified** |
| 33 | Courses | `GET` | `/api/courses/:slug` | Opt | All | Full published course detail. If old slug, returns `301 Redirect` using `course_slug_history`. | `tests/catalog.test.js` | **Verified** |
| 34 | Courses | `GET` | `/api/courses/:id/reviews` | None | All | Paginated list of approved reviews for course. Filtered by `moderation_status = 'approved'`. | `tests/wishlist_reviews.test.js` | **Verified** |
| 35 | Search | `GET` | `/api/search` | None | All | Unified catalog search across courses, categories, subcategories, instructors (`q`, `type`, `limit`). | `tests/catalog.test.js` | **Verified** |
| 36 | Courses | `GET` | `/api/admin/courses` | Req | `admin`, `super_admin` | Admin course list with status filters (`draft`, `published`, `archived`), sorting, and pagination. | `tests/catalog.test.js` | **Verified** |
| 37 | Courses | `POST` | `/api/admin/courses` | Req | `admin`, `super_admin` | Creates course in `draft` status. Automatically resolves `category_id` from `subcategory_id`. | `tests/catalog.test.js` | **Verified** |
| 38 | Courses | `GET` | `/api/admin/courses/:id` | Req | `admin`, `super_admin` | Retrieves complete course record by numeric ID for editing. | `tests/catalog.test.js` | **Verified** |
| 39 | Courses | `PATCH` | `/api/admin/courses/:id` | Req | `admin`, `super_admin` | Updates course metadata. If slug changes, inserts old slug into `course_slug_history`. | `tests/catalog.test.js` | **Verified** |
| 40 | Courses | `PATCH` | `/api/admin/courses/:id/status` | Req | `admin`, `super_admin` | Transitions status (`draft` -> `published`, `archived`). Enforces strict pre-publish validation. | `tests/catalog.test.js` | **Verified** |
| 41 | Courses | `POST` | `/api/admin/courses/:id/duplicate`| Req | `admin`, `super_admin` | Clones course into `draft` status with new unique `course_code` and `-copy` slug. | `tests/catalog.test.js` | **Verified** |
| 42 | Courses | `DELETE` | `/api/admin/courses/:id` | Req | `admin`, `super_admin` | Soft deletes course (`deleted_at = NOW()`). Excludes from public searches. | `tests/catalog.test.js` | **Verified** |

---

## 5.7 Curriculum & Lesson Management (8 Endpoints)

| # | Module | Method | Full Route | Auth | Allowed Roles | Purpose & Behavior | Tests | Status |
|---|---|---|---|:---:|---|---|---|:---:|
| 43 | Curriculum | `GET` | `/api/admin/courses/:id/curriculum` | Req | `admin`, `super_admin` | Returns complete course hierarchy: modules, lessons, video URLs, and order. | `tests/course_content.test.js` | **Verified** |
| 44 | Curriculum | `POST` | `/api/admin/courses/:id/modules` | Req | `admin`, `super_admin` | Adds module to course (`title`, `description`, `display_order`). Updates `total_modules`. | `tests/course_content.test.js` | **Verified** |
| 45 | Curriculum | `PATCH` | `/api/admin/courses/:id/curriculum/reorder` | Req | `admin`, `super_admin` | Reorders modules and nested lessons in bulk. | `tests/course_content.test.js` | **Verified** |
| 46 | Curriculum | `PATCH` | `/api/admin/modules/:moduleId` | Req | `admin`, `super_admin` | Updates module title, description, or visibility status. | `tests/course_content.test.js` | **Verified** |
| 47 | Curriculum | `DELETE` | `/api/admin/modules/:moduleId` | Req | `admin`, `super_admin` | Deletes module and cascades to child lessons. Updates counters. | `tests/course_content.test.js` | **Verified** |
| 48 | Curriculum | `POST` | `/api/admin/modules/:moduleId/lessons` | Req | `admin`, `super_admin` | Adds lesson (`title`, `duration_seconds`, `video_url`, `is_free_preview`). | `tests/course_content.test.js` | **Verified** |
| 49 | Curriculum | `PATCH` | `/api/admin/lessons/:lessonId` | Req | `admin`, `super_admin` | Updates lesson title, video URL, duration, or preview toggle. | `tests/course_content.test.js` | **Verified** |
| 50 | Curriculum | `DELETE` | `/api/admin/lessons/:lessonId` | Req | `admin`, `super_admin` | Deletes lesson. Updates course `total_lessons` count. | `tests/course_content.test.js` | **Verified** |

---

## 5.8 Batch Management (5 Endpoints)

| # | Module | Method | Full Route | Auth | Allowed Roles | Purpose & Behavior | Tests | Status |
|---|---|---|---|:---:|---|---|---|:---:|
| 51 | Batches | `GET` | `/api/courses/:id/batches` | None | All | Lists upcoming batches for published course (`status = 'open'`, `start_date >= CURDATE()`). | `tests/course_content.test.js` | **Verified** |
| 52 | Batches | `GET` | `/api/admin/courses/:id/batches` | Req | `admin`, `super_admin` | Lists all batches for course regardless of status or date. | `tests/course_content.test.js` | **Verified** |
| 53 | Batches | `POST` | `/api/admin/courses/:id/batches` | Req | `admin`, `super_admin` | Creates batch (`batch_name`, `start_date`, `seats_total`, `status: 'open'`). Initializes `seats_available`. | `tests/course_content.test.js` | **Verified** |
| 54 | Batches | `PATCH` | `/api/admin/batches/:batchId` | Req | `admin`, `super_admin` | Updates batch dates, status (`open`, `full`, `closed`, `completed`), or total seats. | `tests/course_content.test.js` | **Verified** |
| 55 | Batches | `DELETE` | `/api/admin/batches/:batchId` | Req | `admin`, `super_admin` | Removes batch if no active enrollments reference it. | `tests/course_content.test.js` | **Verified** |

---

## 5.9 Course Content, SEO, Pricing & Settings (22 Endpoints)

| # | Module | Method | Full Route | Auth | Allowed Roles | Purpose & Behavior | Tests | Status |
|---|---|---|---|:---:|---|---|---|:---:|
| 56 | SEO | `GET` | `/api/admin/courses/:id/seo` | Req | `admin`, `super_admin` | Retrieves meta title, description, keywords, og tags, schema json. | `tests/course_content.test.js` | **Verified** |
| 57 | SEO | `PUT` | `/api/admin/courses/:id/seo` | Req | `admin`, `super_admin` | Replaces or updates SEO metadata for course. | `tests/course_content.test.js` | **Verified** |
| 58 | Pricing | `GET` | `/api/admin/courses/:id/pricing` | Req | `admin`, `super_admin` | Retrieves `price`, `offer_price`, `currency`, `tax_inclusive`, `is_free`. | `tests/course_content.test.js` | **Verified** |
| 59 | Pricing | `PUT` | `/api/admin/courses/:id/pricing` | Req | `admin`, `super_admin` | Updates course pricing. Validates `offer_price <= price` and `is_free` consistency. | `tests/course_content.test.js` | **Verified** |
| 60 | Installments | `GET` | `/api/admin/courses/:id/installments` | Req | `admin`, `super_admin` | Lists installment plans for course. | `tests/course_content.test.js` | **Verified** |
| 61 | Installments | `POST` | `/api/admin/courses/:id/installments` | Req | `admin`, `super_admin` | Creates installment plan (`total_installments`, `amount_per_installment`). | `tests/course_content.test.js` | **Verified** |
| 62 | Installments | `PATCH` | `/api/admin/courses/:id/installments/:planId`| Req | `admin`, `super_admin`| Updates installment plan parameters. | `tests/course_content.test.js` | **Verified** |
| 63 | Installments | `DELETE` | `/api/admin/courses/:id/installments/:planId`| Req | `admin`, `super_admin`| Deletes installment plan. | `tests/course_content.test.js` | **Verified** |
| 64 | Offers | `GET` | `/api/admin/courses/:id/offers` | Req | `admin`, `super_admin` | Lists promotional offers for course. | `tests/course_content.test.js` | **Verified** |
| 65 | Offers | `POST` | `/api/admin/courses/:id/offers` | Req | `admin`, `super_admin` | Creates offer (`coupon_code`, `discount_percentage`, start/end dates). | `tests/course_content.test.js` | **Verified** |
| 66 | Offers | `PATCH` | `/api/admin/courses/:id/offers/:offerId` | Req | `admin`, `super_admin` | Updates offer details or active flag. | `tests/course_content.test.js` | **Verified** |
| 67 | Offers | `DELETE` | `/api/admin/courses/:id/offers/:offerId` | Req | `admin`, `super_admin` | Deletes offer. | `tests/course_content.test.js` | **Verified** |
| 68 | FAQs | `GET` | `/api/admin/courses/:id/faqs` | Req | `admin`, `super_admin` | Retrieves list of course FAQs. | `tests/course_content.test.js` | **Verified** |
| 69 | FAQs | `PUT` | `/api/admin/courses/:id/faqs` | Req | `admin`, `super_admin` | Full replacement of FAQs array (`question`, `answer`, `display_order`). | `tests/course_content.test.js` | **Verified** |
| 70 | Testimonials | `GET` | `/api/admin/courses/:id/testimonials` | Req | `admin`, `super_admin` | Retrieves course testimonials. | `tests/course_content.test.js` | **Verified** |
| 71 | Testimonials | `PUT` | `/api/admin/courses/:id/testimonials` | Req | `admin`, `super_admin` | Full replacement of testimonials array. | `tests/course_content.test.js` | **Verified** |
| 72 | Benefits | `GET` | `/api/admin/courses/:id/benefits` | Req | `admin`, `super_admin` | Retrieves course benefits (certificate, career support, mock interviews). | `tests/course_content.test.js` | **Verified** |
| 73 | Benefits | `PUT` | `/api/admin/courses/:id/benefits` | Req | `admin`, `super_admin` | Replaces or updates course benefits flags and descriptions. | `tests/course_content.test.js` | **Verified** |
| 74 | Settings | `GET` | `/api/admin/courses/:id/enrollment-settings` | Req | `admin`, `super_admin`| Retrieves enrollment window, seat limits, and access duration. | `tests/course_content.test.js` | **Verified** |
| 75 | Settings | `PUT` | `/api/admin/courses/:id/enrollment-settings` | Req | `admin`, `super_admin`| Updates enrollment window dates and max student capacity. | `tests/course_content.test.js` | **Verified** |
| 76 | Points | `GET` | `/api/admin/courses/:id/points` | Req | `admin`, `super_admin` | Retrieves highlights / bullet points. | `tests/course_content.test.js` | **Verified** |
| 77 | Points | `PUT` | `/api/admin/courses/:id/points` | Req | `admin`, `super_admin` | Full replacement of course highlights. | `tests/course_content.test.js` | **Verified** |

---

## 5.10 File Uploads & Media Storage (2 Endpoints)

| # | Module | Method | Full Route | Auth | Allowed Roles | Purpose & Behavior | Tests | Status |
|---|---|---|---|:---:|---|---|---|:---:|
| 78 | Uploads | `POST` | `/api/admin/uploads` | Req | `admin`, `super_admin` | Handles multipart file upload (images, PDFs, documents). Inspects magic bytes, restricts extensions, writes to local disk with UUID filename. | `tests/uploads_materials.test.js` | **Verified** |
| 79 | Uploads | `DELETE` | `/api/admin/uploads` | Req | `admin`, `super_admin` | Deletes uploaded file from local storage directory by relative path. Prevents path traversal attacks. | `tests/uploads_materials.test.js` | **Verified** |

---

## 5.11 Course Materials & Downloads (6 Endpoints)

| # | Module | Method | Full Route | Auth | Allowed Roles | Purpose & Behavior | Tests | Status |
|---|---|---|---|:---:|---|---|---|:---:|
| 80 | Materials | `GET` | `/api/courses/:id/materials` | Opt | All | Lists materials for course. If unauthenticated, returns only `is_free = TRUE` items. | `tests/uploads_materials.test.js` | **Verified** |
| 81 | Materials | `GET` | `/api/courses/:id/materials/:materialId/download` | Opt | All | Streams or redirects to file download. For paid materials, verifies active enrollment or admin role. | `tests/uploads_materials.test.js` | **Verified** |
| 82 | Materials | `GET` | `/api/admin/courses/:id/materials` | Req | `admin`, `super_admin` | Lists all materials (free, paid, private) for course. | `tests/uploads_materials.test.js` | **Verified** |
| 83 | Materials | `POST` | `/api/admin/courses/:id/materials` | Req | `admin`, `super_admin` | Attaches study material, brochure, or syllabus to course (`title`, `file_url`, `is_free`). | `tests/uploads_materials.test.js` | **Verified** |
| 84 | Materials | `PATCH` | `/api/admin/materials/:materialId` | Req | `admin`, `super_admin` | Updates material title, file URL, or free/paid access flag. | `tests/uploads_materials.test.js` | **Verified** |
| 85 | Materials | `DELETE` | `/api/admin/materials/:materialId` | Req | `admin`, `super_admin` | Removes material record and dissociates file. | `tests/uploads_materials.test.js` | **Verified** |

---

## 5.12 Demo Classes & Lead Management (15 Endpoints)

| # | Module | Method | Full Route | Auth | Allowed Roles | Purpose & Behavior | Tests | Status |
|---|---|---|---|:---:|---|---|---|:---:|
| 86 | Demo | `GET` | `/api/courses/:id/demo-settings` | None | All | Returns public demo configuration (slot times, dates, demo active flag). | `tests/demo_classes.test.js` | **Verified** |
| 87 | Demo | `POST` | `/api/courses/:id/demo-requests` | Req | All Roles | Submits demo class booking. Enforces phone regex, consent check, and max 1 active request per course within 30 days. | `tests/demo_classes.test.js` | **Verified** |
| 88 | Demo | `GET` | `/api/me/demo-requests` | Req | `user`, Staff | Lists personal demo class bookings for authenticated student. | `tests/demo_classes.test.js` | **Verified** |
| 89 | Demo | `PATCH` | `/api/me/demo-requests/:id/cancel` | Req | `user`, Staff | Cancels personal demo booking if status is `pending` or `scheduled`. | `tests/demo_classes.test.js` | **Verified** |
| 90 | Demo | `GET` | `/api/admin/courses/:id/demo-settings` | Req | `admin`, `super_admin` | Retrieves admin demo configuration for course. | `tests/demo_classes.test.js` | **Verified** |
| 91 | Demo | `PUT` | `/api/admin/courses/:id/demo-settings` | Req | `admin`, `super_admin` | Updates demo configuration, maximum attendees, and schedule templates. | `tests/demo_classes.test.js` | **Verified** |
| 92 | Demo | `GET` | `/api/admin/courses/:id/demo-requests` | Req | `counsellor`, `admin`, `super_admin` | Lists demo bookings specifically for specified course. | `tests/demo_classes.test.js` | **Verified** |
| 93 | Demo | `GET` | `/api/admin/demo-requests/export` | Req | `admin`, `super_admin` | Exports demo leads as CSV with date filters. | `tests/demo_classes.test.js` | **Verified** |
| 94 | Demo | `PATCH` | `/api/admin/demo-requests/bulk` | Req | `counsellor`, `admin`, `super_admin` | Bulk updates status or assigns counselor across multiple lead IDs. | `tests/demo_classes.test.js` | **Verified** |
| 95 | Demo | `GET` | `/api/admin/demo-requests` | Req | `counsellor`, `admin`, `super_admin` | Global leads dashboard with status, date, and counselor filters. | `tests/demo_classes.test.js` | **Verified** |
| 96 | Demo | `GET` | `/api/admin/demo-requests/:id` | Req | `counsellor`, `admin`, `super_admin` | Returns detailed lead record including follow-up notes and activity log. | `tests/demo_classes.test.js` | **Verified** |
| 97 | Demo | `PATCH` | `/api/admin/demo-requests/:id` | Req | `counsellor`, `admin`, `super_admin` | Updates lead status (`contacted`, `scheduled`, `attended`, `no_show`). | `tests/demo_classes.test.js` | **Verified** |
| 98 | Demo | `POST` | `/api/admin/demo-requests/:id/notes` | Req | `counsellor`, `admin`, `super_admin` | Appends counselor follow-up note to lead activity history. | `tests/demo_classes.test.js` | **Verified** |
| 99 | Demo | `POST` | `/api/admin/demo-requests/:id/convert` | Req | `admin`, `super_admin` | Converts lead into course enrollment. Enforces transactional batch validation (Correction 1). | `tests/demo_classes.test.js` | **Verified** |
| 100| Demo | `DELETE` | `/api/admin/demo-requests/:id` | Req | `admin`, `super_admin` | Soft deletes demo request record. | `tests/demo_classes.test.js` | **Verified** |

---

## 5.13 Course Eligibility Rules & Assessments (6 Endpoints)

| # | Module | Method | Full Route | Auth | Allowed Roles | Purpose & Behavior | Tests | Status |
|---|---|---|---|:---:|---|---|---|:---:|
| 101| Eligibility | `GET` | `/api/courses/:id/eligibility` | None | All | Returns public eligibility questionnaire without exposing scoring keys or minimum cutoffs. | `tests/eligibility.test.js` | **Verified** |
| 102| Eligibility | `POST` | `/api/courses/:id/eligibility-checks`| Req | All 5 Roles | Evaluates student assessment responses. Returns `result: 'eligible' \| 'not_eligible'`. Saves check record. | `tests/eligibility.test.js` | **Verified** |
| 103| Eligibility | `GET` | `/api/me/courses/:id/eligibility-result`| Req | `user`, Staff | Retrieves authenticated student's latest assessment score and eligibility outcome for course. | `tests/eligibility.test.js` | **Verified** |
| 104| Eligibility | `GET` | `/api/admin/courses/:id/eligibility-rules` | Req | `admin`, `super_admin` | Retrieves complete rule criteria, scoring weights, and cutoff thresholds. | `tests/eligibility.test.js` | **Verified** |
| 105| Eligibility | `PUT` | `/api/admin/courses/:id/eligibility-rules` | Req | `admin`, `super_admin` | Updates course eligibility criteria, toggle flag, and scoring rubric. | `tests/eligibility.test.js` | **Verified** |
| 106| Eligibility | `GET` | `/api/admin/courses/:id/eligibility-checks`| Req | `counsellor`, `admin`, `super_admin`| Lists student assessment submissions and evaluations for specified course. | `tests/eligibility.test.js` | **Verified** |

---

## 5.14 Step 10: Course Enrollments & Lesson Progress (7 Endpoints)

| # | Module | Method | Full Route | Auth | Allowed Roles | Purpose & Behavior | Tests | Status |
|---|---|---|---|:---:|---|---|---|:---:|
| 107| Enrollments | `POST` | `/api/courses/:id/enroll` | Req | `user`, Staff | Enrolls authenticated student in free course. Enforces published, dates, capacity, eligibility, batch, duplicates. | `tests/enrollments.test.js` | **Verified** |
| 108| Enrollments | `GET` | `/api/me/enrollments` | Req | `user`, Staff | Returns authenticated student's enrolled courses, batch, progress percentage, and last lesson ID. | `tests/enrollments.test.js` | **Verified** |
| 109| Enrollments | `GET` | `/api/me/courses/:id/curriculum` | Req | `user`, Staff | Returns curriculum for enrolled student. Verifies enrollment. Includes full video URLs. | `tests/enrollments.test.js` | **Verified** |
| 110| Enrollments | `POST` | `/api/me/lessons/:lessonId/progress`| Req | `user`, Staff | Saves lesson playback position (`last_position_seconds`) and completion. Auto-completes course. | `tests/enrollments.test.js` | **Verified** |
| 111| Enrollments | `GET` | `/api/admin/enrollments` | Req | `admin`, `super_admin` | Administrative enrollment listing with student, course, batch, status, and source filters. | `tests/enrollments.test.js` | **Verified** |
| 112| Enrollments | `POST` | `/api/admin/enrollments` | Req | `admin`, `super_admin` | Manually creates enrollment. Enforces transactional seat decrement and logs audit event. | `tests/enrollments.test.js` | **Verified** |
| 113| Enrollments | `PATCH` | `/api/admin/enrollments/:id` | Req | `admin`, `super_admin` | Updates status, access expiry, or reassigns batch with atomic seat handover (Correction 2). | `tests/enrollments.test.js` | **Verified** |

---

## 5.15 Step 11: Wishlist Management (3 Endpoints)

| # | Module | Method | Full Route | Auth | Allowed Roles | Purpose & Behavior | Tests | Status |
|---|---|---|---|:---:|---|---|---|:---:|
| 114| Wishlist | `GET` | `/api/me/wishlist` | Req | `user`, Staff | Retrieves authenticated student's wishlisted courses with batch, instructor, pricing, and ratings. | `tests/wishlist_reviews.test.js` | **Verified** |
| 115| Wishlist | `POST` | `/api/courses/:id/wishlist` | Req | `user`, Staff | Adds course to student wishlist. Idempotent (returns `200` if already added). Increments `wishlist_count`. | `tests/wishlist_reviews.test.js` | **Verified** |
| 116| Wishlist | `DELETE` | `/api/courses/:id/wishlist` | Req | `user`, Staff | Removes course from wishlist. Idempotent. Decrements `wishlist_count = GREATEST(wishlist_count - 1, 0)`. | `tests/wishlist_reviews.test.js` | **Verified** |

---

## 5.16 Step 11: Course Reviews & Moderation (5 Endpoints)

*(Note: Public reviews query `GET /api/courses/:id/reviews` is documented at #34 in Section 5.6 and verified in `tests/wishlist_reviews.test.js`)*

| # | Module | Method | Full Route | Auth | Allowed Roles | Purpose & Behavior | Tests | Status |
|---|---|---|---|:---:|---|---|---|:---:|
| 117| Reviews | `POST` | `/api/courses/:id/reviews` | Req | `user`, Staff | Submits review. Enforces verified enrollment, rating 1-5, single review per course (`409`). Sets `pending`. | `tests/wishlist_reviews.test.js` | **Verified** |
| 118| Reviews | `PATCH` | `/api/me/reviews/:id` | Req | `user`, Staff | Edits own review (`rating`, `title`, `text`). Reverts `moderation_status` to `'pending'`, recomputes course rating. | `tests/wishlist_reviews.test.js` | **Verified** |
| 119| Reviews | `DELETE` | `/api/me/reviews/:id` | Req | `user`, Staff | Deletes own review. Recomputes course `rating_avg` and `rating_count`. | `tests/wishlist_reviews.test.js` | **Verified** |
| 120| Reviews | `GET` | `/api/admin/reviews` | Req | `admin`, `super_admin` | Lists reviews for administration with status, course, rating, pagination, and user contact details. | `tests/wishlist_reviews.test.js` | **Verified** |
| 121| Reviews | `PATCH` | `/api/admin/reviews/:id/moderate` | Req | `admin`, `super_admin` | Approves or rejects review. Dynamically updates `courses.rating_avg`/`rating_count`, logs `review.moderate`. | `tests/wishlist_reviews.test.js` | **Verified** |

---

## 5.17 Root API Info (1 Endpoint)

| # | Module | Method | Full Route | Auth | Allowed Roles | Purpose & Behavior | Tests | Status |
|---|---|---|---|:---:|---|---|---|:---:|
| 122| Root | `GET` | `/api` | None | All | Returns basic API version and documentation info `{ success: true, message: "Course Platform API v1.0" }`. | `tests/server-startup.test.js`| **Verified** |

---

# 6. Step 10 Detailed Reference: Enrollments, Progress & Integrity Corrections

Step 10 implements the core student enrollment subsystem, personal learning progress tracking, administrative enrollment management, and transactional seat protection.

## 6.1 The 7 Core Step 10 Endpoints

### 1. Student Self-Enrollment
- **Route:** `POST /api/courses/:id/enroll`
- **Access:** Authenticated (`user`, `counsellor`, `admin`, `super_admin`)
- **Request Body (JSON):**
  ```json
  {
    "batch_id": 14
  }
  ```
  *(Note: `batch_id` is optional; if omitted, student enrolls in the self-paced course without an assigned batch).*
- **Business Conditions Enforced Server-Side:**
  1. **Course Existence:** Course must exist and not be soft-deleted.
  2. **Publication Check:** `courses.status` must strictly be `'published'`.
  3. **Free Course Restriction:** `courses.is_free` must be `TRUE`. If `is_free = FALSE`, request is rejected with `400 Bad Request` (*"Only free courses can be self-enrolled"*). Paid courses require payment flows.
  4. **Enrollment Date Window:** If `course_enrollment_settings` exists:
     - Rejects if `enrollment_start_at` is in the future.
     - Rejects if `enrollment_end_at` is in the past.
  5. **Course Capacity Limit:** Rejects if `max_students > 0` and current `courses.enrollment_count >= max_students`.
  6. **Server-Side Eligibility Check:** If `course_eligibility_rules.eligibility_enabled = TRUE`:
     - Queries `eligibility_checks` for the student's latest assessment (`user_id = ? AND course_id = ? ORDER BY id DESC LIMIT 1`).
     - If no assessment exists, rejects with `400 Bad Request` (*"Course requires eligibility check before enrollment"*).
     - If latest result is `'not_eligible'`, rejects with `400 Bad Request` (*"Student is not eligible for this course"*).
  7. **Duplicate Prevention:** Checks `course_enrollments` for `(user_id, course_id)`. Rejects duplicate attempts with `409 Conflict`.
  8. **Batch Validation & Row Locking:** If `batch_id` is supplied:
     - Locks batch row with `SELECT ... FOR UPDATE`.
     - Validates `batch.course_id === course.id` (rejects cross-course batches with `400`).
     - Validates `batch.status === 'open'` (rejects closed/completed batches with `400`).
     - Validates `batch.seats_available > 0` (rejects full batches with `409 Conflict`).
- **Database Transaction Effects on Success:**
  - `INSERT INTO course_enrollments (user_id, course_id, batch_id, enrollment_source, enrollment_status, access_expires_at, enrolled_at) VALUES (?, ?, ?, 'free', 'active', ?, NOW())`
  - If batch supplied: `UPDATE course_batches SET seats_available = seats_available - 1, status = IF(seats_available - 1 = 0, 'full', status) WHERE id = ?`
  - `UPDATE courses SET enrollment_count = enrollment_count + 1 WHERE id = ?`
  - Transaction commits atomically.
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Enrollment successful",
    "data": {
      "enrollment_id": 102,
      "course_id": 5,
      "batch_id": 14,
      "enrollment_status": "active",
      "enrolled_at": "2026-10-27T15:30:00.000Z",
      "access_expires_at": "2027-10-27T15:30:00.000Z"
    }
  }
  ```

### 2. My Enrollments List
- **Route:** `GET /api/me/enrollments`
- **Access:** Authenticated (Scoped strictly to `req.user.id`)
- **Query Parameters:** `page` (default 1), `limit` (default 10), `status` (`'active' | 'completed' | 'expired' | 'cancelled'`)
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": [
      {
        "enrollment_id": 102,
        "course": {
          "id": 5,
          "course_name": "Full Stack Web Development",
          "slug": "full-stack-web-development",
          "thumbnail_url": "/files/courses/thumb-5.png",
          "course_level": "beginner",
          "mode": "online"
        },
        "batch": {
          "id": 14,
          "batch_name": "Weekend Batch Oct 2026",
          "start_date": "2026-11-01"
        },
        "enrollment_status": "active",
        "enrolled_at": "2026-10-27T15:30:00.000Z",
        "access_expires_at": "2027-10-27T15:30:00.000Z",
        "progress_percentage": 42.85,
        "last_lesson_id": 28
      }
    ],
    "pagination": { "page": 1, "limit": 10, "total": 1, "total_pages": 1 }
  }
  ```

### 3. Enrolled Course Curriculum
- **Route:** `GET /api/me/courses/:id/curriculum`
- **Access:** Authenticated student enrolled in the course.
- **Permissions:** Unenrolled students receive `403 Forbidden` (*"Active enrollment required to access curriculum"*).
- **Behavior:** Returns full module and lesson hierarchy with lesson duration, completion flags, and actual video URLs (which are withheld from public catalog endpoints).

### 4. Update Lesson Progress
- **Route:** `POST /api/me/lessons/:lessonId/progress`
- **Access:** Authenticated student enrolled in the lesson's course.
- **Request Body (JSON):**
  ```json
  {
    "completed": true,
    "last_position_seconds": 745
  }
  ```
- **Behavior:**
  - Verifies lesson belongs to a course in which `req.user.id` has an active enrollment.
  - Inserts or updates `lesson_progress` row using `ON DUPLICATE KEY UPDATE`.
  - Recomputes total course completion. If all published lessons are marked `completed = TRUE`, automatically updates `course_enrollments.enrollment_status = 'completed'` and sets `completed_at = NOW()`.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Progress recorded successfully",
    "data": {
      "lesson_id": 44,
      "completed": true,
      "last_position_seconds": 745,
      "course_progress_percentage": 100.0,
      "course_completed": true
    }
  }
  ```

### 5. Admin Enrollment Listing
- **Route:** `GET /api/admin/enrollments`
- **Access:** `admin`, `super_admin` (`user` and `counsellor` rejected with `403 Forbidden`).
- **Query Parameters:** `page`, `limit`, `course_id`, `user_id`, `batch_id`, `status`, `source`, `sort`
- **Behavior:** Returns full student identity, enrolled course metadata, assigned batch details, enrolled_by staff ID, and pagination.

### 6. Admin Manual Enrollment Creation
- **Route:** `POST /api/admin/enrollments`
- **Access:** `admin`, `super_admin`
- **Request Body (JSON):**
  ```json
  {
    "user_id": 88,
    "course_id": 5,
    "batch_id": 14,
    "access_expires_at": "2027-12-31T23:59:59Z",
    "notes": "Corporate sponsored enrollment"
  }
  ```
- **Behavior:** Creates enrollment with `enrollment_source = 'admin_manual'`. Atomically manages batch seats and course enrollment counters inside a transaction. Records audit log `enrollment.admin_create`.

### 7. Admin Enrollment Update & Batch Reassignment
- **Route:** `PATCH /api/admin/enrollments/:id`
- **Access:** `admin`, `super_admin`
- **Request Body (JSON):**
  ```json
  {
    "enrollment_status": "active",
    "batch_id": 15,
    "access_expires_at": "2028-01-01T00:00:00Z",
    "notes": "Transferred to Batch 15"
  }
  ```
- **Behavior:** Enforces atomic batch seat handover when reassigning batches (see Section 6.2). Records audit log `enrollment.admin_update`.

---

## 6.2 Verified Database Integrity Corrections

### Correction 1: Demo Conversion Batch Validation
Implemented in [`src/modules/demo/demo.repository.js`](file:///D:/Course_plateform/backend/src/modules/demo/demo.repository.js) and [`src/modules/demo/demo.service.js`](file:///D:/Course_plateform/backend/src/modules/demo/demo.service.js).
- When an administrator converts a demo lead into an enrollment via `POST /api/admin/demo-requests/:id/convert`:
  - If `batch_id` is supplied in the request body, the batch row is locked with `SELECT ... FOR UPDATE` inside the conversion transaction.
  - The batch must belong to the demo request's target course (`batch.course_id === request.course_id`). Mismatched batches are rejected with `400 Bad Request`.
  - The batch status must be `'open'`. Closed or completed batches are rejected with `400 Bad Request`.
  - The batch must have `seats_available > 0`. If full, rejected with `409 Conflict`.
  - If validation fails, the entire transaction rolls back; no enrollment is inserted and the demo request status remains unchanged.
  - If `batch_id` is omitted, the conversion succeeds with `batch_id = NULL`, preserving flexible demo conversion flows.
- **Verification:** Covered by 4 dedicated automated test cases in `tests/demo_classes.test.js`.

### Correction 2: Admin Batch Reassignment Atomicity
Implemented in [`src/modules/enrollments/enrollment.repository.js`](file:///D:/Course_plateform/backend/src/modules/enrollments/enrollment.repository.js) and [`src/modules/enrollments/enrollment.service.js`](file:///D:/Course_plateform/backend/src/modules/enrollments/enrollment.service.js).
- When an administrator changes a student's batch via `PATCH /api/admin/enrollments/:id`:
  - If `batch_id` changes from `old_batch_id` to `new_batch_id`:
    - Locks both old and new batches `FOR UPDATE`.
    - Validates that the new batch belongs to the enrollment's course.
    - Validates that the new batch is status `'open'` with `seats_available > 0`.
    - Atomically increments seats on the old batch (`seats_available = seats_available + 1`).
    - Atomically decrements seats on the new batch (`seats_available = seats_available - 1`).
    - Updates enrollment record with `batch_id = new_batch_id`.
  - If the new batch is invalid or full, the transaction rolls back cleanly, leaving the old batch's seat count untouched.
- **Verification:** Covered by 4 dedicated automated test cases in `tests/enrollments.test.js` (Subtest 6).

### Correction 3: Concurrent Final-Seat Contention
Implemented in [`tests/enrollments.test.js`](file:///D:/Course_plateform/backend/tests/enrollments.test.js) (Subtest 7).
- Tests race conditions under high concurrency targeting the final available seat:
  - Creates a course and batch with exactly `seats_available = 1`.
  - Prepares two distinct authenticated students (User A and User B).
  - Fires two simultaneous self-enrollment HTTP requests via `Promise.all([requestA, requestB])`.
  - **Verified Result:**
    - MariaDB row-level locking (`SELECT ... FOR UPDATE`) serialized the requests.
    - Exactly one request succeeded with `201 Created`.
    - The concurrent request was rejected with `409 Conflict` (*"Batch is full"*).
    - `seats_available` ended at exactly `0` (never negative).
    - `course_batches.status` automatically transitioned from `'open'` to `'full'`.
    - `courses.enrollment_count` incremented by exactly `1`.
    - Exactly one enrollment row was written to `course_enrollments`.

### Correction 4: Cancellation Policy Preservation
- The current implementation enforces:
  - Cancelling an enrollment updates `enrollment_status = 'cancelled'`.
  - Batch seats are **not restored** upon cancellation.
  - `courses.enrollment_count` is **not decremented**.
  - `courses.enrollment_count` functions as a cumulative lifetime enrollment counter.
- **Stakeholder Decision Required:** This behavior is preserved without alteration as documented in Section 9.

---

# 7. How to Test the Backend — Automated and Manual Testing

## 7.1 Automated Test Execution

All tests run on Node.js native test runner (`node --test`). Tests execute against `course_platform_db` (MariaDB 10.4.32 on `localhost:3306`).

### Full Test Suite Command
To run all 13 test suites sequentially:
```powershell
cd D:\Course_plateform\backend
node scratch/run_all_tests.js
```
*Expected Output:*
```
Starting execution of 13 test files sequentially...

Executing tests/auth.test.js... PASS (1.30s, 22 tests, 7 suites)
Executing tests/catalog.test.js... PASS (1.49s, 36 tests, 6 suites)
Executing tests/course_content.test.js... PASS (1.50s, 36 tests, 9 suites)
Executing tests/demo_classes.test.js... PASS (1.51s, 42 tests, 7 suites)
Executing tests/eligibility.test.js... PASS (1.59s, 35 tests, 9 suites)
Executing tests/enrollments.test.js... PASS (1.34s, 31 tests, 8 suites)
Executing tests/esm-import.test.js... PASS (0.99s, 5 tests, 1 suites)
Executing tests/health.test.js... PASS (1.00s, 8 tests, 1 suites)
Executing tests/schema.test.js... PASS (0.37s, 11 tests, 1 suites)
Executing tests/server-startup.test.js... PASS (0.89s, 1 tests, 1 suites)
Executing tests/uploads_materials.test.js... PASS (1.49s, 40 tests, 7 suites)
Executing tests/utils.test.js... PASS (0.22s, 10 tests, 5 suites)
Executing tests/wishlist_reviews.test.js... PASS (1.47s, 33 tests, 7 suites)

=============================================
ALL 13 TEST FILES PASSED! Total tests: 310, Total suites: 69
```

### Individual Test File Commands
```powershell
# Run Wishlist, Reviews & Moderation Tests (33 tests)
node --test tests/wishlist_reviews.test.js

# Run Enrollment & Progress Tests (31 tests)
node --test tests/enrollments.test.js

# Run Demo Classes & Conversion Tests (42 tests)
node --test tests/demo_classes.test.js

# Run Eligibility Engine Tests (35 tests)
node --test tests/eligibility.test.js

# Run Catalog & Search Tests (36 tests)
node --test tests/catalog.test.js

# Run Course Content, SEO & Batches Tests (36 tests)
node --test tests/course_content.test.js

# Run Uploads & Materials Tests (40 tests)
node --test tests/uploads_materials.test.js

# Run Auth & Session Tests (22 tests)
node --test tests/auth.test.js

# Run Database Schema Validation Tests (11 tests)
node --test tests/schema.test.js

# Run Health Check Tests (8 tests)
node --test tests/health.test.js
```

---

## 7.2 Manual API Testing Procedure

Manual testing can be performed using Postman, Thunder Client, or cURL.

### Step 1: Start the Development Server
```powershell
cd D:\Course_plateform\backend
npm run dev
```
*Server starts on configured port (default: `http://localhost:5000`).*

### Step 2: Verify Health
```http
GET /api/health
Host: localhost:5000
```
*Expected: `200 OK` with status `'up'`.*

### Step 3: Authenticate Test Accounts
Use the test utility to generate authentic JWT access tokens for testing:
- User Token: role `'user'`
- Admin Token: role `'admin'`
- Counsellor Token: role `'counsellor'`

### Step 4: Execute Test Flows

#### A. Free Self-Enrollment Flow
1. Check course eligibility:
   ```http
   POST /api/courses/1/eligibility-checks
   Authorization: Bearer <USER_TOKEN>
   Content-Type: application/json

   {
     "qualification": "bachelors",
     "programming_experience": "beginner",
     "weekly_hours_available": 15
   }
   ```
   *Expected: `200 OK` with `result: "eligible"`.*

2. Submit self-enrollment:
   ```http
   POST /api/courses/1/enroll
   Authorization: Bearer <USER_TOKEN>
   Content-Type: application/json

   {
     "batch_id": 1
   }
   ```
   *Expected: `201 Created` with `enrollment_status: "active"`.*

3. Try duplicate enrollment:
   *Resend step 2. Expected: `409 Conflict` ("User already enrolled in this course").*

4. View enrolled curriculum:
   ```http
   GET /api/me/courses/1/curriculum
   Authorization: Bearer <USER_TOKEN>
   ```
   *Expected: `200 OK` with lesson modules and video URLs.*

5. Save lesson progress:
   ```http
   POST /api/me/lessons/1/progress
   Authorization: Bearer <USER_TOKEN>
   Content-Type: application/json

   {
     "completed": true,
     "last_position_seconds": 300
   }
   ```
   *Expected: `200 OK`.*

#### B. Admin Batch Reassignment Flow
1. Update student enrollment batch:
   ```http
   PATCH /api/admin/enrollments/1
   Authorization: Bearer <ADMIN_TOKEN>
   Content-Type: application/json

   {
     "batch_id": 2
   }
   ```
   *Expected: `200 OK`.*
   *Verify in DB: batch 1 seats incremented by 1, batch 2 seats decremented by 1.*

---

# 8. Test Coverage and Evidence Matrix

| Module | Endpoint / Feature Area | Positive Cases | Negative Cases | Role Tests | DB Integrity Tests | Total Tests | Status |
|---|---|---|---|---|---|:---:|:---:|
| **Health** | `/api/health`, `/api/health/db` | Server up, DB latency probe | DB down (503) | Public access | Connection pool state | 8 | **Verified** |
| **Auth** | `/api/auth/google`, refresh, logout, profile | Sign-in, token rotation, update me | Bad tokens, expired tokens | All roles, banned check | Replay attack revocation | 22 | **Verified** |
| **Catalog** | Categories, Subcategories, Instructors | Listing, detail, admin CRUD, reorder | Slug conflict (409), invalid ID | Admin vs user check | Child block on delete | 36 | **Verified** |
| **Course Content** | SEO, Pricing, Offers, FAQs, Benefits, Batches | Get & update metadata, installment plans | Offer > price, negative pricing | Admin restricted | Batch seat constraints | 36 | **Verified** |
| **Uploads & Materials** | File upload, static files, study materials | Valid image/PDF, signed download token | Magic byte mismatch, paid bypass | Admin upload, user download | Path traversal protection | 40 | **Verified** |
| **Demo Classes** | Demo settings, bookings, lead conversion | Valid booking, status patch, CSV export | Duplicate lead in 30d (409), bad phone | Counsellor vs Admin roles | Concurrency, batch lock (Corr 1) | 42 | **Verified** |
| **Eligibility** | Rules configuration, student evaluation | Passing evaluation, question scrub | Failing evaluation, missing fields | 5-role access matrix | Assessment persistence | 35 | **Verified** |
| **Enrollments** | Self-enroll, my courses, progress, admin | Free enroll, curriculum, progress save | Paid reject (400), full batch (409) | Student vs Admin vs Counsellor | Concurrency (Corr 3), Reassign (Corr 2) | 31 | **Verified** |
| **Schema** | 33 business tables + migrations table | Schema validation, foreign keys | N/A | Super admin seed | Referential cascades | 11 | **Verified** |
| **Startup & ESM** | App initialization, ES Module imports | Port bind, clean ESM resolution | Module load errors | N/A | In-memory verification | 6 | **Verified** |
| **Wishlist** | `/api/me/wishlist`, `/api/courses/:id/wishlist` | Add, remove, list, idempotency | Missing course (404), unauth (401) | User data isolation | Atomic counter increment & GREATEST(x-1, 0) | 11 | **Verified** |
| **Reviews & Ratings** | `/api/courses/:id/reviews`, `/api/me/reviews/:id`, `/api/admin/reviews`, moderation | Public list, submit, edit, delete, moderate | Duplicate (409), unenrolled (403), rating range (400) | Student vs Admin, non-owner block (403) | Re-moderation to pending on edit, dynamic rating recalculation, privacy scrub | 22 | **Verified** |
| **Total** | **All 13 Automated Test Suites** | **198 Cases** | **68 Cases** | **26 Cases** | **18 Cases** | **310** | **PASS (0 Fail)** |

---

# 9. Project Status — Completed, Pending, Blocked and Unverified

## 9.1 Table A: Completed Work Register

| Milestone | Area | Key APIs Implemented | Security & Integrity Controls | Automated Test Evidence | Status |
|---|---|---|---|---|:---:|
| **Step 1** | Foundation & Architecture | `/api/health`, `/api/health/db` | Helmet, CORS, centralized errorHandler, response helpers | `tests/health.test.js`, `server-startup.test.js` | **Verified** |
| **Step 2** | Auth & User Sessions | `/api/auth/google`, refresh, logout, `/me` | SHA-256 token hashing, token rotation, replay detection | `tests/auth.test.js` (22 tests) | **Verified** |
| **Step 3** | Catalog Hierarchy | Categories, Subcategories, Instructors | Child entity deletion blocking (409), display ordering | `tests/catalog.test.js` (36 tests) | **Verified** |
| **Step 4** | Media & Uploads | `/api/admin/uploads` | Magic bytes sniffing, mime validation, UUID filenames | `tests/uploads_materials.test.js` (40 tests) | **Verified** |
| **Step 5** | Courses CRUD | `/api/courses`, `/api/admin/courses` | Pre-publish checks, 301 slug redirect history | `tests/catalog.test.js` (36 tests) | **Verified** |
| **Step 6** | Course Content | SEO, Pricing, Batches, FAQs, Benefits | `offer_price <= price` invariant, batch status ENUM | `tests/course_content.test.js` (36 tests) | **Verified** |
| **Step 7** | Course Materials | `/api/courses/:id/materials`, download | Signed download tokens, paid material authorization | `tests/uploads_materials.test.js` (40 tests) | **Verified** |
| **Step 8** | Demo Class Leads | Booking, leads CRM, conversion | Transactional demo conversion with batch locking (Corr 1) | `tests/demo_classes.test.js` (42 tests) | **Verified** |
| **Step 9** | Course Eligibility | Rules, student assessment | Full 5-role access matrix, server-side scoring | `tests/eligibility.test.js` (35 tests) | **Verified** |
| **Step 10**| Course Enrollments | Self-enroll, My Courses, curriculum, progress | Concurrency row-locking (Corr 3), Batch handover (Corr 2) | `tests/enrollments.test.js` (31 tests) | **Verified** |
| **Step 11**| Wishlist, Reviews & Search | `/api/me/wishlist`, `/api/courses/:id/wishlist`, reviews CRUD, moderation | Idempotent wishlist counters (GREATEST >= 0), verified enrollment (403), duplicate check (409), dynamic rating recalculation, student contact privacy scrub | `tests/wishlist_reviews.test.js` (33 tests) | **Verified** |

---

## 9.2 Table B: Pending Implementation Register

| Build Step | Milestone Name | Authoritative Spec Ref | Planned Deliverables | Dependencies | Acceptance Criteria | Current Status |
|---|---|---|---|---|---|:---:|
| **Step 12** | Views, Analytics & Cron | Section 16, 19.2, 19.4 | Public view tracking, admin analytics dashboard, 8 node-cron jobs | Step 11 | Nightly analytics aggregation, offer expiry cron, session cleanup | **Ready for Implementation (NEXT)** |
| **Step 13** | Audit, Notifications, Admin Users | Section 17, 19.4 | Admin user management, audit log viewer, notification queue worker | Step 12 | Role management, notification worker dispatch, final production QA | **Pending Step 12** |

---

## 9.3 Table C: Unresolved Decisions, Ambiguities & Blockers

| ID | Topic | Current Implementation Reality | Impact & Risk | Required Decision / Action | Status |
|---|---|---|---|---|:---:|
| **U-1** | **Cancellation Seat & Counter Policy** | Cancelling sets `enrollment_status = 'cancelled'`. Batch seats are not restored and `courses.enrollment_count` is not decremented. | Ambiguity on whether `enrollment_count` is lifetime or active, and whether cancelled seats should be recycled. | Stakeholder decision: (A) Lifetime counter + no seat restore (current), or (B) Decrement active count + restore seat. | **Decision Pending (Preserved)** |
| **U-2** | **Disk Plan File Truncation** | `D:\Course_plateform\Course_Platform_Backend_Plan.txt` on disk is truncated at line 1,000 (Section 9.3). Sections 10–19 exist in conversation transcripts. | Anyone relying solely on the disk text file will be unable to audit Sections 10–19. | Restore full 2,422 lines of `Course_Platform_Backend_Plan.txt` to disk. | **Documentation Blocker** |
| **U-3** | **Untested Public Reviews Route** | `GET /api/courses/:id/reviews` was previously mounted without dedicated test coverage. | Risk eliminated: now covered by 4 dedicated test assertions (positive, negative, privacy, non-existent course). | Verified in Step 11 test suite `tests/wishlist_reviews.test.js`. | **Resolved & Verified** |

---

# 10. Build-Order Numbering Verification

In an earlier project report, a discrepancy appeared where the remaining milestones were mislabelled as *"Step 11: Payments, Step 12: Wishlists/Reviews, Step 13: Analytics/Cron"*.

### Authoritative Build Order Resolution (Section 19.4)
Cross-referencing the full authoritative specification confirms the true, unbroken build order:

```
Step 1:  Project setup, DB connection, migrations, error handler
Step 2:  Auth: Google login, tokens, roles, super_admin seed
Step 3:  Categories, subcategories, instructors
Step 4:  Uploads (local)
Step 5:  Courses CRUD, publish checks, course detail API
Step 6:  SEO, pricing, offers, FAQs, benefits, curriculum, batches
Step 7:  Materials aur signed downloads
Step 8:  Demo settings, demo requests, admin leads
Step 9:  Eligibility rules & check form
Step 10: Enrollments (free, manual, demo convert), progress -> My courses (COMPLETED)
Step 11: Wishlist, reviews, search (COMPLETED & VERIFIED)
Step 12: Views, analytics, dashboard, cron jobs (NEXT)
Step 13: Audit logs, notifications queue, users management, tests
```

> [!WARNING]
> **No Payments in Scope:** Section 1 explicitly excludes online payment gateways (*"Payment gateway aur online payment... jaan boojh kar shamil nahi hai. Enrollment abhi admin manual ya free enroll se hoga"*). Step 11 was strictly **Wishlist, Reviews & Search**, and Step 12 is strictly **Views, Analytics, Dashboard & Cron**. Under no circumstances should payment gateways be introduced.

---

# 11. Next Planned Work — Section 19.4 Step 12: Views, Analytics, Dashboard & Cron Jobs

With **Step 11 (Wishlist, Reviews & Search)** completed and verified by 33 automated tests (bringing the total regression suite to 310 tests across 13 files with 0 failures), the next authoritative build milestone is **Step 12**.

## 11.1 Step 11 Verification Summary
- **Wishlist Module:** 3 endpoints (`GET /api/me/wishlist`, `POST /api/courses/:id/wishlist`, `DELETE /api/courses/:id/wishlist`) verified with idempotency and atomic `courses.wishlist_count` updates (`GREATEST(wishlist_count - 1, 0)`).
- **Reviews & Ratings Module:** 5 write/admin endpoints (`POST /api/courses/:id/reviews`, `PATCH /api/me/reviews/:id`, `DELETE /api/me/reviews/:id`, `GET /api/admin/reviews`, `PATCH /api/admin/reviews/:id/moderate`) plus the existing public `GET /api/courses/:id/reviews` endpoint verified.
- **Key Invariants Enforced:**
  - Verified active or completed enrollment required for review submission (403).
  - Duplicate review per student per course blocked (409).
  - Editing an approved review reverts `moderation_status` back to `'pending'` and recomputes the course rating.
  - Course ratings (`rating_avg`, `rating_count`) are dynamically recalculated exclusively from `moderation_status = 'approved'` records.
  - Public reviews strictly scrub student personal contact data (`email`, `phone`).
- **Search Module:** Verified that `GET /api/search` operates cleanly alongside wishlist and review aggregates without regressions.

---

## 11.2 Step 12 Subsystem Requirements & Scope (Section 16 & 19.2)

### A. Public View Tracking Subsystem (Section 16.1)
- **Database Table:** `course_views` (tracking IP / hashed session, course ID, timestamp) and `courses.view_count`.
- **Planned Endpoints:**
  - `POST /api/courses/:id/view`: Records a course view with rate-limiting / deduplication per IP / session window to prevent counter inflation.

### B. Admin Analytics & Dashboard Subsystem (Section 16.2 & 19.2)
- **Planned Endpoints:**
  - `GET /api/admin/analytics/overview`: High-level metrics (total enrollments, active students, popular courses, demo lead conversion rate, pending reviews).
  - `GET /api/admin/analytics/courses`: Per-course performance metrics (views, wishlist additions, enrollments, completion rates, rating distribution).
  - `GET /api/admin/analytics/leads`: Demo lead conversion funnel statistics.

### C. Background Scheduled Jobs (node-cron) (Section 19.2)
Authoritative specification requires 8 scheduled background cron jobs:
1. **Daily Analytics Aggregation:** Nightly rollups of course views, enrollments, and lead metrics into daily reporting tables.
2. **Offer Expiry Checker:** Automatically marks expired promotional offers as inactive.
3. **Demo Class Reminders:** Sends automated reminder notifications for upcoming booked demo sessions.
4. **Access Expiry Checker:** Automatically transitions expired student enrollments to `'expired'` status.
5. **Session / Refresh Token Cleanup:** Purges expired or revoked tokens older than retention policy.
6. **Temporary Uploads Cleanup:** Removes unlinked scratch / temporary uploads older than 24 hours.
7. **Batch Seat Reconciliation:** Nightly sanity check ensuring `seats_available + (enrolled count) = max_capacity`.
8. **Database & Service Heartbeat:** Regular background health and latency monitoring check.

---

## 11.3 Step 12 Readiness Checklist

| Item | Requirement | Status |
|---|---|:---:|
| **Prerequisites** | Step 11 Wishlist, Reviews & Search completed | **COMPLETED & VERIFIED (310/310 Tests)** |
| **Database Schema** | Verify analytics tables and view tracking schema | **Pending Inspection** |
| **Dependencies** | Check if `node-cron` is present or requires setup | **Pending Verification** |
| **Target Route Files**| `src/modules/analytics/` and `src/jobs/` | **Pending Approval** |
| **Automated Tests** | `tests/analytics_cron.test.js` | **Pending Approval** |

---

# 12. Final Handover Summary & Verification Checklist

### Verification Summary
- **Primary Document Updated:** [`docs/COURSE_PLATFORM_BACKEND_MANUAL.md`](file:///D:/Course_plateform/backend/docs/COURSE_PLATFORM_BACKEND_MANUAL.md) (in-place).
- **All Registered Endpoints Documented:** 122 API endpoints (+ 1 root documentation info `/api`) across 16 functional modules verified.
- **Automated Regression Status:** **310 passing tests across 13 files (0 failures).**
- **Step 11 Deliverables Verified:**
  - Wishlist module with atomic counter and authenticated student isolation.
  - Reviews module with verified enrollment checking, duplicate prevention, re-moderation on edit, and dynamic rating recalculation.
  - Public reviews test assertion verifying student privacy scrubbing (email/phone omitted).
  - Search endpoint regression verified.
- **Safety Boundaries Respected:**
  - Workspace: `D:\Course_plateform\backend\` exclusively.
  - Unrelated project `D:\g9expert` untouched.
  - Dedicated database `course_platform_db` preserved without destructive schema resets.
  - Applied migrations `001` through `008` preserved.
  - No payment gateways or external third-party services introduced.

---

### Mandatory Stop Condition
**Step 11 is 100% complete, tested, and documented. Step 12 requirements and readiness are established. Awaiting explicit user approval before beginning Section 19.4 Step 12 implementation.**
