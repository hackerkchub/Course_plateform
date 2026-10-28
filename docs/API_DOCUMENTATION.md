# Course Platform Backend — Complete API Reference

**Base URL:** `http://localhost:5000/api`  
**Protocol:** REST over HTTP/1.1 or HTTP/2  
**Format:** JSON (`Content-Type: application/json` unless multipart/form-data for uploads)  
**Standard Response Wrapper:**
```json
{
  "success": true,
  "message": "Human readable status message",
  "data": {}
}
```
**Standard Paginated Response Wrapper:**
```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "total_pages": 5
  }
}
```
**Standard Error Response Wrapper:**
```json
{
  "success": false,
  "message": "Error description",
  "errors": [
    { "field": "email", "message": "Invalid email address" }
  ]
}
```

---

## 1. Authentication & Session Management

### 1.1 Google Sign-In
- **Endpoint:** `POST /api/auth/google`
- **Access:** Public
- **Request Body:**
  ```json
  { "id_token": "eyJhbGciOiJSUzI1NiIs..." }
  ```
- **Response (`200 OK`):**
  - Sets `httpOnly`, `secure`, `sameSite: 'strict'` cookie `access_token` (15m).
  - Sets `httpOnly`, `secure`, `sameSite: 'strict'` cookie `refresh_token` (30d).
  - Returns user profile:
    ```json
    {
      "success": true,
      "message": "Login successful",
      "data": {
        "user": {
          "id": 1,
          "name": "Amit Kumar",
          "email": "amit@example.com",
          "role": "user",
          "avatar_url": "https://..."
        }
      }
    }
    ```

### 1.2 Rotate Refresh Token
- **Endpoint:** `POST /api/auth/refresh`
- **Access:** Public (Requires valid `refresh_token` cookie)
- **Response (`200 OK`):**
  - Rotates refresh token in database (hashes token, revokes previous token).
  - Sets fresh `access_token` and `refresh_token` cookies.
  - Automatically triggers replay detection if an already-revoked refresh token is presented, revoking all sessions for that user.

### 1.3 User Logout
- **Endpoint:** `POST /api/auth/logout`
- **Access:** Authenticated
- **Response (`200 OK`):**
  - Marks current refresh token as `revoked_at = NOW()`.
  - Clears `access_token` and `refresh_token` cookies.

### 1.4 Get Current User Profile
- **Endpoint:** `GET /api/auth/me`
- **Access:** Authenticated (`user`, `counsellor`, `admin`, `super_admin`)
- **Response (`200 OK`):** Returns authenticated user's ID, name, email, avatar, role, and status.

---

## 2. Catalog & Course Management

### 2.1 Public Catalog Endpoints
| Method | Route | Description |
|---|---|---|
| `GET` | `/api/categories` | List active categories with course counts. |
| `GET` | `/api/categories/:catSlug/subcategories` | List active subcategories under category. |
| `GET` | `/api/courses` | Search, filter, and paginate published courses (`search`, `category`, `level`, `price_min`, `price_max`, `sort`, `page`, `limit`). |
| `GET` | `/api/courses/:slug` | Retrieve complete published course details including curriculum, batches, instructors, SEO, pricing, active offers, benefits, and FAQs. Increments view counter. |
| `POST` | `/api/courses/:slug/views` | Record course page view (rate limited to 60/min/IP). |

### 2.2 Admin Course Management
| Method | Route | Access | Description |
|---|---|---|---|
| `POST` | `/api/admin/categories` | `admin`, `super_admin` | Create new category. |
| `PUT` | `/api/admin/categories/:id` | `admin`, `super_admin` | Update existing category. |
| `DELETE` | `/api/admin/categories/:id` | `admin`, `super_admin` | Soft delete category (rejected with 409 if active courses/subcategories exist). |
| `POST` | `/api/admin/subcategories` | `admin`, `super_admin` | Create subcategory under category. |
| `PUT` | `/api/admin/subcategories/:id` | `admin`, `super_admin` | Update subcategory. |
| `DELETE` | `/api/admin/subcategories/:id` | `admin`, `super_admin` | Soft delete subcategory (rejected with 409 if active courses exist). |
| `POST` | `/api/admin/courses` | `admin`, `super_admin` | Create draft course. Subcategory required; auto-assigns parent category. |
| `PUT` | `/api/admin/courses/:id` | `admin`, `super_admin` | Update course core details. |
| `PATCH` | `/api/admin/courses/:id/status` | `admin`, `super_admin` | Publish or archive course. Enforces mandatory pre-publish validation. |
| `DELETE` | `/api/admin/courses/:id` | `admin`, `super_admin` | Soft delete course and log audit record. |

---

## 3. Curriculum, Batches & Content

| Method | Route | Access | Description |
|---|---|---|---|
| `POST` | `/api/admin/courses/:id/modules` | `admin`, `super_admin` | Create curriculum module. |
| `PUT` | `/api/admin/modules/:id` | `admin`, `super_admin` | Update curriculum module. |
| `DELETE` | `/api/admin/modules/:id` | `admin`, `super_admin` | Delete module (cascades or blocks lessons). |
| `POST` | `/api/admin/modules/:id/lessons` | `admin`, `super_admin` | Create lesson within module. |
| `PUT` | `/api/admin/lessons/:id` | `admin`, `super_admin` | Update lesson details, video URL, duration, preview status. |
| `DELETE` | `/api/admin/lessons/:id` | `admin`, `super_admin` | Delete lesson. |
| `GET` | `/api/courses/:id/batches` | Public | List upcoming enrollment batches for course. |
| `POST` | `/api/admin/courses/:id/batches` | `admin`, `super_admin` | Create course batch with seat limits and date window. |
| `PUT` | `/api/admin/batches/:id` | `admin`, `super_admin` | Update batch details, seats, or schedule. |
| `PATCH` | `/api/admin/batches/:id/status` | `admin`, `super_admin` | Update batch status (`upcoming`, `ongoing`, `completed`, `cancelled`). |

---

## 4. Uploads & Study Materials

| Method | Route | Access | Description |
|---|---|---|---|
| `POST` | `/api/admin/uploads` | `admin`, `super_admin` | Upload image or document. Validates magic bytes, enforces size limit, assigns UUID filename. |
| `GET` | `/files/public/:filename` | Public | Direct static access to public course assets (thumbnails, banners). |
| `GET` | `/api/courses/:id/materials` | Public / User | List course study materials. Unenrolled users see preview materials; enrolled students and admins receive signed download URLs. |
| `POST` | `/api/admin/courses/:id/materials` | `admin`, `super_admin` | Attach uploaded material to course with access level (`public_preview`, `enrolled_only`). |
| `PATCH` | `/api/admin/materials/:id` | `admin`, `super_admin` | Update material metadata. |
| `DELETE` | `/api/admin/materials/:id` | `admin`, `super_admin` | Remove material and delete private file from disk. |
| `GET` | `/api/courses/:id/materials/:materialId/download` | Public / User | Stream file download. Requires active enrollment or cryptographically verified `token` query param. |

---

## 5. Demo Classes & Free Trials

| Method | Route | Access | Description |
|---|---|---|---|
| `GET` | `/api/courses/:id/demo-settings` | Public | Public demo configuration, form fields, and available slots. |
| `POST` | `/api/courses/:id/demo-requests` | Authenticated | Submit demo booking request. Validates capacity, honeypot, active duplicate check, and logs activity within a database transaction. |
| `GET` | `/api/me/demo-requests` | Authenticated | List personal demo requests and meeting links. |
| `PATCH` | `/api/me/demo-requests/:id/cancel` | Authenticated | Cancel personal pending demo request. |
| `GET` | `/api/admin/demo-requests` | `counsellor`, `admin`, `super_admin` | Staff leads table with filtering, search, and pagination. |
| `GET` | `/api/admin/courses/:id/demo-requests` | `counsellor`, `admin`, `super_admin` | List leads for specific course. |
| `GET` | `/api/admin/demo-requests/:id` | `counsellor`, `admin`, `super_admin` | Full lead detail with activity log history. |
| `PATCH` | `/api/admin/demo-requests/:id` | `counsellor`, `admin`, `super_admin` | Update lead status (`pending` → `contacted` → `scheduled` → `completed`/`cancelled`) and schedule time. |
| `POST` | `/api/admin/demo-requests/:id/notes` | `counsellor`, `admin`, `super_admin` | Append follow-up note to lead. |
| `POST` | `/api/admin/demo-requests/:id/convert` | `admin`, `super_admin` | Transactionally convert lead to active course enrollment. |
| `GET` | `/api/admin/demo-requests/export` | `admin`, `super_admin` | Stream RFC 4180 CSV export with formula injection neutralization. |
| `DELETE` | `/api/admin/demo-requests/:id` | `admin`, `super_admin` | Soft delete lead record and write audit log. |

---

## 6. Course Eligibility Subsystem

| Method | Route | Access | Description |
|---|---|---|---|
| `GET` | `/api/courses/:id/eligibility` | Public | Public criteria requirements and questions. Cleanses `correct_answers` from custom questions. |
| `POST` | `/api/courses/:id/eligibility-checks` | Authenticated | Submit answers for server-side evaluation. Evaluates qualification level, percentage, stream, age boundaries, experience, and custom questions. Persists check attempt. |
| `GET` | `/api/me/courses/:id/eligibility-result` | Authenticated | Retrieve student's personal latest evaluation result. Strictly isolated to `req.user.id`. |
| `GET` | `/api/admin/courses/:id/eligibility-rules` | `admin`, `super_admin` | Fetch course eligibility configuration including answer keys. |
| `PUT` | `/api/admin/courses/:id/eligibility-rules` | `admin`, `super_admin` | Upsert eligibility criteria with age boundary verification (`max >= min`) and audit logging. |
| `GET` | `/api/admin/courses/:id/eligibility-checks` | `counsellor`, `admin`, `super_admin` | View paginated student check attempts with name, email, avatar, and result filter (`eligible`/`not_eligible`). Excludes passwords, tokens, and Google IDs. |

---

## 7. Course Enrollments & Lesson Progress (Section 15.1 & 18.5)

### 7.1 Student Self-Enrollment (Free Courses Only)
- **Endpoint:** `POST /api/courses/:id/enroll`
- **Access:** Authenticated (`user`, `counsellor`, `admin`, `super_admin`)
- **Headers:** `Cookie: access_token=...` or `Authorization: Bearer <token>`
- **Request Body (Optional):**
  ```json
  {
    "batch_id": 12
  }
  ```
- **Business Logic & Server-Side Enforcement:**
  1. Authenticated user identity is resolved strictly from `req.user.id`.
  2. Course must exist, be `published`, and not soft-deleted.
  3. Course must be free (`is_free = true` and `price = 0`). Paid courses reject self-enrollment with `400 Bad Request`.
  4. Course enrollment window (`enrollment_start_at` and `enrollment_end_at`) must be open.
  5. Overall course `enrollment_limit` must not be reached.
  6. If `batch_id` is specified, verifies batch belongs to the course, is open (`status = 'open'`), and has available seats (`seats_available > 0`). Decrements `seats_available` atomically within transaction.
  7. If `course_eligibility_rules.eligibility_enabled = true`, checks user's latest check from `eligibility_checks`. Rejects with `400` if check missing or `result !== 'eligible'`. Ignores client-supplied flags.
  8. Prevents duplicate enrollment under `SELECT FOR UPDATE` lock (returns `409 Conflict`).
  9. Increments `courses.enrollment_count` atomically.
  10. Computes access duration expiration from `course_benefits` if not lifetime access.
- **Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Enrolled successfully",
    "data": {
      "enrollment_id": 45,
      "course_id": 10,
      "batch_id": 12,
      "status": "active",
      "access_expires_at": null,
      "progress_percentage": 0
    }
  }
  ```

### 7.2 Student My Courses
- **Endpoint:** `GET /api/me/enrollments`
- **Access:** Authenticated (`user`, `counsellor`, `admin`, `super_admin`)
- **Query Params (Optional):** `status` (`active`, `completed`, `cancelled`, `expired`), `page`, `limit`
- **Enforcement:** Strictly scoped to `req.user.id`.
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 45,
        "course_id": 10,
        "course_name": "Modern Fullstack JavaScript",
        "slug": "modern-fullstack-javascript",
        "thumbnail_url": "https://...",
        "batch_id": 12,
        "batch_name": "Batch Alpha",
        "enrollment_status": "active",
        "enrollment_source": "free",
        "enrolled_at": "2026-10-27T08:00:00.000Z",
        "access_expires_at": null,
        "completed_at": null,
        "progress_percentage": 50,
        "last_lesson_id": 101
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "total_pages": 1
    }
  }
  ```

### 7.3 Enrolled Course Curriculum & Lesson Video Access
- **Endpoint:** `GET /api/me/courses/:id/curriculum`
- **Access:** Authenticated Enrolled Student
- **Enforcement:**
  - Rejects unenrolled users with `403 Forbidden` (`NOT_ENROLLED`).
  - Rejects cancelled or expired enrollments with `403 Forbidden`.
  - Exposes unmasked `content_url` (private video/stream URLs) and student's lesson completion state only to authorized enrolled students.
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": {
      "course_id": 10,
      "enrollment": {
        "id": 45,
        "status": "active",
        "access_expires_at": null
      },
      "modules": [
        {
          "id": 1,
          "title": "Module 1: Getting Started",
          "display_order": 1,
          "lessons": [
            {
              "id": 101,
              "title": "Lesson 1: Introduction",
              "lesson_type": "video",
              "content_url": "https://video.example.com/stream/l1.mp4",
              "duration_seconds": 600,
              "is_preview": false,
              "display_order": 1,
              "completed": true,
              "last_position_seconds": 600
            }
          ]
        }
      ]
    }
  }
  ```

### 7.4 Record Lesson Progress
- **Endpoint:** `POST /api/me/lessons/:lessonId/progress`
- **Access:** Authenticated Enrolled Student
- **Request Body:**
  ```json
  {
    "completed": true,
    "last_position_seconds": 450
  }
  ```
- **Business Logic & Auto-Completion:**
  1. Validates lesson existence and published status.
  2. Verifies student is enrolled in the lesson's parent course with active or completed status. Unenrolled users receive `403 Forbidden`.
  3. Upserts `lesson_progress` row under `(user_id, lesson_id)` UNIQUE constraint.
  4. Auto-completion evaluation: If `completed = true`, checks total published lessons in course. If all published lessons are completed, automatically sets `course_enrollments.enrollment_status = 'completed'` and `completed_at = NOW()`.
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Lesson progress saved",
    "data": {
      "lesson_id": 101,
      "completed": true,
      "last_position_seconds": 450,
      "course_completed": false
    }
  }
  ```

### 7.5 Admin Enrollment Management Endpoints
| Method | Route | Access | Description |
|---|---|---|---|
| `GET` | `/api/admin/enrollments` | `admin`, `super_admin` | Paginated listing of enrollments with student profile (`name`, `email`, `phone`), course, batch, enrolled_by, source, and status. Filters: `course_id`, `user_id`, `status`, `source`, `from_date`, `to_date`, `search`. |
| `POST` | `/api/admin/enrollments` | `admin`, `super_admin` | Manual administrative enrollment. Bypasses self-enrollment free/eligibility constraints, validates user and course, verifies batch seats, decrements seats, writes audit log (`enrollment.admin_create`). |
| `PATCH` | `/api/admin/enrollments/:id` | `admin`, `super_admin` | Administrative update of enrollment. Supports changing `enrollment_status` (`active`, `completed`, `cancelled`, `expired`), reallocating `batch_id` (returns seat to old batch, decrements from new batch), extending `access_expires_at`, updating `notes`. Writes audit log (`enrollment.admin_update`). |

---

## 8. Wishlist Subsystem (Section 15.2)

### 8.1 Add Course to Wishlist
- **Endpoint:** `POST /api/courses/:id/wishlist`
- **Access:** Authenticated (`user`, `counsellor`, `admin`, `super_admin`)
- **Path Parameters:** `id` (Course ID, integer)
- **Business Logic:**
  1. Validates course existence and `status = 'published'`. Unpublished courses return `400 Bad Request`.
  2. Idempotency: If course is already wishlisted by student, returns `200 OK` without error; counter is not incremented.
  3. If not already wishlisted, inserts row into `wishlists` and atomically increments `courses.wishlist_count`.
- **Response (`201 Created` / `200 OK`):**
  ```json
  {
    "success": true,
    "message": "Course added to wishlist successfully",
    "data": {
      "course_id": 10,
      "wishlisted": true,
      "already_wishlisted": false
    }
  }
  ```

### 8.2 Remove Course from Wishlist
- **Endpoint:** `DELETE /api/courses/:id/wishlist`
- **Access:** Authenticated (`user`, `counsellor`, `admin`, `super_admin`)
- **Path Parameters:** `id` (Course ID, integer)
- **Business Logic:**
  1. If present in wishlist, deletes row and decrements `courses.wishlist_count` using `GREATEST(wishlist_count - 1, 0)`.
  2. Idempotency: If not present, returns `200 OK` without error. Counter remains untouched (never negative).
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Course removed from wishlist successfully",
    "data": {
      "course_id": 10,
      "wishlisted": false,
      "removed": true
    }
  }
  ```

### 8.3 Get Personal Wishlist
- **Endpoint:** `GET /api/me/wishlist`
- **Access:** Authenticated (`user`, `counsellor`, `admin`, `super_admin`)
- **Query Parameters:** `page` (default 1), `limit` (default 12)
- **Business Logic:**
  - Returns paginated course cards wishlisted by authenticated user (`req.user.id`).
  - Enforces strict user isolation.
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 10,
        "course_name": "Full Stack React & Node.js",
        "slug": "full-stack-react-nodejs",
        "url": "/courses/development/web-dev/full-stack-react-nodejs",
        "thumbnail_url": "/files/courses/thumb-10.png",
        "price": 4999.00,
        "offer_price": 2999.00,
        "is_free": false,
        "course_level": "intermediate",
        "mode": "online",
        "duration_hours": 45.0,
        "rating_avg": 4.80,
        "rating_count": 124,
        "wishlisted": true,
        "wishlisted_at": "2026-10-27T16:00:00.000Z",
        "instructor": {
          "id": 2,
          "name": "Rajesh Sharma",
          "photo_url": "/files/instructors/rajesh.png"
        }
      }
    ],
    "pagination": { "page": 1, "limit": 12, "total": 1, "total_pages": 1 }
  }
  ```

---

## 9. Course Reviews & Moderation Subsystem (Section 15.3)

### 9.1 Public Course Reviews
- **Endpoint:** `GET /api/courses/:id/reviews`
- **Access:** Public (Unauthenticated)
- **Query Parameters:** `page` (default 1), `limit` (default 10), `sort` (`newest`, `rating_high`, `rating_low`)
- **Privacy & Security:**
  - Returns ONLY reviews with `moderation_status = 'approved'`.
  - Scrubs student personal contact details: `email` and `phone` are **never** exposed.
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "data": [
      {
        "id": 55,
        "user_name": "Amit Kumar",
        "avatar_url": "https://lh3.googleusercontent.com/...",
        "rating": 5,
        "title": "Exceptional curriculum and hands-on projects",
        "text": "The course content was structured logically and the instructor provided timely feedback.",
        "is_verified_enrollment": true,
        "created_at": "2026-10-27T16:15:00.000Z"
      }
    ],
    "pagination": { "page": 1, "limit": 10, "total": 1, "total_pages": 1 }
  }
  ```

### 9.2 Submit Course Review
- **Endpoint:** `POST /api/courses/:id/reviews`
- **Access:** Authenticated Enrolled Student (`user`, `counsellor`, `admin`, `super_admin`)
- **Request Body:**
  ```json
  {
    "rating": 5,
    "title": "Comprehensive and clear",
    "text": "Loved the practical assignments and mentoring sessions."
  }
  ```
- **Business Conditions:**
  1. **Course Status:** Course must be `published`.
  2. **Verified Enrollment Required:** Student must possess an active or completed enrollment in the course (`course_enrollments`). Non-enrolled users receive `403 Forbidden` (*"Only enrolled students can review this course"*).
  3. **Single Review Constraint:** Only one review per user per course. Duplicate submissions receive `409 Conflict` (*"You have already reviewed this course"*).
  4. **Initial Moderation Status:** Created with `moderation_status = 'pending'` and `is_verified_enrollment = true`.
  5. Pending reviews are excluded from public course listings and do not affect course rating counters until approved.
- **Response (`201 Created`):**
  ```json
  {
    "success": true,
    "message": "Review submitted successfully and is awaiting moderation",
    "data": {
      "id": 55,
      "course_id": 10,
      "rating": 5,
      "moderation_status": "pending"
    }
  }
  ```

### 9.3 Edit Personal Review
- **Endpoint:** `PATCH /api/me/reviews/:id`
- **Access:** Authenticated Student (Review Owner)
- **Request Body:** `{ "rating"?: int (1-5), "title"?: string (max 150), "text"?: string (max 2000) }`
- **Re-moderation Invariant:**
  - Verifies review ownership (`user_id = req.user.id`).
  - Automatically reverts `moderation_status` to `'pending'`.
  - If the review was previously `'approved'`, dynamically recalculates `courses.rating_avg` and `courses.rating_count`, removing it from public aggregate statistics until re-approved.
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Review updated and resubmitted for moderation",
    "data": {
      "id": 55,
      "moderation_status": "pending"
    }
  }
  ```

### 9.4 Delete Personal Review
- **Endpoint:** `DELETE /api/me/reviews/:id`
- **Access:** Authenticated Student (Review Owner)
- **Business Logic:**
  - Verifies review ownership (`user_id = req.user.id`).
  - Deletes row from `course_reviews`.
  - If review was previously `'approved'`, dynamically recalculates `courses.rating_avg` and `courses.rating_count`.
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "message": "Review deleted successfully"
  }
  ```

### 9.5 Admin Review Management & Moderation
| Method | Route | Access | Description |
|---|---|---|---|
| `GET` | `/api/admin/reviews` | `admin`, `super_admin` | Lists reviews with course name, student identity (`id`, `name`, `email`), `rating`, `title`, `text`, `moderation_status`, `is_verified_enrollment`. Filters: `moderation_status`, `course_id`, `rating`, `sort`, `page`, `limit`. |
| `PATCH` | `/api/admin/reviews/:id/moderate` | `admin`, `super_admin` | Approves or rejects review (`{ "moderation_status": "approved" \| "rejected", "reason": "optional note" }`). **Dynamically recalculates `courses.rating_avg` and `courses.rating_count`** from all approved reviews for the course. Records audit log `review.moderate`. |


