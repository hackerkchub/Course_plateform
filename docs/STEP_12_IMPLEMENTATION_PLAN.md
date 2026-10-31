# Section 19.4 Step 12: Views, Analytics, Dashboard & Cron Jobs — Implementation Plan

**Milestone:** Section 19.4 — Step 12  
**Document:** `docs/STEP_12_IMPLEMENTATION_PLAN.md`  
**Workspace:** `D:\Course_plateform\backend\`  
**Dedicated Database:** `course_platform_db` (MariaDB 10.4.32 on `localhost:3306`)  
**Backend Stack:** Node.js, Express.js, MariaDB (mysql2 connection pool), native ES Modules (ESM)  
**Authoritative Specification References:** `Course_Platform_Backend_Plan.txt` (Section 16, Section 18.2, Section 19.1, Section 19.2, Section 19.4)  
**Baseline Verification Status:** 314 tests passing across 13 test files (0 failures); 122 unique HTTP endpoints  
**Execution Guardrails:** Planning & Pre-Implementation Audit Only. No code implemented, no database modified, no dependencies added, no Step 13 started.

---

## 1. Executive Summary & Authoritative Specification Mapping

Step 12 delivers the reporting, telemetry, administrative dashboard, and background automation subsystems of the Course Platform Backend as explicitly scheduled in **Section 19.4 (Build Order Step 12)** and defined in **Section 16 (Views, Analytics aur Dashboard APIs)**, **Section 18.2 (Course Page Open & View Count)**, and **Section 19.2 (Background Jobs / node-cron)**.

### Subsystem Mapping Matrix

| Specification Section | Functional Area | Key Requirements | Target Delivery |
|---|---|---|---|
| **Section 16.1** | **Public Telemetry & Tracking** | `POST /api/courses/:id/views`, `POST /api/courses/:id/share`, `POST /api/courses/:id/enquiry-click`. Client `session_id`, bot detection, daily deduplication per session, atomic counter updates in `courses`. | 3 Public Endpoints |
| **Section 16.2** | **Admin Analytics & Dashboard** | `GET /api/admin/courses/:id/analytics`, `GET /api/admin/analytics/courses`, `GET /api/admin/dashboard`. Conversion rates, totals, daily breakdown, traffic sources, device types, demo leads funnel, platform overview. | 3 Admin Endpoints (`admin`, `super_admin`) |
| **Section 18.2** | **Course View Lifecycle** | Connection between course detail browsing and telemetry. Lightweight write path on view; heavy rollups deferred to nightly cron. | Service Integration |
| **Section 19.2** | **Scheduled Background Jobs** | 8 node-cron jobs: `offer_expiry`, `analytics_aggregate`, `enrollment_expiry`, `enrollment_expiring_notice`, `demo_reminder`, `token_cleanup`, `views_retention`, `rating_resync`. Timezone: `Asia/Kolkata`. | 8 Background Cron Jobs in `src/jobs/` |

---

## 2. Existing Functionality Discovered & Reusable Assets

Our pre-implementation audit inspected the entire codebase and confirmed that the following core architectural components are already in place and directly reusable:

1. **Database Tables & Schema (Migration 007 & 002):**
   - [`course_views`](file:///D:/Course_plateform/backend/migrations/007_analytics_audit_notifications.sql): Table exists with `id`, `course_id`, `user_id`, `session_id`, `viewed_at`, `referrer`, `source`, `device_type`.
   - [`course_analytics_daily`](file:///D:/Course_plateform/backend/migrations/007_analytics_audit_notifications.sql): Table exists with `id`, `course_id`, `analytics_date`, `total_views`, `unique_visitors`, `enquiry_count`, `demo_request_count`, `wishlist_add_count`, `enrollment_count`, and `UNIQUE KEY uq_analytics_course_date (course_id, analytics_date)`.
   - [`courses`](file:///D:/Course_plateform/backend/migrations/002_catalog_and_courses.sql): Table already includes all telemetry columns: `total_views`, `unique_visitors`, `enquiry_count`, `demo_request_count`, `wishlist_count`, `share_count`, `enrollment_count`, `rating_avg`, `rating_count`.
   - [`notifications`](file:///D:/Course_plateform/backend/migrations/007_analytics_audit_notifications.sql): Table exists with `type`, `channel`, `recipient`, `payload`, `status`, `sent_at` for queueing cron reminder notifications.
   - [`audit_logs`](file:///D:/Course_plateform/backend/migrations/007_analytics_audit_notifications.sql): Table exists for tracking administrative actions.
2. **Authentication & Access Control Middleware:**
   - [`authenticate`](file:///D:/Course_plateform/backend/src/middleware/authenticate.js): Validates JWT from httpOnly cookies or `Bearer` headers.
   - [`optionalAuth`](file:///D:/Course_plateform/backend/src/middleware/authenticate.js): Decodes user context if present without rejecting anonymous visitors (`req.user = null`). Used for `POST /api/courses/:id/views`.
   - [`authorize('admin', 'super_admin')`](file:///D:/Course_plateform/backend/src/middleware/authorize.js): Restricts admin analytics and dashboard endpoints.
3. **Rate Limiting:**
   - [`viewsRateLimiter`](file:///D:/Course_plateform/backend/src/middleware/rateLimiter.js#L46-L54): Already defined with threshold 60 requests/minute per IP (test environment bypassed).
   - [`generalRateLimiter`](file:///D:/Course_plateform/backend/src/middleware/rateLimiter.js#L13-L21): General rate limiter (300 requests/15 min).
4. **Validation Infrastructure:**
   - [`validateBody`, `validateQuery`, `validateParams`](file:///D:/Course_plateform/backend/src/middleware/validate.js): Zod middleware for request contracts.
5. **Database Connection Pool & Transaction Helper:**
   - [`getPool`, `withTransaction`](file:///D:/Course_plateform/backend/src/config/db.js): Connection pooling with MariaDB InnoDB transactions.
6. **Logging & Standard Response Formats:**
   - [`sendSuccess`, `sendPaginated`, `sendError`](file:///D:/Course_plateform/backend/src/utils/response.js): Enforces uniform `{ success, message, data }` envelopes.
   - [`logger`](file:///D:/Course_plateform/backend/src/config/logger.js): Structured Pino logger for jobs and error tracking.
7. **Scheduled Job Driver:**
   - `node-cron` package (`^3.0.3`) is already installed in `package.json`.

---

## 3. New Functionality Required

The following modules, routes, services, repositories, and background jobs are required to be built in Step 12:

### A. New Module: Analytics & Telemetry (`src/modules/analytics/`)
1. **`analytics.validation.js`**: Zod validation schemas for:
   - `recordViewSchema`: `session_id` (string, 1–100 chars), `referrer` (optional string, max 500), `source` (optional enum: `'organic'`, `'direct'`, `'social'`, `'campaign'`), `device_type` (optional enum: `'desktop'`, `'mobile'`, `'tablet'`).
   - `courseAnalyticsQuerySchema`: `from` (optional date YYYY-MM-DD), `to` (optional date YYYY-MM-DD), `group_by` (optional enum: `'day'`, `'week'`, `'month'`).
   - `adminCoursesAnalyticsQuerySchema`: `from`, `to`, `category_id` (optional integer), `sort_by` (optional enum: `'views'`, `'demo_requests'`, `'enrollments'`, `'conversion'`), `page`, `limit`.
2. **`analytics.repository.js`**: Pure SQL functions:
   - `checkTodaySessionView(courseId, sessionId)`: Sargable check whether a view was already recorded today.
   - `checkSessionEverViewed(courseId, sessionId)`: Check if this `session_id` has ever recorded a view on this course on any prior date.
   - `insertCourseView(viewData)`: Inserts raw event into `course_views`.
   - `incrementCourseViewsAtomic(courseId, isNewVisitor)`: Increments `courses.total_views = total_views + 1` and conditionally `courses.unique_visitors = unique_visitors + 1`.
   - `incrementCourseShareCount(courseId)`: Atomic increment `courses.share_count = share_count + 1`.
   - `incrementCourseEnquiryCount(courseId)`: Atomic increment `courses.enquiry_count = enquiry_count + 1`.
   - `getCourseAnalyticsTotals(courseId, from, to)`: Queries aggregations and totals for single course report.
   - `getCourseAnalyticsDailySeries(courseId, from, to)`: Queries daily breakdown from `course_analytics_daily` (supplemented by today's live views if today is within range).
   - `getCourseTrafficSources(courseId, from, to)`: Aggregates `source` counts from `course_views`.
   - `getCourseDeviceTypes(courseId, from, to)`: Aggregates `device_type` counts from `course_views`.
   - `getCourseDemoFunnel(courseId)`: Status distribution breakdown from `demo_requests` for target course.
   - `getCoursesAnalyticsComparison(options)`: Multi-course comparison with conversion rates, sorting, and pagination.
   - `getAdminDashboardSummary()`: Global summary query for total courses by status, users, new users (30d), total enrollments, demo request counts, recent demo requests, recent enrollments, top courses, and 30-day views series.
3. **`analytics.service.js`**: Business logic orchestration:
   - Bot detection filter (inspects `User-Agent` against crawler signatures; ignores bots with HTTP 200).
   - Daily view deduplication per session.
   - Atomic counter synchronization.
   - Conversion rate computation ($\text{Conversion Rate} = \frac{\text{Enrollments}}{\text{Unique Visitors}} \times 100$).
   - Formatting dashboard and analytics envelopes.
4. **`analytics.controller.js`**: Request handlers mapping HTTP parameters to service functions and sending standardized JSON envelopes.
5. **`analytics.routes.js`**: Router declarations:
   - Public course routes (`POST /api/courses/:id/views`, `POST /api/courses/:id/share`, `POST /api/courses/:id/enquiry-click`).
   - Admin analytics & dashboard routes (`GET /api/admin/courses/:id/analytics`, `GET /api/admin/analytics/courses`, `GET /api/admin/dashboard`).

### B. Background Scheduled Jobs Subsystem (`src/jobs/`)
1. **`src/jobs/offerExpiry.job.js`**: Hourly job (`0 * * * *`) marking expired promotional offers inactive.
2. **`src/jobs/analyticsAggregate.job.js`**: Nightly job at 2:00 AM (`0 2 * * *`) rolling up daily `course_views`, `demo_requests`, `course_enrollments`, and `wishlists` into `course_analytics_daily` and resyncing course counters.
3. **`src/jobs/enrollmentExpiry.job.js`**: Nightly job at 1:00 AM (`0 1 * * *`) marking past-due enrollments as `'expired'`.
4. **`src/jobs/enrollmentNotice.job.js`**: Daily morning job at 8:00 AM (`0 8 * * *`) queueing notice notifications for enrollments expiring within 7 days.
5. **`src/jobs/demoReminder.job.js`**: Every 10 minutes (`*/10 * * * *`) queueing notifications for demo classes scheduled within the next 60 minutes.
6. **`src/jobs/tokenCleanup.job.js`**: Daily job at 3:00 AM (`0 3 * * *`) purging revoked or expired refresh tokens older than retention policy.
7. **`src/jobs/viewsRetention.job.js`**: Weekly job on Sunday at 4:00 AM (`0 4 * * 0`) purging raw `course_views` rows older than 180 days.
8. **`src/jobs/ratingResync.job.js`**: Daily job at 4:00 AM (`0 4 * * *`) recalculating `courses.rating_avg` and `courses.rating_count` from approved `course_reviews` to guarantee zero drift.
9. **`src/jobs/scheduler.js`**: Master orchestrator:
   - Exports `initCronJobs()` and `stopCronJobs()`.
   - Protects against overlapping job executions using job-specific execution mutex flags.
   - Provides individual callable runner functions (e.g. `runOfferExpiryJob()`, `runAnalyticsAggregateJob()`) for direct execution in automated integration tests.
   - Automatically disabled in test environments (`NODE_ENV === 'test'`) to prevent hanging Node.js test runners.

---

## 4. Proposed API Endpoints Specification

Step 12 introduces **6 new HTTP endpoints** (3 Public, 3 Admin).

### 4.1 Public Telemetry & Tracking APIs (Section 16.1)

#### 1. `POST /api/courses/:id/views`
- **Description:** Records a course view event. Deduplicates identical `session_id` on the same day. Disregards web bots.
- **Access:** Public (`optionalAuth` — attaches `user_id` if logged in, otherwise null).
- **Rate Limit:** `viewsRateLimiter` (60 requests per minute per IP).
- **Route Parameter:** `:id` — Course ID (integer).
- **Request Body (JSON):**
  ```json
  {
    "session_id": "sess_9f83a2c4e1b7",
    "referrer": "https://google.com/search?q=fullstack",
    "source": "organic",
    "device_type": "desktop"
  }
  ```
  - `session_id`: Required string, 1 to 100 characters.
  - `referrer`: Optional string, max 500 chars (nullable).
  - `source`: Optional enum (`"organic"`, `"direct"`, `"social"`, `"campaign"`).
  - `device_type`: Optional enum (`"desktop"`, `"mobile"`, `"tablet"`).
- **Processing Logic:**
  1. Validate course exists and `status = 'published'` AND `deleted_at IS NULL`. Return `404` if not found.
  2. Inspect `User-Agent`. If matching bot signatures (`/bot|crawler|spider|googlebot|headless/i`), return `200 OK` with `{ "success": true, "message": "Bot view ignored" }` without DB insert or counter change.
  3. Query `course_views` for existing view with `course_id = ? AND session_id = ? AND viewed_at >= [TODAY_START] AND viewed_at <= [TODAY_END]`.
  4. If already recorded today: Return `200 OK` with `{ "success": true, "message": "View already recorded today" }` (counters unchanged).
  5. If new view today:
     - Check if `session_id` has ever recorded a view on this `course_id` on any prior date.
     - Insert row into `course_views`.
     - Atomically increment `courses.total_views = total_views + 1`.
     - If this session has never visited before: atomically increment `courses.unique_visitors = unique_visitors + 1`.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "View recorded"
  }
  ```
  *(Note: Per Section 16.1 specification, total counts are strictly omitted from the public telemetry response; they are returned only via the Course Detail API).*

#### 2. `POST /api/courses/:id/share`
- **Description:** Increments course social share counter.
- **Access:** Public.
- **Rate Limit:** `generalRateLimiter`.
- **Route Parameter:** `:id` — Course ID (integer).
- **Processing Logic:**
  1. Validate course exists and is published (`404` if not).
  2. Atomically execute `UPDATE courses SET share_count = share_count + 1 WHERE id = ?`.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Share recorded"
  }
  ```

#### 3. `POST /api/courses/:id/enquiry-click`
- **Description:** Increments course enquiry / chat button click counter.
- **Access:** Public.
- **Rate Limit:** `generalRateLimiter`.
- **Route Parameter:** `:id` — Course ID (integer).
- **Processing Logic:**
  1. Validate course exists and is published (`404` if not).
  2. Atomically execute `UPDATE courses SET enquiry_count = enquiry_count + 1 WHERE id = ?`.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Enquiry click recorded"
  }
  ```

---

### 4.2 Admin Analytics & Dashboard APIs (Section 16.2)

#### 4. `GET /api/admin/courses/:id/analytics`
- **Description:** Comprehensive analytics and conversion breakdown for a single course.
- **Access:** Restricted (`authenticate`, `authorize('admin', 'super_admin')`).
- **Route Parameter:** `:id` — Course ID (integer).
- **Query Parameters:**
  - `from`: string (YYYY-MM-DD), default: 30 days ago.
  - `to`: string (YYYY-MM-DD), default: today.
  - `group_by`: string (`"day"`, `"week"`, `"month"`), default: `"day"`.
- **Response `200 OK` (exact shape per Section 16.2):**
  ```json
  {
    "success": true,
    "data": {
      "course_id": 101,
      "range": {
        "from": "2026-10-01",
        "to": "2026-10-31"
      },
      "totals": {
        "total_views": 15200,
        "unique_visitors": 9800,
        "enquiry_count": 120,
        "demo_request_count": 85,
        "wishlist_count": 210,
        "share_count": 60,
        "enrollment_count": 340,
        "conversion_rate": 3.47,
        "last_viewed_at": "2026-10-31T17:00:00.000Z"
      },
      "daily": [
        {
          "date": "2026-10-30",
          "total_views": 620,
          "unique_visitors": 410,
          "demo_request_count": 5,
          "enrollment_count": 12
        }
      ],
      "sources": {
        "organic": 5200,
        "direct": 3100,
        "social": 4200,
        "campaign": 2700
      },
      "devices": {
        "mobile": 9100,
        "desktop": 5600,
        "tablet": 500
      },
      "demo_funnel": {
        "pending": 20,
        "contacted": 15,
        "scheduled": 25,
        "completed": 20,
        "cancelled": 5,
        "converted": 12
      }
    }
  }
  ```

#### 5. `GET /api/admin/analytics/courses`
- **Description:** Multi-course comparison table with conversion metrics and sorting.
- **Access:** Restricted (`authenticate`, `authorize('admin', 'super_admin')`).
- **Query Parameters:**
  - `from`, `to`: date range strings (optional).
  - `category_id`: integer (optional).
  - `sort_by`: enum (`"views"`, `"demo_requests"`, `"enrollments"`, `"conversion"`), default: `"views"`.
  - `page`: integer, default: 1.
  - `limit`: integer, default: 20 (max: 100).
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": [
      {
        "course_id": 101,
        "course_name": "Complete JavaScript DSA",
        "slug": "complete-javascript-dsa",
        "category_name": "DSA",
        "total_views": 15200,
        "unique_visitors": 9800,
        "demo_request_count": 85,
        "enrollment_count": 340,
        "conversion_rate": 3.47
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 48,
      "total_pages": 3
    }
  }
  ```

#### 6. `GET /api/admin/dashboard`
- **Description:** High-level platform dashboard summary for administrative overview.
- **Access:** Restricted (`authenticate`, `authorize('admin', 'super_admin')`).
- **Response `200 OK` (exact shape per Section 16.2):**
  ```json
  {
    "success": true,
    "data": {
      "total_courses": {
        "published": 24,
        "draft": 8,
        "archived": 2,
        "total": 34
      },
      "total_users": 1540,
      "new_users_last_30_days": 185,
      "total_enrollments": 840,
      "demo_requests": {
        "total": 320,
        "pending": 45,
        "today": 8
      },
      "top_courses": [
        {
          "id": 101,
          "course_name": "Complete JavaScript DSA",
          "slug": "complete-javascript-dsa",
          "total_views": 15200,
          "enrollment_count": 340
        }
      ],
      "recent_demo_requests": [
        {
          "id": 512,
          "reference_no": "DEMO-202610-0081",
          "student_name": "Ananya Roy",
          "course_name": "Complete JavaScript DSA",
          "status": "pending",
          "created_at": "2026-10-31T10:15:00.000Z"
        }
      ],
      "recent_enrollments": [
        {
          "id": 91,
          "user_name": "Karan Malhotra",
          "course_name": "Complete JavaScript DSA",
          "enrollment_source": "free",
          "enrolled_at": "2026-10-31T09:30:00.000Z"
        }
      ],
      "views_last_30_days": [
        {
          "date": "2026-10-30",
          "views": 1420
        }
      ]
    }
  }
  ```

---

## 5. Database Schema Impact & Verification

### Schema Inspection Result
During our pre-implementation audit, we executed SQL schema inspection queries against `course_platform_db`. The results verify that:
1. `course_views` contains all required columns: `course_id`, `user_id`, `session_id`, `viewed_at`, `referrer`, `source`, `device_type`, `created_at`, `updated_at`.
2. `course_analytics_daily` contains all required columns: `course_id`, `analytics_date`, `total_views`, `unique_visitors`, `enquiry_count`, `demo_request_count`, `wishlist_add_count`, `enrollment_count`.
3. `courses` table contains all required telemetry counter columns: `total_views`, `unique_visitors`, `enquiry_count`, `demo_request_count`, `wishlist_count`, `share_count`, `enrollment_count`, `rating_avg`, `rating_count`.
4. `notifications` contains all columns needed for cron reminders: `user_id`, `type`, `channel`, `recipient`, `payload`, `status`, `sent_at`.

### Forward-Only Migration Plan
> [!IMPORTANT]
> **NO DATABASE SCHEMA CHANGES OR MIGRATIONS ARE REQUIRED FOR STEP 12.**  
> Applied migrations 001–008 are 100% complete and will be preserved without modification. No SQL migration runner execution will occur during Step 12.

---

## 6. Analytics Calculations & Aggregation Rules

### 6.1 Telemetry Definitions & Conversion Rates
- **`total_views`**: Total count of page visits by unique sessions per day.
- **`unique_visitors`**: Total count of unique sessions that have ever interacted with the course.
- **Conversion Rate Formula**:
  $$\text{Conversion Rate} = \begin{cases} \text{ROUND}\left(\frac{\text{enrollment\_count}}{\text{unique\_visitors}} \times 100, 2\right) & \text{if } \text{unique\_visitors} > 0 \\ 0.00 & \text{if } \text{unique\_visitors} = 0 \end{cases}$$
- **Bot Detection Signature Filter**:
  A standard regular expression matches web spiders and automated scraping tools:
  ```javascript
  const BOT_USER_AGENT_REGEX = /bot|crawler|spider|crawling|googlebot|bingbot|yandex|baidu|duckduckbot|slurp|headlesschrome|facebookexternalhit|whatsapp|telegrambot/i;
  ```
  Views with matching `User-Agent` headers are acknowledged with HTTP 200 `{ success: true, message: "Bot view ignored" }`, preventing counter inflation.

### 6.2 Nightly Daily Aggregation Invariants
The nightly aggregation job (`analyticsAggregate.job.js` at 2:00 AM) processes telemetry for the preceding day:
1. **Views & Visitors Rollup:**
   ```sql
   SELECT 
     course_id,
     COUNT(*) AS total_views,
     COUNT(DISTINCT session_id) AS unique_visitors
   FROM course_views
   WHERE viewed_at >= ? AND viewed_at < ?
   GROUP BY course_id
   ```
2. **Engagement Events Rollup:**
   - Counts demo requests created on the target date.
   - Counts course enrollments created on the target date.
   - Counts wishlist additions created on the target date.
3. **Idempotent Upsert into `course_analytics_daily`:**
   ```sql
   INSERT INTO course_analytics_daily 
     (course_id, analytics_date, total_views, unique_visitors, enquiry_count, demo_request_count, wishlist_add_count, enrollment_count, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
   ON DUPLICATE KEY UPDATE
     total_views = VALUES(total_views),
     unique_visitors = VALUES(unique_visitors),
     enquiry_count = VALUES(enquiry_count),
     demo_request_count = VALUES(demo_request_count),
     wishlist_add_count = VALUES(wishlist_add_count),
     enrollment_count = VALUES(enrollment_count),
     updated_at = NOW()
   ```
4. **Course Counter Resynchronization:**
   Updates lifetime counts in `courses` to ensure aggregate values remain completely consistent.

---

## 7. Background Scheduled Jobs Specifications (node-cron)

All background jobs will be implemented in `src/jobs/` using `node-cron`. Timezone is strictly set to `Asia/Kolkata` (`env.TIMEZONE || 'Asia/Kolkata'`).

| # | Job Identifier | Schedule (Cron Expression) | Execution Time | Purpose & Primary Action |
|---|---|---|---|---|
| **1** | **`offer_expiry`** | `0 * * * *` | Hourly at minute 0 | Queries `course_offers` where `is_active = true` AND `ends_at < NOW()`. Sets `is_active = false`. Checks courses with expired offers to clear stale discounts. |
| **2** | **`analytics_aggregate`** | `0 2 * * *` | Daily at 2:00 AM | Aggregates previous day's `course_views`, `demo_requests`, `course_enrollments`, and `wishlists` into `course_analytics_daily` using `ON DUPLICATE KEY UPDATE`. Syncs `courses` counters. |
| **3** | **`enrollment_expiry`** | `0 1 * * *` | Daily at 1:00 AM | Queries `course_enrollments` where `enrollment_status = 'active'` AND `access_expires_at IS NOT NULL` AND `access_expires_at < NOW()`. Sets `enrollment_status = 'expired'`. |
| **4** | **`enrollment_expiring_notice`** | `0 8 * * *` | Daily at 8:00 AM | Finds active enrollments where `access_expires_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)`. Queues notification in `notifications` table (`type = 'enrollment_expiring'`) if not already notified. |
| **5** | **`demo_reminder`** | `*/10 * * * *` | Every 10 minutes | Queries `demo_requests` with `status = 'scheduled'` AND `scheduled_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 60 MINUTE)`. Queues reminder in `notifications` table (`type = 'demo_reminder'`) if not already notified. |
| **6** | **`token_cleanup`** | `0 3 * * *` | Daily at 3:00 AM | Deletes expired or revoked tokens from `refresh_tokens` where `revoked_at IS NOT NULL` OR `expires_at < DATE_SUB(NOW(), INTERVAL 30 DAY)`. |
| **7** | **`rating_resync`** | `0 4 * * *` | Daily at 4:00 AM | Scans courses with reviews, dynamically recomputes `AVG(rating)` and `COUNT(*)` exclusively from `course_reviews` where `moderation_status = 'approved'`, and updates `courses.rating_avg` and `courses.rating_count`. |
| **8** | **`views_retention`** | `30 4 * * 0` | Weekly on Sunday at 4:30 AM | Purges raw rows from `course_views` older than 180 days (`viewed_at < DATE_SUB(NOW(), INTERVAL 180 DAY)`) after daily aggregation has completed. Staggered 30 minutes after `rating_resync` to avoid DB contention. |

### Execution Safety & Locking Architecture
1. **Distributed Database-Level Locking (MariaDB `GET_LOCK`):** Each job acquires a non-blocking MariaDB advisory lock (`SELECT GET_LOCK('course_platform_cron_<job>', 0)`). If multiple Node.js instances or worker processes are running, only one instance executes the scheduled job while others skip cleanly without duplicate executions. Advisory locks automatically release if a connection or process drops, ensuring fail-safe recovery.
2. **In-Memory Guard Mutex:** A secondary local mutex (`isJobRunning`) guards against accidental re-entrance within the same process.
3. **Error Isolation:** Each job is wrapped in its own `try/catch` block with structured Pino logging. An error in a scheduled job will never crash the Express application process.
4. **Graceful Shutdown:** `stopCronJobs()` halts all scheduled tasks upon `SIGTERM` / `SIGINT`.
5. **Environment Isolation:** Jobs are not auto-started when `NODE_ENV === 'test'`. Integration tests import the underlying runner functions directly to test logic deterministically.

---

## 8. Privacy, Security & Data Retention Rules

1. **Session-Only Tracking:** The `course_views` table does NOT store IP addresses. Only the client-generated random `session_id` (from browser local storage) is stored.
2. **Student Privacy Protection:** Public telemetry and tracking endpoints never reveal counts or personal information. Admin analytics endpoints scrub student emails/phones when returning aggregated course metrics.
3. **Data Retention (180 Days):** Raw `course_views` records older than 180 days are permanently purged by the weekly `views_retention` cron job. Long-term historical telemetry is safely preserved in `course_analytics_daily`.
4. **Role Authorization:** Admin analytics and dashboard routes require verified `admin` or `super_admin` roles. Other roles (`user`, `counsellor`) receive HTTP `403 Forbidden`.

---

## 9. Performance & Indexing Strategy

1. **Lightweight Telemetry Write Path:**
   - The view recording endpoint executes at most 1 `SELECT` (indexed by `course_id, session_id, viewed_at`), 1 `INSERT` into `course_views`, and 1 atomic counter `UPDATE courses SET total_views = total_views + 1 WHERE id = ?`.
   - No heavy analytical joins run on the public request path.
2. **Composite Index Utilization:**
   - Querying today's view deduplication uses `viewed_at >= ? AND viewed_at <= ?` across the composite index `idx_course_views_session (course_id, session_id, viewed_at)` without wrapping fields in SQL functions (`DATE(viewed_at)`), ensuring high sargability and sub-millisecond execution.
3. **Background Rollups:**
   - All multi-course aggregation and range scans run in the background through `node-cron` during low-traffic night hours (2:00 AM).

---

## 10. Automated Test Plan (`tests/analytics_cron.test.js`)

A dedicated integration test suite will be created covering all public endpoints, admin analytics, and all 8 background jobs using real MariaDB transactions and fixtures:

### Suite 1: Public Telemetry & Tracking APIs (Section 16.1)
- `POST /api/courses/:id/views`:
  - Successfully records view event for published course (`200 OK`).
  - Idempotent duplicate check: second view with identical `session_id` on same day returns `200 OK` without duplicating row or incrementing counters.
  - New session visitor: increments both `total_views` and `unique_visitors`.
  - Repeat visitor from earlier date: increments `total_views` but does NOT increment `unique_visitors`.
  - Bot detection: `User-Agent` containing `bot` returns `200 OK` (`"Bot view ignored"`) without writing to DB or incrementing counters.
  - Rejects unpublished or non-existent course with `404 Not Found`.
  - Supports authenticated student (`user_id` stored) as well as anonymous guest (`user_id = null`).
- `POST /api/courses/:id/share`:
  - Increments `courses.share_count` by 1 (`200 OK`).
  - Rejects non-existent course with `404`.
- `POST /api/courses/:id/enquiry-click`:
  - Increments `courses.enquiry_count` by 1 (`200 OK`).
  - Rejects non-existent course with `404`.

### Suite 2: Admin Analytics & Dashboard APIs (Section 16.2)
- Authorization enforcement:
  - Rejects unauthenticated request with `401 Unauthorized`.
  - Rejects `user` and `counsellor` roles with `403 Forbidden`.
  - Allows `admin` and `super_admin` access (`200 OK`).
- `GET /api/admin/courses/:id/analytics`:
  - Returns complete telemetry payload matching Section 16.2 structure (`totals`, `daily`, `sources`, `devices`, `demo_funnel`).
  - Verifies mathematical accuracy of conversion rate calculation ($\frac{\text{Enrollments}}{\text{Unique Visitors}} \times 100$).
  - Correctly respects `from` and `to` date query filters.
- `GET /api/admin/analytics/courses`:
  - Returns course comparison array with conversion rates.
  - Supports sorting by `views`, `demo_requests`, `enrollments`, and `conversion`.
  - Supports pagination parameters.
- `GET /api/admin/dashboard`:
  - Returns global platform summary metrics: course status counts, user counts, enrollment counts, demo requests, recent enrollments, recent demo leads, and 30-day views series.

### Suite 3: Background Scheduled Jobs (Section 19.2)
- `runOfferExpiryJob()`: Inserts active offer with past `ends_at`; runs job; verifies `is_active` becomes `0`.
- `runAnalyticsAggregateJob()`: Inserts mock views, enrollments, and demo leads; runs job; verifies daily row inserted into `course_analytics_daily` and verifies counters.
- `runEnrollmentExpiryJob()`: Inserts active enrollment with past `access_expires_at`; runs job; verifies status transitions to `'expired'`.
- `runEnrollmentNoticeJob()`: Inserts active enrollment expiring in 5 days; runs job; verifies reminder queued in `notifications` table.
- `runDemoReminderJob()`: Inserts scheduled demo request 30 minutes in future; runs job; verifies notification queued in `notifications` table.
- `runTokenCleanupJob()`: Inserts revoked token and expired token older than 30 days; runs job; verifies records are purged from `refresh_tokens`.
- `runViewsRetentionJob()`: Inserts mock course view 190 days old; runs job; verifies row is deleted while recent views are retained.
- `runRatingResyncJob()`: Artificially alters course rating counters; runs job; verifies `rating_avg` and `rating_count` are recalculated accurately from approved reviews.

---

## 11. Files Expected to be Created or Modified

### New Files to Create:
1. `src/modules/analytics/analytics.validation.js` — Zod request validation schemas.
2. `src/modules/analytics/analytics.repository.js` — MariaDB SQL queries for telemetry, analytics, and dashboard.
3. `src/modules/analytics/analytics.service.js` — Business logic, bot detection, deduplication, conversion calculations.
4. `src/modules/analytics/analytics.controller.js` — Express controllers for public telemetry and admin dashboard.
5. `src/modules/analytics/analytics.routes.js` — Route declarations for public tracking and admin analytics.
6. `src/jobs/offerExpiry.job.js` — Scheduled offer expiry task.
7. `src/jobs/analyticsAggregate.job.js` — Scheduled daily analytics aggregation task.
8. `src/jobs/enrollmentExpiry.job.js` — Scheduled enrollment access expiry task.
9. `src/jobs/enrollmentNotice.job.js` — Scheduled expiring enrollment notice task.
10. `src/jobs/demoReminder.job.js` — Scheduled demo session reminder task.
11. `src/jobs/tokenCleanup.job.js` — Scheduled refresh token purge task.
12. `src/jobs/viewsRetention.job.js` — Scheduled view retention purge task.
13. `src/jobs/ratingResync.job.js` — Scheduled review rating aggregate resync task.
14. `src/jobs/scheduler.js` — Master cron scheduler initialization, lock management, and export orchestrator.
15. `tests/analytics_cron.test.js` — Comprehensive automated integration test suite for Step 12.

### Existing Files to Modify:
1. `src/app.js`: Mount `analyticsCourseRoutes` under `/api/courses` and `analyticsAdminRoutes` under `/api/admin`.
2. `src/server.js`: Initialize `initCronJobs()` when starting in non-test mode and invoke `stopCronJobs()` in graceful shutdown.
3. `scratch/run_all_tests.js`: Add `tests/analytics_cron.test.js` to the sequential test runner.
4. `docs/COURSE_PLATFORM_BACKEND_MANUAL.md`: Update Step 12 section from roadmap to verified implementation.
5. `docs/API_DOCUMENTATION.md`: Document the 6 new endpoints and response schemas.

---

## 12. Dependencies & Risk Assessment

- **Zero External Dependencies Required:** `node-cron` (`^3.0.3`) is already installed in `package.json`. No payment gateways or third-party paid cloud services will be introduced.
- **Process Crash Risk:** An unhandled error in a background cron job could theoretically bring down the Node.js server. *Mitigation:* Every cron job executes within an isolated `try/catch` block that logs errors via Pino without terminating the process.
- **Counter Drift Risk:** High-concurrency view events could cause counter inaccuracies. *Mitigation:* Telemetry increments use atomic SQL (`SET total_views = total_views + 1`), and the nightly aggregation job resynchronizes lifetime counters from source tables.
- **Test Runner Hang Risk:** Unstopped `setInterval` or `node-cron` schedules prevent Node.js test processes from exiting cleanly. *Mitigation:* Cron jobs are never automatically scheduled in test environments (`NODE_ENV === 'test'`); tests invoke runner functions directly.

---

## 13. Step-by-Step Implementation Sequence

Once approved, implementation will proceed in the following disciplined order:
1. **Phase 1: Analytics Module Implementation (`src/modules/analytics/`)**
   - Create `analytics.validation.js`, `analytics.repository.js`, `analytics.service.js`, `analytics.controller.js`, `analytics.routes.js`.
   - Mount routes in `src/app.js`.
2. **Phase 2: Cron Jobs Implementation (`src/jobs/`)**
   - Create all 8 individual job runner files and `scheduler.js`.
   - Wire `initCronJobs()` and `stopCronJobs()` into `src/server.js`.
3. **Phase 3: Automated Testing & Verification**
   - Build `tests/analytics_cron.test.js` covering all 6 endpoints and all 8 cron jobs.
   - Run focused Step 12 test suite.
   - Run the full sequential regression suite (all 14 test files).
4. **Phase 4: Documentation & Final Verification**
   - Update `docs/COURSE_PLATFORM_BACKEND_MANUAL.md` and `docs/API_DOCUMENTATION.md`.
   - Verify that router handler count increases from 122 to 128.
   - Halt execution at Step 12 completion; do not start Step 13.

---

## 14. Acceptance Criteria

1. `POST /api/courses/:id/views` records valid views, ignores web bots, and deduplicates identical sessions within the same day without throwing 500 errors.
2. `POST /api/courses/:id/share` and `POST /api/courses/:id/enquiry-click` atomically increment counters.
3. `GET /api/admin/courses/:id/analytics`, `GET /api/admin/analytics/courses`, and `GET /api/admin/dashboard` strictly enforce admin RBAC and return complete payloads matching Section 16.2.
4. All 8 scheduled cron jobs execute correctly, handle errors safely, prevent overlapping runs via MariaDB advisory locks, and can be triggered on-demand by automated tests.
5. All 314 existing regression tests continue to pass with 0 failures, plus all new Step 12 tests pass cleanly.
6. Endpoint inventory increases by exactly 6 endpoints (from 122 to 128).
7. Zero database migrations executed; migrations 001–008 preserved intact.
8. Step 13 remains completely untouched.

---

## 15. Planning Review – Resolved Issues and Decisions

This section addresses the architectural review points raised during the Step 12 pre-implementation evaluation, establishing rigorous rules, calculations, and safety boundaries for implementation.

### 15.1 Point 1: Lifetime Analytics Preservation & Pruning Invariants

#### Identified Risk:
The weekly `viewsRetention.job.js` cron job purges raw records from `course_views` where `viewed_at < DATE_SUB(NOW(), INTERVAL 180 DAY)`. If lifetime metrics (`courses.total_views`, `courses.unique_visitors`) or reporting queries derive values by executing `COUNT(*)` or `COUNT(DISTINCT session_id)` on `course_views`, pruning raw rows would cause lifetime counters to drop dramatically every Sunday morning. Furthermore, multi-year `unique_visitors` cannot be obtained by summing `course_analytics_daily.unique_visitors` (as the same visitor on different days would be double-counted).

#### Proposed Solution:
Architecturally decouple the three distinct analytical layers:
1. **Raw Telemetry Stream (`course_views`):** An ephemeral 180-day audit log of page events. Used strictly for real-time deduplication and the current day's aggregation. Pruned weekly.
2. **Permanent Daily Historical Ledger (`course_analytics_daily`):** Immutable daily snapshots (`analytics_date`, `total_views`, `unique_visitors`, `enquiry_count`, etc.). **Never pruned.** These rows remain permanently for reporting, trending, and multi-year comparative analytics.
3. **Monotonic Lifetime Counters (`courses.total_views`, `courses.unique_visitors`, etc.):** Persistent counters stored on the `courses` record. Incremented atomically on valid live events. **Never recalculated from raw `course_views` during retention pruning.**

#### Exact Calculation and Execution Rules:
1. **Live Monotonic Updates:**
   - On a valid, non-bot, non-duplicate daily view event:
     `UPDATE courses SET total_views = total_views + 1 WHERE id = ?`
   - To check if a visitor is genuinely unique in the lifetime of the course:
     Query `SELECT id FROM course_views WHERE course_id = ? AND session_id = ? LIMIT 1`.
     If 0 rows exist (meaning this session has never visited the course within the active 180-day window):
     `UPDATE courses SET unique_visitors = unique_visitors + 1 WHERE id = ?`
2. **Safe Retention Pruning Rule:**
   - Pruning query:
     ```sql
     DELETE FROM course_views WHERE viewed_at < DATE_SUB(NOW(), INTERVAL 180 DAY);
     ```
   - **Inviolable Invariant:** The retention pruning job executes ONLY the `DELETE` statement. It is strictly forbidden from executing any `UPDATE courses SET total_views = ...` or altering `courses.unique_visitors`.
3. **Admin Reporting Derivation Rule:**
   - In `GET /api/admin/courses/:id/analytics`, the `totals` block reads `total_views` and `unique_visitors` directly from `courses`. It never executes a full-table `COUNT(*)` on `course_views`.
   - The `daily` array reads from `course_analytics_daily`, whose records are permanent and unaffected by the 180-day pruning of `course_views`.

#### Relevant Database Tables:
- `course_views` (ephemeral 180-day events)
- `course_analytics_daily` (permanent daily summaries)
- `courses` (monotonic lifetime counters)

#### Required Tests:
- `test_lifetime_counters_survive_retention_purge`: Seed a course with `total_views = 500` and `unique_visitors = 320`. Insert raw `course_views` rows dated 190 days ago. Execute `runViewsRetentionJob()`. Verify raw rows are pruned, but `courses.total_views` remains 500 and `courses.unique_visitors` remains 320.
- `test_repeat_visitor_does_not_increment_unique_visitors`: Execute two views from the same session on consecutive days. Verify `total_views` increments on both days, but `unique_visitors` increments only on the first day.

---

### 15.2 Point 2: Enquiry Analytics Sourcing & Share Count Tracking

#### Identified Risk:
The `course_analytics_daily` schema contains an `enquiry_count` column. However, there is no standalone `course_enquiries` table in migrations 001–008. If the daily aggregation job expects a non-existent table, `enquiry_count` in `course_analytics_daily` would remain permanently `0`. Additionally, `courses` contains `share_count`, but `course_analytics_daily` has no `share_count` column, introducing ambiguity on whether shares require daily tracking.

#### Proposed Solution:
1. **Enquiry Click Sourcing:**
   - The authoritative source event for course enquiries is the public endpoint `POST /api/courses/:id/enquiry-click` (which records user clicks on enquiry/contact/chat triggers on the course landing page).
   - In addition, demo booking form submissions (`POST /api/courses/:id/demo-requests`) represent formal lead generation and are tracked via `course_analytics_daily.demo_request_count`.
   - To ensure daily enquiry counts are never lost:
     When `POST /api/courses/:id/enquiry-click` is invoked, it will:
     1. Increment `courses.enquiry_count = enquiry_count + 1`.
     2. Atomically upsert today's row in `course_analytics_daily`:
        ```sql
        INSERT INTO course_analytics_daily 
          (course_id, analytics_date, enquiry_count, created_at, updated_at)
        VALUES (?, CURDATE(), 1, NOW(), NOW())
        ON DUPLICATE KEY UPDATE 
          enquiry_count = enquiry_count + 1, 
          updated_at = NOW();
        ```
     This captures daily enquiry activity directly without requiring schema migrations.
2. **Nightly Aggregation Safety:**
   - During the nightly aggregation job (`analyticsAggregate.job.js`), `enquiry_count` in `course_analytics_daily` is preserved using `COALESCE(enquiry_count, 0)`. The aggregation job will NOT overwrite today's or yesterday's enquiry clicks with 0.
3. **Share Count Tracking Policy:**
   - `courses.share_count` is a monotonic lifetime counter incremented on `POST /api/courses/:id/share`.
   - Because `course_analytics_daily` in Migration 007 does not contain a `share_count` column, and database schema modifications are forbidden by project rules, `share_count` is tracked **purely as a lifetime counter** on the `courses` record.

#### Exact Calculation and Execution Rules:
- **`POST /api/courses/:id/enquiry-click`**:
  - Atomically update lifetime: `UPDATE courses SET enquiry_count = enquiry_count + 1 WHERE id = ?`.
  - Atomically update daily: Upsert `course_analytics_daily` with `enquiry_count = enquiry_count + 1`.
- **`POST /api/courses/:id/share`**:
  - Atomically update lifetime: `UPDATE courses SET share_count = share_count + 1 WHERE id = ?`.
- **`runAnalyticsAggregateJob()`**:
  - Aggregates `demo_requests` created on target date $\to$ `demo_request_count`.
  - Preserves existing `enquiry_count` in `course_analytics_daily`.

#### Relevant Database Tables:
- `courses` (`enquiry_count`, `share_count`)
- `course_analytics_daily` (`enquiry_count`, `demo_request_count`)
- `demo_requests` (source for demo booking leads)

#### Required Tests:
- `test_enquiry_click_updates_both_lifetime_and_daily`: Call `POST /api/courses/:id/enquiry-click`. Verify `courses.enquiry_count` increments and `course_analytics_daily.enquiry_count` for `CURDATE()` increments.
- `test_nightly_aggregation_preserves_enquiry_count`: Seed mock views and enrollments alongside an existing `enquiry_count = 5` in `course_analytics_daily`. Run `runAnalyticsAggregateJob()`. Verify `enquiry_count` remains 5.
- `test_share_click_updates_lifetime_counter`: Call `POST /api/courses/:id/share`. Verify `courses.share_count` increments by 1.

---

### 15.3 Point 3: Cron Job Concurrency & Distributed Advisory Locking

#### Identified Risk:
In a clustered or multi-instance deployment (e.g. multiple Docker containers, PM2 cluster mode, or horizontal auto-scaling instances behind a load balancer), standard in-memory boolean flags (`let isRunning = false`) only guard within a single process. All running instances would trigger the same cron job at 1:00 AM, 2:00 AM, etc., causing duplicate job runs, race conditions on counters, duplicate student notification emails, and lock contention.

#### Proposed Solution:
Implement **MariaDB Named Advisory Locks (`GET_LOCK` / `RELEASE_LOCK`)**:
- MariaDB provides native named locks managed directly by the database engine in memory across all active client connections.
- It requires **zero new dependencies** (no Redis, no external locking daemons) and **zero database table changes**.
- Each job defines a standardized lock key: `course_platform_cron_<job_name>` (e.g. `course_platform_cron_analytics_aggregate`).
- Non-blocking acquisition: `SELECT GET_LOCK(?, 0) AS lock_acquired`.
  - If `1`: The instance acquired the lock and executes the job.
  - If `0`: Another instance is already running this job. The current instance logs an info entry and immediately skips execution cleanly.
- Automatic fail-safe recovery: If an application process crashes or loses network connectivity mid-execution, MariaDB automatically releases all advisory locks tied to that connection when the TCP socket terminates or reaches connection timeout. There is zero risk of permanently stuck locks.

#### Exact Calculation and Execution Rules:
```javascript
export async function withJobLock(jobName, jobFn) {
  const pool = getPool();
  const connection = await pool.getConnection();
  const lockKey = `course_platform_cron_${jobName}`;

  try {
    const [rows] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [lockKey]);
    if (!rows[0] || rows[0].acquired !== 1) {
      logger.info({ job: jobName }, 'Job lock held by another instance; skipping');
      return { skipped: true, reason: 'locked' };
    }

    logger.info({ job: jobName }, 'Starting scheduled job execution');
    const result = await jobFn(connection);
    logger.info({ job: jobName }, 'Scheduled job completed successfully');
    return { skipped: false, result };
  } catch (error) {
    logger.error({ job: jobName, err: error.message }, 'Scheduled job execution failed');
    throw error;
  } finally {
    try {
      await connection.query('SELECT RELEASE_LOCK(?)', [lockKey]);
    } catch (releaseErr) {
      logger.warn({ job: jobName, err: releaseErr.message }, 'Error releasing advisory lock');
    }
    connection.release();
  }
}
```

#### Relevant Database Tables:
- MariaDB engine internal memory (zero tables).

#### Required Tests:
- `test_cron_advisory_lock_mutual_exclusion`: Open connection A and acquire `course_platform_cron_test_job`. On connection B, attempt to run the job wrapped in `withJobLock`. Verify connection B returns `{ skipped: true, reason: 'locked' }`. Release lock on connection A; verify connection B can now acquire the lock and execute.

---

### 15.4 Point 4: Combining Live Today's Data & Historical Daily Analytics

#### Identified Risk:
When an administrator queries `GET /api/admin/courses/:id/analytics` for a date range that includes *today* (e.g. `2026-10-01` to `2026-10-31`, where today is `2026-10-31`), a naive union between `course_views` and `course_analytics_daily` would cause duplicate records or double-counting, because `course_analytics_daily` may already contain a row for today (from live enquiry clicks), while today's views and enrollments are actively accumulating in raw tables. Furthermore, server timezone discrepancies (e.g. UTC vs IST) would shift day boundaries by 5.5 hours.

#### Proposed Solution:
1. **Strict Asia/Kolkata Timezone Enforcement:**
   - All date queries and day boundaries use `Asia/Kolkata` (UTC+05:30) per project specification.
   - The current Kolkata calendar date $D_{\text{today}}$ is derived via `Intl.DateTimeFormat`:
     `const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());`
   - Day boundaries:
     `day_start = "${todayStr} 00:00:00"`
     `day_end = "${todayStr} 23:59:59"`
2. **Two-Tiered Hybrid Query Strategy:**
   - **Historical Slice (`analytics_date >= from AND analytics_date < D_today`):**
     Queried directly from `course_analytics_daily`.
   - **Live Today Slice (evaluated only if `to >= D_today`):**
     Synthesized in real-time from active tables for today:
     - `total_views`: `SELECT COUNT(*) FROM course_views WHERE course_id = ? AND viewed_at >= ? AND viewed_at <= ?`
     - `unique_visitors`: `SELECT COUNT(DISTINCT session_id) FROM course_views WHERE course_id = ? AND viewed_at >= ? AND viewed_at <= ?`
     - `demo_request_count`: `SELECT COUNT(*) FROM demo_requests WHERE course_id = ? AND created_at >= ? AND created_at <= ?`
     - `enrollment_count`: `SELECT COUNT(*) FROM course_enrollments WHERE course_id = ? AND enrolled_at >= ? AND enrolled_at <= ?`
     - `enquiry_count`: Read from `course_analytics_daily` for today (or 0).
   - **Concatenation:**
     The historical array and the single live today object are concatenated. This guarantees:
     - Exactly one entry per calendar date.
     - Zero double-counting.
     - High performance (historical slice reads from indexed summary; only today's single date scans raw tables).

#### Exact Calculation and Execution Rules:
- In `analytics.repository.js`:
  ```javascript
  const todayStr = getKolkataDateString();
  const historicalRows = await getHistoricalDailyRows(courseId, from, to, todayStr);
  
  if (to >= todayStr) {
    const todayStats = await getTodayLiveStats(courseId, todayStr);
    historicalRows.push(todayStats);
  }
  return historicalRows;
  ```
- **Totals Block Calculation:**
  Read directly from `courses` table:
  `total_views = courses.total_views`
  `unique_visitors = courses.unique_visitors`
  `conversion_rate = unique_visitors > 0 ? ROUND((courses.enrollment_count / courses.unique_visitors) * 100, 2) : 0.00`

#### Relevant Database Tables:
- `course_analytics_daily` (historical days $< D_{\text{today}}$)
- `course_views` (today's views)
- `demo_requests` (today's leads)
- `course_enrollments` (today's enrollments)
- `courses` (lifetime totals and conversion rate)

#### Required Tests:
- `test_analytics_hybrid_combining_no_duplicates`: Seed 3 days of historical rows in `course_analytics_daily` (`2026-10-28` to `2026-10-30`) and 4 live views in `course_views` on `2026-10-31`. Query `/api/admin/courses/:id/analytics?from=2026-10-28&to=2026-10-31`. Verify `daily` array has exactly 4 items, dates are unique and strictly sequential, and counts match.
- `test_timezone_boundary_handling`: Verify that events at 23:59:30 Kolkata time are assigned to the current day, and events at 00:00:30 are assigned to the next calendar date.

---

### 15.5 Point 5: Cron Schedule Review & Load Staggering

#### Identified Risk:
In the initial draft schedule:
- `views_retention` was scheduled at `0 4 * * 0` (4:00 AM on Sunday).
- `rating_resync` was scheduled at `0 4 * * *` (4:00 AM Daily).
At 4:00 AM every Sunday, both jobs would execute concurrently. `views_retention` executes bulk range deletes on `course_views`, while `rating_resync` performs table scans and aggregate updates across `courses` and `course_reviews`. Running them at the exact same minute creates lock contention, memory spikes, and potential connection timeouts.

#### Proposed Solution:
Stagger all 8 background jobs across the night and morning hours so that no two heavy jobs overlap:

| # | Job Identifier | Staggered Schedule (Cron) | Time (Asia/Kolkata) | Resource Profile & Justification |
|---|---|---|---|---|
| **1** | **`enrollment_expiry`** | `0 1 * * *` | 1:00 AM Daily | **Light:** Quick indexed update on expired enrollments (`access_expires_at < NOW()`). |
| **2** | **`analytics_aggregate`** | `0 2 * * *` | 2:00 AM Daily | **Medium (Primary Rollup):** Rolls up day $T-1$ views and engagement into `course_analytics_daily`. Must finish before retention pruning. |
| **3** | **`token_cleanup`** | `0 3 * * *` | 3:00 AM Daily | **Light:** Prunes revoked and 30-day expired tokens from `refresh_tokens`. |
| **4** | **`rating_resync`** | `0 4 * * *` | 4:00 AM Daily | **Medium-Heavy:** Recalculates course ratings from approved reviews. Runs alone at 4:00 AM. |
| **5** | **`views_retention`** | `30 4 * * 0` | 4:30 AM Sunday | **Heavy:** Prunes raw `course_views` older than 180 days. **Staggered by 30 minutes** after `rating_resync`, long after `analytics_aggregate` (2:00 AM) has completed. |
| **6** | **`enrollment_expiring_notice`** | `0 8 * * *` | 8:00 AM Daily | **Light:** Queues notification reminders for students whose access expires in 7 days. |
| **7** | **`offer_expiry`** | `0 * * * *` | Hourly at :00 | **Light:** Fast indexed check on active offers where `ends_at < NOW()`. |
| **8** | **`demo_reminder`** | `*/10 * * * *` | Every 10 min | **Light:** Fast indexed scan on demo requests scheduled in next 60 min. |

#### Exact Execution Rules:
- All cron tasks are instantiated in `src/jobs/scheduler.js` with options `{ scheduled: true, timezone: 'Asia/Kolkata' }`.
- In test environments (`NODE_ENV === 'test'`), cron timers are not auto-scheduled, preventing dangling timers. Tests invoke exported runner functions directly.

#### Relevant Database Tables:
- All respective subsystem tables (`course_enrollments`, `course_views`, `course_analytics_daily`, `refresh_tokens`, `course_reviews`, `courses`, `notifications`, `course_offers`, `demo_requests`).

#### Required Tests:
- `test_cron_schedule_expressions_syntax`: Verify all 8 cron strings compile cleanly in `node-cron` with zero syntax errors.
- `test_staggered_timing_isolation`: Programmatically assert that `views_retention` cron string (`30 4 * * 0`) is distinct from `rating_resync` (`0 4 * * *`).

---

### 15.6 Summary of Decisions & Stakeholder Clearances

| # | Topic | Proposed Decision | Alternative Considered | Stakeholder Impact |
|---|---|---|---|---|
| **1** | **Lifetime Counter Pruning** | `courses.total_views` and `courses.unique_visitors` are monotonic lifetime counters and will NEVER decrease during 180-day retention pruning. | Recalculate lifetime counts from pruned table (rejected due to data loss). | Preserves true platform engagement history indefinitely. |
| **2** | **Daily Enquiry Tracking** | `POST /api/courses/:id/enquiry-click` will update both `courses.enquiry_count` and `course_analytics_daily.enquiry_count` (for `CURDATE()`) in real time. | Omit enquiry clicks from daily report (rejected). | Fills existing schema column cleanly without migrations. |
| **3** | **Share Count Tracking** | Tracked purely as a lifetime counter on `courses.share_count`. Not tracked daily because `course_analytics_daily` lacks a `share_count` column. | Alter table schema to add `share_count` (rejected by safety rules). | Respects migration immutability. |
| **4** | **Advisory Locking** | Use MariaDB native `GET_LOCK()` advisory locks for multi-instance cron safety. | Redis or file locks (rejected to avoid new dependencies). | Production-safe, zero dependencies. |
| **5** | **Cron Schedule Staggering** | Move `views_retention` from 4:00 AM to 4:30 AM on Sunday to avoid conflict with `rating_resync`. | Run both at 4:00 AM (rejected due to lock contention). | Eliminates DB load spikes. |

---

## 16. Final Technical Consistency Review

This section resolves the final critical architectural and technical consistency issues identified prior to implementation approval, establishing strict boundaries, data flow rules, transaction lifecycles, and testing requirements.

### 16.1 Issue 1: Lifetime Unique Visitor Definition vs 180-Day Raw Event Retention

#### Risk:
The `courses` table maintains a `unique_visitors` counter, while raw telemetry records in `course_views` are pruned after 180 days by `viewsRetention.job.js`.
If a user visits on Day 1 and returns on Day 181, their earlier `session_id` in `course_views` has been pruned. When deduplicating via `SELECT id FROM course_views WHERE course_id = ? AND session_id = ? LIMIT 1`, the query finds 0 rows, causing `courses.unique_visitors` to increment again.
Claiming that `courses.unique_visitors` represents an exact, eternal lifetime unique visitor count is technically contradictory under 180-day raw event retention.

#### Final Proposed Rule:
1. **Accurate Technical Definition:**
   `courses.unique_visitors` is formally defined as a **monotonic counter deduplicated against an active rolling 180-day retention window**.
   - If a session visits on Day 1 and returns on Day 50, it is recognized as an existing visitor and does NOT increment `unique_visitors`.
   - If a session returns after 181+ days (after raw data expiration), it is treated as a renewed active visitor and increments `unique_visitors`.
   - The counter is strictly monotonic: it **never decrements** when older `course_views` rows are pruned.
2. **Alignment with Specification:**
   This behavior directly honors Section 16 of `Course_Platform_Backend_Plan.txt`:
   *"Ye hamesha asli unique logo ki exact ginti nahi hoti. Anonymous visitor ko pakki pehchaan ke saath individual nahi bana sakte, isliye sirf session_id store hota hai."*
3. **No Schema Changes:**
   The existing schema (`courses.unique_visitors` and `course_views`) supports this rolling 180-day deduplication model without schema modifications.
   *(Note: If the stakeholder requires perpetual eternal uniqueness beyond 180 days, a dedicated persistent session hash table `course_visitor_hashes (course_id, session_hash)` would be required, which would require an approved database migration. In accordance with safety rules, no migration will be introduced; the rolling 180-day window rule will be enforced).*

#### Data Source:
- Deduplication check: `course_views` table (`session_id, course_id`).
- Monotonic counter: `courses.unique_visitors` column.

#### Transaction / Locking Behavior:
- During view tracking, the check for visitor novelty is performed on `course_views`:
  `SELECT id FROM course_views WHERE course_id = ? AND session_id = ? LIMIT 1`
  If not found, `courses.unique_visitors` is incremented atomically:
  `UPDATE courses SET total_views = total_views + 1, unique_visitors = unique_visitors + 1 WHERE id = ?`

#### Required Test Cases:
- `test_unique_visitor_rolling_window_behavior`:
  - Seed view for Session A at Day $T-30$. Verify returning view today from Session A increments `total_views` but NOT `unique_visitors`.
  - Simulate returning Session B whose only previous visit was Day $T-190$ (pruned). Verify view today increments `unique_visitors` as a renewed active visitor.
  - Assert `courses.unique_visitors` never decreases after `viewsRetention.job.js` execution.

#### Pending Stakeholder Decision:
- **Decision Required:** Formal acknowledgment that `courses.unique_visitors` represents a monotonic counter deduplicated within the 180-day retention window rather than an eternal identity tracker.

---

### 16.2 Issue 2: MariaDB Advisory Lock Connection Lifecycle & Pool Handling

#### Risk:
MariaDB named advisory locks (`GET_LOCK` and `RELEASE_LOCK`) are **connection-scoped** (tied to the individual MySQL/MariaDB TCP connection).
If advisory locks are executed using pooled connections without strict lifecycle management:
1. Releasing a pooled connection (`connection.release()`) while `GET_LOCK` is still held leaves the lock dangling on that pooled socket, corrupting future queries that borrow the connection.
2. Using `pool.query()` for `GET_LOCK` and `RELEASE_LOCK` executes them on two different pooled connections, causing `RELEASE_LOCK` to fail.
3. The existing `withTransaction` helper manages SQL transactions (`START TRANSACTION / COMMIT / ROLLBACK`), which are irrelevant to advisory locks (advisory locks are not rolled back on transaction rollback).

#### Final Proposed Rule:
Create a dedicated `withAdvisoryLock(lockName, jobFn)` helper with strict connection lifecycle boundaries:
1. **Dedicated Connection Acquisition:** Acquire a single dedicated connection from the pool (`const connection = await pool.getConnection()`).
2. **Lock Acquisition:** Execute `SELECT GET_LOCK(?, 0) AS acquired` on that exact connection.
   - If `acquired === 0` (lock held elsewhere): Release connection immediately back to pool (`connection.release()`) and return `{ skipped: true, reason: 'locked' }`.
3. **Execution on Same Connection:** Execute the cron job logic using this exact dedicated connection (or passing this connection to repository methods). The connection is held open for the entire duration of the job.
4. **Mandatory Lock Release Before Connection Release:**
   In the `finally` block:
   - Execute `SELECT RELEASE_LOCK(?)` on the exact same connection.
   - Only AFTER the lock is released, call `connection.release()` to return the clean socket back to the pool.
5. **Connection Loss & Crash Recovery:**
   If the Node.js process crashes, receives `SIGKILL`, or loses network connection, MariaDB automatically releases all advisory locks tied to that connection when the TCP session terminates.

#### Data Source:
- MariaDB engine memory metadata (no database tables).

#### Transaction / Locking Behavior:
- Exact helper code pattern:
```javascript
export async function withAdvisoryLock(jobName, jobFn) {
  const pool = getPool();
  const connection = await pool.getConnection();
  const lockKey = `course_platform_cron_${jobName}`;

  try {
    const [rows] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [lockKey]);
    if (!rows[0] || rows[0].acquired !== 1) {
      logger.info({ job: jobName }, 'Job lock currently held by another instance; skipping');
      return { skipped: true, reason: 'locked' };
    }

    logger.info({ job: jobName }, 'Acquired distributed lock; executing job');
    const result = await jobFn(connection);
    return { skipped: false, result };
  } finally {
    try {
      await connection.query('SELECT RELEASE_LOCK(?)', [lockKey]);
    } catch (releaseErr) {
      logger.warn({ job: jobName, err: releaseErr.message }, 'Warning on lock release');
    }
    connection.release(); // Connection released ONLY after RELEASE_LOCK
  }
}
```

#### Required Test Cases:
- `test_advisory_lock_dedicated_connection_lifecycle`:
  - Acquire lock on dedicated Connection 1.
  - Attempt acquisition on Connection 2; verify immediate skip with `{ skipped: true }`.
  - Release lock on Connection 1; verify Connection 2 can now acquire lock and execute.
  - Verify Connection 1 is returned to pool clean with no active locks.

#### Pending Stakeholder Decision:
- None. This is standard database connection engineering adhering to MariaDB specifications.

---

### 16.3 Issue 3: Atomic Enquiry Tracking & Timezone Synchronization

#### Risk:
When a user clicks the enquiry button (`POST /api/courses/:id/enquiry-click`):
1. If updating `courses.enquiry_count` and upserting `course_analytics_daily` are executed as two independent pool queries, a failure in the second query causes permanent drift between lifetime and daily reporting.
2. If the SQL query relies on `CURDATE()`, database server timezone offsets (e.g. database in UTC vs application in IST) will cause events between 12:00 AM and 5:30 AM IST to be attributed to the previous calendar day in `course_analytics_daily`.
3. If nightly aggregation at 2:00 AM aggregates day $T-1$, it could overwrite the real-time accumulated `enquiry_count` with 0 if no separate enquiry events table exists.

#### Final Proposed Rule:
1. **Single ACID Transaction:**
   `courses.enquiry_count` and `course_analytics_daily.enquiry_count` must execute within a single MariaDB database transaction on the same connection.
   If either statement fails, both roll back cleanly.
2. **Application-Computed `Asia/Kolkata` Calendar Date:**
   The calendar date is computed by the application using `Asia/Kolkata` timezone:
   `const dateKolkata = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());` (format: `YYYY-MM-DD`).
   This string is passed as a parameterized value `?` to the SQL query. `CURDATE()` is strictly forbidden.
3. **Atomic SQL Execution:**
   ```sql
   START TRANSACTION;
   UPDATE courses 
   SET enquiry_count = enquiry_count + 1 
   WHERE id = ? AND deleted_at IS NULL;

   INSERT INTO course_analytics_daily 
     (course_id, analytics_date, enquiry_count, created_at, updated_at)
   VALUES (?, ?, 1, NOW(), NOW())
   ON DUPLICATE KEY UPDATE 
     enquiry_count = enquiry_count + 1, 
     updated_at = NOW();
   COMMIT;
   ```
4. **Nightly Aggregation Preservation:**
   When `runAnalyticsAggregateJob()` aggregates the previous day ($T-1$), its upsert SQL uses:
   `enquiry_count = course_analytics_daily.enquiry_count` (preserving the real-time accumulated counter rather than resetting it).

#### Data Source:
- Lifetime: `courses.enquiry_count`.
- Daily: `course_analytics_daily.enquiry_count` for `analytics_date = dateKolkata`.

#### Transaction / Locking Behavior:
- Row-level lock on `courses` row via `UPDATE ... WHERE id = ?`.
- Row-level lock on `course_analytics_daily` row via unique key `uq_analytics_course_date`.
- Managed using `withTransaction` in `src/config/db.js`.

#### Required Test Cases:
- `test_enquiry_tracking_atomic_rollback`: Mock failure on `course_analytics_daily` insert; assert `courses.enquiry_count` does not increment and rolls back.
- `test_enquiry_tracking_kolkata_timezone`: Verify events occurring at 01:30 AM IST are written to the current IST date even if DB server clock is UTC.
- `test_nightly_aggregation_preserves_enquiry_counter`: Seed `enquiry_count = 7` in `course_analytics_daily`; execute `runAnalyticsAggregateJob()`; assert `enquiry_count` remains 7.

#### Pending Stakeholder Decision:
- None. Meets all data consistency and timezone requirements.

---

### 16.4 Issue 4: Notification Idempotency Without Schema Modifications

#### Risk:
The scheduled background jobs `enrollmentNotice.job.js` (daily at 8:00 AM) and `demoReminder.job.js` (every 10 minutes) insert notifications into the `notifications` table.
- A demo session scheduled 45 minutes in the future will match the 60-minute window at $T=0$, $T=10$, $T=20$, and $T=30$ minutes.
- An enrollment expiring in 5 days will match the 7-day query every morning, and would trigger multiple times on cron retries, server restarts, or manual test reruns.
- The `notifications` table in Migration 007 does NOT have a unique constraint on `(user_id, type)` or `(recipient, type)`.
- Advisory locks prevent concurrent overlapping instances, but do NOT prevent repeated insertions across consecutive scheduled runs.

#### Final Proposed Rule:
Enforce application-level deterministic deduplication keys stored inside `notifications.payload` (JSON) and checked prior to insertion:
1. **Demo Reminder Idempotency Key:**
   - Payload format:
     `{ "demo_request_id": 108, "course_id": 4, "scheduled_at": "2026-11-01T14:00:00+05:30", "meeting_link": "..." }`
   - Pre-insertion check on the same connection:
     ```sql
     SELECT id FROM notifications 
     WHERE type = 'demo_reminder' 
       AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.demo_request_id')) = ?
     LIMIT 1;
     ```
   - If an existing notification row exists for `demo_request_id`: Skip insertion.
   - Guarantees each demo session receives exactly one reminder, regardless of how many times `demoReminder.job.js` runs during the 60-minute window.
2. **Enrollment Expiry Notice Idempotency Key:**
   - Payload format:
     `{ "enrollment_id": 52, "course_id": 4, "access_expires_at": "2026-11-08T00:00:00+05:30" }`
   - Pre-insertion check:
     ```sql
     SELECT id FROM notifications 
     WHERE type = 'enrollment_expiring' 
       AND JSON_UNQUOTE(JSON_EXTRACT(payload, '$.enrollment_id')) = ?
       AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
     LIMIT 1;
     ```
   - If a notification was queued for this enrollment in the past 7 days: Skip insertion.
3. **No Schema Changes:**
   MariaDB's native `JSON_EXTRACT` / `JSON_UNQUOTE` operators inspect the existing `payload` column directly without requiring any migration.

#### Data Source:
- Source tables: `demo_requests`, `course_enrollments`.
- Target table: `notifications`.

#### Transaction / Locking Behavior:
- Sourced and inserted inside a dedicated transaction per batch or using pre-check verification before insertion.

#### Required Test Cases:
- `test_demo_reminder_idempotency_multiple_runs`: Run `runDemoReminderJob()` 3 consecutive times for a demo session 30 minutes away; assert exactly 1 notification is inserted in `notifications`.
- `test_enrollment_notice_idempotency_multiple_runs`: Run `runEnrollmentNoticeJob()` twice on the same day; assert student receives exactly 1 expiration notification.

#### Pending Stakeholder Decision:
- None. Achieves 100% notification idempotency without modifying applied migrations 001–008.

---

### 16.5 Issue 5: Today's Analytics Consistency & Aggregation Ownership

#### Risk:
In `GET /api/admin/courses/:id/analytics`, if today's live activity and historical summaries are combined carelessly:
1. If the nightly aggregation job runs while today is still in progress, it could prematurely finalize today's incomplete numbers into `course_analytics_daily`.
2. If `GET /api/admin/courses/:id/analytics` queries `course_analytics_daily` for today AND queries `course_views` for today, today's views would be doubled.
3. The definition of who "owns" today's metrics must be mathematically unambiguous.

#### Final Proposed Rule:
1. **Strict Aggregation Ownership Separation:**
   - **Past Days ($< D_{\text{today}}$):** Owned exclusively by `course_analytics_daily`.
     The nightly aggregation job `runAnalyticsAggregateJob()` runs at 2:00 AM on day $T$ and processes ONLY days $\le T-1$. It is strictly forbidden from processing $D_{\text{today}}$.
   - **Current Day ($= D_{\text{today}}$):** Owned dynamically by live raw tables.
     Never finalized into a batch until the calendar day has completely concluded.
2. **Exact Data Sources for Today's Live Slice ($D_{\text{today}}$):**
   When `GET /api/admin/courses/:id/analytics` is requested:
   - **Views (`total_views`):** Sourced from `course_views` where `course_id = ? AND viewed_at >= day_start AND viewed_at <= day_end`.
   - **Unique Visitors (`unique_visitors`):** Sourced from `course_views` via `COUNT(DISTINCT session_id) WHERE course_id = ? AND viewed_at >= day_start AND viewed_at <= day_end`.
   - **Enquiry Clicks (`enquiry_count`):** Sourced from `course_analytics_daily.enquiry_count` for `analytics_date = D_today` (populated live by `POST /api/courses/:id/enquiry-click`).
   - **Demo Requests (`demo_request_count`):** Sourced from `demo_requests` via `COUNT(*) WHERE course_id = ? AND created_at >= day_start AND created_at <= day_end`.
   - **Enrollments (`enrollment_count`):** Sourced from `course_enrollments` via `COUNT(*) WHERE course_id = ? AND enrolled_at >= day_start AND enrolled_at <= day_end`.
3. **Zero Double-Counting Invariant:**
   - The query on `course_analytics_daily` explicitly filters:
     `WHERE course_id = ? AND analytics_date >= ? AND analytics_date < ?` (using today's date $D_{\text{today}}$ as the exclusive upper bound `<`).
   - The synthesized live object for $D_{\text{today}}$ is appended as the single, final element of the `daily` array.
   - Because $D_{\text{today}}$ is excluded from the `course_analytics_daily` query, no duplicate date records or double-counting can occur.

#### Data Source:
- Historical days: `course_analytics_daily`.
- Today's live views: `course_views`.
- Today's live enquiries: `course_analytics_daily` (`analytics_date = D_today`).
- Today's live demo leads: `demo_requests`.
- Today's live enrollments: `course_enrollments`.
- Overall totals block: `courses` table monotonic counters.

#### Transaction / Locking Behavior:
- Read-only queries using standard pool connections with read committed isolation.

#### Required Test Cases:
- `test_today_analytics_exact_ownership`: Seed historical row for yesterday (`total_views = 100`) and live views today (`total_views = 5`). Query analytics with range covering both days. Verify yesterday's views equal 100, today's views equal 5, and total is 105.
- `test_aggregation_job_excludes_current_day`: Run `runAnalyticsAggregateJob()` at 15:00. Verify it aggregates yesterday ($T-1$) and does not touch today ($T$).

---

### 16.6 Pending Stakeholder Authorizations Matrix

| # | Topic | Proposed Resolution | Approval Status |
|---|---|---|:---:|
| **1** | **Rolling 180-Day Unique Visitors** | `courses.unique_visitors` is defined as a monotonic counter deduplicated within the 180-day retention window, avoiding new table migrations. | **Pending User Approval** |
| **2** | **Daily Enquiry Tracking** | `POST /api/courses/:id/enquiry-click` atomically updates both `courses.enquiry_count` and `course_analytics_daily.enquiry_count` in one transaction. | **Approved / Integrated** |
| **3** | **Share Count Lifetime-Only** | `share_count` tracked on `courses.share_count` only; omitted from daily summaries due to lack of column in Migration 007. | **Approved / Integrated** |
| **4** | **MariaDB Advisory Locks** | Dedicated connection lifecycle with `withAdvisoryLock` using native `GET_LOCK` / `RELEASE_LOCK`. | **Approved / Integrated** |
| **5** | **Staggered Cron Timing** | `views_retention` scheduled at `30 4 * * 0` (4:30 AM Sunday) to prevent overlap with `rating_resync` (`0 4 * * *`). | **Approved / Integrated** |
| **6** | **Notification Idempotency** | Pre-insertion checks against payload keys (`demo_request_id`, `enrollment_id`) using MariaDB JSON operators. | **Approved / Integrated** |

---

## 17. Final Pre-Implementation Safety Audit

This section resolves the final pre-implementation safety questions regarding notification multi-recipient concurrency, retention-aggregation verification, and notification lifecycle/delivery policies under strict database immutability boundaries.

---

### 17.1 Item 1: Notification Idempotency, Multi-Recipient Independence & Concurrency Control

#### Identified Risk:
1. **Multi-Recipient Collisions:**
   A scheduled demo session involves two distinct recipients:
   - The Student (`demo_requests.user_id` or lead contact).
   - The Assigned Expert / Instructor (`demo_requests.expert_id`).
   If notification deduplication is keyed solely on `demo_request_id` without recipient identity, the first notification inserted (e.g. for the student) would cause the expert's reminder to be skipped as a duplicate!
2. **Race Conditions in SELECT-Before-INSERT:**
   If two cron job processes run concurrently (e.g., overlapping runs, manual test runner invocations, or multi-instance deployments), both processes could execute the SELECT check simultaneously, find 0 matching records, and both proceed to INSERT, producing duplicate notifications.
3. **Absence of Storage-Level Unique Constraints:**
   The `notifications` table in Migration 007 lacks a unique constraint or idempotency key column. MariaDB storage engine cannot natively reject duplicates at the SQL layer without schema modifications.

#### Final Proposed Rule:
1. **Composite Deduplication Key Including Recipient Identity:**
   Deduplication must be composite and recipient-specific:
   $$\text{Idempotency Key} = (\text{type}, \text{recipient\_target}, \text{business\_event\_id})$$
   - **For Demo Reminders (`demoReminder.job.js`):**
     - Student Reminder:
       - `type = 'demo_reminder'`
       - `user_id = demo_requests.user_id` (or `NULL` if guest lead)
       - `recipient = demo_requests.email` (or `user_${user_id}`)
       - `payload.demo_request_id = demo_requests.id`
     - Expert Reminder:
       - `type = 'demo_reminder'`
       - `user_id = expert_user_id`
       - `recipient = expert_email` (or `expert_${expert_id}`)
       - `payload.demo_request_id = demo_requests.id`
     - Both notifications are created and tracked independently. Neither recipient's reminder blocks the other.
   - **For Enrollment Expiry Notice (`enrollmentNotice.job.js`):**
     - `type = 'enrollment_expiring'`
     - `user_id = course_enrollments.user_id`
     - `recipient = user_email` (or `user_${user_id}`)
     - `payload.enrollment_id = course_enrollments.id`
     - Lookback window: Checked against the past 7 days to ensure only one 7-day warning is generated per enrollment cycle.

2. **Pre-Insertion Verification Query:**
   Prior to insertion, the job executes on the same connection:
   ```sql
   SELECT id FROM notifications 
   WHERE type = ? 
     AND (
       (user_id IS NOT NULL AND user_id = ?) 
       OR recipient = ?
     )
     AND JSON_UNQUOTE(JSON_EXTRACT(payload, ?)) = ?
     AND status IN ('queued', 'sent')
     AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
   LIMIT 1;
   ```
   If a record is returned, creation is safely skipped.

3. **Concurrency Elimination via MariaDB Advisory Locks:**
   All notification cron jobs are wrapped inside `withAdvisoryLock`:
   - `demo_reminder`: Lock key `course_platform_cron_demo_reminder`
   - `enrollment_expiring_notice`: Lock key `course_platform_cron_enrollment_expiring_notice`
   The advisory lock guarantees that across all Node.js processes, exactly **one** worker executes the job at any moment. Because execution is strictly serialized globally, concurrent SELECT-before-INSERT race windows are completely eliminated across server instances.

#### Existing Schema Compatibility:
- **Current Support:** The existing `notifications` schema (`user_id`, `type`, `channel`, `recipient`, `payload`, `status`, `created_at`) fully supports this composite check using MariaDB's native JSON functions (`JSON_UNQUOTE(JSON_EXTRACT(payload, ...))`).
- **Minimum Schema Change for Storage-Level Enforcement (Requiring Stakeholder Approval):**
  If the stakeholder requires 100% database-enforced rejection (e.g. to guard against un-locked manual SQL scripts), the minimum schema change would be:
  ```sql
  ALTER TABLE notifications 
    ADD COLUMN idempotency_key VARCHAR(128) NULL,
    ADD UNIQUE KEY uq_notifications_idempotency (idempotency_key);
  ```
  *In accordance with safety boundaries (migrations 001–008 frozen), no migration will be created or executed unless explicitly authorized. The application-level composite check + advisory lock provides complete multi-instance safety without schema changes.*

#### Transaction and Concurrency Handling:
- The advisory lock is acquired on a dedicated connection before starting the job loop.
- Individual notification insertions are committed per batch or transaction using `withTransaction`.
- If a lock cannot be acquired (`acquired === 0`), the run terminates immediately with `{ skipped: true, reason: 'locked' }`.

#### Failure Recovery:
- **Cron Restart / Retry / Server Reboot:** If the server restarts during execution or a job retries, the pre-insertion check matches existing records with `status IN ('queued', 'sent')` and avoids inserting duplicates.
- **Failed Notifications:** If a previously queued notification has `status = 'failed'`, the delivery dispatcher handles retry on that existing record; the cron job does not spawn duplicate rows.

#### Required Tests:
- `test_demo_reminder_independent_student_and_expert_notifications`: Seed a demo request with both a student and an assigned expert. Run `runDemoReminderJob()`. Verify exactly two notifications are created (one for student, one for expert).
- `test_demo_reminder_idempotency_repeated_runs`: Run `runDemoReminderJob()` 3 consecutive times. Assert the total count of notifications in the database remains exactly 2.
- `test_enrollment_notice_idempotency_consecutive_days`: Seed an enrollment expiring in 5 days. Run `runEnrollmentNoticeJob()` on Day 1 (assert 1 notification created). Run again on Day 2 (assert no second notification created within 7-day window).

#### Pending Stakeholder Decisions:
- Formal authorization to maintain application-level composite deduplication and advisory locks without adding an `idempotency_key` unique column to `notifications`.

---

### 17.2 Item 2: Analytics Aggregation Verification Before Retention Pruning

#### Identified Risk:
1. **Premature Pruning of Unaggregated Telemetry:**
   If `viewsRetention.job.js` executes and deletes `course_views` rows older than 180 days while the nightly aggregation job (`analyticsAggregate.job.js`) had failed or was offline for those dates, raw view telemetry would be permanently deleted before ever being summarized into `course_analytics_daily`, causing permanent data loss in daily reports.
2. **Duplicate Counting on Aggregation Retries:**
   If an aggregation job fails halfway through a day or is retried, an additive query (`total_views = total_views + ?`) would double-count views or enrollments.
3. **Unresolved Historical Aggregation Gaps:**
   If the server is shut down for multiple days (e.g., maintenance or outage), an aggregation job that only aggregates day $T-1$ would leave earlier unaggregated days ($T-2, T-3, ...$) permanently missing.

#### Final Proposed Rule:
1. **Mandatory Verification Gate in Retention Job:**
   `viewsRetention.job.js` is strictly forbidden from executing blind range deletions (`DELETE FROM course_views WHERE viewed_at < DATE_SUB(...)`).
   Instead, retention enforces a two-step verification gate:
   - **Step A: Identify Candidate Dates:**
     ```sql
     SELECT DISTINCT DATE(viewed_at) AS candidate_date 
     FROM course_views 
     WHERE viewed_at < DATE_SUB(NOW(), INTERVAL 180 DAY)
     ORDER BY candidate_date ASC;
     ```
   - **Step B: Verify Aggregation Ledger:**
     For each `candidate_date`:
     Check if `course_analytics_daily` contains records for that date:
     ```sql
     SELECT COUNT(*) AS aggregated_count 
     FROM course_analytics_daily 
     WHERE analytics_date = ?;
     ```
     - **If `aggregated_count > 0`:** The date has been aggregated into the permanent ledger. Retention executes a targeted date delete:
       `DELETE FROM course_views WHERE viewed_at >= ? AND viewed_at <= ?` (for candidate date boundaries).
     - **If `aggregated_count === 0`:** The date has **not** been aggregated. Retention **aborts deletion for that date**, logs a critical alert, and leaves raw telemetry rows intact.
2. **Automated Multi-Day Gap Backfill in Aggregation Job:**
   `analyticsAggregate.job.js` does not merely process day $T-1$.
   On each run, it scans for any unaggregated past dates:
   ```sql
   SELECT DISTINCT DATE(viewed_at) AS pending_date 
   FROM course_views 
   WHERE viewed_at < CURDATE() 
     AND DATE(viewed_at) NOT IN (
       SELECT analytics_date FROM course_analytics_daily GROUP BY analytics_date
     )
   ORDER BY pending_date ASC;
   ```
   The job iterates through all pending dates in ascending order, aggregating each date sequentially before finishing.
3. **Strictly Idempotent Aggregation Upsert:**
   Aggregation queries compute absolute totals from raw tables and write to `course_analytics_daily` using replacement (`= VALUES(...)`), not accumulation (`+ VALUES(...)`):
   ```sql
   INSERT INTO course_analytics_daily 
     (course_id, analytics_date, total_views, unique_visitors, demo_request_count, enrollment_count, enquiry_count, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), NOW())
   ON DUPLICATE KEY UPDATE
     total_views = VALUES(total_views),
     unique_visitors = VALUES(unique_visitors),
     demo_request_count = VALUES(demo_request_count),
     enrollment_count = VALUES(enrollment_count),
     updated_at = NOW();
   ```
   *(Note: `enquiry_count` is preserved as-is because it is updated live in real time).*
   Retrying aggregation 1 time or 100 times produces identical, deterministic results.

#### Existing Schema Compatibility:
- `course_analytics_daily` already has `UNIQUE KEY uq_analytics_course_date (course_id, analytics_date)` and `INDEX idx_analytics_date (analytics_date)`.
- `course_views` already has `INDEX idx_course_views_course_date (course_id, viewed_at)`.
- 100% compatible with existing database schema without modifications.

#### Transaction and Concurrency Handling:
- `analyticsAggregate.job.js` is protected by advisory lock `course_platform_cron_analytics_aggregate`.
- `viewsRetention.job.js` is protected by advisory lock `course_platform_cron_views_retention`.
- Staggered timing: Aggregation runs at 2:00 AM daily; Retention runs at 4:30 AM Sunday. Even if schedules were modified, the verification gate guarantees retention will never delete unaggregated data.

#### Failure Recovery:
- If aggregation fails, raw data in `course_views` is never deleted.
- The next execution of `analyticsAggregate.job.js` detects the unaggregated gap via the backfill query and automatically aggregates the missing date.
- Retention is safely deferred until aggregation succeeds.

#### Required Tests:
- `test_retention_skips_deletion_if_unaggregated`: Seed views for Day $T-190$ with zero rows in `course_analytics_daily`. Run `runViewsRetentionJob()`. Assert `course_views` rows for $T-190$ are still present.
- `test_retention_deletes_only_verified_aggregated_dates`: Seed views for Day $T-190$ with valid rows in `course_analytics_daily`. Run `runViewsRetentionJob()`. Assert `course_views` rows for $T-190$ are successfully deleted.
- `test_aggregation_backfill_multiple_missed_dates`: Seed raw views across 3 consecutive unaggregated days ($T-3, T-2, T-1$). Run `runAnalyticsAggregateJob()`. Assert `course_analytics_daily` contains rows for all 3 dates.
- `test_aggregation_idempotency_retry`: Run `runAnalyticsAggregateJob()` twice on the same dataset. Assert metrics in `course_analytics_daily` do not increase or double.

#### Pending Stakeholder Decisions:
- None.

---

### 17.3 Item 3: Notification Retry, Delivery Policy & Lifecycle Boundaries

#### Identified Risk:
1. **Conflating Notification Creation with Delivery:**
   Conflating the creation of a notification record with its physical delivery over external channels (SMTP, Twilio, WhatsApp).
2. **Duplicate Notification Records Spawned on Delivery Failures:**
   If a network delivery attempt fails, an unmanaged retry mechanism might re-invoke the creation workflow, inserting duplicate rows into `notifications`.
3. **Loss of In-Flight State on Server Restarts:**
   Unpersisted notifications in memory or in-flight delivery states being dropped or re-queued improperly upon process reboot.
4. **Assumption of Non-Existent External Providers:**
   Assuming third-party delivery gateways exist in the environment when no external SMS/email services are configured.

#### Final Proposed Rule:
1. **Strict Decoupling of Notification Creation from Delivery:**
   - **Notification Creation (Step 12 Scope):**
     Background cron jobs (`demoReminder.job.js`, `enrollmentNotice.job.js`) and domain services are strictly **Creation Producers**. They detect business events and insert records into `notifications` with:
     - `status = 'queued'`
     - `sent_at = NULL`
   - **Notification Delivery (Modular / Independent):**
     Delivery is handled asynchronously by a separate notification delivery dispatcher or worker.
   - **No External Delivery Provider Dependency:**
     The backend makes zero assumptions about external SMS/SMTP providers.
     - For channel `'inapp'`, the notification is immediately queryable and active in `queued` or `sent` status.
     - For `'email'` or `'whatsapp'`, if no external provider is configured, notifications remain safely recorded as `'queued'` or can be stubbed/logged in development/test environments.
2. **Explicit Notification Lifecycle States:**
   - `queued`: Record created and persisted in MariaDB; pending delivery attempt.
   - `sent`: Successfully delivered by provider (or made available for in-app). Sets `sent_at = NOW()`.
   - `failed`: Delivery attempt failed (e.g. invalid contact, provider error). Error message stored in `payload.last_error`.
3. **Delivery Retry Policy (Zero Duplicate Insertions):**
   - Retries operate exclusively by updating the **existing row**:
     - Increment `payload.delivery_attempts = delivery_attempts + 1`.
     - Update `updated_at = NOW()`.
   - If `delivery_attempts >= 3`: Transition `status = 'failed'` and record error details in `payload.last_error`.
   - A delivery retry is **strictly forbidden from inserting a new row** into `notifications`.
4. **Server Restart Resilience:**
   - Because notifications are persisted immediately in MariaDB, records with `status = 'queued'` survive process restarts intact.
   - On server reboot, cron jobs resume their standard intervals. The pre-insertion composite check prevents already-queued or sent notifications from being re-inserted.

#### Existing Schema Compatibility:
- Supported 100% by the existing `notifications` schema:
  - `status ENUM('queued', 'sent', 'failed') DEFAULT 'queued'`
  - `sent_at DATETIME NULL`
  - `payload JSON NULL` (retains `delivery_attempts`, `last_error`, `business_event_id`).
- No database migrations required.

#### Transaction and Concurrency Handling:
- Delivery dispatchers use atomic state transitions:
  ```sql
  UPDATE notifications 
  SET status = 'sent', sent_at = NOW() 
  WHERE id = ? AND status = 'queued';
  ```
  Ensures that if multiple workers attempt delivery, exactly one succeeds.

#### Failure Recovery:
- If delivery crashes mid-flight, uncommitted updates roll back, leaving the record in `queued` status to be retried safely.

#### Required Tests:
- `test_notification_creation_persists_queued_state`: Verify `runDemoReminderJob()` writes row with `status = 'queued'` and `sent_at = NULL`.
- `test_notification_delivery_failure_updates_existing_record`: Simulate transport failure; verify status transitions to `failed` on the existing row without inserting new rows.
- `test_notification_survives_server_restart`: Insert queued notification, trigger cron job; assert existing queued notification is recognized and no duplicate row is created.

#### Pending Stakeholder Decisions:
- None.

---

### 17.4 Summary Matrix of Pre-Implementation Authorizations

| # | Topic | Proposed Safety Rule | Schema Impact | Approval Status |
|---|---|---|:---:|:---:|
| **1** | **Multi-Recipient Idempotency** | Composite key `(type, recipient, business_event_id)` ensures student & expert receive independent reminders without collision. | Existing Schema (JSON extraction) | **Pending User Approval** |
| **2** | **DB-Level Unique Key Proposal** | Optional `ALTER TABLE notifications ADD COLUMN idempotency_key VARCHAR(128) UNIQUE` for strict DB-level enforcement. | Migration Required (Deferred) | **Optional / Deferred** |
| **3** | **Retention Aggregation Gate** | `viewsRetention` verifies `course_analytics_daily` before pruning; unaggregated dates are never deleted. | Existing Schema | **Approved / Integrated** |
| **4** | **Automated Multi-Day Backfill** | `analyticsAggregate` scans and backfills all missing historical dates sequentially before retention can prune. | Existing Schema | **Approved / Integrated** |
| **5** | **Idempotent Aggregation Upsert** | Upsert uses `= VALUES(...)` (replacement), preventing duplicate counter inflation on retries. | Existing Schema | **Approved / Integrated** |
| **6** | **Decoupled Delivery Lifecycle** | Cron jobs only create `status = 'queued'`; retries update existing rows; no external provider assumed. | Existing Schema | **Approved / Integrated** |

---

## 18. Final Approval Readiness Review

This section resolves the final three pre-implementation review questions prior to execution approval: complete multi-course analytics aggregation verification, notification locking and recipient identity scoping, and explicit notification delivery boundaries.

---

### 18.1 Item 1: Complete Analytics Aggregation Verification

#### Identified Risk:
The previous retention gate checked `SELECT COUNT(*) FROM course_analytics_daily WHERE analytics_date = candidate_date`.
This check was flawed because on any given calendar date $D$, multiple courses may have received views. If aggregation partially failed or crashed after aggregating only one course (e.g. Course A succeeded, but Course B and Course C failed), `COUNT(*)` returns `1` ($> 0$).
Deleting raw `course_views` for date $D$ based merely on the presence of one row would permanently destroy unaggregated raw views for Course B and Course C, resulting in permanent, unrecoverable data loss in daily reports.

#### Final Technical Decision:
1. **Mathematical Completeness Anti-Join Verification:**
   Raw `course_views` records for a calendar date $D$ are **never** deleted merely because one or more daily aggregate rows exist.
   Before any deletion is permitted for date $D$, retention executes a SQL anti-join check across all courses active on that date:
   ```sql
   SELECT cv.course_id 
   FROM course_views cv
   LEFT JOIN course_analytics_daily cad 
     ON cad.course_id = cv.course_id 
    AND cad.analytics_date = DATE(cv.viewed_at)
   WHERE DATE(cv.viewed_at) = ?
     AND cad.id IS NULL
   LIMIT 1;
   ```
   - **Completeness Invariant:** Date $D$ is verified as **complete** if and only if the query returns **0 rows** (meaning every single `course_id` that received views on date $D$ has a corresponding row in `course_analytics_daily`).
   - If the query returns $\ge 1$ row: The date has **partial or missing aggregation**. Deletion is strictly aborted for date $D$.

2. **Conservative Retention Policy (All-or-Nothing Date Pruning):**
   - If 100% of courses active on date $D$ are verified in `course_analytics_daily`:
     Execute targeted date pruning:
     `DELETE FROM course_views WHERE viewed_at >= ? AND viewed_at <= ?` (for date $D$ 00:00:00 to 23:59:59).
   - If even one course is missing:
     **Zero records are deleted for that date**. Raw data is preserved indefinitely.
     Retention logs a structured warning:
     `logger.warn({ date: candidateDate, missingCourseId: row.course_id }, 'Retention skipped: unaggregated course detected for date')`.

3. **Safe Automated Backfill for Partial Failures:**
   When `analyticsAggregate.job.js` runs, its gap detection query uses the exact same anti-join logic to find any dates with unaggregated courses:
   ```sql
   SELECT DISTINCT DATE(cv.viewed_at) AS pending_date
   FROM course_views cv
   LEFT JOIN course_analytics_daily cad 
     ON cad.course_id = cv.course_id 
    AND cad.analytics_date = DATE(cv.viewed_at)
   WHERE cv.viewed_at < CURDATE()
     AND cad.id IS NULL
   ORDER BY pending_date ASC;
   ```
   The job iterates through all pending dates and runs the idempotent replacement upsert (`= VALUES(...)`) course-by-course, cleanly backfilling the missing courses without inflating existing rows.

#### Existing Schema Compatibility:
- Supported 100% by the existing database schema:
  - `course_views`: Indexed on `(course_id, viewed_at)` via `idx_course_views_course_date`.
  - `course_analytics_daily`: Indexed on `(course_id, analytics_date)` via `uq_analytics_course_date`.
- No new tables, columns, or migrations required.

#### Remaining Limitations:
- The existing schema lacks a dedicated `analytics_batch_runs` metadata table (e.g. `batch_id, date, status, course_count, completed_at`).
- Aggregation completeness is therefore derived dynamically from the anti-join query between raw events and daily summaries. While index-supported and mathematically robust, dynamic derivation requires an indexed query rather than a single batch-status flag.

#### Required Implementation Tests:
- `test_retention_aborts_if_even_one_course_unaggregated`: Seed views for Course 1 and Course 2 on Day $T-190$. Seed `course_analytics_daily` for Course 1 only. Run `runViewsRetentionJob()`. Assert zero rows are deleted from `course_views`.
- `test_retention_deletes_when_all_active_courses_aggregated`: Seed views for Course 1 and Course 2 on Day $T-190$. Seed `course_analytics_daily` for both Course 1 and Course 2. Run `runViewsRetentionJob()`. Assert views for both courses are deleted.
- `test_aggregation_backfill_identifies_partially_aggregated_dates`: Create a partially aggregated date; verify `runAnalyticsAggregateJob()` detects the date, aggregates the missing course, and marks it complete.

#### Pending Stakeholder Decisions:
- Formal authorization of the conservative anti-join all-or-nothing retention policy without adding an `analytics_batch_runs` schema table.

---

### 18.2 Item 2: Notification Locking and Recipient Identity

#### Identified Risk:
1. **Ambiguous Recipient Identity:** If recipient identity relies on volatile emails instead of stable database IDs, users changing email addresses or formatting differences could bypass deduplication.
2. **Lock Scoping Gaps:** If the deduplication SELECT and the notification INSERT do not execute within the exact same lock scope, concurrent threads could race.
3. **Manual vs Scheduled Divergence:** If manual triggers or testing scripts bypass the advisory lock, idempotency guarantees could break.
4. **False Sense of Security:** Conflating application-level mutual exclusion with database-enforced storage uniqueness.

#### Final Technical Decision:
1. **Recipient Identity Resolution Rules:**
   - **Registered Users (Students & Experts):**
     - Sourced directly from `users.id`.
     - Stored in `notifications.user_id` (`BIGINT UNSIGNED`).
     - `recipient` column stores canonical identifier: `user_${user_id}` or user's email.
     - **Email-based identity is avoidable and strictly secondary** for all registered users and assigned experts.
   - **Guest Demo Leads (Unregistered):**
     - `notifications.user_id = NULL`.
     - `recipient` column stores normalized lowercase email (`demo_requests.email`).
     - In this scenario, email-based identity is **unavoidable** because the guest visitor has no database account.
   - **Deduplication Check Implementation:**
     ```sql
     SELECT id FROM notifications 
     WHERE type = ? 
       AND (
         (user_id IS NOT NULL AND user_id = ?)
         OR (user_id IS NULL AND recipient = ?)
       )
       AND JSON_UNQUOTE(JSON_EXTRACT(payload, ?)) = ?
       AND status IN ('queued', 'sent')
     LIMIT 1;
     ```

2. **Lock Scope and Producer Alignment:**
   - **Job-Specific Advisory Lock Keys:**
     - Demo Reminder: `course_platform_cron_demo_reminder`
     - Enrollment Expiry Notice: `course_platform_cron_enrollment_expiring_notice`
   - **Strict Same-Lock Scope:**
     The advisory lock is acquired **before** the job begins fetching candidate records, and is held continuously across all SELECT checks and INSERT statements.
     Both the deduplication SELECT and the record INSERT execute on the **same locked connection**.
   - **Uniform Manual Execution:**
     All manual triggers, admin test endpoints, or CLI scripts invoke the same exported runner functions (`runDemoReminderJob()`, `runEnrollmentNoticeJob()`). These runners unconditionally route through `withAdvisoryLock`. Manual invocations follow the exact same mutual exclusion rules as automated cron runs.

3. **Guarantees vs Remaining Limitations:**
   - **Guarantees Provided (Application Level + Advisory Lock):**
     - 100% protection against concurrent multi-instance cron runs.
     - 100% protection against race conditions between automated and manual job executions.
     - 100% idempotency across retries, restarts, and repeated cron triggers.
   - **Remaining Limitations (Storage Level):**
     - Because `notifications` has no unique constraint, MariaDB storage engine will accept duplicate rows if a developer runs an ad-hoc SQL query directly via command-line MySQL client, or if an un-locked repository function is written in the future.
     - True database-enforced uniqueness requires `ALTER TABLE notifications ADD COLUMN idempotency_key VARCHAR(128) UNIQUE`. This remains a deferred proposal requiring explicit migration approval.

#### Existing Schema Compatibility:
- Supported 100% by the existing `notifications` schema:
  - `user_id BIGINT UNSIGNED NULL`
  - `recipient VARCHAR(191) NOT NULL`
  - `payload JSON NULL`
  - `status ENUM('queued', 'sent', 'failed')`
- Zero schema changes required.

#### Required Implementation Tests:
- `test_notification_lock_holds_across_select_and_insert`: Verify lock remains active throughout candidate querying and record insertion.
- `test_manual_execution_obeys_advisory_lock`: While a job is executing with lock held on connection A, invoke manual runner function on connection B; assert it safely skips with `{ skipped: true }`.
- `test_guest_lead_email_deduplication`: Verify unauthenticated guest demo reminders are deduplicated by email address.

#### Pending Stakeholder Decisions:
- Formal authorization to enforce idempotency via application advisory locks without adding a database unique index to `notifications`.

---

### 18.3 Item 3: Notification Delivery Scope & Explicitly Deferred Features

#### Identified Risk:
Scope creep from inventing non-existent notification delivery infrastructure (SMTP mailers, SendGrid API, Twilio SMS, WhatsApp Business API, push notification services, delivery retry daemon).

#### Final Technical Decision:
1. **Authoritative Specification Conformance:**
   Section 19.2 and Section 19.4 of `Course_Platform_Backend_Plan.txt` explicitly define the cron jobs' scope:
   - Line 2338: *"7 din me expire hone walon ki notification **queue karo**"*
   - Line 2341: *"scheduled_at se 60 minute pehle reminder **queue karo**"*
   The specification explicitly mandates **queueing** notifications into the database table, not physical delivery.
2. **Notification Records Created in Step 12:**
   Cron jobs in Step 12 create exclusively two notification types:
   - **`demo_reminder`:**
     - Channel: `'inapp'`
     - Status: `'queued'`
     - Payload: `{ "demo_request_id": id, "course_id": course_id, "scheduled_at": ISO8601 }`
   - **`enrollment_expiring`:**
     - Channel: `'inapp'`
     - Status: `'queued'`
     - Payload: `{ "enrollment_id": id, "course_id": course_id, "access_expires_at": ISO8601 }`
3. **Delivery Workers & Gateways are Strictly Deferred:**
   - **No SMTP / Email Transport:** Zero Nodemailer or email provider code will be written in Step 12.
   - **No SMS / WhatsApp Gateways:** Zero external communication dependencies will be added.
   - **No Delivery Dispatcher / Poller:** No background worker polling `status = 'queued'` will be implemented in Step 12.
   - **No Delivery Retries:** Delivery retries are tied to delivery transport, which is out of scope. Step 12 handles only **creation retry** (ensuring failed job runs do not create duplicate queued rows).
4. **Immediate In-App Utility:**
   Records created with `status = 'queued'` and `channel = 'inapp'` are immediately queryable by frontend in-app notification endpoints in subsequent milestones.

#### Existing Schema Compatibility:
- Supported 100% by `notifications` table (`status = 'queued'`).

#### Required Implementation Tests:
- `test_demo_reminder_creates_queued_records_only`: Verify `demoReminder.job.js` creates records with `status = 'queued'` and does not make external network requests.
- `test_enrollment_notice_creates_queued_records_only`: Verify `enrollmentNotice.job.js` creates records with `status = 'queued'`.

#### Pending Stakeholder Decisions:
- None. Fully aligns with the authoritative specification.

---

### 18.4 Final Scope & Explicitly Deferred Items Matrix

| Category | Component / Feature | Step 12 Implementation Status | Justification / Authority |
|---|---|:---:|---|
| **Public Track Endpoints** | `POST /api/courses/:id/views` | **In Scope** | Section 16.1 & 19.4 Step 12 |
| **Public Track Endpoints** | `POST /api/courses/:id/share` | **In Scope** | Section 16.1 & 19.4 Step 12 |
| **Public Track Endpoints** | `POST /api/courses/:id/enquiry-click` | **In Scope** | Section 16.1 & 19.4 Step 12 |
| **Admin Analytics Endpoints** | `GET /api/admin/courses/:id/analytics` | **In Scope** | Section 16.2 & 19.4 Step 12 |
| **Admin Analytics Endpoints** | `GET /api/admin/analytics/courses` | **In Scope** | Section 16.2 & 19.4 Step 12 |
| **Admin Analytics Endpoints** | `GET /api/admin/dashboard` | **In Scope** | Section 16.2 & 19.4 Step 12 |
| **Background Cron Jobs** | `offer_expiry` (`0 * * * *`) | **In Scope** | Section 19.2 Background jobs |
| **Background Cron Jobs** | `analytics_aggregate` (`0 2 * * *`) | **In Scope** | Section 19.2 Background jobs |
| **Background Cron Jobs** | `enrollment_expiry` (`0 1 * * *`) | **In Scope** | Section 19.2 Background jobs |
| **Background Cron Jobs** | `enrollment_expiring_notice` (`0 8 * * *`) | **In Scope** | Section 19.2 Background jobs |
| **Background Cron Jobs** | `demo_reminder` (`*/10 * * * *`) | **In Scope** | Section 19.2 Background jobs |
| **Background Cron Jobs** | `token_cleanup` (`0 3 * * *`) | **In Scope** | Section 19.2 Background jobs |
| **Background Cron Jobs** | `views_retention` (`30 4 * * 0`) | **In Scope** | Section 19.2 Background jobs |
| **Background Cron Jobs** | `rating_resync` (`0 4 * * *`) | **In Scope** | Section 19.2 Background jobs |
| **Locking Infrastructure** | MariaDB Advisory Locks (`withAdvisoryLock`) | **In Scope** | Multi-instance concurrency safety |
| **Retention Safety** | Anti-Join Completeness Verification Gate | **In Scope** | Prevents unaggregated data loss |
| **Notification Transport** | SMTP / Nodemailer Email Delivery | **Explicitly Deferred** | Out of scope; spec requires queueing only |
| **Notification Transport** | SMS / WhatsApp Gateways | **Explicitly Deferred** | Out of scope; spec requires queueing only |
| **Notification Transport** | Delivery Dispatcher Worker & Retries | **Explicitly Deferred** | Future notification infrastructure milestone |
| **Database Migrations** | `idempotency_key` unique column on `notifications` | **Explicitly Deferred** | Safety rule: migrations 001–008 are frozen |
| **Database Migrations** | `analytics_batch_runs` table | **Explicitly Deferred** | Safety rule: migrations 001–008 are frozen |
| **Next Phase** | Step 13 (Payments, Orders, Checkout) | **Explicitly Deferred** | Strictly forbidden in Step 12 |

---

| **6** | **Zero Migrations Policy** | Migrations 001–008 remain 100% frozen; zero new migrations or schema changes. | **Approved / Integrated** |

---

## 19. Final Analytics Integrity & Retention Verification

This section establishes the definitive technical specification for analytics data integrity, multi-course aggregation verification, index-compatible sargable query performance, and the absolute retention safety invariant under immutable database schema constraints.

---

### 19.1 Existing but Incomplete Aggregate Rows & The Recompute-First Strategy

#### Identified Risk:
The previous verification gate tested only for row existence via an anti-join.
However, **row existence alone does not prove aggregation correctness**:
- A row could exist in `course_analytics_daily` for a course/date, but contain stale or partial counts (e.g. if the original aggregation was executed while late-arriving views were still buffering, or if a previous aggregation script failed midway through a batch).
- If `course_analytics_daily` already contains a row with `total_views = 20`, but `course_views` contains 35 raw view rows for that date, an existence check sees `cad.id IS NOT NULL` and considers the course complete.
- Deleting raw views based merely on row existence would permanently freeze the stale count of 20, permanently losing the 15 unaggregated views.

#### Final Technical Decision:
1. **The Recompute-First Pattern:**
   The retention job `viewsRetention.job.js` will never rely on pre-existing rows in `course_analytics_daily` without recomputation.
   Before deleting raw records for any candidate date $D$ older than 180 days, retention executes an active, comprehensive recomputation across every course active on that date:
   - For every `course_id` present in `course_views` between `day_start` and `day_end`:
     - Recompute `real_views = COUNT(*)` from `course_views`
     - Recompute `real_unique = COUNT(DISTINCT session_id)` from `course_views`
     - Recompute `real_demos = COUNT(*)` from `demo_requests`
     - Recompute `real_enrollments = COUNT(*)` from `course_enrollments`

2. **Idempotent Replacement Upsert (Repairing Stale & Missing Rows):**
   The recomputed numbers are applied using an idempotent replacement upsert:
   ```sql
   INSERT INTO course_analytics_daily 
     (course_id, analytics_date, total_views, unique_visitors, demo_request_count, enrollment_count, enquiry_count, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), NOW())
   ON DUPLICATE KEY UPDATE
     total_views = VALUES(total_views),
     unique_visitors = VALUES(unique_visitors),
     demo_request_count = VALUES(demo_request_count),
     enrollment_count = VALUES(enrollment_count),
     updated_at = NOW();
   ```
   *(Note: `enquiry_count` is preserved as-is because it is updated atomically in real time).*
   - **If the row was missing:** It is inserted cleanly.
   - **If the row existed with stale or partial numbers:** Its counters are repaired and overwritten with the true, exact counts.

3. **Pre-Retention Count-Matching Verification Gate:**
   Pruning is authorized **only if** a post-upsert verification query confirms that every course's aggregated `total_views` exactly matches the raw count:
   ```sql
   SELECT 
     cv.course_id,
     COUNT(cv.id) AS raw_views,
     cad.total_views AS agg_views
   FROM course_views cv
   LEFT JOIN course_analytics_daily cad 
     ON cad.course_id = cv.course_id 
    AND cad.analytics_date = ?
   WHERE cv.viewed_at >= ? AND cv.viewed_at <= ?
   GROUP BY cv.course_id, cad.total_views
   HAVING cad.total_views IS NULL OR cad.total_views <> raw_views;
   ```
   - **Rule:** If this query returns **any row**, there is a count mismatch or missing record. Deletion is **strictly aborted** for date $D$.
   - **Authorization:** Pruning is permitted if and only if the mismatch query returns **0 rows**.

---

### 19.2 Timezone Consistency & Canonical Asia/Kolkata Boundaries

#### Schema Inspection:
- `course_views.viewed_at` is defined as `DATETIME NOT NULL` in Migration 007.
- In MariaDB/MySQL, a `DATETIME` column stores raw `YYYY-MM-DD HH:MM:SS` strings without internal UTC conversion or offset metadata.
- Database connection pool configuration in `src/config/db.js` explicitly defines:
  `timezone: '+05:30'` (Asia/Kolkata).
  Consequently, `mysql2` formats JavaScript `Date` objects using `+05:30` when storing, and interprets retrieved `DATETIME` strings using `+05:30`.

#### Final Technical Decision:
1. **Canonical Kolkata Boundary Definition:**
   All aggregation, verification, and retention queries must use a single, uniform calendar-date boundary generated in `Asia/Kolkata` time:
   ```javascript
   function getKolkataDateBoundaries(dateStr) {
     // dateStr format: 'YYYY-MM-DD'
     return {
       dayStart: `${dateStr} 00:00:00`,
       dayEnd: `${dateStr} 23:59:59`
     };
   }
   ```
2. **Elimination of Database Engine `DATE()` Functions:**
   Applying `DATE(viewed_at)` inside SQL queries creates two critical risks:
   - It relies on the MariaDB server's internal session timezone setting (`@@session.time_zone`), which could drift if misconfigured.
   - It breaks index sargability (evaluating the function per row).
3. **Strict Parameterized Date-Range Usage:**
   All queries across aggregation, verification, and retention must unconditionally pass explicit boundary parameters:
   `WHERE viewed_at >= ? AND viewed_at <= ?` with `[dayStart, dayEnd]`.
   This ensures identical timestamp interpretation across the entire backend.

---

### 19.3 Index Usage and Query Performance (Sargable Optimization)

#### Schema Index Review:
Inspection of `course_views` in `migrations/007_analytics_audit_notifications.sql` reveals two composite indexes:
1. `INDEX idx_course_views_course_date (course_id, viewed_at)`
2. `INDEX idx_course_views_session (course_id, session_id, viewed_at)`

Notice:
- There is **no single-column index on `viewed_at`**.
- Both indexes have `course_id` as their leading column.

#### Performance Analysis:
1. **Non-Sargable Pitfall:**
   Writing `WHERE DATE(viewed_at) = '2026-04-01'` forces a full table scan because MariaDB cannot evaluate B-tree index bounds on expressions wrapped in functions.
2. **Sargable Optimization Without Schema Alterations:**
   - **Course-Scoped Aggregation:**
     When aggregating views per course:
     ```sql
     SELECT COUNT(*) AS total_views, COUNT(DISTINCT session_id) AS unique_visitors
     FROM course_views
     WHERE course_id = ? 
       AND viewed_at >= ? 
       AND viewed_at <= ?;
     ```
     This query fully utilizes `idx_course_views_course_date` with `range` access on both `course_id` and `viewed_at`. It executes in sub-millisecond time.
   - **Candidate Date Discovery for Retention:**
     To find dates older than 180 days with raw views, retention scans using an indexed range condition:
     ```sql
     SELECT DISTINCT viewed_at 
     FROM course_views 
     WHERE viewed_at < ? 
     LIMIT 500;
     ```
     From the retrieved timestamps, application logic derives the distinct `YYYY-MM-DD` candidate dates in memory using `Asia/Kolkata` time.
   - **Targeted Pruning by Course/Date Range:**
     Pruning deletes raw views per course or per indexed range:
     ```sql
     DELETE FROM course_views 
     WHERE viewed_at >= ? AND viewed_at <= ?;
     ```
     By passing string literals `dayStart` and `dayEnd`, MariaDB leverages index range bounds, eliminating table-wide locking.

---

### 19.4 Retention Safety Invariant & Failure Sequences

#### The Absolute Retention Safety Invariant:
$$\text{Authorized to Delete}(D) \iff \forall c \in C_{\text{views}}(D): \left( \text{agg\_views}(c, D) = \text{raw\_views}(c, D) \land \text{agg\_views}(c, D) > 0 \right)$$
*Under no circumstances may any raw `course_views` records for a calendar date $D$ be deleted unless every course that received views on date $D$ has been recomputed, upserted, and mathematically verified to match the raw count in `course_analytics_daily`.*

#### Exact Execution Sequence:
```
  [Candidate Date D < Now - 180 Days]
                  │
                  ▼
   1. Active Recomputation Pass
      (Fetch raw views, unique visitors, demos, enrollments)
                  │
                  ▼
   2. Idempotent Replacement Upsert
      (Insert missing rows OR repair existing stale counters)
                  │
                  ▼
   3. Verification Query (HAVING cad.total_views <> raw_views)
                  │
       ┌──────────┴──────────┐
   [Mismatches > 0]     [Mismatches == 0]
       │                     │
       ▼                     ▼
   ABORT PRUNING        4. Targeted Pruning
   Log Critical Alert   (DELETE FROM course_views
   Retain Raw Data       WHERE viewed_at BETWEEN dayStart AND dayEnd)
```

#### Failure & Recovery Scenarios:
1. **Aggregation Fails Midway:**
   If a network drop, timeout, or MariaDB error interrupts the upsert after Course 1 of 5 is repaired:
   - The verification query runs and detects that Courses 2–5 have mismatches or missing summaries.
   - Deletion is **immediately aborted**. Zero raw view rows are deleted for date $D$.
2. **Transient Database Lock Timeout:**
   If MariaDB locks time out during the recompute pass:
   - Transaction rolls back. Verification fails. Retention deletes zero rows.
3. **Retry on Subsequent Scheduled Run:**
   On the next run of `viewsRetention.job.js` (or during daily `analyticsAggregate.job.js` backfill):
   - The job picks up date $D$ again.
   - Idempotent replacement upserts cleanly recompute all courses.
   - Once verification query returns 0 mismatches, pruning proceeds safely.

---

### 19.5 Required Implementation Test Cases

The following automated test cases must be implemented in `tests/analytics_cron.test.js` during Phase 3 to validate Section 19 rules:

1. `test_stale_aggregate_row_repaired_before_retention`:
   - Seed `course_analytics_daily` with `total_views = 10` for Course 1 on Day $T-190$.
   - Seed `course_views` with 25 rows for Course 1 on Day $T-190$.
   - Execute pre-retention aggregation and verification.
   - Assert `course_analytics_daily.total_views` is updated to 25.
   - Assert raw views are pruned only after `total_views === 25` is verified.
2. `test_missing_aggregate_row_backfilled_before_retention`:
   - Seed views for Course 2 on Day $T-190$ with zero rows in `course_analytics_daily`.
   - Run retention. Verify Course 2 row is created, verified, and only then pruned.
3. `test_aggregation_midway_failure_deletes_zero_views`:
   - Simulate an error during the upsert of Course 3 in a 4-course dataset.
   - Run retention.
   - Assert **zero** rows are deleted from `course_views` for that date.
4. `test_aggregation_retry_after_failure_completes_safely`:
   - Following the simulated failure, run the aggregation job again.
   - Assert all 4 courses are repaired, verification succeeds, and pruning cleans up raw views cleanly.
5. `test_views_near_midnight_kolkata_timezone`:
   - Insert view at `2026-04-01 23:59:45` and another view at `2026-04-02 00:00:15` (Kolkata time).
   - Run aggregation.
   - Verify view 1 is counted on `2026-04-01` and view 2 is counted on `2026-04-02`.
6. `test_repeated_aggregation_never_double_counts`:
   - Execute aggregation 3 consecutive times for the same date.
   - Assert `total_views`, `unique_visitors`, and `enrollment_count` remain identical and do not double.
7. `test_retention_strictly_requires_verification_pass`:
   - Force a verification mismatch by temporarily injecting a bad count; assert retention aborts and deletes zero rows.

---

| **6** | **Zero Migrations Policy** | Migrations 001–008 remain 100% frozen; zero new migrations or schema changes. | **Approved / Integrated** |

---

## 20. Final Retention Concurrency & Full-Metric Integrity Review

This section resolves the final concurrency, multi-metric verification, and boundary precision questions prior to implementation approval: coordinating view ingestion with retention pruning, verifying all six daily analytics metrics, eliminating fractional-second boundary gaps, and enforcing the absolute retention safety invariant under immutable database schema constraints.

---

### 20.1 Concurrent View-Ingestion Race & Concrete Coordination Strategy

#### Identified Risk:
A race condition exists if a new raw view record is inserted for a course/date *after* the pre-retention verification check passes, but *before* the retention job executes `DELETE FROM course_views`:
```
   Retention Worker                        Ingestion Worker
───────────────────────                 ───────────────────────
1. Recomputes metrics (e.g. 50 views)
2. Upserts summary (total_views = 50)
3. Verifies count (50 == 50 -> OK)
                                        4. Inserts new view (viewed_at = D)
5. Executes DELETE for date D
   (Deletes 51 views!)
```
In this sequence, the 51st view is permanently deleted without ever being counted in `course_analytics_daily`.

#### Concrete Coordination Strategy:
1. **Timeframe Separation in Standard Operation:**
   - Standard live view ingestion (`POST /api/courses/:id/views`) stamps views with `viewed_at = NOW()` (which is the current calendar day $D_{\text{today}}$).
   - The retention job `viewsRetention.job.js` operates strictly on dates $D \le \text{Now} - 180 \text{ days}$.
   - Because $D_{\text{today}}$ and $D$ are separated by 180 calendar days, standard live view ingestion never targets candidate dates undergoing retention pruning.
2. **Coordinated Advisory Locking for Historical Ingestion & Retention:**
   To guard against delayed event ingestion, offline queue flush, manual backfill scripts, or test runners writing to historical dates:
   Both view ingestion and retention adhere to a shared MariaDB advisory lock naming convention:
   $$\text{Lock Key} = \text{course\_platform\_views\_rw\_} \parallel \text{course\_id} \parallel \text{\_} \parallel \text{date\_str}$$
   - **Retention Scope:**
     When `viewsRetention.job.js` prunes date $D$ for course $C$, it acquires:
     `SELECT GET_LOCK(?, 5) AS acquired` with key `course_platform_views_rw_${courseId}_${dateStr}` on its dedicated connection.
     The recomputation pass, upsert repair, count verification, and `DELETE` execute **inside this exact lock scope**.
   - **Ingestion Scope:**
     If any ingestion or backfill worker inserts a raw view with a specified historical `viewed_at`, it must acquire `GET_LOCK('course_platform_views_rw_' || courseId || '_' || targetDateStr, 2)`.
   - **Dedicated Connection Lifecycle:**
     Locks are acquired on a dedicated connection obtained via `pool.getConnection()`. The lock is released via `SELECT RELEASE_LOCK(?)` in a `finally` block **before** `connection.release()`.
   - **Timeout and Failure Handling:**
     - Retention lock timeout: 5 seconds. If `acquired !== 1`, retention immediately aborts processing for that course/date, logs `{ courseId, dateStr, reason: 'lock_busy' }`, and deletes zero rows.
     - Ingestion lock timeout: 2 seconds. If lock contention occurs, ingestion safely retries or logs.
   - **MariaDB Fail-Safe:** If the process crashes or network drops, MariaDB automatically releases all advisory locks when the TCP socket terminates.

---

### 20.2 Full Daily Metric Integrity Across All Six Fields

The `course_analytics_daily` table defines six business metric columns. Total views count matching alone is insufficient to prove that the entire daily ledger record is complete. Every single metric must be governed by an authoritative source, date attribution rule, and recomputation policy:

| # | Metric Column | Authoritative Source Table | Date Attribution Rule (Asia/Kolkata) | Recomputation Method | Can Be Recomputed After Views Pruning? | Protection Against Live Overwrite |
|---|---|---|---|---|:---:|---|
| **1** | **`total_views`** | `course_views` | `viewed_at >= dayStart AND viewed_at < nextDayStart` | `COUNT(cv.id)` | **NO** (Raw views deleted after 180 days) | Computed from raw `course_views`; live views write only to `courses.total_views`. |
| **2** | **`unique_visitors`** | `course_views` | `viewed_at >= dayStart AND viewed_at < nextDayStart` | `COUNT(DISTINCT cv.session_id)` | **NO** (Session IDs deleted after 180 days) | Computed from raw `course_views`; no direct live writes to daily summary. |
| **3** | **`enquiry_count`** | Live API (`POST /api/courses/:id/enquiry-click`) | Click date in `Asia/Kolkata` (`analytics_date = currentKolkataDate`) | **No raw events table exists in schema**. Sourced live. | **N/A** (Does not depend on `course_views`) | **CRITICAL:** Recomputation upsert MUST use `enquiry_count = course_analytics_daily.enquiry_count` to preserve live accumulated clicks. |
| **4** | **`demo_request_count`** | `demo_requests` | `created_at >= dayStart AND created_at < nextDayStart` | `COUNT(dr.id)` | **YES** (`demo_requests` rows are permanent lead records) | Nightly aggregation recomputes from permanent `demo_requests` table. |
| **5** | **`wishlist_add_count`** | `wishlists` | `created_at >= dayStart AND created_at < nextDayStart` | `COUNT(w.id)` | **YES** (`wishlists` rows are permanent library entries) | Recomputed from permanent `wishlists` table. |
| **6** | **`enrollment_count`** | `course_enrollments` | `enrolled_at >= dayStart AND enrolled_at < nextDayStart` | `COUNT(ce.id)` | **YES** (`course_enrollments` rows are permanent academic records) | Recomputed from permanent `course_enrollments` table. |

#### Safe Recomputation Upsert SQL:
```sql
INSERT INTO course_analytics_daily 
  (course_id, analytics_date, total_views, unique_visitors, demo_request_count, wishlist_add_count, enrollment_count, enquiry_count, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW())
ON DUPLICATE KEY UPDATE
  total_views = VALUES(total_views),
  unique_visitors = VALUES(unique_visitors),
  demo_request_count = VALUES(demo_request_count),
  wishlist_add_count = VALUES(wishlist_add_count),
  enrollment_count = VALUES(enrollment_count),
  enquiry_count = course_analytics_daily.enquiry_count, -- PRESERVES LIVE ENQUIRIES
  updated_at = NOW();
```

---

### 20.3 Verification Completeness Across Every Metric

#### Multi-Metric Pre-Retention Verification Query:
Before deleting raw views for course $C$ on date $D$, retention runs a comprehensive multi-metric verification query:
```sql
SELECT 
  cad.course_id,
  cad.total_views,
  cad.unique_visitors,
  cad.demo_request_count,
  cad.wishlist_add_count,
  cad.enrollment_count,
  cad.enquiry_count,
  (SELECT COUNT(*) FROM course_views WHERE course_id = ? AND viewed_at >= ? AND viewed_at < ?) AS actual_views,
  (SELECT COUNT(DISTINCT session_id) FROM course_views WHERE course_id = ? AND viewed_at >= ? AND viewed_at < ?) AS actual_unique,
  (SELECT COUNT(*) FROM demo_requests WHERE course_id = ? AND created_at >= ? AND created_at < ?) AS actual_demos,
  (SELECT COUNT(*) FROM wishlists WHERE course_id = ? AND created_at >= ? AND created_at < ?) AS actual_wishlists,
  (SELECT COUNT(*) FROM course_enrollments WHERE course_id = ? AND enrolled_at >= ? AND enrolled_at < ?) AS actual_enrollments
FROM course_analytics_daily cad
WHERE cad.course_id = ? AND cad.analytics_date = ?;
```

#### Conservative Verification Gate Rules:
1. **Verification Test:**
   - `cad.total_views === actual_views`
   - `cad.unique_visitors === actual_unique`
   - `cad.demo_request_count === actual_demos`
   - `cad.wishlist_add_count === actual_wishlists`
   - `cad.enrollment_count === actual_enrollments`
   - `cad.enquiry_count >= 0` AND `cad.enquiry_count IS NOT NULL`
2. **Failure Behavior:**
   If **any** metric fails verification:
   - Deletion of raw `course_views` is **strictly aborted** for that course and date.
   - Zero rows are deleted.
   - A structured critical warning is emitted:
     `logger.error({ courseId, dateStr, expected: actual_views, actual: cad.total_views }, 'Multi-metric verification failed: retention aborted')`.
   - Raw telemetry is preserved indefinitely until a subsequent backfill re-syncs all metrics.

---

### 20.4 Date Boundary Precision & Half-Open Range Enforcement

#### Schema Column Inspection:
- `course_views.viewed_at` is defined as `DATETIME NOT NULL` in Migration 007.
- Standard MariaDB `DATETIME` stores `YYYY-MM-DD HH:MM:SS` (1-second precision).
- If an application passes millisecond/microsecond values, or if fractional-second precision is used in logging:
  An inclusive upper boundary `viewed_at <= '2026-04-01 23:59:59'` would **omit** any record timestamped between `23:59:59.001` and `23:59:59.999`.

#### Canonical Half-Open Range Rule:
All SQL predicates across ingestion, aggregation, verification, and retention must unconditionally use a **half-open interval**:
$$\text{Timestamp Range} = [T_{\text{start}}, T_{\text{next\_start}}) \implies \text{viewed\_at} \ge ? \quad \text{AND} \quad \text{viewed\_at} < ?$$

```javascript
function getKolkataHalfOpenRange(dateStr) {
  // dateStr format: 'YYYY-MM-DD'
  const [year, month, day] = dateStr.split('-').map(Number);
  
  // Calculate next day calendar date in Asia/Kolkata
  const current = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const next = new Date(current.getTime() + 86400000);
  const nextDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(next);

  return {
    dayStart: `${dateStr} 00:00:00`,
    nextDayStart: `${nextDateStr} 00:00:00`
  };
}
```
**Benefits of the Half-Open Interval:**
- Zero gaps: Covers every microsecond up to the next midnight.
- Zero overlap: Boundary $T_{\text{next\_start}}$ belongs strictly to the next calendar date.
- Sargable: Leverages B-tree index seeks on `(course_id, viewed_at)` without SQL functions.

---

### 20.5 Required Implementation Test Cases

The following test cases must be implemented in `tests/analytics_cron.test.js` to validate Section 20:

1. `test_view_arriving_between_recompute_and_deletion`:
   - Simulate an ingestion thread inserting a view for date $D$ during retention.
   - Verify advisory lock coordinates execution so that the view is either blocked until after retention or causes a verification mismatch that aborts deletion.
2. `test_ingestion_lock_contention_with_retention`:
   - Hold `course_platform_views_rw_${courseId}_${dateStr}` on Connection A.
   - Attempt retention pruning on Connection B; verify retention times out safely and aborts without deleting rows.
3. `test_lock_acquisition_failure_aborts_retention`:
   - Simulate advisory lock acquisition returning 0; verify retention skips with `{ skipped: true }` and deletes zero rows.
4. `test_every_daily_metric_recomputed_and_verified`:
   - Seed mismatched values across all 6 columns in `course_analytics_daily`.
   - Run recompute pass; assert all 6 metrics are updated to exact raw counts.
   - Assert verification passes for all 6 columns before pruning.
5. `test_live_enquiry_count_not_overwritten`:
   - Seed `course_analytics_daily` with `enquiry_count = 14`.
   - Run recomputation pass; assert `enquiry_count` remains 14.
6. `test_fractional_second_views_near_midnight_half_open_range`:
   - Insert view at `2026-04-01 23:59:59`.
   - Verify it is included in `[2026-04-01 00:00:00, 2026-04-02 00:00:00)` and not omitted.
7. `test_no_raw_views_deleted_if_any_metric_verification_fails`:
   - Mock a mismatch in `enrollment_count` while `total_views` matches.
   - Assert retention immediately aborts and deletes zero raw views.

---

### 20.6 Concurrency Design, Metric Table, and Invariant Statement

#### Exact Concurrency-Control Design:
1. **Advisory Lock Naming Convention:** `course_platform_views_rw_${courseId}_${dateStr}`
2. **Dedicated Connection:** Acquired via `pool.getConnection()`. Lock acquired via `SELECT GET_LOCK(?, 5)`.
3. **Atomic Pruning Block:** Recompute $\to$ Upsert $\to$ Multi-Metric Verify $\to$ `DELETE` execute within the dedicated locked connection.
4. **Lock Cleanup:** `SELECT RELEASE_LOCK(?)` in `finally` block before `connection.release()`.

#### The Definitive Retention Safety Invariant:
$$\text{Pruning Permitted}(c, D) \iff \left( \bigwedge_{m \in \text{Metrics}} \text{Verify}(m, c, D) = \text{PASS} \right) \land \text{AdvisoryLockAcquired}(c, D)$$
*Under no circumstances may any raw `course_views` records for course $c$ on date $D$ be deleted unless the course/date advisory lock is held, and every single one of the six daily metrics is mathematically verified against its authoritative table.*

#### Remaining Blockers or Assumptions:
- **None.** All 6 metrics are mapped to authoritative tables or live increment ledgers.
- The 180-day retention rule isolates standard live view ingestion from retention pruning in calendar time.
- Advisory locks serialize any concurrent historical writes.

#### Schema Compatibility:
- **100% Compatible with Existing Schema:**
  - `course_views` indexes `idx_course_views_course_date` and `idx_course_views_session`.
  - `course_analytics_daily` unique key `uq_analytics_course_date`.
  - `demo_requests`, `wishlists`, and `course_enrollments` tables.
  - MariaDB internal memory advisory locks.
- **Zero database migrations or schema alterations required.**

---

## 21. Final Metric Source Reliability & Lock Contract Review

This section establishes the definitive analysis of raw metric source reliability, hard deletion constraints in wishlists, atomic lock contracts, and the rigorous classification of all six daily analytics metrics under strict database immutability rules.

---

### 21.1 Enquiry Count: Source Reality & Sanitization Boundary

#### Authoritative Source Inspection:
- Inspection of migrations 001–008 confirms that **no raw enquiry events table exists** in `course_platform_db`.
- Enquiry clicks are tracked via `POST /api/courses/:id/enquiry-click` as an atomic increment directly to `courses.enquiry_count` and `course_analytics_daily.enquiry_count`.
- Consequently, historical daily enquiry clicks **cannot be independently recomputed or reconstructed from raw telemetry**.

#### Technical Rules:
1. **Sanity Check vs Mathematical Verification:**
   - The check `cad.enquiry_count >= 0 AND cad.enquiry_count IS NOT NULL` is an integrity sanity check to guard against corruption or `NULL` insertion. It is **not** an independent mathematical verification from raw events.
   - We do not claim that daily enquiry counts are independently verified from raw logs.
2. **Preservation During Recomputation:**
   - Any recomputation upsert (in nightly aggregation backfills or retention passes) must preserve the existing accumulated count:
     `ON DUPLICATE KEY UPDATE enquiry_count = course_analytics_daily.enquiry_count`.
   - If inserting a brand-new summary row for an unaggregated past date, `enquiry_count` defaults to `0`.
3. **Impact on Raw Views Retention Safety:**
   - Raw `course_views` contains **only page view telemetry** (`viewed_at`, `session_id`, `referrer`, `source`, `device_type`).
   - `course_views` does **not** store enquiry events.
   - Therefore, pruning raw `course_views` older than 180 days has **zero impact** on enquiry tracking. The absence of a raw enquiry log does not compromise raw view retention safety.

---

### 21.2 Wishlist Add Count: Physical Deletion & Reconstruction Limits

#### Schema & Repository Inspection:
- **Database Schema:** Inspection of [migrations/006_enrollments_progress_reviews.sql](file:///D:/Course_plateform/backend/migrations/006_enrollments_progress_reviews.sql#L44-L55) reveals that the `wishlists` table contains `id`, `user_id`, `course_id`, `created_at`, and `updated_at`. There is **no `deleted_at` column**.
- **Removal Implementation:** Inspection of [src/modules/wishlist/wishlist.repository.js](file:///D:/Course_plateform/backend/src/modules/wishlist/wishlist.repository.js#L99-L102) reveals:
  ```javascript
  await connection.query(
    `DELETE FROM wishlists WHERE user_id = ? AND course_id = ?`,
    [userId, courseId]
  );
  ```
  Removing a course from a wishlist executes a **physical hard deletion**.

#### Technical Rules & Consequences:
1. **Historical Data Loss via Hard Deletion:**
   - If 10 users add a course to their wishlist on Day $D$, and 3 users remove it 30 days later, those 3 rows are permanently deleted from `wishlists`.
   - A subsequent query `SELECT COUNT(*) FROM wishlists WHERE course_id = ? AND created_at >= dayStart AND created_at < nextDayStart` returns **7**, not the true historical addition count of 10.
   - Historical wishlist additions **cannot be accurately reconstructed from the `wishlists` table for historical dates**.
2. **Safe Existing-Schema Preservation Policy:**
   - Nightly aggregation at 2:00 AM on Day $T$ computes `wishlist_add_count = COUNT(*)` for Day $T-1$ as a fresh, best-effort snapshot before significant user removals occur.
   - Thereafter, on all subsequent recomputations, backfills, and retention passes, `wishlist_add_count` in `course_analytics_daily` must be **strictly preserved**:
     `ON DUPLICATE KEY UPDATE wishlist_add_count = course_analytics_daily.wishlist_add_count`.
   - Recomputations must **never overwrite existing historical `wishlist_add_count` values** with degraded counts derived from the mutated `wishlists` table.
3. **Impact on Views Retention Safety:**
   - Wishlist events are stored in `wishlists`, not `course_views`.
   - Pruning `course_views` has **zero impact** on wishlist records.

---

### 21.3 Shared Lock Contract: Ingestion & Retention Coordination

To provide complete mathematical race protection without database schema migrations, view ingestion and retention adhere to an identical shared advisory lock contract:

#### Exact Shared Lock Contract:
$$\text{Lock Key} = \text{course\_platform\_views\_rw\_} \parallel \text{course\_id} \parallel \text{\_} \parallel \text{date\_str}$$
- `course_id`: The target course ID.
- `date_str`: The target `Asia/Kolkata` calendar date (`YYYY-MM-DD`).

#### Acquisition, Scope & Release Lifecycle:
```
           View Ingestion Path                               Views Retention Path
      (POST /api/courses/:id/views)                        (viewsRetention.job.js)
─────────────────────────────────────────        ─────────────────────────────────────────
1. Get dedicated connection from pool:            1. Get dedicated connection from pool:
   conn = await pool.getConnection()                 conn = await pool.getConnection()

2. Acquire advisory lock (timeout = 2s):          2. Acquire advisory lock (timeout = 5s):
   SELECT GET_LOCK(lockKey, 2) AS acquired          SELECT GET_LOCK(lockKey, 5) AS acquired

3. If acquired !== 1:                             3. If acquired !== 1:
   Log lock contention;                              Log lock contention;
   Return 503 Service Unavailable;                   Abort pruning for this course/date;
   Release connection immediately;                   Zero rows deleted;
   HALT (Never bypass lock).                         Release connection; HALT.

4. Inside lock scope:                             4. Inside lock scope:
   START TRANSACTION;                                START TRANSACTION;
   - Check session novelty (1 view/session/day)      - Recompute metrics from raw tables
   - INSERT INTO course_views                        - Upsert summary (preserving B metrics)
   - UPDATE courses SET total_views = ...            - Multi-metric verification check
   COMMIT;                                           - If verified: DELETE FROM course_views
                                                     COMMIT;

5. Finally block (mandatory cleanup):             5. Finally block (mandatory cleanup):
   await conn.query('SELECT RELEASE_LOCK(?)')        await conn.query('SELECT RELEASE_LOCK(?)')
   conn.release();                                   conn.release();
```

#### Strict Contract Guarantees:
- **Single Dedicated Socket:** All lock acquisition, transactional queries, and lock release execute on the **exact same physical connection**.
- **Lock Held Through Commit:** The lock is held continuously across transaction start, record insertion/deletion, and `COMMIT`.
- **Zero Lock Bypassing:** No ingestion path may write to `course_views` without acquiring this lock.
- **Mutual Exclusion:** Ingestion and retention cannot operate on the same course and date simultaneously.

---

### 21.4 Comprehensive Metric Classification Matrix

Every metric in `course_analytics_daily` is classified into one of three structural categories:
- **Class A:** Independently recomputable and verifiable against permanent raw tables.
- **Class B:** Preservable in summary ledger, but not independently verifiable from raw events.
- **Class C:** Stored in raw tables subject to retention; non-reconstructable once raw data is deleted.

| # | Metric Column | Classification | Source Table | Retention Pruning Safety Analysis |
|---|---|:---:|---|---|
| **1** | **`total_views`** | **Class C** (Becomes unrecoverable after pruning) | `course_views` | **Primary Subject of Retention.** While raw `course_views` exist, it behaves as **Class A** and is mathematically verified against raw rows before deletion. After deletion, it becomes permanent in `course_analytics_daily`. |
| **2** | **`unique_visitors`** | **Class C** (Becomes unrecoverable after pruning) | `course_views` | **Primary Subject of Retention.** While raw `course_views` exist, it behaves as **Class A** and is verified (`COUNT(DISTINCT session_id)`) before deletion. After deletion, it becomes permanent in `course_analytics_daily`. |
| **3** | **`demo_request_count`** | **Class A** (Permanently recomputable) | `demo_requests` | `demo_requests` has no retention pruning; rows are permanent. 100% verifiable before views pruning. |
| **4** | **`enrollment_count`** | **Class A** (Permanently recomputable) | `course_enrollments` | `course_enrollments` rows are permanent academic records. 100% verifiable before views pruning. |
| **5** | **`enquiry_count`** | **Class B** (Preservable ledger only) | Live API clicks (No raw table) | Sourced live. Not stored in `course_views`. Retention query **strictly preserves** this column (`cad.enquiry = cad.enquiry`). Safe for views retention. |
| **6** | **`wishlist_add_count`** | **Class B** (Preservable ledger only) | `wishlists` (Mutated by hard delete) | Raw additions lost to user removals. Not stored in `course_views`. Retention query **strictly preserves** this column (`cad.wishlist = cad.wishlist`). Safe for views retention. |

#### Retention Safety Justification:
- Pruning `course_views` deletes **only raw view records**.
- It does **not** prune `demo_requests`, `wishlists`, `course_enrollments`, or `course_analytics_daily`.
- Therefore, only **Class C metrics (`total_views` and `unique_visitors`)** are endangered by retention.
- Because Class C metrics are **100% verified against raw `course_views` before deletion**, and Class B metrics are strictly preserved without overwrite, raw `course_views` retention is **mathematically safe**.

---

### 21.5 Final Decision & Schema Compatibility

#### Definitive Decision:
The existing database schema in migrations 001–008 **fully and safely supports the proposed retention design without any schema migrations**, subject to the following enforced contracts:
1. **Verification Boundary:** Pre-retention verification checks that Class C view counts (`total_views`, `unique_visitors`) match raw `course_views` exactly, Class A metrics (`demo_request_count`, `enrollment_count`) match their permanent tables, and Class B metrics (`enquiry_count`, `wishlist_add_count`) are non-negative.
2. **Preservation Invariant:** Recomputation upserts strictly preserve Class B metrics (`enquiry_count`, `wishlist_add_count`) using `cad.col = cad.col` rather than overwriting with zero or degraded values.
3. **Advisory Lock Contract:** Both ingestion and retention acquire `course_platform_views_rw_${courseId}_${dateStr}` on dedicated connections, eliminating race conditions.
4. **Half-Open Intervals:** All queries enforce `viewed_at >= dayStart AND viewed_at < nextDayStart` in `Asia/Kolkata` time.
5. **Zero-Deletion Fallback:** If any lock times out, any query fails, or any metric verification fails, retention **aborts immediately and deletes zero rows**.







