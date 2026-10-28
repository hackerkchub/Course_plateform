# Section 19.4 Step 11: Wishlist, Reviews & Search — Implementation Plan

**Company / Project:** Softmaxs Solution LLP — Course Platform  
**Document Type:** Detailed Implementation & Testing Plan  
**Target Milestone:** Section 19.4 — Step 11 (Wishlist, Reviews & Search)  
**Workspace:** `D:\Course_plateform\backend\`  
**Dedicated Database:** `course_platform_db` (MariaDB 10.4.32 on `localhost:3306`)  
**Backend Architecture:** Node.js v20+, Express.js 4.19, MySQL2, Native ES Modules (`type: "module"`)  
**Prerequisite Milestone:** Step 10 (Enrollments & Progress) — Completed & Verified (277/277 tests passing)  
**Document Status:** Complete Implementation Plan awaiting explicit user review and approval. Zero code or schema changes have been made during this planning phase.

---

# 1. Objective and Safety Rules

## 1.1 Objective
Prepare a rigorous, complete, and code-grounded implementation plan for **Section 19.4 Step 11: Wishlist, Reviews & Search** in accordance with the authoritative project specification (`Course_Platform_Backend_Plan.txt` Sections 9.1, 15.2, 15.3, 19.3, 19.4) and the verified technical manual ([`docs/COURSE_PLATFORM_BACKEND_MANUAL.md`](file:///D:/Course_plateform/backend/docs/COURSE_PLATFORM_BACKEND_MANUAL.md)).

## 1.2 Mandatory Safety Rules
1. **Workspace Boundary:** Work exclusively within `D:\Course_plateform\backend\`.
2. **Project Isolation:** Never access, inspect, modify, or execute anything within `D:\g9expert` or its databases.
3. **Dedicated Database Only:** Connect exclusively to `course_platform_db`. Verify database name via `SELECT DATABASE()` before any transactional or operational check.
4. **Zero Destructive Database Operations:** Never run `DROP`, `TRUNCATE`, `RESET`, or mass `DELETE`.
5. **Preserve Applied Migrations:** Migrations `001` through `008` have already been applied and tracked in `schema_migrations`. Never edit, rewrite, or roll back applied migrations.
6. **No Premature Implementation:** Do not write or modify application route, controller, service, or repository files until the user reviews and explicitly approves this plan.
7. **No Unapproved Dependencies:** Do not introduce Redis, external search engines (Elasticsearch), payment gateways, or third-party mailing APIs.
8. **Scope Gating:** Do not start Step 12 (Views, Analytics, Dashboard, Cron) or Step 13 (Audit Logs, Notifications, Users).

---

# 2. Authoritative Specification Requirements & References

The authoritative requirements for Step 11 are defined in Sections 9.1, 15.2, 15.3, 19.3, and 19.4 of the uncut specification:

### Section 15.2 — Wishlist
- **Table:** `wishlists`
- **Endpoints:**
  - `GET /api/me/wishlist` — Access: `user` (Student's personal wishlisted course cards).
  - `POST /api/courses/:id/wishlist` — Access: `user` (Add course to wishlist; **idempotent**: adding an already wishlisted course returns success with no error and same result).
  - `DELETE /api/courses/:id/wishlist` — Access: `user` (Remove course from wishlist).
- **Counter Invariant:** Every addition increments `courses.wishlist_count`; every removal decrements `courses.wishlist_count = GREATEST(wishlist_count - 1, 0)`.

### Section 15.3 — Reviews
- **Table:** `course_reviews`
- **Endpoints:**
  - `GET /api/courses/:id/reviews` — Access: Public (Approved reviews with pagination and sorting).
  - `POST /api/courses/:id/reviews` — Access: `user (enrolled)` (Submit review; rating: 1-5 required, title: max 150, text: max 2000; single review per user per course; new review defaults to `moderation_status = 'pending'`).
  - `PATCH /api/me/reviews/:id` — Access: `user` (Edit personal review; **re-moderation invariant**: automatically reverts `moderation_status` back to `'pending'`).
  - `DELETE /api/me/reviews/:id` — Access: `user` (Delete personal review).
  - `GET /api/admin/reviews` — Access: `admin`, `super_admin` (List reviews with filters: `moderation_status`, `course_id`, `rating`, `page`, `limit`).
  - `PATCH /api/admin/reviews/:id/moderate` — Access: `admin`, `super_admin` (Approve or reject review: `{ "moderation_status": "approved" | "rejected", "reason": "optional" }`).
- **Dynamic Rating Recalculation Invariant:** On every approve, reject, or delete, `courses.rating_avg` and `courses.rating_count` must be dynamically recalculated from approved reviews (`SELECT AVG(rating), COUNT(*) FROM course_reviews WHERE course_id = ? AND moderation_status = 'approved'`). Arbitrary client ratings are never accepted.
- **Privacy Invariant (Section 9.1):** Public review responses must display reviewer name and avatar, but **never student email or phone number**.

### Section 9.1 & 19.4 — Search
- **Endpoint:** `GET /api/search`
- **Access:** Public (query: `q` min 2 chars required, `type`: `all | course | category | subcategory`, `limit`: default 10).
- **Behavior:** Searches published courses, active categories, and active subcategories using SQL parameterization.

---

# 3. Existing Codebase Audit & Inspection Findings

A thorough audit of the live codebase was conducted to determine what already exists:

| Component | File Location | Existing Implementation Status | Audit Finding & Action Required |
|---|---|:---:|---|
| **`wishlists` Table** | `migrations/006_enrollments_progress_reviews.sql` | **Exists in DB** | Table exists with `id`, `user_id`, `course_id`, `created_at`, `updated_at`, `uq_wishlists_user_course (user_id, course_id)`, and cascade FKs. **100% schema-ready.** |
| **`course_reviews` Table** | `migrations/006_enrollments_progress_reviews.sql` | **Exists in DB** | Table exists with `id`, `user_id`, `course_id`, `rating` (1-5), `title`, `text`, `moderation_status` (`pending`, `approved`, `rejected`), `is_verified_enrollment`, `uq_reviews_user_course (user_id, course_id)`. **100% schema-ready.** |
| **Course Counters** | `migrations/002_catalog_and_courses.sql` | **Exists in DB** | `courses` table contains `wishlist_count INT DEFAULT 0`, `rating_avg DECIMAL(3,2) DEFAULT 0.00`, and `rating_count INT DEFAULT 0`. |
| **Wishlist Read Checks** | `src/modules/courses/course.repository.js`<br>`src/modules/subcategories/subcategory.repository.js` | **Partially Implemented** | Repository already evaluates `EXISTS(SELECT 1 FROM wishlists w WHERE w.course_id = co.id AND w.user_id = ?)` to populate `is_wishlisted` flag on course cards. |
| **Wishlist Endpoints** | None | **Missing** | `GET /api/me/wishlist`, `POST /api/courses/:id/wishlist`, and `DELETE /api/courses/:id/wishlist` are **completely unbuilt**. |
| **Public Reviews Route** | `src/modules/courses/course.routes.js`<br>`src/modules/courses/course.repository.js` | **Implemented but Untested** | `GET /api/courses/:id/reviews` is implemented, enforces `moderation_status = 'approved'`, scrubs email/phone, but has **0 automated tests** in `tests/catalog.test.js`. |
| **Review Write & Admin Endpoints** | None | **Missing** | `POST /api/courses/:id/reviews`, `PATCH /api/me/reviews/:id`, `DELETE /api/me/reviews/:id`, `GET /api/admin/reviews`, and `PATCH /api/admin/reviews/:id/moderate` are **completely unbuilt**. |
| **Enrollment Verification** | `src/modules/enrollments/enrollment.repository.js` | **Available for Reuse** | `findExistingEnrollment(userId, courseId)` can be reused to verify active/completed enrollment before permitting review submission. |
| **Search Route** | `src/modules/courses/course.routes.js` | **Implemented & Tested** | `GET /api/search` is implemented and verified in `tests/catalog.test.js`. |

---

# 4. Requirements and Gap Matrix for Step 11

| # | Spec Requirement | Endpoint & Method | Auth & Role | Existing State | Required Change | DB Effect | Automated Test Required |
|---|---|---|:---:|---|---|---|---|
| **R-1** | Add to wishlist | `POST /api/courses/:id/wishlist` | Authenticated (`user`, staff) | Missing | Create controller, service, repo. Check course published. Insert row, increment counter. Handle duplicate idempotently. | `INSERT INTO wishlists`<br>`UPDATE courses SET wishlist_count + 1` | • Valid add (201/200)<br>• Idempotent duplicate (200)<br>• Unpublished course (400)<br>• Unauthenticated (401) |
| **R-2** | Remove from wishlist | `DELETE /api/courses/:id/wishlist` | Authenticated (`user`, staff) | Missing | Create controller, service, repo. Delete row, decrement counter with `GREATEST(..., 0)`. Idempotent removal. | `DELETE FROM wishlists`<br>`UPDATE courses SET wishlist_count - 1` | • Valid remove (200)<br>• Remove non-wishlisted (200)<br>• Counter never negative |
| **R-3** | View my wishlist | `GET /api/me/wishlist` | Authenticated (`user`, staff) | Missing | Create controller, service, repo. Query wishlisted course cards scoped strictly to `req.user.id`. | Read-only join (`wishlists` + `courses`) | • Scoped to user<br>• Empty wishlist (200, [])<br>• User isolation (User A vs B) |
| **R-4** | Public approved reviews | `GET /api/courses/:id/reviews` | Public | Implemented (`course.routes.js`) | Retain existing route or route through review module. Add automated test coverage and sort options. | Read-only join (`course_reviews` + `users`) | • Approved reviews returned<br>• Pending/rejected hidden<br>• No email/phone exposed<br>• Pagination & sorting |
| **R-5** | Submit course review | `POST /api/courses/:id/reviews` | Authenticated (`user`, staff) with enrollment | Missing | Validate `rating` (1-5), optional `title`/`text`. Check enrollment via `course_enrollments`. Check single review constraint (409). Set `moderation_status = 'pending'`. | `INSERT INTO course_reviews` (`status: pending`) | • Enrolled user submit (201)<br>• Unenrolled user reject (403)<br>• Duplicate review reject (409)<br>• Rating < 1 or > 5 reject (400) |
| **R-6** | Edit personal review | `PATCH /api/me/reviews/:id` | Authenticated (`user`, staff) | Missing | Verify ownership (`user_id = req.user.id`). Update rating/title/text. **Revert status to `pending`**. Recompute course rating if previously approved. | `UPDATE course_reviews SET status = 'pending'`<br>Dynamic rating sync | • Update own review (200)<br>• Status reverted to pending<br>• Course rating recomputed<br>• Non-owner reject (404/403) |
| **R-7** | Delete personal review | `DELETE /api/me/reviews/:id` | Authenticated (`user`, staff) | Missing | Verify ownership. Delete review row. Dynamically recalculate `courses.rating_avg` and `courses.rating_count`. | `DELETE FROM course_reviews`<br>Dynamic rating sync | • Delete own review (200)<br>• Course rating updated<br>• Non-owner reject (404) |
| **R-8** | Admin reviews list | `GET /api/admin/reviews` | `admin`, `super_admin` | Missing | Query all reviews with filters (`moderation_status`, `course_id`, `rating`, `page`, `limit`). Include student email and course name. | Read-only join (`course_reviews`, `users`, `courses`) | • Admin permitted (200)<br>• Student rejected (403)<br>• Status filter works |
| **R-9** | Admin moderate review | `PATCH /api/admin/reviews/:id/moderate` | `admin`, `super_admin` | Missing | Update `moderation_status` (`approved` or `rejected`). **Dynamically recompute course `rating_avg` and `rating_count`**. Log audit event. | `UPDATE course_reviews`<br>`UPDATE courses SET rating_avg, rating_count`<br>`INSERT audit_logs` | • Approve review (200)<br>• Reject review (200)<br>• Rating recalculated exactly<br>• Audit event logged |
| **R-10**| Catalog Search | `GET /api/search` | Public | Implemented (`course.routes.js`) | Verify search returns updated `rating_avg`, `rating_count`, and `wishlisted` flag without regressions. | Read-only search query | • Search term matching<br>• Query min 2 chars<br>• Inactive courses hidden |

---

# 5. Subsystem Detailed Design & Endpoint Contracts

## 5.1 Wishlist Subsystem

### A. Add to Wishlist
- **Route:** `POST /api/courses/:id/wishlist`
- **Access:** Authenticated (`authenticate`)
- **Params:** `id` (Course ID, integer)
- **Validation:** `courseIdParamSchema` (integer > 0)
- **Business Logic:**
  1. Course must exist, not be soft-deleted, and have `status = 'published'`. If unpublished/deleted, return `400 Bad Request`.
  2. Query `wishlists` for `user_id = req.user.id AND course_id = ?`.
  3. **Idempotency Condition:**
     - If row already exists: return `200 OK` with `{ success: true, message: "Course already in wishlist", data: { course_id, wishlisted: true } }`. Do not increment counter.
     - If row does not exist:
       - Insert into `wishlists (user_id, course_id) VALUES (?, ?)`.
       - Update `courses SET wishlist_count = wishlist_count + 1 WHERE id = ?`.
       - Return `201 Created` with `{ success: true, message: "Course added to wishlist", data: { course_id, wishlisted: true } }`.

### B. Remove from Wishlist
- **Route:** `DELETE /api/courses/:id/wishlist`
- **Access:** Authenticated (`authenticate`)
- **Params:** `id` (Course ID, integer)
- **Business Logic:**
  1. Query `wishlists` for `user_id = req.user.id AND course_id = ?`.
  2. If found:
     - Delete row from `wishlists WHERE user_id = ? AND course_id = ?`.
     - Update `courses SET wishlist_count = GREATEST(wishlist_count - 1, 0) WHERE id = ?`.
  3. Return `200 OK` with `{ success: true, message: "Course removed from wishlist", data: { course_id, wishlisted: false } }`.

### C. Get My Wishlist
- **Route:** `GET /api/me/wishlist`
- **Access:** Authenticated (`authenticate`)
- **Query:** `page` (default 1), `limit` (default 10)
- **Business Logic:**
  - Queries `wishlists` inner joined with `courses co`, `categories c`, `subcategories sc`, and `instructors i`.
  - Filters `w.user_id = req.user.id AND co.deleted_at IS NULL`.
  - Returns array of course cards matching the catalog format:
    ```json
    {
      "success": true,
      "data": [
        {
          "id": 10,
          "course_name": "Full Stack React & Node.js",
          "slug": "full-stack-react-nodejs",
          "thumbnail_url": "/files/courses/thumb-10.png",
          "price": 4999.00,
          "offer_price": 2999.00,
          "is_free": false,
          "course_level": "intermediate",
          "duration_hours": 45.0,
          "rating_avg": 4.80,
          "rating_count": 124,
          "instructor": {
            "name": "Rajesh Sharma",
            "photo_url": "/files/instructors/rajesh.png"
          },
          "wishlisted_at": "2026-10-27T16:00:00.000Z"
        }
      ],
      "pagination": { "page": 1, "limit": 10, "total": 1, "total_pages": 1 }
    }
    ```

---

## 5.2 Reviews & Moderation Subsystem

### A. Submit Review
- **Route:** `POST /api/courses/:id/reviews`
- **Access:** Authenticated (`authenticate`)
- **Params:** `id` (Course ID)
- **Request Body (Zod validated):**
  ```json
  {
    "rating": 5,
    "title": "Comprehensive and well structured",
    "text": "The curriculum covers everything from basics to advanced topics. Practical projects were very helpful."
  }
  ```
- **Validation Rules:**
  - `rating`: integer, min 1, max 5 (required)
  - `title`: string, max 150 (optional, trimmed, HTML sanitized)
  - `text`: string, max 2000 (optional, trimmed, HTML sanitized)
- **Business Conditions:**
  1. Course must exist, not be soft-deleted, and be `status = 'published'`.
  2. **Verified Enrollment Check:**
     - Query `course_enrollments` for `user_id = req.user.id AND course_id = ? AND enrollment_status IN ('active', 'completed')`.
     - If no enrollment found: reject with `403 Forbidden` (*"Only enrolled students can review this course"*).
  3. **Duplicate Review Check:**
     - Query `course_reviews` for `user_id = req.user.id AND course_id = ?`.
     - If review exists: reject with `409 Conflict` (*"You have already reviewed this course"*).
  4. **Persistence:**
     - Insert into `course_reviews`:
       - `user_id`: `req.user.id`
       - `course_id`: `courseId`
       - `rating`: `rating`
       - `title`: `title || null`
       - `text`: `text || null`
       - `moderation_status`: `'pending'`
       - `is_verified_enrollment`: `TRUE`
  5. **Rating Integrity:** Note that submitting a review **does NOT** immediately alter `courses.rating_avg` or `courses.rating_count` because the review is `'pending'` and must await administrative approval.
- **Success Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Review submitted successfully and is awaiting moderation",
    "data": {
      "id": 55,
      "course_id": 10,
      "rating": 5,
      "moderation_status": "pending",
      "created_at": "2026-10-27T16:15:00.000Z"
    }
  }
  ```

### B. Edit Own Review
- **Route:** `PATCH /api/me/reviews/:id`
- **Access:** Authenticated (`authenticate`)
- **Params:** `id` (Review ID)
- **Request Body:** `{ "rating"?: int, "title"?: string, "text"?: string }`
- **Business Logic:**
  1. Find review where `id = ? AND user_id = req.user.id`. If not found, return `404 Not Found`.
  2. Note current `moderation_status`.
  3. Update fields and set `moderation_status = 'pending'`.
  4. **Re-moderation Invariant:**
     - If the review was previously `'approved'`, it is now `'pending'`, meaning it must no longer count toward the course rating.
     - Call dynamic rating recalculation helper:
       `recalculateCourseRating(connection, review.course_id)`.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Review updated and resubmitted for moderation",
    "data": { "id": 55, "moderation_status": "pending" }
  }
  ```

### C. Delete Own Review
- **Route:** `DELETE /api/me/reviews/:id`
- **Access:** Authenticated (`authenticate`)
- **Params:** `id` (Review ID)
- **Business Logic:**
  1. Find review where `id = ? AND user_id = req.user.id`. If not found, return `404 Not Found`.
  2. Delete row from `course_reviews WHERE id = ?`.
  3. If review was `'approved'`, call `recalculateCourseRating(connection, review.course_id)`.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Review deleted successfully"
  }
  ```

### D. Admin Review Listing & Moderation Queue
- **Route:** `GET /api/admin/reviews`
- **Access:** `admin`, `super_admin` (`user` and `counsellor` rejected with `403 Forbidden`)
- **Query Parameters:** `page`, `limit`, `moderation_status` (`pending`, `approved`, `rejected`), `course_id`, `rating`, `sort`
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 55,
        "course": { "id": 10, "course_name": "Full Stack React & Node.js" },
        "student": { "id": 4, "name": "Kapil Chilhate", "email": "kapil@example.com" },
        "rating": 5,
        "title": "Comprehensive course",
        "text": "Great projects and mentorship.",
        "moderation_status": "pending",
        "is_verified_enrollment": true,
        "created_at": "2026-10-27T16:15:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "total_pages": 1 }
  }
  ```

### E. Admin Review Moderation Action
- **Route:** `PATCH /api/admin/reviews/:id/moderate`
- **Access:** `admin`, `super_admin`
- **Params:** `id` (Review ID)
- **Request Body (Zod validated):**
  ```json
  {
    "moderation_status": "approved",
    "reason": "Meets community standards"
  }
  ```
- **Business Logic (Transactional):**
  1. Find review by ID. If not found, return `404 Not Found`.
  2. Update `course_reviews SET moderation_status = ? WHERE id = ?`.
  3. **Dynamic Rating Recalculation:**
     ```sql
     SELECT 
       COALESCE(ROUND(AVG(rating), 2), 0.00) AS avg_rating,
       COUNT(*) AS total_count
     FROM course_reviews
     WHERE course_id = ? AND moderation_status = 'approved'
     ```
  4. Update course:
     ```sql
     UPDATE courses 
     SET rating_avg = ?, rating_count = ? 
     WHERE id = ?
     ```
  5. Log audit event `review.moderate` with previous status, new status, and reviewer ID.
- **Success Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Review moderation status updated",
    "data": {
      "id": 55,
      "moderation_status": "approved",
      "course_id": 10,
      "course_rating_avg": 4.85,
      "course_rating_count": 125
    }
  }
  ```

---

# 6. Database and Migration Assessment

### Schema Sufficiency Determination
An inspection of `migrations/002_catalog_and_courses.sql` and `migrations/006_enrollments_progress_reviews.sql` proves:

1. **`wishlists` Table:** Already exists with foreign keys (`user_id` -> `users.id`, `course_id` -> `courses.id`), `ON DELETE CASCADE`, unique constraint `uq_wishlists_user_course`, and indexes on `user_id` and `course_id`.
2. **`course_reviews` Table:** Already exists with `user_id`, `course_id`, `rating`, `title`, `text`, `moderation_status ENUM('pending', 'approved', 'rejected')`, `is_verified_enrollment BOOLEAN`, `uq_reviews_user_course`, and indexes on `(course_id, moderation_status)` and `rating`.
3. **`courses` Table Columns:** Already contains `wishlist_count INT DEFAULT 0`, `rating_avg DECIMAL(3,2) DEFAULT 0.00`, and `rating_count INT DEFAULT 0`.

### Conclusion
> [!IMPORTANT]
> **No database migrations are required.** The database schema in `course_platform_db` is **100% prepared** to support all Step 11 wishlist, reviews, and search operations.

---

# 7. Proposed Implementation Architecture & File Layout

To adhere to the established project structure and layered architecture, the following modular layout is planned:

```
src/
├── modules/
│   ├── wishlist/
│   │   ├── wishlist.validation.js     (Zod schemas for courseId param, pagination)
│   │   ├── wishlist.repository.js     (SQL queries with transaction locks for wishlist & counters)
│   │   ├── wishlist.service.js        (Business conditions, idempotency, published check)
│   │   ├── wishlist.controller.js     (HTTP request handling, response formatting)
│   │   └── wishlist.routes.js         (Mounts /api/courses/:id/wishlist and /api/me/wishlist)
│   ├── reviews/
│   │   ├── review.validation.js       (Zod schemas for submit, update, moderate, query)
│   │   ├── review.repository.js       (SQL for reviews, moderation, dynamic rating recalculation)
│   │   ├── review.service.js          (Enrollment verification, moderation transitions, audit log)
│   │   ├── review.controller.js       (HTTP handling for public, student, and admin review APIs)
│   │   └── review.routes.js           (Routes for /api/courses/:id/reviews, /api/me/reviews, /api/admin/reviews)
│   └── courses/
│       └── course.routes.js           (Reconcile with review routes to avoid route shadowing)
tests/
└── wishlist_reviews.test.js           (Comprehensive automated test suite for Step 11)
```

### Express Mounting Plan in `src/app.js`
```javascript
// Public & Student Course Actions
app.use('/api/courses', wishlistCourseRoutes); // POST /:id/wishlist, DELETE /:id/wishlist
app.use('/api/courses', reviewCourseRoutes);   // GET /:id/reviews, POST /:id/reviews

// Student Personal Me Actions
app.use('/api/me', wishlistStudentRoutes);     // GET /wishlist
app.use('/api/me', reviewStudentRoutes);       // PATCH /reviews/:id, DELETE /reviews/:id

// Admin Management Actions
app.use('/api/admin/reviews', reviewAdminRoutes); // GET /, PATCH /:id/moderate
```

---

# 8. Step-by-Step Implementation Sequence

Once approved, implementation will proceed in strictly gated stages:

```
[ Stage 1: Validation Schemas ]
  ├── Create src/modules/wishlist/wishlist.validation.js
  └── Create src/modules/reviews/review.validation.js
            │
            ▼
[ Stage 2: Repositories & SQL Invariants ]
  ├── Create src/modules/wishlist/wishlist.repository.js
  │     - addWishlist (idempotent INSERT IGNORE or duplicate handling)
  │     - removeWishlist (DELETE + GREATEST decrement)
  │     - findUserWishlist (paginated course cards)
  └── Create src/modules/reviews/review.repository.js
        - insertReview, updateReview, deleteReview
        - findReviewById, findCourseReviewsPublic, findAdminReviews
        - recalculateCourseRating (dynamic AVG and COUNT recalculation)
            │
            ▼
[ Stage 3: Services & Business Rules ]
  ├── Create src/modules/wishlist/wishlist.service.js
  │     - Check course existence and published status
  │     - Enforce idempotent returns
  └── Create src/modules/reviews/review.service.js
        - Verify enrollment via findExistingEnrollment
        - Prevent duplicate review submissions (409)
        - Revert status to pending on edit
        - Orchestrate audit logging on admin moderation
            │
            ▼
[ Stage 4: Controllers & Routes ]
  ├── Create wishlist.controller.js & wishlist.routes.js
  ├── Create review.controller.js & review.routes.js
  └── Mount in src/app.js under /api/courses, /api/me, /api/admin/reviews
            │
            ▼
[ Stage 5: Automated Testing Suite ]
  ├── Create tests/wishlist_reviews.test.js (Unit & integration on real MariaDB)
  │     - 10+ Wishlist test cases
  │     - 15+ Reviews & Moderation test cases
  │     - Public reviews privacy check
  │     - Rating recalculation assertions
  └── Re-run full regression suite (tests/run_all_tests.js)
            │
            ▼
[ Stage 6: Documentation & Handover Update ]
  ├── Update docs/API_DOCUMENTATION.md with new endpoint schemas
  ├── Update docs/COURSE_PLATFORM_BACKEND_MANUAL.md to record Step 11 completion
  └── Generate Phase 11 / Step 11 Verification Report
```

---

# 9. Automated Testing & Verification Plan

Tests will be added to `tests/wishlist_reviews.test.js` using Node.js native test runner (`node --test`), `supertest`, and real connections to `course_platform_db`.

### Planned Test Cases

#### A. Wishlist Test Group
1. `POST /api/courses/:id/wishlist` — Unauthenticated receives `401 Unauthorized`.
2. `POST /api/courses/:id/wishlist` — Non-existent course receives `404 Not Found`.
3. `POST /api/courses/:id/wishlist` — Unpublished course receives `400 Bad Request`.
4. `POST /api/courses/:id/wishlist` — Valid student addition returns `201/200` and increments `courses.wishlist_count`.
5. `POST /api/courses/:id/wishlist` — Adding same course second time returns `200 OK` (idempotent) and keeps `wishlist_count` unchanged.
6. `GET /api/me/wishlist` — Unauthenticated receives `401 Unauthorized`.
7. `GET /api/me/wishlist` — Authenticated student receives their wishlisted courses with complete card metadata.
8. `GET /api/me/wishlist` — User isolation: User A does not see User B's wishlisted courses.
9. `DELETE /api/courses/:id/wishlist` — Unauthenticated receives `401 Unauthorized`.
10. `DELETE /api/courses/:id/wishlist` — Valid removal returns `200 OK` and decrements `courses.wishlist_count`.
11. `DELETE /api/courses/:id/wishlist` — Removing a course not in wishlist returns `200 OK` without error; `wishlist_count` remains >= 0.

#### B. Reviews Test Group
12. `GET /api/courses/:id/reviews` — Public access permitted (`200 OK`).
13. `GET /api/courses/:id/reviews` — Only reviews with `moderation_status = 'approved'` are returned.
14. `GET /api/courses/:id/reviews` — Student privacy invariant: `email` and `phone` are **never** present in the response items.
15. `POST /api/courses/:id/reviews` — Unauthenticated receives `401 Unauthorized`.
16. `POST /api/courses/:id/reviews` — Unenrolled student receives `403 Forbidden` (*"Only enrolled students can review this course"*).
17. `POST /api/courses/:id/reviews` — Invalid rating (0 or 6) receives `400 Bad Request`.
18. `POST /api/courses/:id/reviews` — Enrolled student submits valid review; returns `201 Created` with `moderation_status = 'pending'`.
19. `POST /api/courses/:id/reviews` — Duplicate review by same student on same course receives `409 Conflict`.
20. `GET /api/courses/:id/reviews` — Newly created `'pending'` review does not appear in public reviews list.
21. `GET /api/admin/reviews` — Unauthenticated receives `401`, standard student receives `403 Forbidden`.
22. `GET /api/admin/reviews` — Admin receives list of reviews including pending submissions, student email, and course name.
23. `PATCH /api/admin/reviews/:id/moderate` — Student receives `403 Forbidden`.
24. `PATCH /api/admin/reviews/:id/moderate` — Admin approves review:
    - Review status transitions to `'approved'`.
    - `courses.rating_avg` and `courses.rating_count` are recalculated and incremented.
    - Review now appears in public `GET /api/courses/:id/reviews`.
    - Audit log entry `review.moderate` is created.
25. `PATCH /api/me/reviews/:id` — Student edits their approved review:
    - Review updates successfully (`200 OK`).
    - Review status automatically reverts to `'pending'`.
    - Course `rating_avg` and `rating_count` are dynamically recalculated, removing the review from active stats until re-approved.
26. `DELETE /api/me/reviews/:id` — Student cannot delete another student's review (404/403).
27. `DELETE /api/me/reviews/:id` — Student deletes own approved review:
    - Row is removed from `course_reviews`.
    - Course `rating_avg` and `rating_count` are dynamically recomputed.
28. `PATCH /api/admin/reviews/:id/moderate` — Admin rejects review:
    - Status transitions to `'rejected'`.
    - Review is hidden from public list.
    - Course rating remains accurate.

#### C. Search & Regression Test Group
29. `GET /api/search` — Query `q=react` returns matches across courses, categories, subcategories.
30. `GET /api/search` — Query < 2 characters returns `400 Bad Request`.
31. Full Regression Suite — All 277 previously passing tests across 12 test files continue to pass without error.

---

# 10. Acceptance Criteria

Step 11 will be considered complete and ready for handover only when:
1. All 8 new/updated endpoints are registered and responding with correct HTTP status codes.
2. Wishlist additions and removals are strictly idempotent and maintain accurate `courses.wishlist_count`.
3. Only enrolled students can submit reviews (`is_verified_enrollment = TRUE`).
4. Duplicate reviews on the same course are rejected with `409 Conflict`.
5. Review submissions default to `'pending'` and are completely hidden from public listings.
6. Admin approval/rejection dynamically recomputes `courses.rating_avg` and `courses.rating_count`.
7. Student edits to approved reviews automatically revert moderation status to `'pending'` and re-trigger rating recalculation.
8. Public review responses never leak student email or phone numbers.
9. All 31 planned test cases in `tests/wishlist_reviews.test.js` pass cleanly on `course_platform_db`.
10. The full regression suite passes with **0 failures** (expecting >= 308 total passing tests).
11. Documentation is updated in `docs/API_DOCUMENTATION.md` and `docs/COURSE_PLATFORM_BACKEND_MANUAL.md`.

---

# 11. Files Expected to Change

### New Files to Create:
- `src/modules/wishlist/wishlist.validation.js`
- `src/modules/wishlist/wishlist.repository.js`
- `src/modules/wishlist/wishlist.service.js`
- `src/modules/wishlist/wishlist.controller.js`
- `src/modules/wishlist/wishlist.routes.js`
- `src/modules/reviews/review.validation.js`
- `src/modules/reviews/review.repository.js`
- `src/modules/reviews/review.service.js`
- `src/modules/reviews/review.controller.js`
- `src/modules/reviews/review.routes.js`
- `tests/wishlist_reviews.test.js`

### Existing Files to Update:
- `src/app.js` (mount wishlist and review routers)
- `src/modules/courses/course.routes.js` (reconcile public reviews route)
- `docs/API_DOCUMENTATION.md` (add Step 11 endpoint specifications)
- `docs/COURSE_PLATFORM_BACKEND_MANUAL.md` (update Step 11 status upon completion)

---

# 12. Explicit Confirmation & Mandatory Stop Condition

- **Confirmation:** No application code, route definitions, or database objects have been created or modified during this planning step.
- **Safety Status:** `course_platform_db` remains completely intact. `D:\g9expert` was not accessed.
- **Status:** Planning complete and fully documented in [`docs/STEP_11_WISHLIST_REVIEWS_SEARCH_PLAN.md`](file:///D:/Course_plateform/backend/docs/STEP_11_WISHLIST_REVIEWS_SEARCH_PLAN.md).

> [!CAUTION]
> **MANDATORY STOP CONDITION:**
> Do NOT begin implementation of Step 11 (Wishlist, Reviews & Search) or any subsequent step until the user reviews this plan and gives explicit approval to proceed.
