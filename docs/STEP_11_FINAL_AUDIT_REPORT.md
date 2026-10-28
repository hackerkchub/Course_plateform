# Section 19.4 Step 11: Wishlist, Reviews & Search — Final Audit Report

**Audit Date:** 2026-10-27  
**Workspace:** `D:\Course_plateform\backend\`  
**Dedicated Database:** `course_platform_db` (MariaDB 10.4.32 on `localhost:3306`)  
**Audit Type:** Read-Only Verification (No code or schema modifications)  
**Specification References:** `Course_Platform_Backend_Plan.txt` (Sections 9.1, 15.2, 15.3, 19.1, 19.3, 19.4)  
**Authoritative Implementation Plan:** [`docs/STEP_11_WISHLIST_REVIEWS_SEARCH_PLAN.md`](file:///D:/Course_plateform/backend/docs/STEP_11_WISHLIST_REVIEWS_SEARCH_PLAN.md)  
**Associated Technical Manual:** [`docs/COURSE_PLATFORM_BACKEND_MANUAL.md`](file:///D:/Course_plateform/backend/docs/COURSE_PLATFORM_BACKEND_MANUAL.md)  

---

## 1. Executive Summary & Audit Scorecard

| # | Checklist Item | Status | Key Evidence / Primary Source |
|---|---|:---:|---|
| **1** | **Endpoints & Authorization Rules** | **PASS** *(Finding Documented)* | Section 15.2/15.3; [`src/modules/wishlist/wishlist.routes.js`](file:///D:/Course_plateform/backend/src/modules/wishlist/wishlist.routes.js); [`src/modules/reviews/review.routes.js`](file:///D:/Course_plateform/backend/src/modules/reviews/review.routes.js) |
| **2** | **Wishlist Transactions & SQL** | **PASS** | `addCourseToWishlist`, `removeCourseFromWishlist` in [`src/modules/wishlist/wishlist.repository.js`](file:///D:/Course_plateform/backend/src/modules/wishlist/wishlist.repository.js); `uq_wishlists_user_course` |
| **3** | **Review Lifecycle & Invariants** | **PASS** | `checkUserEnrollment`, `insertReview`, `updateReview`, `recalculateCourseRating` in [`src/modules/reviews/review.repository.js`](file:///D:/Course_plateform/backend/src/modules/reviews/review.repository.js) |
| **4** | **Rating Aggregates & Audit Logging** | **PASS** | `recalculateCourseRating` (`WHERE moderation_status = 'approved'`); `createAuditLog` in [`src/utils/auditLogger.js`](file:///D:/Course_plateform/backend/src/utils/auditLogger.js) |
| **5** | **Public Review Privacy** | **PASS** | `findPublicCourseReviews` in [`src/modules/reviews/review.repository.js`](file:///D:/Course_plateform/backend/src/modules/reviews/review.repository.js); email/phone strictly omitted |
| **6** | **Search API Integration** | **PASS** | `searchCatalog` in [`src/modules/courses/course.repository.js`](file:///D:/Course_plateform/backend/src/modules/courses/course.repository.js); parameterization, min-length check |
| **7** | **Route Reconciliation & Inventory** | **PASS** *(Finding Documented)* | 122 unique HTTP endpoints (123 registered handlers, 1 shadowed route); [`scratch/inventory_all_routes.js`](file:///D:/Course_plateform/backend/scratch/inventory_all_routes.js) |
| **8** | **Test Inspection & Real DB Coverage** | **PASS** *(Scope Clarified)* | [`tests/wishlist_reviews.test.js`](file:///D:/Course_plateform/backend/tests/wishlist_reviews.test.js) (33 real DB tests); 310 total regression tests passing (0 failures) |
| **9** | **Migrations & Safety Boundaries** | **PASS** | Migrations 001–008 clean; 33 tables + migrations table verified; `D:\g9expert` untouched |

---

## 2. Detailed Audit Findings by Checklist Item

### Checklist Item 1: Endpoints & Authorization Rules Comparison
- **Authoritative Specification:**
  - **Section 15.2 (Wishlist):**
    - `GET /api/me/wishlist` — Access: `user`
    - `POST /api/courses/:id/wishlist` — Access: `user` (Idempotent)
    - `DELETE /api/courses/:id/wishlist` — Access: `user` (Idempotent)
  - **Section 15.3 (Reviews):**
    - `GET /api/courses/:id/reviews` — Access: Public
    - `POST /api/courses/:id/reviews` — Access: `user` (enrolled)
    - `PATCH /api/me/reviews/:id` — Access: `user` (reverts to pending)
    - `DELETE /api/me/reviews/:id` — Access: `user`
    - `GET /api/admin/reviews` — Access: `admin`, `super_admin`
    - `PATCH /api/admin/reviews/:id/moderate` — Access: `admin`, `super_admin`
  - **Section 9.1 & 19.4 (Search):**
    - `GET /api/search` — Access: Public
- **Implementation Reality:**
  - All 9 planned endpoints exist and are mounted in [`src/app.js`](file:///D:/Course_plateform/backend/src/app.js).
  - Admin endpoints (`/api/admin/reviews`, `/api/admin/reviews/:id/moderate`) strictly apply `authenticate` and `authorize('admin', 'super_admin')`. Non-admin access returns `403 Forbidden` (verified in tests).
- **Specific Resolution: Wishlist Access (`user` vs `Staff`):**
  - In `src/modules/wishlist/wishlist.routes.js`, all three wishlist endpoints use `authenticate` without a secondary `authorize('user')` guard.
  - **Codebase Pattern Analysis:** This architecture mirrors all other student `/api/me/*` endpoints across the platform:
    - `/api/auth/me` (`authenticate` — any logged-in user can manage personal profile)
    - `/api/me/enrollments` (`authenticate` — any logged-in user can view their enrollments)
    - `/api/courses/:id/enroll` (`authenticate` — any logged-in user can self-enroll in a free course)
    - `/api/me/courses/:id/curriculum` (`authenticate` — access checked against `course_enrollments`)
    - `/api/me/lessons/:lessonId/progress` (`authenticate` — progress recorded for authenticated user ID)
  - **Impact:** Any authenticated user with a valid JWT access token (`user`, `counsellor`, `admin`, `super_admin`) can add courses to their personal wishlist. Their wishlist data is strictly isolated to their own `user_id`.
  - **Conclusion:** If the stakeholder specification requires that staff accounts (`admin`, `counsellor`, `super_admin`) be forbidden from maintaining personal wishlists, an explicit `authorize('user')` middleware must be added. Currently, the system follows standard consumer platform behavior where staff members can also bookmark courses under their own account ID.

---

### Checklist Item 2: Wishlist Repository Transactions and SQL
- **Source File:** [`src/modules/wishlist/wishlist.repository.js`](file:///D:/Course_plateform/backend/src/modules/wishlist/wishlist.repository.js)
- **Functions:**
  1. `findCourseForWishlist(courseId)`:
     ```sql
     SELECT id, course_name, slug, status, is_free, wishlist_count
     FROM courses
     WHERE id = ? AND deleted_at IS NULL
     ```
  2. `addCourseToWishlist(userId, courseId)`:
     - Acquires dedicated connection from pool.
     - Executes `await connection.beginTransaction()`.
     - Queries existing row with row-level lock:
       ```sql
       SELECT id FROM wishlists WHERE user_id = ? AND course_id = ? FOR UPDATE
       ```
     - **Idempotency:** If `existing.length > 0`, immediately commits and returns `{ alreadyWishlisted: true, wishlistId: existing[0].id }`. `courses.wishlist_count` is **not** modified.
     - If not existing:
       ```sql
       INSERT INTO wishlists (user_id, course_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())
       UPDATE courses SET wishlist_count = wishlist_count + 1 WHERE id = ?
       ```
     - Commits transaction. Rollback on catch.
  3. `removeCourseFromWishlist(userId, courseId)`:
     - Acquires connection, starts transaction.
     - Row lock check:
       ```sql
       SELECT id FROM wishlists WHERE user_id = ? AND course_id = ? FOR UPDATE
       ```
     - **Idempotency:** If `existing.length === 0`, commits and returns `{ removed: false }`.
     - If existing:
       ```sql
       DELETE FROM wishlists WHERE user_id = ? AND course_id = ?
       UPDATE courses SET wishlist_count = GREATEST(wishlist_count - 1, 0) WHERE id = ?
       ```
     - Commits transaction. Rollback on catch.
- **Integrity & Concurrency Assessment:**
  - Table `wishlists` has `UNIQUE KEY uq_wishlists_user_course (user_id, course_id)`.
  - Even under concurrent threads where two transactions simultaneously find no row before insert, MariaDB InnoDB enforces the unique constraint, rejecting the duplicate with `ER_DUP_ENTRY` and rolling back the transaction. The counter can never be double-incremented.
  - `GREATEST(wishlist_count - 1, 0)` guarantees `courses.wishlist_count` can never become negative.

---

### Checklist Item 3: Review Lifecycle & Business Invariants
- **Source Files:** [`src/modules/reviews/review.service.js`](file:///D:/Course_plateform/backend/src/modules/reviews/review.service.js), [`src/modules/reviews/review.repository.js`](file:///D:/Course_plateform/backend/src/modules/reviews/review.repository.js)
- **Verification Evidence:**
  1. **Enrollment Check (`checkUserEnrollment`):**
     ```sql
     SELECT id, enrollment_status 
     FROM course_enrollments
     WHERE user_id = ? AND course_id = ? AND enrollment_status IN ('active', 'completed')
     LIMIT 1
     ```
     - Throws `AppError('Only enrolled students can review this course', 403)` if no active/completed enrollment exists. Tested and verified in `tests/wishlist_reviews.test.js`.
  2. **Duplicate Review Prevention (`findReviewByUserAndCourse`):**
     ```sql
     SELECT id FROM course_reviews WHERE user_id = ? AND course_id = ?
     ```
     - Throws `AppError('You have already reviewed this course', 409)` if an existing review exists.
     - Backed by DB unique index `UNIQUE KEY uq_reviews_user_course (user_id, course_id)`.
  3. **Ownership Verification (`editMyReviewService`, `deleteMyReviewService`):**
     - Queries `findReviewById(reviewId)`.
     - Checks `if (!review || Number(review.user_id) !== Number(userId)) throw new AppError('Review not found', 404)`.
     - Tested: Student B cannot edit or delete Student A's review (returns 404).
  4. **Re-Moderation State Reversion (`updateReview`):**
     - Update query explicitly executes:
       ```sql
       UPDATE course_reviews SET moderation_status = "pending", updated_at = NOW(), ... WHERE id = ?
       ```
     - If the review was previously `approved`, `recalculateCourseRating(review.course_id)` is invoked to immediately drop the pending review from the public average.
  5. **Dynamic Rating Recalculation (`recalculateCourseRating`):**
     ```sql
     SELECT 
       COALESCE(ROUND(AVG(rating), 2), 0.00) AS avg_rating,
       COUNT(*) AS total_count
     FROM course_reviews
     WHERE course_id = ? AND moderation_status = 'approved'
     ```
     ```sql
     UPDATE courses SET rating_avg = ?, rating_count = ? WHERE id = ?
     ```
     - Arbitrary client ratings are never accepted. Values are derived purely from SQL aggregation.

---

### Checklist Item 4: Rating Aggregates & Audit Logging
- **Rating Recalculation Invariants:**
  - Every review moderation change (`approve`, `reject`), review edit, and review deletion triggers `recalculateCourseRating`.
  - Only reviews with `moderation_status = 'approved'` are included in `AVG(rating)` and `COUNT(*)`.
  - **Idempotency of Moderation:** Repeated approval or rejection of the same review causes no counter drift or average distortion because the query recalculates the exact snapshot of approved reviews.
- **Audit Logging:**
  - `moderateReviewService` dispatches:
    ```javascript
    await createAuditLog({
      actor_id: actorId,
      action: 'review.moderate',
      entity_type: 'review',
      entity_id: reviewId,
      old_value: { moderation_status: previousStatus },
      new_value: { moderation_status, reason: reason || null },
      ip_address: ipAddress,
    });
    ```
  - `createAuditLog` in [`src/utils/auditLogger.js`](file:///D:/Course_plateform/backend/src/utils/auditLogger.js) inserts into `audit_logs` table (immutability enforced by DB triggers created in Migration 008).
  - **Failure Handling:** If the audit log insert fails, `createAuditLog` logs the error to Winston (`logger.error`) and returns `null` rather than failing the core operation.

---

### Checklist Item 5: Public Review Response Privacy
- **Source File:** [`src/modules/reviews/review.repository.js`](file:///D:/Course_plateform/backend/src/modules/reviews/review.repository.js#L142-L186)
- **Function:** `findPublicCourseReviews(courseId, { page, limit, sort })`
- **Executed Query:**
  ```sql
  SELECT 
    cr.id, cr.rating, cr.title, cr.text, cr.is_verified_enrollment, cr.created_at,
    u.name AS user_name, u.avatar_url
  FROM course_reviews cr
  JOIN users u ON u.id = cr.user_id
  WHERE cr.course_id = ? AND cr.moderation_status = 'approved'
  ORDER BY cr.created_at DESC
  LIMIT ? OFFSET ?
  ```
- **Privacy Verification:**
  - **Fields Queried:** `u.name`, `u.avatar_url`.
  - **Fields Omitted:** `u.email`, `u.phone`, `u.google_id`, `u.role`, `u.status`.
  - **Status Filter:** `cr.moderation_status = 'approved'` is strictly enforced in both count and row queries.
  - Pending reviews and rejected reviews are completely hidden from public callers.

---

### Checklist Item 6: Search API (`GET /api/search`) Verification
- **Source File:** [`src/modules/courses/course.repository.js`](file:///D:/Course_plateform/backend/src/modules/courses/course.repository.js#L605-L680)
- **Validation:** [`searchQuerySchema`](file:///D:/Course_plateform/backend/src/modules/courses/course.validation.js) requires `q` to be at least 2 characters. Validates `type: all | course | category | subcategory`.
- **SQL Security:**
  - Parameterized `LIKE ?` with `searchTerm = %${q}%`.
  - Zero raw SQL interpolation.
- **Catalog Constraints Enforced:**
  - Courses: `co.status = 'published' AND co.deleted_at IS NULL AND c.status = 'active' AND sc.status = 'active'`
  - Categories: `status = 'active' AND deleted_at IS NULL`
  - Subcategories: `sc.status = 'active' AND sc.deleted_at IS NULL AND c.status = 'active'`
- **Scope Note:** In accordance with Section 9.1 of `Course_Platform_Backend_Plan.txt`, search targets published courses, categories, and subcategories. Instructors are not included in `searchCatalog` (they are browsed via `/api/instructors`).

---

### Checklist Item 7: Route Count & Reconciliation

#### A. Reproducible Counting Methodology
To audit the Express router stack deterministically without regex truncation:
Execute:
```powershell
node scratch/inventory_all_routes.js
```
The script inspects every router mounted in `src/app.js` and outputs the registered handlers.

#### B. Exact Route Numbers
- **Total Route Handlers Registered in Express Stack:** **123**
- **Total Unique HTTP Endpoints (Method + Path):** **122**
- **Root Documentation Route:** `GET /api` (1)
- **Functional API Endpoints:** 121

#### C. Reconciliation with Previous 108 Inventory
1. **The Step 10 Typo:** In the previous `COURSE_PLATFORM_BACKEND_MANUAL.md`, the introductory text stated "108 registered endpoints", but the enumerated table actually contained **114 endpoints** (including `/api`). The "108" was an outdated figure from before the final demo conversion and eligibility routes were tabulated.
2. **Step 11 Additions (8 New Endpoints):**
   - 3 Wishlist endpoints: `GET /api/me/wishlist`, `POST /api/courses/:id/wishlist`, `DELETE /api/courses/:id/wishlist`
   - 5 Review endpoints: `POST /api/courses/:id/reviews`, `PATCH /api/me/reviews/:id`, `DELETE /api/me/reviews/:id`, `GET /api/admin/reviews`, `PATCH /api/admin/reviews/:id/moderate`
   *(Note: `GET /api/courses/:id/reviews` and `GET /api/search` were already part of the 114 endpoints).*
3. **The 114 + 8 = 122 Calculation:**
   Adding the 8 new endpoints to the 114 baseline yields exactly **122 unique HTTP endpoints**.
4. **The 123 vs 122 Discrepancy (Shadow Route Finding):**
   - In `src/app.js`:
     - Line 97: `app.use('/api/courses', reviewCourseRoutes)` mounts `GET /:id/reviews`.
     - Line 98: `app.use('/api/courses', coursePublicRoutes)` also mounts `GET /:id/reviews`.
   - Because `reviewCourseRoutes` is mounted first, any request to `GET /api/courses/:id/reviews` is handled by `reviewCourseRoutes`. The identical route in `coursePublicRoutes` is shadowed/dead code.
   - This accounts for the 123rd registered handler.

---

### Checklist Item 8: Test Suite Inspection (Real DB vs Mocks, Concurrency & Rollback)

#### A. Real MariaDB Integration
All tests in [`tests/wishlist_reviews.test.js`](file:///D:/Course_plateform/backend/tests/wishlist_reviews.test.js) use **100% real MariaDB integration**:
- Verifies `SELECT DATABASE()` returns `course_platform_db`.
- Creates real test records in `users`, `categories`, `subcategories`, `courses`, and `course_enrollments`.
- Executes HTTP requests using `supertest(app)`.
- Verifies database effects with direct SQL queries (`SELECT wishlist_count...`, `SELECT rating_avg...`).
- Zero mocks or stubs are used for database operations in `wishlist_reviews.test.js`.

#### B. Concurrency & Rollback Coverage Audit
In accordance with the rule *"Do not claim a scenario is tested unless a corresponding test exists and was executed"*:
- **Tested:**
  - Idempotency via sequential repeat calls (calling add twice, calling delete twice).
  - Data isolation between student accounts.
  - Ownership protection (Student B cannot edit or delete Student A's review).
  - Moderation approval/rejection rating synchronization.
- **NOT Tested:**
  - **Simultaneous Concurrency Stress Tests:** Unlike `tests/enrollments.test.js` (which used `Promise.all` for final-seat race contention), `tests/wishlist_reviews.test.js` does **not** execute parallel `Promise.all` requests.
  - **Simulated Transaction Rollback:** There is no test that forcibly injects a failure mid-transaction to assert rollback behavior.

---

### Checklist Item 9: Migrations and Workspace Safety Boundaries
- **Workspace Isolation:** All work remained exclusively within `D:\Course_plateform\backend\`. Unrelated path `D:\g9expert` was **never accessed, read, or modified**.
- **Dedicated Database:** All queries executed exclusively on `course_platform_db`.
- **Migration Files Clean:**
  `git status -- migrations/` outputs:
  ```
  On branch master
  nothing to commit, working tree clean
  ```
  Migrations `001` through `008` have identical file sizes, hashes, and contents as baseline.
- **Database Tables:** 33 application tables + 1 `schema_migrations` table = 34 tables confirmed intact. No `DROP`, `TRUNCATE`, or destructive schema statements were executed.

---

## 3. Real Commands Executed & Outputs

### Command 1: Database Verification
```powershell
node scripts/verify-db.js
```
**Output:**
```
--- Dedicated MySQL Read-Only Verification ---
Target Host:     localhost:3306
Target User:     root
Target Database: course_platform_db
Password:        [PROTECTED - NOT DISPLAYED]

✅ Connection established successfully.
Verified Database: course_platform_db
MySQL Version:     10.4.32-MariaDB
Default Charset:   utf8mb4
Default Collation: utf8mb4_unicode_ci
Existing Tables:   34
```

### Command 2: Database Schema & Index Verification Test
```powershell
node --test tests/schema.test.js
```
**Output:**
```
# tests 11
# suites 1
# pass 11
# fail 0
# duration_ms 321.5268
```

### Command 3: Step 11 Test Suite
```powershell
node --test tests/wishlist_reviews.test.js
```
**Output:**
```
# tests 33
# suites 7
# pass 33
# fail 0
# duration_ms 1232.3942
```

### Command 4: Full Sequential Regression Suite
```powershell
node scratch/run_all_tests.js
```
**Output:**
```
Starting execution of 13 test files sequentially...

Executing tests/auth.test.js... PASS (1.16s, 22 tests, 7 suites)
Executing tests/catalog.test.js... PASS (1.33s, 36 tests, 6 suites)
Executing tests/course_content.test.js... PASS (1.47s, 36 tests, 9 suites)
Executing tests/demo_classes.test.js... PASS (1.44s, 42 tests, 7 suites)
Executing tests/eligibility.test.js... PASS (1.45s, 35 tests, 9 suites)
Executing tests/enrollments.test.js... PASS (1.46s, 31 tests, 8 suites)
Executing tests/esm-import.test.js... PASS (0.92s, 5 tests, 1 suites)
Executing tests/health.test.js... PASS (0.96s, 8 tests, 1 suites)
Executing tests/schema.test.js... PASS (0.34s, 11 tests, 1 suites)
Executing tests/server-startup.test.js... PASS (0.94s, 1 tests, 1 suites)
Executing tests/uploads_materials.test.js... PASS (1.47s, 40 tests, 7 suites)
Executing tests/utils.test.js... PASS (0.18s, 10 tests, 5 suites)
Executing tests/wishlist_reviews.test.js... PASS (1.19s, 33 tests, 7 suites)

=============================================
ALL 13 TEST FILES PASSED! Total tests: 310, Total suites: 69
```

---

## 4. Unresolved Discrepancies and Residual Risks

| ID | Finding / Risk | Severity | Description | Current Impact |
|---|---|:---:|---|---|
| **D-1** | **Shadowed Review Route** | Low | `GET /api/courses/:id/reviews` is declared in both `src/modules/reviews/review.routes.js` and `src/modules/courses/course.routes.js`. | No functional impact because the reviews router is mounted first in `src/app.js` and handles all requests. However, it creates dead code in `course.routes.js` and inflates handler count to 123. |
| **D-2** | **Moderation Multi-Query Atomicity** | Low | `moderateReviewService` performs status update, rating recalculation, and audit log insert as sequential pool queries rather than inside a single connection transaction. | If database connection drops midway, status could update without rating resync until next review change. |
| **D-3** | **Concurrent Wishlist Duplicate Error Mapping** | Very Low | If two requests from the same user add the same course at the exact same millisecond when no row exists, the second will hit DB `ER_DUP_ENTRY`. It rolls back cleanly, but throws 500 instead of returning `{ alreadyWishlisted: true }`. | Very rare edge case; data integrity is fully preserved by DB unique key and transaction rollback. |

---

## 5. Recommended Fixes (Listed Separately — NOT Applied)

The following improvements are proposed for approval prior to or during Step 12:

1. **Remove Shadowed Route in `course.routes.js`:**
   In [`src/modules/courses/course.routes.js`](file:///D:/Course_plateform/backend/src/modules/courses/course.routes.js#L29), remove `publicRouter.get('/:id/reviews', getCourseReviews)` and its unused controller import `getCourseReviews`. This consolidates review handling entirely inside `src/modules/reviews/review.routes.js` and aligns the router handler count with the unique endpoint count (122).
2. **Catch `ER_DUP_ENTRY` in `addCourseToWishlist`:**
   In [`src/modules/wishlist/wishlist.repository.js`](file:///D:/Course_plateform/backend/src/modules/wishlist/wishlist.repository.js#L55), catch `error.code === 'ER_DUP_ENTRY'` and treat it as `{ alreadyWishlisted: true }`, ensuring 100% idempotent HTTP 200 response even under high-concurrency race conditions.
3. **Transaction-wrap Review Moderation:**
   In [`src/modules/reviews/review.service.js`](file:///D:/Course_plateform/backend/src/modules/reviews/review.service.js#L114), obtain a dedicated connection and wrap `updateReviewModeration` and `recalculateCourseRating` in `beginTransaction()` / `commit()` / `rollback()` to guarantee atomicity.
4. **Staff Wishlist Policy Clarification:**
   If business rules dictate that staff accounts (`counsellor`, `admin`, `super_admin`) must not be permitted to bookmark courses, mount `authorize('user')` on `wishlistCourseRoutes` and `wishlistStudentRoutes`. If staff are permitted to bookmark courses, keep the current `authenticate` pattern.

---

## 6. Audit Conclusion & Stop Condition

- **Section 19.4 Step 11 Implementation:** Fully Verified, Sound, and Complete.
- **Regression Suite:** 310 tests passed, 0 failures across 13 test files.
- **Safety Boundaries:** Strictly respected throughout.
- **Mandatory Stop Condition:** This audit is complete. Awaiting explicit user approval before proceeding to Section 19.4 Step 12 (Views, Analytics, Dashboard & Cron).
