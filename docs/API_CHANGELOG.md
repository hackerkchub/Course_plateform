# Course Platform Backend — API Changelog

**Document Version:** 1.0.0  
**Current State:** Steps 1–12 Complete & Verified (343/343 Tests Passing)  
**Database:** MariaDB / MySQL (`course_platform_db`)  
**Frozen Migrations:** `001_auth_and_users.sql` through `008_wishlist_reviews_analytics.sql`  
**Pending Scope:** Step 13 Payments, Orders, and Checkout Gateway Integration  

---

## [v1.0.0] — 2026-10-31 (Step 12 Completion)

### Added
- **Analytics & Telemetry Module (Step 12):**
  - Implemented `POST /api/courses/:id/views` with 60 req/min/IP rate limiting, client fingerprinting, visitor vs. enrolled student classification, and MariaDB advisory lock coordination (`course_platform_views_rw_${courseId}_${dateStr}`).
  - Implemented `POST /api/courses/:id/share` for social sharing telemetry.
  - Implemented `POST /api/courses/:id/enquiry-click` for WhatsApp and call enquiry telemetry.
  - Implemented `GET /api/admin/courses/:id/analytics` for 30-day course performance trends, views, conversion funnel, and demographics.
  - Implemented `GET /api/admin/analytics/courses` for platform-wide course comparison and top-performing courses.
  - Implemented `GET /api/admin/dashboard` for executive summary (total revenue, active enrollments, leads, conversion metrics).
- **Background Cron Schedulers (All 8 Jobs):**
  - Integrated `node-cron` with strict `Asia/Kolkata` (+05:30) timezone.
  - `offer_expiry` (`0 * * * *`): Hourly check to expire past promotional offers.
  - `enrollment_expiry` (`0 1 * * *`): 1:00 AM daily check to expire past student course access.
  - `analytics_aggregate` (`0 2 * * *`): 2:00 AM daily roll-up of raw telemetry into `course_analytics_daily` with advisory locking.
  - `token_cleanup` (`0 3 * * *`): 3:00 AM daily purge of expired and revoked JWT refresh tokens.
  - `rating_resync` (`0 4 * * *`): 4:00 AM daily recalculation of course average ratings and review counts from approved reviews.
  - `views_retention` (`30 4 * * 0`): 4:30 AM Sunday raw view purge guarded by completeness verification.
  - `enrollment_expiring_notice` (`0 8 * * *`): 8:00 AM daily notice dispatch for enrollments expiring in 7 and 3 days.
  - `demo_reminder` (`*/10 * * * *`): Every 10 minutes scan for upcoming demo sessions (24h and 1h ahead).
- **Advisory Lock Architecture:**
  - Integrated MySQL/MariaDB named advisory locks (`GET_LOCK`) on dedicated physical database connections for all cron jobs.
  - Added per-course/date shared read-write advisory lock (`course_platform_views_rw_${courseId}_${dateStr}`) across view ingestion, daily aggregation, and retention jobs to eliminate data race conditions.

---

## [v0.11.0] — 2026-10-27 (Step 11: Wishlist, Reviews & Search)

### Added
- **Wishlist Module:**
  - Implemented `POST /api/courses/:id/wishlist` and `DELETE /api/courses/:id/wishlist` for student bookmarking.
  - Implemented `GET /api/me/wishlist` with pagination, course pricing, and category enrichment.
- **Reviews & Moderation Module:**
  - Implemented `GET /api/courses/:id/reviews` for public course reviews and star breakdown.
  - Implemented `POST /api/courses/:id/reviews` for verified student review submission.
  - Implemented `PATCH /api/me/reviews/:id` and `DELETE /api/me/reviews/:id` for student self-management.
  - Implemented `GET /api/admin/reviews` and `PATCH /api/admin/reviews/:id/moderate` for administrative review moderation (`pending`, `approved`, `rejected`).
- **Global Search Module:**
  - Implemented `GET /api/search` with full-text fuzzy matching, category filtering, level filtering, price sorting, and query autocomplete suggestions.

---

## [v0.10.0] — 2026-10-26 (Step 10: Eligibility, Enrollments & Progress)

### Added
- **Eligibility Engine:**
  - Implemented `GET /api/courses/:id/eligibility` for public prerequisite inspection.
  - Implemented `POST /api/courses/:id/eligibility-checks` for student test submissions.
  - Implemented `GET /api/me/courses/:id/eligibility-result` for personal evaluation history.
  - Implemented `GET /api/admin/courses/:id/eligibility-rules` and `PUT /api/admin/courses/:id/eligibility-rules` for rule and question management.
  - Implemented `GET /api/admin/courses/:id/eligibility-checks` for counsellor review of student attempts.
- **Enrollments & Student Access:**
  - Implemented `POST /api/courses/:id/enroll` for instant student self-enrollment in free courses.
  - Implemented `GET /api/me/enrollments` for student course dashboard.
  - Implemented `GET /api/me/courses/:id/curriculum` for enrolled lesson streaming.
  - Implemented `POST /api/me/lessons/:lessonId/progress` for playback tracking and auto-completion.
  - Implemented `GET /api/admin/enrollments`, `POST /api/admin/enrollments`, and `PATCH /api/admin/enrollments/:id` for manual administrative enrollment provisioning and lifecycle control.

---

## [v0.9.0] — 2026-10-25 (Step 9: Demo Classes & Leads)

### Added
- **Demo Booking & Lead Management:**
  - Implemented `GET /api/courses/:id/demo-settings` for public schedule availability.
  - Implemented `POST /api/courses/:id/demo-requests` with 5 req/hr rate limiting.
  - Implemented `GET /api/me/demo-requests` and `PATCH /api/me/demo-requests/:id/cancel` for student self-service.
  - Implemented `GET /api/admin/demo-requests` with extensive filtering (counsellor, course, status, date).
  - Implemented `GET /api/admin/demo-requests/:id` and `PATCH /api/admin/demo-requests/:id` for lead lifecycle tracking.
  - Implemented `POST /api/admin/demo-requests/:id/notes` for internal follow-up audit trail.
  - Implemented `POST /api/admin/demo-requests/:id/convert` for converting qualified leads to student enrollments.
  - Implemented `PATCH /api/admin/demo-requests/bulk` for bulk counsellor reassignment.
  - Implemented `GET /api/admin/demo-requests/export` for CSV lead export.

---

## [v0.8.0] — 2026-10-24 (Step 8: Course Content & Media Uploads)

### Added
- **Course Enhancements:**
  - Implemented SEO management: `GET` / `PUT /api/admin/courses/:id/seo`.
  - Implemented pricing management: `GET` / `PUT /api/admin/courses/:id/pricing`.
  - Implemented installment plans: `GET`, `POST`, `PATCH`, `DELETE /api/admin/courses/:id/installments`.
  - Implemented promotional offers: `GET`, `POST`, `PATCH`, `DELETE /api/admin/courses/:id/offers`.
  - Implemented structured FAQs: `GET` / `PUT /api/admin/courses/:id/faqs`.
  - Implemented testimonials: `GET` / `PUT /api/admin/courses/:id/testimonials`.
  - Implemented learning benefits: `GET` / `PUT /api/admin/courses/:id/benefits`.
  - Implemented enrollment settings: `GET` / `PUT /api/admin/courses/:id/enrollment-settings`.
  - Implemented summary points: `GET` / `PUT /api/admin/courses/:id/points`.
- **Media Uploads & Materials:**
  - Implemented `POST /api/admin/uploads` and `DELETE /api/admin/uploads` with `multer` MIME filtering.
  - Implemented `GET /api/courses/:id/materials` and `GET /api/courses/:id/materials/:materialId/download` with enrollment access verification.
  - Implemented admin course materials CRUD: `GET`, `POST /api/admin/courses/:id/materials` and `PATCH`, `DELETE /api/admin/materials/:materialId`.

---

## [v0.7.0] — 2026-10-22 (Step 7: Curriculum & Batches)

### Added
- **Curriculum Management:**
  - Implemented `GET /api/admin/courses/:id/curriculum` and `PATCH /api/admin/courses/:id/curriculum/reorder`.
  - Implemented module CRUD: `POST /api/admin/courses/:id/modules`, `PATCH /api/admin/modules/:id`, `DELETE /api/admin/modules/:id`.
  - Implemented lesson CRUD: `POST /api/admin/modules/:id/lessons`, `PATCH /api/admin/lessons/:id`, `DELETE /api/admin/lessons/:id`.
- **Batch Management:**
  - Implemented `GET /api/courses/:id/batches` for public schedule inspection.
  - Implemented admin batch CRUD: `GET`, `POST /api/admin/courses/:id/batches` and `PATCH`, `DELETE /api/admin/batches/:id`.

---

## [v0.6.0] — 2026-10-20 (Step 6: Courses Core & Instructors)

### Added
- **Course Catalog Management:**
  - Implemented public course catalog: `GET /api/courses` and `GET /api/courses/:slug`.
  - Implemented admin course CRUD: `GET`, `POST /api/admin/courses`, `GET`, `PATCH`, `DELETE /api/admin/courses/:id`.
  - Implemented course status transitions: `PATCH /api/admin/courses/:id/status` (`draft`, `published`, `archived`).
  - Implemented deep course cloning: `POST /api/admin/courses/:id/duplicate`.
- **Instructor Profiles:**
  - Implemented public instructor directory: `GET /api/instructors` and `GET /api/instructors/:id`.
  - Implemented admin instructor CRUD: `GET`, `POST /api/admin/instructors`, `GET`, `PATCH`, `DELETE /api/admin/instructors/:id`.

---

## [v0.5.0] — 2026-10-18 (Step 5: Categories & Subcategories)

### Added
- **Taxonomy & Hierarchy:**
  - Implemented public category navigation: `GET /api/categories` and `GET /api/categories/:slug`.
  - Implemented nested subcategory routing: `GET /api/categories/:catSlug/subcategories` and `GET /api/categories/:catSlug/subcategories/:subSlug`.
  - Implemented admin category CRUD: `GET`, `POST`, `GET :id`, `PATCH :id`, `DELETE :id`, `PATCH /reorder`.
  - Implemented admin subcategory CRUD: `GET`, `POST`, `GET :id`, `PATCH :id`, `DELETE :id`, `PATCH /reorder`.

---

## [v0.4.0] — 2026-10-15 (Step 4: Auth & Session Management)

### Added
- **OAuth & JWT Authentication:**
  - Implemented `POST /api/auth/google` with Google OAuth token verification and account auto-provisioning.
  - Implemented `POST /api/auth/refresh` with refresh token rotation and token replay breach detection.
  - Implemented `POST /api/auth/logout` and `POST /api/auth/logout-all`.
  - Implemented `GET /api/auth/me` and `PATCH /api/auth/me`.
  - Integrated HTTP-only, `sameSite: strict` secure cookies.
  - Role-based access control middleware (`authenticate`, `optionalAuth`, `authorize`).

---

## [v0.3.0] — 2026-10-12 (Steps 1–3: Foundation, Security & Architecture)

### Added
- **System Architecture & Database Initialization:**
  - Initialized ESM Node.js architecture with Express 4.
  - Applied frozen database migrations 001 through 008 onto `course_platform_db` (34 tables).
  - Implemented `src/config/env.js` with strict Zod runtime schema validation.
  - Configured MariaDB connection pool with `Asia/Kolkata` (+05:30) timezone.
  - Implemented security headers via `helmet` and custom `cors` middleware.
  - Configured IP rate limiters (`generalRateLimiter`, `authRateLimiter`, `demoFormRateLimiter`, `viewsRateLimiter`).
  - Added health diagnostics: `GET /api/health` and `GET /api/health/db`.
  - Implemented structured JSON logging with `pino` and Asia/Kolkata timestamps.
