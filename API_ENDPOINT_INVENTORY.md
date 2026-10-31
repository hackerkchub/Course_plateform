# Course Platform Backend — API Endpoint Inventory

**Document Version:** 1.0.0  
**Generated At:** 2026-10-31  
**Total Registered Unique Endpoints:** 128  
**Backend Framework:** Node.js (v18+) / Express 4 (ESM)  
**Database:** MariaDB / MySQL (`course_platform_db`)  
**Scope:** Steps 1–12 Implemented & Verified (343/343 Tests Passing)  
**Deferred Scope:** Step 13 Payments, Orders, and Checkout Gateway Integration (Pending)

---

## 1. Summary Statistics

### 1.1 Endpoints by Module
| Module | Endpoint Count |
|---|---|
| Health & Diagnostics | 2 |
| Root Information | 1 |
| Authentication & Session Management | 6 |
| Categories & Hierarchy | 8 |
| Subcategories & Taxonomy | 8 |
| Instructors Management | 7 |
| Courses & Public Catalog | 10 |
| Curriculum, Modules & Lessons | 8 |
| Batches & Schedules | 5 |
| Course Content Enhancements (Pricing, SEO, Offers, FAQs, etc.) | 22 |
| File Uploads & Media Assets | 2 |
| Course Materials & Downloads | 6 |
| Demo Classes & Lead Management | 15 |
| Eligibility Rules & Checks | 6 |
| Enrollments & Lesson Progress | 7 |
| Wishlist Management | 3 |
| Course Reviews & Moderation | 6 |
| Views, Telemetry, Analytics & Admin Dashboard | 6 |
| **Total Unique Endpoints** | **128** |

### 1.2 Endpoints by Access Level
| Access Level | Count | Description |
|---|---|---|
| **Public** | 22 | Open to unauthenticated clients (rate limited). |
| **Optional Auth** | 3 | Public access, but enriches payload if JWT is provided (e.g. view tracking, subcategory page). |
| **Student (Authenticated)** | 15 | Requires valid JWT; accessible by role `user`, `counsellor`, `admin`, `super_admin`. |
| **Counsellor / Admin** | 10 | Requires valid JWT with role `counsellor`, `admin`, or `super_admin`. |
| **Admin Only** | 78 | Requires valid JWT with role `admin` or `super_admin`. |
| **Total** | **128** | |

### 1.3 Endpoints by HTTP Method
| HTTP Method | Count |
|---|---|
| `GET` | 61 |
| `POST` | 27 |
| `PATCH` | 19 |
| `PUT` | 10 |
| `DELETE` | 11 |
| **Total** | **128** |

---

## 2. Complete Inventory of Implemented Endpoints (1–128)

| # | Method | Endpoint URL | Module | Access Level | Description / Handler |
|---|---|---|---|---|---|
| 1 | `GET` | `/api` | Root Info | Public | Basic platform information, version, and documentation links. |
| 2 | `GET` | `/api/health` | Health | Public | Basic application uptime, process health, and system timestamp. |
| 3 | `GET` | `/api/health/db` | Health | Public | MySQL database ping, connection latency, and active database name. |
| 4 | `POST` | `/api/auth/google` | Auth | Public | Exchange Google OAuth `id_token` for JWT access and refresh cookies. |
| 5 | `POST` | `/api/auth/refresh` | Auth | Public / Cookie | Rotate refresh token cookie, verify replay attacks, issue new access token. |
| 6 | `POST` | `/api/auth/logout` | Auth | Authenticated | Revoke current refresh token in database and clear auth cookies. |
| 7 | `POST` | `/api/auth/logout-all` | Auth | Authenticated | Revoke all active refresh tokens for the current user and clear cookies. |
| 8 | `GET` | `/api/auth/me` | Auth | Authenticated | Retrieve authenticated user profile, avatar, role, and permissions. |
| 9 | `PATCH` | `/api/auth/me` | Auth | Authenticated | Update user profile fields (name, phone, avatar URL). |
| 10 | `GET` | `/api/categories` | Categories | Public | List all active categories with published course count. |
| 11 | `GET` | `/api/categories/:slug` | Categories | Public | Retrieve single category details by slug with active subcategories. |
| 12 | `GET` | `/api/admin/categories` | Categories | Admin | List all categories with pagination, search, and status filters. |
| 13 | `POST` | `/api/admin/categories` | Categories | Admin | Create a new category with unique slug and order index. |
| 14 | `GET` | `/api/admin/categories/:id` | Categories | Admin | Retrieve complete category details by primary key ID. |
| 15 | `PATCH` | `/api/admin/categories/:id` | Categories | Admin | Update category details, name, icon, slug, status, or display order. |
| 16 | `DELETE` | `/api/admin/categories/:id` | Categories | Admin | Soft-delete / delete category if no child courses/subcategories exist. |
| 17 | `PATCH` | `/api/admin/categories/reorder` | Categories | Admin | Bulk reorder category display order indexes. |
| 18 | `GET` | `/api/categories/:catSlug/subcategories` | Subcategories | Public | List published subcategories for a given category slug. |
| 19 | `GET` | `/api/categories/:catSlug/subcategories/:subSlug` | Subcategories | Optional Auth | Retrieve subcategory detail page, metadata, and published courses. |
| 20 | `GET` | `/api/admin/subcategories` | Subcategories | Admin | List all subcategories with category join and filtering. |
| 21 | `POST` | `/api/admin/subcategories` | Subcategories | Admin | Create a new subcategory linked to a category ID. |
| 22 | `GET` | `/api/admin/subcategories/:id` | Subcategories | Admin | Retrieve single subcategory details by primary key ID. |
| 23 | `PATCH` | `/api/admin/subcategories/:id` | Subcategories | Admin | Update subcategory name, slug, status, description, or parent category. |
| 24 | `DELETE` | `/api/admin/subcategories/:id` | Subcategories | Admin | Delete subcategory if no active courses are associated. |
| 25 | `PATCH` | `/api/admin/subcategories/reorder` | Subcategories | Admin | Bulk update sort orders for subcategories within a category. |
| 26 | `GET` | `/api/instructors` | Instructors | Public | List published instructor profiles with active course counts. |
| 27 | `GET` | `/api/instructors/:id` | Instructors | Public | Retrieve detailed instructor biography, credentials, and courses. |
| 28 | `GET` | `/api/admin/instructors` | Instructors | Admin | List all instructors with pagination, status filters, and course counts. |
| 29 | `POST` | `/api/admin/instructors` | Instructors | Admin | Create a new instructor profile with bio, avatar, and social links. |
| 30 | `GET` | `/api/admin/instructors/:id` | Instructors | Admin | Retrieve instructor details by primary key ID for editing. |
| 31 | `PATCH` | `/api/admin/instructors/:id` | Instructors | Admin | Update instructor profile details, status, photo, or expertise. |
| 32 | `DELETE` | `/api/admin/instructors/:id` | Instructors | Admin | Delete or deactivate instructor profile. |
| 33 | `GET` | `/api/courses` | Courses | Public | Search, filter, and paginate published courses (category, level, price, sort). |
| 34 | `GET` | `/api/courses/:slug` | Courses | Optional Auth | Complete course details: curriculum, batches, instructors, SEO, pricing. |
| 35 | `GET` | `/api/search` | Search | Public | Full-text course search with autocomplete suggestions and filters. |
| 36 | `GET` | `/api/admin/courses` | Courses | Admin | List all courses (draft, published, archived) with comprehensive filters. |
| 37 | `POST` | `/api/admin/courses` | Courses | Admin | Create a new course in draft status with basic metadata. |
| 38 | `GET` | `/api/admin/courses/:id` | Courses | Admin | Retrieve complete course admin record including relation counts. |
| 39 | `PATCH` | `/api/admin/courses/:id` | Courses | Admin | Update core course details, title, category, level, instructor. |
| 40 | `DELETE` | `/api/admin/courses/:id` | Courses | Admin | Soft-delete / delete course (verifies no active enrollments exist). |
| 41 | `POST` | `/api/admin/courses/:id/duplicate` | Courses | Admin | Deep clone course, curriculum modules, lessons, FAQs, benefits. |
| 42 | `PATCH` | `/api/admin/courses/:id/status` | Courses | Admin | Transition course publishing status (`draft`, `published`, `archived`). |
| 43 | `GET` | `/api/admin/courses/:id/curriculum` | Curriculum | Admin | Retrieve complete course curriculum hierarchy (modules & lessons). |
| 44 | `PATCH` | `/api/admin/courses/:id/curriculum/reorder` | Curriculum | Admin | Bulk reorder modules and lessons within course curriculum. |
| 45 | `POST` | `/api/admin/courses/:id/modules` | Curriculum | Admin | Create a new curriculum module under a course. |
| 46 | `PATCH` | `/api/admin/modules/:moduleId` | Curriculum | Admin | Update module title, description, order index, or status. |
| 47 | `DELETE` | `/api/admin/modules/:moduleId` | Curriculum | Admin | Delete curriculum module and cascade-delete its lessons. |
| 48 | `POST` | `/api/admin/modules/:moduleId/lessons` | Curriculum | Admin | Create a new lesson under a curriculum module. |
| 49 | `PATCH` | `/api/admin/lessons/:lessonId` | Curriculum | Admin | Update lesson title, type, duration, preview flag, or video URL. |
| 50 | `DELETE` | `/api/admin/lessons/:lessonId` | Curriculum | Admin | Delete a lesson from curriculum. |
| 51 | `GET` | `/api/courses/:id/batches` | Batches | Public | List upcoming and open batches for a published course. |
| 52 | `GET` | `/api/admin/courses/:id/batches` | Batches | Admin | List all batches (scheduled, open, completed) for a specific course. |
| 53 | `POST` | `/api/admin/courses/:id/batches` | Batches | Admin | Create a new batch with seat capacity, dates, and instructor assignment. |
| 54 | `PATCH` | `/api/admin/batches/:batchId` | Batches | Admin | Update batch schedule, seat limits, status, or meeting link. |
| 55 | `DELETE` | `/api/admin/batches/:batchId` | Batches | Admin | Delete / cancel batch (verifies no active enrollments exist). |
| 56 | `GET` | `/api/admin/courses/:id/seo` | Course Content | Admin | Retrieve SEO metadata (meta title, description, keywords, canonical URL). |
| 57 | `PUT` | `/api/admin/courses/:id/seo` | Course Content | Admin | Upsert SEO metadata for a course. |
| 58 | `GET` | `/api/admin/courses/:id/pricing` | Course Content | Admin | Retrieve course base price, currency, discount price, and GST settings. |
| 59 | `PUT` | `/api/admin/courses/:id/pricing` | Course Content | Admin | Update course pricing configurations and tax details. |
| 60 | `GET` | `/api/admin/courses/:id/installments` | Course Content | Admin | List active installment plans configured for a course. |
| 61 | `POST` | `/api/admin/courses/:id/installments` | Course Content | Admin | Create a new installment payment plan with schedule and interest. |
| 62 | `PATCH` | `/api/admin/courses/:id/installments/:planId` | Course Content | Admin | Update installment plan terms, intervals, or status. |
| 63 | `DELETE` | `/api/admin/courses/:id/installments/:planId` | Course Content | Admin | Deactivate / delete installment plan. |
| 64 | `GET` | `/api/admin/courses/:id/offers` | Course Content | Admin | List active and scheduled discount offers for a course. |
| 65 | `POST` | `/api/admin/courses/:id/offers` | Course Content | Admin | Create a promotional discount offer with date range and coupon code. |
| 66 | `PATCH` | `/api/admin/courses/:id/offers/:offerId` | Course Content | Admin | Update offer discount rate, validity period, or active state. |
| 67 | `DELETE` | `/api/admin/courses/:id/offers/:offerId` | Course Content | Admin | Remove / cancel promotional offer. |
| 68 | `GET` | `/api/admin/courses/:id/faqs` | Course Content | Admin | List structured FAQs configured for a course. |
| 69 | `PUT` | `/api/admin/courses/:id/faqs` | Course Content | Admin | Bulk replace FAQ items (question, answer, sort order) for course. |
| 70 | `GET` | `/api/admin/courses/:id/testimonials` | Course Content | Admin | List student testimonials attached to a course. |
| 71 | `PUT` | `/api/admin/courses/:id/testimonials` | Course Content | Admin | Bulk replace student testimonials for course page. |
| 72 | `GET` | `/api/admin/courses/:id/benefits` | Course Content | Admin | List key learning benefits / outcomes configured for course. |
| 73 | `PUT` | `/api/admin/courses/:id/benefits` | Course Content | Admin | Bulk update learning benefits and key takeaways. |
| 74 | `GET` | `/api/admin/courses/:id/enrollment-settings` | Course Content | Admin | Retrieve course enrollment limits, prerequisite checks, and expiry rules. |
| 75 | `PUT` | `/api/admin/courses/:id/enrollment-settings` | Course Content | Admin | Update enrollment limits, self-enrollment toggle, and validity period. |
| 76 | `GET` | `/api/admin/courses/:id/points` | Course Content | Admin | Retrieve bullet highlights / key points for course summary. |
| 77 | `PUT` | `/api/admin/courses/:id/points` | Course Content | Admin | Bulk replace bullet highlights for course landing page. |
| 78 | `POST` | `/api/admin/uploads` | Uploads | Admin | Upload file asset (image/document) via `multipart/form-data`. |
| 79 | `DELETE` | `/api/admin/uploads` | Uploads | Admin | Delete uploaded file asset from local disk storage. |
| 80 | `GET` | `/api/courses/:id/materials` | Materials | Public / Student | List downloadable course materials (public and enrolled-only). |
| 81 | `GET` | `/api/courses/:id/materials/:materialId/download` | Materials | Student | Verify enrollment and securely stream/download course material. |
| 82 | `GET` | `/api/admin/courses/:id/materials` | Materials | Admin | List all uploaded materials associated with a specific course. |
| 83 | `POST` | `/api/admin/courses/:id/materials` | Materials | Admin | Attach uploaded document/file as downloadable course material. |
| 84 | `PATCH` | `/api/admin/materials/:materialId` | Materials | Admin | Update material title, description, or access level. |
| 85 | `DELETE` | `/api/admin/materials/:materialId` | Materials | Admin | Detach and delete course material record. |
| 86 | `GET` | `/api/courses/:id/demo-settings` | Demo Classes | Public | Retrieve public demo booking settings, schedule, and capacity. |
| 87 | `POST` | `/api/courses/:id/demo-requests` | Demo Classes | Student | Submit demo class request / lead registration (rate-limited). |
| 88 | `GET` | `/api/me/demo-requests` | Demo Classes | Student | View student's own registered demo requests and status. |
| 89 | `PATCH` | `/api/me/demo-requests/:id/cancel` | Demo Classes | Student | Cancel pending demo request submitted by the authenticated student. |
| 90 | `GET` | `/api/admin/courses/:id/demo-settings` | Demo Classes | Admin | Retrieve course demo settings for administrative editing. |
| 91 | `PUT` | `/api/admin/courses/:id/demo-settings` | Demo Classes | Admin | Update demo availability, max seats, meeting URL, and automated reminders. |
| 92 | `GET` | `/api/admin/courses/:id/demo-requests` | Demo Classes | Counsellor / Admin | List demo leads specifically for a single course. |
| 93 | `GET` | `/api/admin/demo-requests` | Demo Leads | Counsellor / Admin | List all demo leads with status, counsellor assignment, and date filters. |
| 94 | `GET` | `/api/admin/demo-requests/export` | Demo Leads | Admin | Export demo leads to downloadable CSV file. |
| 95 | `GET` | `/api/admin/demo-requests/:id` | Demo Leads | Counsellor / Admin | Retrieve full lead details, follow-up history, and counsellor notes. |
| 96 | `PATCH` | `/api/admin/demo-requests/:id` | Demo Leads | Counsellor / Admin | Update lead status (`pending`, `contacted`, `scheduled`, `attended`, `converted`). |
| 97 | `DELETE` | `/api/admin/demo-requests/:id` | Demo Leads | Admin | Soft-delete demo lead record. |
| 98 | `POST` | `/api/admin/demo-requests/:id/notes` | Demo Leads | Counsellor / Admin | Add internal follow-up note to demo lead record. |
| 99 | `POST` | `/api/admin/demo-requests/:id/convert` | Demo Leads | Admin | Convert demo lead into active course enrollment. |
| 100 | `PATCH` | `/api/admin/demo-requests/bulk` | Demo Leads | Counsellor / Admin | Bulk update status or assign counsellor to multiple demo leads. |
| 101 | `GET` | `/api/courses/:id/eligibility` | Eligibility | Public | Retrieve eligibility requirements and prerequisite rules for course. |
| 102 | `POST` | `/api/courses/:id/eligibility-checks` | Eligibility | Student | Submit questionnaire answers to test eligibility for enrollment. |
| 103 | `GET` | `/api/me/courses/:id/eligibility-result` | Eligibility | Student | Check current student's latest eligibility evaluation result for a course. |
| 104 | `GET` | `/api/admin/courses/:id/eligibility-rules` | Eligibility | Admin | Retrieve course eligibility criteria and question configurations. |
| 105 | `PUT` | `/api/admin/courses/:id/eligibility-rules` | Eligibility | Admin | Update eligibility criteria, passing thresholds, and questions. |
| 106 | `GET` | `/api/admin/courses/:id/eligibility-checks` | Eligibility | Counsellor / Admin | List student eligibility test attempts, scores, and evaluations. |
| 107 | `POST` | `/api/courses/:id/enroll` | Enrollments | Student | Self-enroll into a free/open course with batch selection. |
| 108 | `GET` | `/api/me/enrollments` | Enrollments | Student | List all courses currently or previously enrolled by the student. |
| 109 | `GET` | `/api/me/courses/:id/curriculum` | Enrollments | Student | Access full curriculum, lesson stream URLs, and lesson progress. |
| 110 | `POST` | `/api/me/lessons/:lessonId/progress` | Enrollments | Student | Save playback position, mark lesson completed, update progress %. |
| 111 | `GET` | `/api/admin/enrollments` | Enrollments | Admin | List all platform enrollments with status, dates, and student filters. |
| 112 | `POST` | `/api/admin/enrollments` | Enrollments | Admin | Manually grant course enrollment to a student (scholarship/offline). |
| 113 | `PATCH` | `/api/admin/enrollments/:id` | Enrollments | Admin | Update enrollment status (`active`, `suspended`, `expired`), batch, or dates. |
| 114 | `POST` | `/api/courses/:id/wishlist` | Wishlist | Student | Add course to authenticated student's personal wishlist. |
| 115 | `DELETE` | `/api/courses/:id/wishlist` | Wishlist | Student | Remove course from authenticated student's wishlist. |
| 116 | `GET` | `/api/me/wishlist` | Wishlist | Student | List all wishlisted courses for authenticated student with pagination. |
| 117 | `GET` | `/api/courses/:id/reviews` | Reviews | Public | List approved public course reviews, star distribution, and ratings. |
| 118 | `POST` | `/api/courses/:id/reviews` | Reviews | Student | Submit course review and star rating (pending moderation). |
| 119 | `PATCH` | `/api/me/reviews/:id` | Reviews | Student | Edit student's own review (resets status to `pending` moderation). |
| 120 | `DELETE` | `/api/me/reviews/:id` | Reviews | Student | Delete student's own review from course. |
| 121 | `GET` | `/api/admin/reviews` | Reviews | Admin | List all reviews with moderation status filter (`pending`, `approved`, `rejected`). |
| 122 | `PATCH` | `/api/admin/reviews/:id/moderate` | Reviews | Admin | Approve or reject review, updates course aggregate rating. |
| 123 | `POST` | `/api/courses/:id/views` | Analytics | Optional Auth | Record telemetry page view (rate limited to 60/min/IP). |
| 124 | `POST` | `/api/courses/:id/share` | Analytics | Public | Track social share event for course landing page. |
| 125 | `POST` | `/api/courses/:id/enquiry-click` | Analytics | Public | Track WhatsApp/phone enquiry click for course. |
| 126 | `GET` | `/api/admin/courses/:id/analytics` | Analytics | Admin | Retrieve 30-day view trends, conversion funnel, and demographics. |
| 127 | `GET` | `/api/admin/analytics/courses` | Analytics | Admin | Platform-wide course performance comparison and top-performing courses. |
| 128 | `GET` | `/api/admin/dashboard` | Analytics | Admin | Executive summary: total revenue, active enrollments, leads, conversion rates. |

---

## 3. Explicitly Deferred / Planned APIs (Step 13)

The following payment, order, and checkout routes are **explicitly postponed** to Step 13 and are **NOT** implemented in the current backend:

| Planned Method | Planned Route | Planned Purpose | Status |
|---|---|---|---|
| `POST` | `/api/checkout/orders` | Create course purchase order | ⏳ Pending Step 13 |
| `POST` | `/api/checkout/verify` | Verify payment gateway signature | ⏳ Pending Step 13 |
| `POST` | `/api/checkout/webhook` | Process payment provider webhooks | ⏳ Pending Step 13 |
| `GET` | `/api/me/orders` | Student purchase history & invoices | ⏳ Pending Step 13 |
| `GET` | `/api/me/orders/:id` | Single order & transaction breakdown | ⏳ Pending Step 13 |
| `GET` | `/api/admin/orders` | Admin revenue & transaction ledger | ⏳ Pending Step 13 |
| `POST` | `/api/admin/orders/:id/refund` | Process student order refund | ⏳ Pending Step 13 |
