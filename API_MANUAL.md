# Course Platform Backend — Comprehensive API Manual

**Specification Version:** 1.0.0  
**Backend Framework:** Node.js 18+ / Express 4 (ESM)  
**Database Target:** MariaDB / MySQL (`course_platform_db`)  
**Timezone Standard:** `Asia/Kolkata` (`+05:30`)  
**Character Encoding:** `utf8mb4` / `utf8mb4_unicode_ci`  
**Current Test Coverage:** 14/14 Suites Passed, 343/343 Tests Passing  
**Implemented Modules:** Steps 1–12 (128 Unique Endpoints, 8 Automated Background Cron Schedulers)  
**Deferred Modules:** Step 13 Payments, Orders, and Checkout Gateway Integration (Pending)

---

## Table of Contents

1. [Architectural Overview & Global Conventions](#1-architectural-overview--global-conventions)
   - [Base URL & Protocol](#11-base-url--protocol)
   - [Standard Request Headers](#12-standard-request-headers)
   - [Standard Success & Paginated Responses](#13-standard-success--paginated-responses)
   - [Standard Error Handling & Status Codes](#14-standard-error-handling--status-codes)
   - [Authentication & Role-Based Access Control (RBAC)](#15-authentication--role-based-access-control-rbac)
   - [Global Rate Limiting Architecture](#16-global-rate-limiting-architecture)
2. [Module 1: Health Diagnostics & Root System](#2-module-1-health-diagnostics--root-system)
3. [Module 2: Authentication & Session Management](#3-module-2-authentication--session-management)
4. [Module 3: Categories & Hierarchy](#4-module-3-categories--hierarchy)
5. [Module 4: Subcategories & Taxonomy](#5-module-4-subcategories--taxonomy)
6. [Module 5: Instructors Management](#6-module-5-instructors-management)
7. [Module 6: Public Course Catalog & Core Courses](#7-module-6-public-course-catalog--core-courses)
8. [Module 7: Global Search Engine](#8-module-7-global-search-engine)
9. [Module 8: Curriculum, Modules & Lessons](#9-module-8-curriculum-modules--lessons)
10. [Module 9: Batches & Scheduling](#10-module-9-batches--scheduling)
11. [Module 10: Course Content Enhancements (Pricing, SEO, Offers, FAQs, etc.)](#11-module-10-course-content-enhancements)
12. [Module 11: File Uploads & Media Assets](#12-module-11-file-uploads--media-assets)
13. [Module 12: Downloadable Course Materials](#13-module-12-downloadable-course-materials)
14. [Module 13: Demo Classes & Lead Management](#14-module-13-demo-classes--lead-management)
15. [Module 14: Eligibility Engine & Evaluations](#15-module-14-eligibility-engine--evaluations)
16. [Module 15: Student Enrollments & Curriculum Progress](#16-module-15-student-enrollments--curriculum-progress)
17. [Module 16: Wishlist Management](#17-module-16-wishlist-management)
18. [Module 17: Reviews & Moderation](#18-module-17-reviews--moderation)
19. [Module 18: Views, Telemetry, Analytics & Executive Dashboard](#19-module-18-views-telemetry-analytics--executive-dashboard)
20. [Automated Background Cron Schedulers & Advisory Locking](#20-automated-background-cron-schedulers--advisory-locking)
21. [Step 13 Postponement Notice (Payments & Orders)](#21-step-13-postponement-notice-payments--orders)

---

## 1. Architectural Overview & Global Conventions

### 1.1 Base URL & Protocol
- **Production Base URL:** `https://api.yourdomain.com/api`
- **Development Base URL:** `http://localhost:5000/api`
- **Protocol:** HTTP/1.1 or HTTP/2 over TLS in production
- **Format:** JSON (`Content-Type: application/json` UTF-8) except for file upload endpoints which use `multipart/form-data`.

### 1.2 Standard Request Headers
| Header | Description | Required On |
|---|---|---|
| `Content-Type` | `application/json` | All `POST`, `PUT`, `PATCH` requests with body. |
| `Authorization` | `Bearer <access_token>` | Optional alternative to `access_token` cookie for authenticated requests. |
| `Cookie` | `access_token=...; refresh_token=...` | Standard browser-based authenticated sessions. |

### 1.3 Standard Success & Paginated Responses
All successful responses return HTTP `200 OK` (or `201 Created` for resource creation) wrapped in standard envelope:

```json
{
  "success": true,
  "message": "Resource retrieved successfully",
  "data": { ... }
}
```

Paginated lists wrap collection items in `data` and append metadata in `pagination`:
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 145,
    "total_pages": 8
  }
}
```

### 1.4 Standard Error Handling & Status Codes
Errors return a standard envelope with no leakage of internal SQL queries, file paths, or system stack traces:
```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "email", "message": "Invalid email address format" }
  ]
}
```

| HTTP Status | Meaning | Typical Trigger |
|---|---|---|
| `400 Bad Request` | Client error or Zod schema validation failure. | Missing required fields, invalid types, malformed JSON. |
| `401 Unauthorized` | Missing, invalid, or expired JWT token. | Accessing protected route without authentication. |
| `403 Forbidden` | Authenticated, but lacking sufficient role permission. | Student accessing `/api/admin/*` endpoints. |
| `404 Not Found` | Requested resource does not exist or is inactive. | Invalid ID, slug, or soft-deleted resource. |
| `409 Conflict` | Unique constraint or business conflict. | Duplicate slug, duplicate enrollment, duplicate review. |
| `429 Too Many Requests` | IP rate limit exceeded. | Brute force login, demo spamming, view flooding. |
| `500 Internal Error` | Unexpected server exception. | Database outage, unhandled filesystem failure. |

### 1.5 Authentication & Role-Based Access Control (RBAC)
User identity is established via Google OAuth2 token exchange (`POST /api/auth/google`).
- **Access Token:** Short-lived JWT (`15m` TTL) signed with `JWT_ACCESS_SECRET`. Contains `{ id, role }`.
- **Refresh Token:** Long-lived cryptographically secure random token (`30d` TTL) stored as SHA-256 hash in `refresh_tokens`.
- **Cookie Security:** Cookies set with `httpOnly: true`, `sameSite: 'strict'`, and `secure: true` in production.
- **Roles:**
  1. `user`: Registered student.
  2. `counsellor`: Sales & academic counsellor (demo leads, eligibility checks).
  3. `admin`: Academic and platform administrator.
  4. `super_admin`: Full system control (initial seed from `SUPER_ADMIN_EMAIL`).

### 1.6 Global Rate Limiting Architecture
- **General API Limiter:** 300 requests / 15 minutes per IP (`generalRateLimiter`).
- **Authentication Limiter:** 10 requests / 15 minutes per IP (`authRateLimiter`).
- **Demo Booking Limiter:** 5 requests / 1 hour per IP (`demoFormRateLimiter`).
- **Course View Tracking Limiter:** 60 requests / 1 minute per IP (`viewsRateLimiter`).

---

## 2. Module 1: Health Diagnostics & Root System

### 2.1 GET /api
- **Module:** Root Information
- **Purpose:** Platform API metadata and verification endpoint.
- **Auth:** Public
- **Role:** None
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Course Platform API v1.0",
    "documentation": "/api/docs"
  }
  ```

### 2.2 GET /api/health
- **Module:** Health Diagnostics
- **Purpose:** Lightweight process liveness check for load balancers (AWS ALB, Nginx, Kubernetes).
- **Auth:** Public
- **Role:** None
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Course Platform API is healthy",
    "data": {
      "status": "healthy",
      "timestamp": "2026-10-31T20:55:00.000+05:30",
      "uptime": 3482.12,
      "environment": "production"
    }
  }
  ```

### 2.3 GET /api/health/db
- **Module:** Health Diagnostics
- **Purpose:** Deep readiness probe verifying MariaDB database connectivity, ping latency, and database name.
- **Auth:** Public
- **Role:** None
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Database connection is healthy",
    "data": {
      "status": "up",
      "latencyMs": 2,
      "database": "course_platform_db",
      "mock": false
    }
  }
  ```
- **Error Response (`503 Service Unavailable`):**
  ```json
  {
    "success": false,
    "message": "Database connection failed",
    "data": { "status": "down", "error": "ECONNREFUSED" }
  }
  ```
- **Database Effects:** Executes read-only query `SELECT 1 AS health_check, DATABASE() AS current_db`.

---

## 3. Module 2: Authentication & Session Management

### 3.1 POST /api/auth/google
- **Module:** Authentication
- **Purpose:** Authenticate user using Google OAuth ID token. Verifies token against Google OAuth API, provisions user in `users` table if not present, and sets `access_token` and `refresh_token` HTTP-only cookies.
- **Auth:** Public
- **Rate Limit:** 10 req / 15 min per IP.
- **Body:**
  - `id_token` (`string`, required): Google JWT ID token.
- **Response (`200 OK`):**
  - Sets cookies: `access_token` (Max-Age: 15m), `refresh_token` (Max-Age: 30d, Path: `/api/auth`).
  ```json
  {
    "success": true,
    "message": "Login successful",
    "data": {
      "user": {
        "id": 14,
        "name": "Pooja Sharma",
        "email": "pooja.sharma@example.com",
        "role": "user",
        "avatar_url": "https://lh3.googleusercontent.com/a/..."
      }
    }
  }
  ```
- **Database Effects:** Inserts/updates `users`, inserts SHA-256 hashed token into `refresh_tokens`.

### 3.2 POST /api/auth/refresh
- **Module:** Authentication
- **Purpose:** Rotate refresh token. Detects token replay attacks: if an already-revoked refresh token is re-submitted, all active sessions for that user are immediately revoked.
- **Auth:** Public (Requires `refresh_token` cookie).
- **Response (`200 OK`):**
  - Sets fresh `access_token` and rotated `refresh_token` cookies.
  ```json
  {
    "success": true,
    "message": "Token refreshed successfully",
    "data": {
      "user": { "id": 14, "role": "user" }
    }
  }
  ```
- **Errors:** `401 Unauthorized` (Token expired or revoked).
- **Database Effects:** Marks previous `refresh_tokens` record with `revoked_at = NOW()`, inserts new hashed token.

### 3.3 POST /api/auth/logout
- **Module:** Authentication
- **Purpose:** Revoke current session's refresh token and clear auth cookies from browser.
- **Auth:** Authenticated (`user`, `counsellor`, `admin`, `super_admin`).
- **Response (`200 OK`):**
  ```json
  { "success": true, "message": "Logged out successfully" }
  ```
- **Database Effects:** Sets `revoked_at = NOW()` on the matching `refresh_tokens` row.

### 3.4 POST /api/auth/logout-all
- **Module:** Authentication
- **Purpose:** Invalidate all active sessions across all devices for the current user.
- **Auth:** Authenticated.
- **Response (`200 OK`):**
  ```json
  { "success": true, "message": "All sessions terminated successfully" }
  ```
- **Database Effects:** `UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL`.

### 3.5 GET /api/auth/me
- **Module:** Authentication
- **Purpose:** Retrieve currently authenticated user profile, role, and permissions.
- **Auth:** Authenticated.
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "User profile retrieved",
    "data": {
      "user": {
        "id": 14,
        "name": "Pooja Sharma",
        "email": "pooja.sharma@example.com",
        "phone": "+919876543210",
        "role": "user",
        "status": "active",
        "avatar_url": "https://..."
      }
    }
  }
  ```

### 3.6 PATCH /api/auth/me
- **Module:** Authentication
- **Purpose:** Update authenticated user's profile details.
- **Auth:** Authenticated.
- **Body:**
  - `name` (`string`, optional, min 2, max 100)
  - `phone` (`string`, optional, valid phone regex)
  - `avatar_url` (`string`, optional, valid URL)
- **Response (`200 OK`):** Returns updated user profile.
- **Database Effects:** `UPDATE users SET name = ?, phone = ?, avatar_url = ?, updated_at = NOW() WHERE id = ?`.

---

## 4. Module 3: Categories & Hierarchy

### 4.1 GET /api/categories
- **Module:** Categories
- **Purpose:** Public catalog list of active course categories with published course counts and icons.
- **Auth:** Public
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Categories retrieved successfully",
    "data": [
      {
        "id": 1,
        "name": "Full Stack Web Development",
        "slug": "full-stack-web-development",
        "description": "Master frontend and backend web engineering",
        "icon": "code-slash",
        "display_order": 1,
        "course_count": 12
      }
    ]
  }
  ```

### 4.2 GET /api/categories/:slug
- **Module:** Categories
- **Purpose:** Public category detail page with active subcategories and summary.
- **Auth:** Public
- **Path Params:** `slug` (`string`, required)
- **Response (`200 OK`):** Returns category object and nested `subcategories` array.
- **Errors:** `404 Not Found` if category does not exist or `status != 'active'`.

### 4.3 GET /api/admin/categories
- **Module:** Categories
- **Purpose:** Administrative paginated list of categories including inactive records.
- **Auth:** Admin (`admin`, `super_admin`)
- **Query Params:** `page` (default 1), `limit` (default 20), `status` (`active` | `inactive`), `search` (`string`).
- **Response (`200 OK`):** Standard paginated list of category rows.

### 4.4 POST /api/admin/categories
- **Module:** Categories
- **Purpose:** Create a new course category.
- **Auth:** Admin
- **Body:**
  - `name` (`string`, required, min 2, max 100)
  - `slug` (`string`, optional, autogenerated if omitted)
  - `description` (`string`, optional)
  - `icon` (`string`, optional)
  - `display_order` (`integer`, optional, default 0)
  - `status` (`enum: 'active' | 'inactive'`, optional, default `'active'`)
- **Response (`201 Created`):** Returns newly created category record with `id`.
- **Database Effects:** Inserts into `categories`.

### 4.5 GET /api/admin/categories/:id
- **Module:** Categories
- **Purpose:** Retrieve full administrative category record by primary key.
- **Auth:** Admin
- **Path Params:** `id` (`integer`, required)

### 4.6 PATCH /api/admin/categories/:id
- **Module:** Categories
- **Purpose:** Modify category metadata, status, or slug.
- **Auth:** Admin
- **Path Params:** `id` (`integer`, required)
- **Body:** Partial category fields.

### 4.7 DELETE /api/admin/categories/:id
- **Module:** Categories
- **Purpose:** Delete a category. Validates that no subcategories or courses are linked.
- **Auth:** Admin
- **Path Params:** `id` (`integer`, required)
- **Errors:** `400 Bad Request` if category contains active subcategories or courses.

### 4.8 PATCH /api/admin/categories/reorder
- **Module:** Categories
- **Purpose:** Bulk reorder category display positions.
- **Auth:** Admin
- **Body:**
  - `orders` (`array` of `{ id: number, display_order: number }`, required).
- **Database Effects:** Runs atomic multi-row `UPDATE categories SET display_order = ? WHERE id = ?`.

---

## 5. Module 4: Subcategories & Taxonomy

### 5.1 GET /api/categories/:catSlug/subcategories
- **Module:** Subcategories
- **Purpose:** Public list of active subcategories nested under a parent category slug.
- **Auth:** Public
- **Path Params:** `catSlug` (`string`, required)
- **Response (`200 OK`):** Array of active subcategory records.

### 5.2 GET /api/categories/:catSlug/subcategories/:subSlug
- **Module:** Subcategories
- **Purpose:** Public subcategory page including published courses within the taxonomy.
- **Auth:** Optional Auth (Enriches user enrollment status if JWT is present).
- **Path Params:** `catSlug` (`string`), `subSlug` (`string`)
- **Response (`200 OK`):** Subcategory metadata + array of published course summary cards.

### 5.3 GET /api/admin/subcategories
- **Module:** Subcategories
- **Purpose:** Administrative list of all subcategories with parent category name and course counts.
- **Auth:** Admin
- **Query Params:** `category_id` (`integer`), `status`, `page`, `limit`.

### 5.4 POST /api/admin/subcategories
- **Module:** Subcategories
- **Purpose:** Create a subcategory under a category.
- **Auth:** Admin
- **Body:**
  - `category_id` (`integer`, required)
  - `name` (`string`, required)
  - `slug` (`string`, optional)
  - `description` (`string`, optional)
  - `display_order` (`integer`, optional)
  - `status` (`'active' | 'inactive'`, default `'active'`)

### 5.5 GET /api/admin/subcategories/:id
- **Module:** Subcategories
- **Purpose:** Retrieve administrative subcategory details by ID.
- **Auth:** Admin

### 5.6 PATCH /api/admin/subcategories/:id
- **Module:** Subcategories
- **Purpose:** Update subcategory attributes.
- **Auth:** Admin

### 5.7 DELETE /api/admin/subcategories/:id
- **Module:** Subcategories
- **Purpose:** Delete subcategory (guarded against deletion if linked courses exist).
- **Auth:** Admin

### 5.8 PATCH /api/admin/subcategories/reorder
- **Module:** Subcategories
- **Purpose:** Bulk reorder subcategories under a category.
- **Auth:** Admin
- **Body:** `{ "orders": [{ "id": 1, "display_order": 1 }] }`

---

## 6. Module 5: Instructors Management

### 6.1 GET /api/instructors
- **Module:** Instructors
- **Purpose:** Public directory of active instructors with biographies, social links, and published course counts.
- **Auth:** Public
- **Response (`200 OK`):** Array of instructor profiles.

### 6.2 GET /api/instructors/:id
- **Module:** Instructors
- **Purpose:** Detailed public instructor profile with list of taught courses.
- **Auth:** Public
- **Path Params:** `id` (`integer`, required)

### 6.3 GET /api/admin/instructors
- **Module:** Instructors
- **Purpose:** Administrative list of all instructors with status filters and course assignment metrics.
- **Auth:** Admin

### 6.4 POST /api/admin/instructors
- **Module:** Instructors
- **Purpose:** Create an instructor profile.
- **Auth:** Admin
- **Body:**
  - `name` (`string`, required)
  - `email` (`string`, required, email)
  - `bio` (`string`, optional)
  - `avatar_url` (`string`, optional)
  - `headline` (`string`, optional)
  - `social_links` (`object`, optional: `{ linkedin, twitter, github, website }`)

### 6.5 GET /api/admin/instructors/:id
- **Module:** Instructors
- **Purpose:** Administrative view of instructor details.
- **Auth:** Admin

### 6.6 PATCH /api/admin/instructors/:id
- **Module:** Instructors
- **Purpose:** Update instructor profile, status (`active` | `inactive`), or avatar.
- **Auth:** Admin

### 6.7 DELETE /api/admin/instructors/:id
- **Module:** Instructors
- **Purpose:** Deactivate or delete instructor (verifies no active course assignments).
- **Auth:** Admin

---

## 7. Module 6: Public Course Catalog & Core Courses

### 7.1 GET /api/courses
- **Module:** Courses
- **Purpose:** Primary public course catalog. Supports full filtering, pagination, and multi-field sorting.
- **Auth:** Public
- **Query Params:**
  - `page` (`integer`, default 1)
  - `limit` (`integer`, default 12, max 100)
  - `search` (`string`, optional)
  - `category` (`string`, category slug)
  - `subcategory` (`string`, subcategory slug)
  - `level` (`enum: 'beginner' | 'intermediate' | 'advanced' | 'all_levels'`)
  - `price_min` (`number`, min price)
  - `price_max` (`number`, max price)
  - `sort` (`enum: 'popular' | 'newest' | 'price_low' | 'price_high' | 'rating'`)
- **Response (`200 OK`):** Paginated course summaries including instructors, ratings, pricing, and active offers.

### 7.2 GET /api/courses/:slug
- **Module:** Courses
- **Purpose:** Comprehensive course landing page. Retrieves course header, curriculum outline, upcoming batches, instructor bio, FAQs, learning benefits, points, testimonials, SEO meta, active offers, and user-specific enrollment/wishlist state.
- **Auth:** Optional Auth
- **Path Params:** `slug` (`string`, course slug)
- **Response (`200 OK`):** Complete nested course payload.

### 7.3 GET /api/admin/courses
- **Module:** Courses
- **Purpose:** Administrative course list covering all publishing states (`draft`, `published`, `archived`).
- **Auth:** Admin
- **Query Params:** `page`, `limit`, `status`, `category_id`, `search`, `sort`.

### 7.4 POST /api/admin/courses
- **Module:** Courses
- **Purpose:** Create a new course in `draft` status.
- **Auth:** Admin
- **Body:**
  - `title` (`string`, required, min 3, max 255)
  - `slug` (`string`, optional, unique)
  - `subtitle` (`string`, optional)
  - `description` (`string`, required)
  - `category_id` (`integer`, required)
  - `subcategory_id` (`integer`, optional)
  - `instructor_id` (`integer`, optional)
  - `level` (`'beginner' | 'intermediate' | 'advanced' | 'all_levels'`)
  - `thumbnail_url` (`string`, optional)

### 7.5 GET /api/admin/courses/:id
- **Module:** Courses
- **Purpose:** Complete administrative course details with relation statistics.
- **Auth:** Admin
- **Path Params:** `id` (`integer`, required)

### 7.6 PATCH /api/admin/courses/:id
- **Module:** Courses
- **Purpose:** Update course core fields.
- **Auth:** Admin
- **Path Params:** `id` (`integer`, required)

### 7.7 DELETE /api/admin/courses/:id
- **Module:** Courses
- **Purpose:** Soft-delete course. Blocks deletion if active student enrollments exist.
- **Auth:** Admin
- **Path Params:** `id` (`integer`, required)

### 7.8 POST /api/admin/courses/:id/duplicate
- **Module:** Courses
- **Purpose:** Deep clone course including curriculum modules, lessons, FAQs, benefits, points, and settings.
- **Auth:** Admin
- **Path Params:** `id` (`integer`, source course ID)
- **Response (`201 Created`):** Returns cloned course with title prefix `Copy of ...` and newly created IDs.

### 7.9 PATCH /api/admin/courses/:id/status
- **Module:** Courses
- **Purpose:** Transition course publishing status between `draft`, `published`, and `archived`.
- **Auth:** Admin
- **Path Params:** `id` (`integer`)
- **Body:**
  - `status` (`enum: 'draft' | 'published' | 'archived'`, required)

---

## 8. Module 7: Global Search Engine

### 8.1 GET /api/search
- **Module:** Search
- **Purpose:** Global full-text search with fuzzy matching across courses, categories, and instructors. Provides query autocomplete suggestions.
- **Auth:** Public
- **Query Params:**
  - `q` (`string`, search query, min 1 char)
  - `category` (`string`, slug)
  - `level` (`string`)
  - `page` (`integer`, default 1)
  - `limit` (`integer`, default 10)
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "courses": [ ... ],
      "suggestions": [ "full stack", "react js", "python" ],
      "total": 42
    }
  }
  ```

---

## 9. Module 8: Curriculum, Modules & Lessons

### 9.1 GET /api/admin/courses/:id/curriculum
- **Module:** Curriculum
- **Purpose:** Retrieve full curriculum tree (modules, lessons, durations, video preview flags).
- **Auth:** Admin
- **Path Params:** `id` (`integer`, course ID)

### 9.2 PATCH /api/admin/courses/:id/curriculum/reorder
- **Module:** Curriculum
- **Purpose:** Bulk reorder modules and nested lessons within a course.
- **Auth:** Admin
- **Body:** `{ "modules": [{ "id": 1, "order_index": 1, "lessons": [{ "id": 5, "order_index": 1 }] }] }`

### 9.3 POST /api/admin/courses/:id/modules
- **Module:** Curriculum
- **Purpose:** Add a new curriculum module section to course.
- **Auth:** Admin
- **Body:**
  - `title` (`string`, required)
  - `description` (`string`, optional)
  - `order_index` (`integer`, optional)

### 9.4 PATCH /api/admin/modules/:moduleId
- **Module:** Curriculum
- **Purpose:** Update module title, summary, or display order.
- **Auth:** Admin
- **Path Params:** `moduleId` (`integer`)

### 9.5 DELETE /api/admin/modules/:moduleId
- **Module:** Curriculum
- **Purpose:** Delete module and cascade-delete child lessons.
- **Auth:** Admin
- **Path Params:** `moduleId` (`integer`)

### 9.6 POST /api/admin/modules/:moduleId/lessons
- **Module:** Curriculum
- **Purpose:** Add a new lesson under a module.
- **Auth:** Admin
- **Path Params:** `moduleId` (`integer`)
- **Body:**
  - `title` (`string`, required)
  - `lesson_type` (`enum: 'video' | 'article' | 'quiz' | 'assignment'`, default `'video'`)
  - `duration_seconds` (`integer`, default 0)
  - `is_preview` (`boolean`, default false)
  - `video_url` (`string`, optional)
  - `content` (`string`, optional)

### 9.7 PATCH /api/admin/lessons/:lessonId
- **Module:** Curriculum
- **Purpose:** Modify lesson properties, preview flag, or video links.
- **Auth:** Admin
- **Path Params:** `lessonId` (`integer`)

### 9.8 DELETE /api/admin/lessons/:lessonId
- **Module:** Curriculum
- **Purpose:** Remove a lesson from curriculum.
- **Auth:** Admin
- **Path Params:** `lessonId` (`integer`)

---

## 10. Module 9: Batches & Scheduling

### 10.1 GET /api/courses/:id/batches
- **Module:** Batches
- **Purpose:** Public schedule of upcoming batches, start dates, seat capacity, and enrolled counts.
- **Auth:** Public
- **Path Params:** `id` (`integer`, course ID)

### 10.2 GET /api/admin/courses/:id/batches
- **Module:** Batches
- **Purpose:** Administrative list of all batches for a course.
- **Auth:** Admin
- **Path Params:** `id` (`integer`)

### 10.3 POST /api/admin/courses/:id/batches
- **Module:** Batches
- **Purpose:** Create a batch for live cohorts.
- **Auth:** Admin
- **Path Params:** `id` (`integer`)
- **Body:**
  - `batch_name` (`string`, required)
  - `start_date` (`datetime`, required)
  - `end_date` (`datetime`, optional)
  - `seat_limit` (`integer`, min 1, required)
  - `meeting_link` (`string`, optional)
  - `instructor_id` (`integer`, optional)

### 10.4 PATCH /api/admin/batches/:batchId
- **Module:** Batches
- **Purpose:** Update batch dates, status (`upcoming` | `ongoing` | `completed`), or seats.
- **Auth:** Admin
- **Path Params:** `batchId` (`integer`)

### 10.5 DELETE /api/admin/batches/:batchId
- **Module:** Batches
- **Purpose:** Delete batch (guarded against active enrollments).
- **Auth:** Admin
- **Path Params:** `batchId` (`integer`)

---

## 11. Module 10: Course Content Enhancements

### 11.1 SEO Management
- **GET /api/admin/courses/:id/seo** (Admin) — Retrieve meta title, meta description, keywords, canonical URL, OG tags.
- **PUT /api/admin/courses/:id/seo** (Admin) — Upsert SEO metadata for course.
  - Body: `{ meta_title, meta_description, keywords, canonical_url, og_image_url }`.

### 11.2 Pricing & Tax Management
- **GET /api/admin/courses/:id/pricing** (Admin) — Retrieve base price, discount price, currency (`INR`), GST inclusion flag.
- **PUT /api/admin/courses/:id/pricing** (Admin) — Update course pricing configurations.
  - Body: `{ base_price: number, discount_price: number, currency: string, is_free: boolean, gst_included: boolean }`.

### 11.3 Installment Payment Plans
- **GET /api/admin/courses/:id/installments** (Admin) — List active installment payment plans.
- **POST /api/admin/courses/:id/installments** (Admin) — Create installment option.
  - Body: `{ title: string, total_amount: number, installments_count: number, interval_days: number }`.
- **PATCH /api/admin/courses/:id/installments/:planId** (Admin) — Update plan terms.
- **DELETE /api/admin/courses/:id/installments/:planId** (Admin) — Deactivate installment plan.

### 11.4 Promotional Discount Offers
- **GET /api/admin/courses/:id/offers** (Admin) — List discount offers and coupons.
- **POST /api/admin/courses/:id/offers** (Admin) — Create promotional discount.
  - Body: `{ title, coupon_code, discount_type: 'percent'|'fixed', discount_value, start_date, end_date }`.
- **PATCH /api/admin/courses/:id/offers/:offerId** (Admin) — Update offer parameters.
- **DELETE /api/admin/courses/:id/offers/:offerId** (Admin) — Revoke discount offer.

### 11.5 FAQs, Testimonials, Benefits & Points
- **GET / PUT /api/admin/courses/:id/faqs** (Admin) — Bulk replace FAQ questions and answers.
- **GET / PUT /api/admin/courses/:id/testimonials** (Admin) — Bulk replace student reviews and ratings.
- **GET / PUT /api/admin/courses/:id/benefits** (Admin) — Bulk update course learning outcomes.
- **GET / PUT /api/admin/courses/:id/enrollment-settings** (Admin) — Update enrollment caps and auto-expiration dates.
- **GET / PUT /api/admin/courses/:id/points** (Admin) — Bulk replace bullet point highlights.

---

## 12. Module 11: File Uploads & Media Assets

### 12.1 POST /api/admin/uploads
- **Module:** Uploads
- **Purpose:** Upload image (PNG, JPEG, WebP, GIF) or document asset (PDF, ZIP, DOCX) via `multipart/form-data`. Stored in local filesystem `uploads/public/` or `uploads/protected/` with size capped at `MAX_UPLOAD_MB` (default 10 MB).
- **Auth:** Admin (`admin`, `super_admin`)
- **Headers:** `Content-Type: multipart/form-data`
- **Body:** `file` (Binary file), `is_public` (`boolean`, optional, default true).
- **Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "File uploaded successfully",
    "data": {
      "filename": "1730400000-banner.webp",
      "url": "/files/1730400000-banner.webp",
      "size_bytes": 248102,
      "mimetype": "image/webp"
    }
  }
  ```

### 12.2 DELETE /api/admin/uploads
- **Module:** Uploads
- **Purpose:** Delete uploaded physical file from disk.
- **Auth:** Admin
- **Body:** `{ "file_url": "/files/1730400000-banner.webp" }`
- **Response (`200 OK`):** Confirms file deletion.

---

## 13. Module 12: Downloadable Course Materials

### 13.1 GET /api/courses/:id/materials
- **Module:** Materials
- **Purpose:** List course resource documents, code repositories, and cheat sheets. Distinguishes public vs. enrolled student materials.
- **Auth:** Public / Authenticated Student
- **Path Params:** `id` (`integer`, course ID)

### 13.2 GET /api/courses/:id/materials/:materialId/download
- **Module:** Materials
- **Purpose:** Securely stream or generate signed download URL for protected course material. Validates active student enrollment.
- **Auth:** Authenticated Student
- **Errors:** `403 Forbidden` if student is not enrolled in the course.

### 13.3 Admin Materials Management
- **GET /api/admin/courses/:id/materials** (Admin) — List all materials attached to course.
- **POST /api/admin/courses/:id/materials** (Admin) — Attach material record to course.
- **PATCH /api/admin/materials/:materialId** (Admin) — Update material metadata or access restriction.
- **DELETE /api/admin/materials/:materialId** (Admin) — Remove material record and unlinks file.

---

## 14. Module 13: Demo Classes & Lead Management

### 14.1 Public & Student Demo APIs
- **GET /api/courses/:id/demo-settings** (Public) — Public demo session time, seat availability, and eligibility.
- **POST /api/courses/:id/demo-requests** (Authenticated Student) — Register for upcoming demo class. Rate limited to 5 req / hour per IP.
  - Body: `{ scheduled_time: datetime, phone: string, notes: string }`.
- **GET /api/me/demo-requests** (Authenticated Student) — List authenticated student's booked demo requests.
- **PATCH /api/me/demo-requests/:id/cancel** (Authenticated Student) — Cancel pending demo booking.

### 14.2 Administrative & Counsellor Lead Workflow
- **GET /api/admin/demo-requests** (Counsellor, Admin) — List all demo leads with filters (`status`, `counsellor_id`, `course_id`, `date_from`, `date_to`).
- **GET /api/admin/demo-requests/:id** (Counsellor, Admin) — Full lead details with chronological notes.
- **PATCH /api/admin/demo-requests/:id** (Counsellor, Admin) — Update lead status (`pending`, `contacted`, `scheduled`, `attended`, `converted`, `lost`) and counsellor assignment.
- **POST /api/admin/demo-requests/:id/notes** (Counsellor, Admin) — Append internal follow-up note to lead.
- **POST /api/admin/demo-requests/:id/convert** (Admin) — Convert qualified lead directly into an active course enrollment.
- **PATCH /api/admin/demo-requests/bulk** (Counsellor, Admin) — Bulk status update or counsellor assignment.
- **GET /api/admin/demo-requests/export** (Admin) — Export filtered leads to downloadable CSV file.
- **DELETE /api/admin/demo-requests/:id** (Admin) — Soft delete lead record.

---

## 15. Module 14: Eligibility Engine & Evaluations

### 15.1 Public & Student Eligibility Evaluation
- **GET /api/courses/:id/eligibility** (Public) — View prerequisite guidelines, education levels, and criteria.
- **POST /api/courses/:id/eligibility-checks** (Authenticated Student) — Submit student test questionnaire answers. Computes score and records evaluation.
  - Body: `{ answers: [{ question_id: number, selected_option: string }] }`.
  - Response: `{ eligible: boolean, score: number, feedback: string }`.
- **GET /api/me/courses/:id/eligibility-result** (Authenticated Student) — Retrieve student's latest test score.

### 15.2 Admin Eligibility Configuration
- **GET /api/admin/courses/:id/eligibility-rules** (Admin) — Retrieve rule thresholds and questions.
- **PUT /api/admin/courses/:id/eligibility-rules** (Admin) — Update test rules, questions, and minimum passing threshold.
- **GET /api/admin/courses/:id/eligibility-checks** (Counsellor, Admin) — List student attempts, scores, and evaluations.

---

## 16. Module 15: Student Enrollments & Curriculum Progress

### 16.1 POST /api/courses/:id/enroll
- **Module:** Enrollments
- **Purpose:** Self-enroll authenticated student into a free/open course. Validates enrollment settings and batch capacity.
- **Auth:** Authenticated Student
- **Body:** `{ "batch_id": integer (optional) }`
- **Response (`201 Created`):** Returns enrollment record with `enrollment_status: 'active'`.
- **Errors:** `400 Bad Request` if course is paid (requires Step 13 Checkout) or batch is full.

### 16.2 GET /api/me/enrollments
- **Module:** Enrollments
- **Purpose:** Student course dashboard listing all active, completed, and expired enrolled courses with overall progress %.
- **Auth:** Authenticated Student

### 16.3 GET /api/me/courses/:id/curriculum
- **Module:** Enrollments
- **Purpose:** Access full enrolled course curriculum, lesson video streaming URLs, and student completion markers.
- **Auth:** Authenticated Student (verifies active enrollment).
- **Errors:** `403 Forbidden` if student does not hold active enrollment.

### 16.4 POST /api/me/lessons/:lessonId/progress
- **Module:** Enrollments
- **Purpose:** Real-time playback position tracker and lesson completion recorder.
- **Auth:** Authenticated Student
- **Path Params:** `lessonId` (`integer`)
- **Body:**
  - `playback_seconds` (`integer`, required)
  - `is_completed` (`boolean`, optional, auto-marked if playback >= 90% duration)
- **Response (`200 OK`):** Returns updated lesson progress and recalculated overall course progress percentage.

### 16.5 Admin Enrollment Management
- **GET /api/admin/enrollments** (Admin) — Filter all student enrollments across platform.
- **POST /api/admin/enrollments** (Admin) — Manually grant course enrollment (scholarships, offline bank payments).
  - Body: `{ user_id: number, course_id: number, batch_id: number, access_expires_at: datetime }`.
- **PATCH /api/admin/enrollments/:id** (Admin) — Update enrollment status (`active`, `suspended`, `expired`), batch, or expiration date.

---

## 17. Module 16: Wishlist Management

### 17.1 POST /api/courses/:id/wishlist
- **Module:** Wishlist
- **Purpose:** Bookmark course into authenticated student's personal wishlist.
- **Auth:** Authenticated Student
- **Path Params:** `id` (`integer`, course ID)
- **Response (`201 Created`):** Confirms bookmarking. Idempotent if already wishlisted.

### 17.2 DELETE /api/courses/:id/wishlist
- **Module:** Wishlist
- **Purpose:** Remove course from student's personal wishlist.
- **Auth:** Authenticated Student
- **Path Params:** `id` (`integer`, course ID)

### 17.3 GET /api/me/wishlist
- **Module:** Wishlist
- **Purpose:** Paginated list of all wishlisted courses with price, category, and instructor details.
- **Auth:** Authenticated Student
- **Query Params:** `page` (default 1), `limit` (default 10).

---

## 18. Module 17: Reviews & Moderation

### 18.1 GET /api/courses/:id/reviews
- **Module:** Reviews
- **Purpose:** Public course reviews, average star rating, total review count, and star distribution (5★ to 1★). Only returns approved reviews.
- **Auth:** Public
- **Path Params:** `id` (`integer`, course ID)
- **Query Params:** `page`, `limit`, `sort` (`newest` | `highest` | `lowest`).

### 18.2 POST /api/courses/:id/reviews
- **Module:** Reviews
- **Purpose:** Submit course review. Requires verified active enrollment. New reviews are initialized with `moderation_status = 'pending'`.
- **Auth:** Authenticated Student
- **Path Params:** `id` (`integer`, course ID)
- **Body:**
  - `rating` (`integer`, min 1, max 5, required)
  - `review_text` (`string`, min 5, max 2000, required)
- **Response (`201 Created`):** Returns review record with `moderation_status: 'pending'`.

### 18.3 PATCH /api/me/reviews/:id
- **Module:** Reviews
- **Purpose:** Student edits their own review. Automatically resets `moderation_status` to `'pending'`.
- **Auth:** Authenticated Student
- **Path Params:** `id` (`integer`, review ID)
- **Body:** `{ rating: number, review_text: string }`

### 18.4 DELETE /api/me/reviews/:id
- **Module:** Reviews
- **Purpose:** Delete student's own review.
- **Auth:** Authenticated Student

### 18.5 Admin Review Moderation
- **GET /api/admin/reviews** (Admin) — List all reviews with filter `moderation_status` (`pending`, `approved`, `rejected`).
- **PATCH /api/admin/reviews/:id/moderate** (Admin) — Approve or reject review.
  - Body: `{ moderation_status: 'approved' | 'rejected', notes: string }`.
  - Database Effects: Updates review row, atomically triggers recalculation of course `average_rating` and `total_reviews`.

---

## 19. Module 18: Views, Telemetry, Analytics & Executive Dashboard

### 19.1 POST /api/courses/:id/views
- **Module:** Analytics & Telemetry
- **Purpose:** Record course page view. Rate limited to 60 req / min per IP. Tracks device type, referrer, visitor IP hash, and visitor vs. enrolled student classification.
- **Auth:** Optional Auth
- **Rate Limit:** 60 req / 1 min per IP.
- **Path Params:** `id` (`integer`, course ID)
- **Body:**
  - `client_fingerprint` (`string`, optional)
  - `referrer` (`string`, optional)
  - `device_type` (`string: 'desktop' | 'mobile' | 'tablet'`, optional)
- **Advisory Lock Coordination:** Acquires shared MariaDB advisory lock `course_platform_views_rw_${courseId}_${dateStr}` with 2-second timeout to prevent race conditions with daily aggregation and retention schedulers.
- **Database Effects:** Inserts raw event into `course_views`.

### 19.2 POST /api/courses/:id/share
- **Module:** Analytics & Telemetry
- **Purpose:** Track social share events (WhatsApp, LinkedIn, Twitter, copy link).
- **Auth:** Public
- **Path Params:** `id` (`integer`, course ID)
- **Body:** `{ platform: 'whatsapp' | 'linkedin' | 'twitter' | 'copy_link' }`
- **Database Effects:** Increments daily share count in telemetry counters.

### 19.3 POST /api/courses/:id/enquiry-click
- **Module:** Analytics & Telemetry
- **Purpose:** Track clicks on WhatsApp chat or phone enquiry buttons on course page.
- **Auth:** Public
- **Path Params:** `id` (`integer`, course ID)
- **Body:** `{ channel: 'whatsapp' | 'call' | 'form' }`

### 19.4 GET /api/admin/courses/:id/analytics
- **Module:** Analytics & Dashboard
- **Purpose:** Comprehensive 30-day course performance analytics: daily views, unique visitors, student vs. guest ratio, conversion funnel (views -> wishlist -> demo -> enrollments), and device breakdown.
- **Auth:** Admin (`admin`, `super_admin`)
- **Path Params:** `id` (`integer`, course ID)
- **Query Params:** `days` (default 30, min 7, max 90).

### 19.5 GET /api/admin/analytics/courses
- **Module:** Analytics & Dashboard
- **Purpose:** Platform-wide course performance comparative analytics. Ranks courses by views, conversion rate, and revenue potential.
- **Auth:** Admin
- **Query Params:** `sort_by` (`views` | `enrollments` | `conversion_rate`), `limit` (default 10).

### 19.6 GET /api/admin/dashboard
- **Module:** Analytics & Dashboard
- **Purpose:** Executive platform dashboard overview. Returns total platform revenue, active enrollments, pending demo leads, unmoderated reviews, top-viewed courses, and conversion metrics.
- **Auth:** Admin
- **Query Params:** `period` (`'today' | '7d' | '30d' | 'all'`, default `'30d'`).

---

## 20. Automated Background Cron Schedulers & Advisory Locking

All 8 background jobs are managed by `src/jobs/scheduler.js`, run in the `Asia/Kolkata` (`+05:30`) timezone, and enforce MariaDB named advisory locks (`GET_LOCK`) on dedicated physical database connections. If another server instance or cluster node is currently executing the job, the lock acquisition fails immediately without blocking (`timeout = 0`) and the duplicate execution is safely skipped.

| # | Job Name | Cron Schedule | Timezone | Named Advisory Lock | Primary Database Effect |
|---|---|---|---|---|---|
| 1 | `offer_expiry` | `0 * * * *` (Hourly) | `Asia/Kolkata` | `course_platform_cron_offer_expiry` | Deactivates offers where `end_date < NOW()` (`is_active = 0`). |
| 2 | `enrollment_expiry` | `0 1 * * *` (1:00 AM Daily) | `Asia/Kolkata` | `course_platform_cron_enrollment_expiry` | Sets `enrollment_status = 'expired'` where `access_expires_at < NOW()`. |
| 3 | `analytics_aggregate` | `0 2 * * *` (2:00 AM Daily) | `Asia/Kolkata` | `course_platform_cron_analytics_aggregate` + `course_platform_views_rw_${courseId}_${dateStr}` | Rolls up raw views, wishlist adds, and enrollments into `course_analytics_daily`. |
| 4 | `token_cleanup` | `0 3 * * *` (3:00 AM Daily) | `Asia/Kolkata` | `course_platform_cron_token_cleanup` | Deletes refresh tokens revoked or expired > 7 days ago. |
| 5 | `rating_resync` | `0 4 * * *` (4:00 AM Daily) | `Asia/Kolkata` | `course_platform_cron_rating_resync` | Recalculates `average_rating` and `total_reviews` in `courses` from approved reviews. |
| 6 | `views_retention` | `30 4 * * 0` (4:30 AM Sun) | `Asia/Kolkata` | `course_platform_cron_views_retention` + `course_platform_views_rw_${courseId}_${dateStr}` | Purges raw `course_views` older than 90 days after verifying full aggregation. |
| 7 | `enrollment_expiring_notice` | `0 8 * * *` (8:00 AM Daily) | `Asia/Kolkata` | `course_platform_cron_enrollment_notice` | Dispatches renewal notices for enrollments expiring in 7 and 3 days. |
| 8 | `demo_reminder` | `*/10 * * * *` (Every 10 min) | `Asia/Kolkata` | `course_platform_cron_demo_reminder` | Sends SMS/email reminders for demo sessions scheduled in 24h and 1h. |

---

## 21. Step 13 Postponement Notice (Payments & Orders)

In accordance with strict project boundaries, **Step 13 (Payments, Orders, Checkout & Gateway SDK Integration) is NOT started and is explicitly deferred**.
- No payment provider SDK (Razorpay, Stripe, Cashfree, PayU) is installed in `package.json`.
- No mock or live checkout gateway endpoints exist in the active router stack.
- Zero financial transactions or real credit card/UPI processing are active in the backend.
- Checkout and payment processing will be scheduled in a dedicated Phase 13 upon explicit approval.
