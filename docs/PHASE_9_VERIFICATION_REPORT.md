# Phase 9 Verification Report — Course Eligibility Management & Evaluation Subsystem

**Project Root:** `D:\Course_plateform\backend\`  
**Authoritative Specification:** `D:\Course_plateform\Course_Platform_Backend_Plan.txt`  
**Database:** `course_platform_db` (MariaDB 10.4.32 on localhost:3306)  
**Date:** 2026-10-26  
**Status:** **AUDITED & FULLY PASSING (35/35 Phase 9 Tests, 242/242 Full Regression Suite Tests)**

---

## 1. Phase 9 Objective and Authoritative References

### Objective
Implement the complete **Course Eligibility Management & Evaluation Subsystem** (Phase 9), enabling course administrators to configure eligibility criteria (minimum qualification hierarchy, percentage threshold, eligible stream whitelists, age boundaries, experience requirements, and custom evaluation questions), while allowing prospective students to view public form rules without leaking answers, submit answers for server-side evaluation, retrieve personal latest eligibility results, and permitting authorized staff to inspect paginated student attempt records.

### Authoritative Specification References
- **Section 3: Roles aur access matrix**:
  - Explicitly specifies that for *"Eligibility check, wishlist, review"*, access is:
    - `guest`: **Nahi** (Blocked, 401 Unauthorized)
    - `user`: **Haan** (Allowed)
    - `counsellor`: **Haan** (Allowed)
    - `admin`: **Haan** (Allowed)
    - `super_admin`: **Haan** (Allowed)
- **Section 14: Eligibility APIs**:
  - `GET /api/courses/:id/eligibility` (Public — form rules & questions, sensitive evaluation logic scrubbed).
  - `POST /api/courses/:id/eligibility-checks` (User/Student — submit answers, evaluate criteria, record check).
  - `GET /api/me/courses/:id/eligibility-result` (User/Student — personal latest check result).
  - `GET /api/admin/courses/:id/eligibility-rules` (Admin — fetch course eligibility configuration).
  - `PUT /api/admin/courses/:id/eligibility-rules` (Admin — upsert course eligibility configuration, audit log).
  - `GET /api/admin/courses/:id/eligibility-checks` (Admin/Staff — student checks with name/email and pagination).
- **Section 14.1 Admin: rules**:
  - Field specifications: `eligibility_enabled`, `minimum_qualification` (`any`, `10th`, `12th`, `diploma`, `graduate`, `post_graduate`), `minimum_percentage` (0–100), `eligible_streams` (array of strings, e.g. `["Any"]` or `["CS", "IT"]`), `minimum_age` & `maximum_age` (`max >= min`), `required_skills`, `experience_required` (`fresher_allowed`, `experience_required`), `custom_questions` (`{key, question, field_type, options, required, correct_answers}`), and `disclaimer`.
- **Section 14.2 Student: check**:
  - Server-side rule evaluation: qualification hierarchy order (`10th` < `12th` < `diploma` < `graduate` < `post_graduate`), percentage comparison, stream whitelist matching, age boundary verification, experience validation, custom question evaluation.
  - Multi-rule failure reporting: returns `not_eligible` and array of `failed_rules` with user-friendly guidance message.
  - Check attempt persistence: records every evaluation attempt in `eligibility_checks` table with timestamp and answers payload.
- **Section 18.4 Eligibility check workflow**:
  - Student sends answers; backend pulls rules from database, evaluates server-side, saves attempt, returns result.
- **Section 19.4 Build order Step 9**:
  - "Eligibility -> Check form".

---

## 2. Specification Discrepancies & Final Audit Resolutions

### 2.1 Role Access for `POST /api/courses/:id/eligibility-checks`
- **Initial Observation:** Section 14 table listed `user` in the Access column, whereas Section 3 Roles Matrix listed `user: Haan`, `counsellor: Haan`, `admin: Haan`, `super_admin: Haan` for "Eligibility check, wishlist, review".
- **Authoritative Resolution:** In Section 14, the label "user" denotes an authenticated user/student context (as opposed to "Public" or "admin"). In the authoritative Section 3 Access Matrix, all authenticated roles (`user`, `counsellor`, `admin`, `super_admin`) have permission to check eligibility, while unauthenticated `guest` requests are forbidden. Therefore, mounting the route with `authenticate` middleware (which accepts any valid authenticated session and rejects unauthenticated guests with `401 Unauthorized`) strictly satisfies both Section 3 and Section 14.

### 2.2 Nature of `required_skills`
- **Initial Observation:** `required_skills` is an array of strings in `course_eligibility_rules` (e.g., `["Basic computer knowledge"]`), but Section 14.2 Student Check answers payload `{ qualification, percentage, stream, age, experience, ...custom question key: value }` does not include a skills field.
- **Authoritative Resolution:** Per Section 14 intro (`course_points (required skills)`) and 14.1, `required_skills` is **informational criteria** exposed on the public eligibility form (`GET /api/courses/:id/eligibility`) and course points. It is not scored as a pass/fail criterion unless the admin explicitly defines a custom evaluation question with `correct_answers`.

### 2.3 Behavior of `minimum_qualification: "any"`
- **Authoritative Resolution:** When `minimum_qualification` is `"any"` (or null/unspecified), the qualification evaluation check is bypassed. Applicants with `10th`, `diploma`, or omitted qualification pass without flagging `minimum_qualification`. If a specific qualification is required (e.g. `graduate`), a student answering `"any"` or a lower level fails.

### 2.4 Behavior of Disabled Eligibility Rules
- **Authoritative Resolution:** When `eligibility_enabled: false` (or no rules record exists), student checks still strictly require authentication (`401`), validate request body schema (`400`), and check course published status and existence (`404`). Once authorized, the check returns `eligible: true`, `result: "eligible"`, `failed_rules: []`, and records the attempt in `eligibility_checks`.

### 2.5 Multi-Rule Evaluation & Age Boundary Precision
- **Authoritative Resolution:** Every configured rule is evaluated. If multiple criteria fail, all are reported in `failed_rules`. Age check logic was refined so that when age is missing or non-numeric, it cleanly reports `minimum_age` (or `maximum_age` if only max is set) without emitting duplicate contradictory messages.

### 2.6 Answer Key Sanitization on Public Endpoints
- **Authoritative Resolution:** `GET /api/courses/:id/eligibility` safely strips `correct_answers` and `correct_answer` from every question object in `custom_questions`, preventing cheating via browser developer tools or network inspection.

### 2.7 Strict Personal Result Isolation
- **Authoritative Resolution:** `GET /api/me/courses/:id/eligibility-result` queries `WHERE user_id = ? AND course_id = ?` using the authenticated `req.user.id`. Distinct users cannot access or view other students' eligibility results. Staff roles (`counsellor`, `admin`, `super_admin`) also receive only their own check results (or `{ has_checked: false }` if they have not submitted a check).

### 2.8 Staff Permissions & Sensitive Data Protection
- **Authoritative Resolution:** `GET /api/admin/courses/:id/eligibility-checks` permits `counsellor`, `admin`, and `super_admin` while returning `403 Forbidden` for students (`user`) and `401 Unauthorized` for unauthenticated guests. The query joins `users` for `student_name`, `student_email`, and `student_avatar_url`, and strictly excludes password hashes, tokens, or Google IDs.

### 2.9 Comprehensive Five-Role Matrix Verification Table

| Route / Action | `guest` | `user` | `counsellor` | `admin` | `super_admin` | Spec Authorization Basis |
|---|---|---|---|---|---|---|
| `GET /api/courses/:id/eligibility` | **200 OK** | **200 OK** | **200 OK** | **200 OK** | **200 OK** | Section 14: Public endpoint, answer keys scrubbed. |
| `POST /api/courses/:id/eligibility-checks` | **401 Unauthorized** | **201 Created** | **201 Created** | **201 Created** | **201 Created** | Section 3 Matrix: Eligibility check permitted for all authenticated roles. |
| `GET /api/me/courses/:id/eligibility-result` | **401 Unauthorized** | **200 OK** (own) | **200 OK** (own) | **200 OK** (own) | **200 OK** (own) | Section 14: Personal result, strictly scoped to `req.user.id`. |
| `GET /api/admin/courses/:id/eligibility-rules` | **401 Unauthorized** | **403 Forbidden** | **403 Forbidden** | **200 OK** | **200 OK** | Section 3 & 14: Admin/super_admin only. |
| `PUT /api/admin/courses/:id/eligibility-rules` | **401 Unauthorized** | **403 Forbidden** | **403 Forbidden** | **200 OK** | **200 OK** | Section 3 & 14: Admin/super_admin only. |
| `GET /api/admin/courses/:id/eligibility-checks` | **401 Unauthorized** | **403 Forbidden** | **200 OK** | **200 OK** | **200 OK** | Section 3: Staff leads inspection (counsellor, admin, super_admin). |

---

## 3. Requirement-by-Requirement Implementation Checklist

| Spec Section | Feature / Requirement | Implementation Details | Status |
|---|---|---|---|
| **14.0** | Server-side calculation only | Evaluation is strictly executed on the server in `eligibility.service.js`. No criteria logic is evaluated on the client. | **VERIFIED** |
| **14.0** | Public form rules & questions | `GET /api/courses/:id/eligibility` returns criteria fields and questions for published courses. Returns default open rules when unconfigured. | **VERIFIED** |
| **14.0** | Sensitive answer sanitization | `correct_answers` are scrubbed from custom questions on the public endpoint to prevent network inspection leakage. | **VERIFIED** |
| **14.1** | Admin rules retrieval | `GET /api/admin/courses/:id/eligibility-rules` allows `admin` and `super_admin` to view full configuration including `correct_answers`. | **VERIFIED** |
| **14.1** | Admin rules upsert | `PUT /api/admin/courses/:id/eligibility-rules` validates payload with Zod, validates age boundaries (`maximum_age >= minimum_age`), upserts in `course_eligibility_rules`, and logs audit trail. | **VERIFIED** |
| **14.2** | Student check submission | `POST /api/courses/:id/eligibility-checks` requires authentication, evaluates all rules, records attempt in `eligibility_checks`, returns `eligible: true/false`, `failed_rules`, and friendly message. | **VERIFIED** |
| **14.2** | Qualification level hierarchy | Hierarchy `10th` (1) < `12th` (2) < `diploma` (3) < `graduate` (4) < `post_graduate` (5) accurately enforced. Equal or higher passes; lower fails. | **VERIFIED** |
| **14.2** | Minimum percentage comparison | Percentage compared against `minimum_percentage` (0–100). Fails with `minimum_percentage` when below threshold. | **VERIFIED** |
| **14.2** | Stream whitelist matching | Matches case-insensitive stream names against `eligible_streams`. Auto-passes if `["Any"]` or `["all"]` is specified. | **VERIFIED** |
| **14.2** | Age range boundary checks | Validates student age against `minimum_age` and `maximum_age`. Accurately flags `minimum_age` or `maximum_age` failures. | **VERIFIED** |
| **14.2** | Experience requirement | When `experience_required` is configured, fails if student answers fresher, none, 0, or empty. Passes when `fresher_allowed`. | **VERIFIED** |
| **14.2** | Custom question criteria | Evaluates required custom questions and compares student responses against configured `correct_answers`. | **VERIFIED** |
| **14.2** | Multi-rule failure reporting | When multiple criteria fail, all failed rules are collected in `failed_rules` array (e.g. `["minimum_qualification", "minimum_percentage"]`). | **VERIFIED** |
| **14.2** | Student latest check result | `GET /api/me/courses/:id/eligibility-result` fetches student's latest evaluation attempt. Returns `{ has_checked: false }` if never checked. | **VERIFIED** |
| **14.0** | Admin student check inspection | `GET /api/admin/courses/:id/eligibility-checks` returns paginated student attempts with student's name, email, avatar, answers, result, and timestamp. | **VERIFIED** |
| **14.0** | Admin check filtering | Supports filtering checks by result (`?result=eligible` or `?result=not_eligible`) and pagination (`page`, `limit`). | **VERIFIED** |

---

## 4. Files Created and Modified

### Created Modules
1. [`src/modules/eligibility/eligibility.validation.js`](file:///D:/Course_plateform/backend/src/modules/eligibility/eligibility.validation.js):
   - Zod validation schemas for rule updates (`updateEligibilityRulesSchema` with age boundary refinement), student checks (`submitEligibilityCheckSchema`), and admin query parameters (`listEligibilityChecksQuerySchema`).
2. [`src/modules/eligibility/eligibility.repository.js`](file:///D:/Course_plateform/backend/src/modules/eligibility/eligibility.repository.js):
   - Parameterized SQL database operations for `course_eligibility_rules` (fetch, `INSERT ... ON DUPLICATE KEY UPDATE`), `eligibility_checks` (insert attempt, fetch latest student check, fetch filtered and paginated checks with `LEFT JOIN users`).
3. [`src/modules/eligibility/eligibility.service.js`](file:///D:/Course_plateform/backend/src/modules/eligibility/eligibility.service.js):
   - Core server-side evaluation engine (`evaluateEligibilityRules`), public criteria sanitizer, check recorder, and audit logger.
4. [`src/modules/eligibility/eligibility.controller.js`](file:///D:/Course_plateform/backend/src/modules/eligibility/eligibility.controller.js):
   - Express controllers implementing standard response format using `sendSuccess`, `sendPaginated`, and `sendError`.
5. [`src/modules/eligibility/eligibility.routes.js`](file:///D:/Course_plateform/backend/src/modules/eligibility/eligibility.routes.js):
   - Route declarations for public (`courseEligibilityRoutes`), student (`meEligibilityRoutes`), and staff (`adminCourseEligibilityRoutes`) with authentication and role-based authorization.
6. [`tests/eligibility.test.js`](file:///D:/Course_plateform/backend/tests/eligibility.test.js):
   - 35 automated test cases testing public requirements, answer stripping, validation boundaries, rule evaluation engine, student checks, personal latest results, staff inspection, filtering, pagination, exhaustive five-role matrices, and privacy guards.

### Modified Files
1. [`src/app.js`](file:///D:/Course_plateform/backend/src/app.js):
   - Mounted `courseEligibilityRoutes` on `/api/courses`.
   - Mounted `meEligibilityRoutes` on `/api/me`.
   - Mounted `adminCourseEligibilityRoutes` on `/api/admin/courses`.

---

## 5. Endpoints, Validations, and Permissions

| Method | Endpoint | Auth | Allowed Roles | Description | Response Status |
|---|---|---|---|---|---|
| `GET` | `/api/courses/:id/eligibility` | Public | All (including Guests) | Fetch eligibility form rules & questions (scrubs `correct_answers`). | `200 OK` (or `404 Not Found`) |
| `POST` | `/api/courses/:id/eligibility-checks` | Authenticated | `user`, `counsellor`, `admin`, `super_admin` | Submit answers and evaluate eligibility. Persists check record. | `201 Created` |
| `GET` | `/api/me/courses/:id/eligibility-result` | Authenticated | `user`, `counsellor`, `admin`, `super_admin` | Get student's personal latest evaluation result for a course. | `200 OK` |
| `GET` | `/api/admin/courses/:id/eligibility-rules` | Authenticated | `admin`, `super_admin` | Fetch complete eligibility rules including answer keys. | `200 OK` |
| `PUT` | `/api/admin/courses/:id/eligibility-rules` | Authenticated | `admin`, `super_admin` | Upsert course eligibility criteria and record audit log. | `200 OK` |
| `GET` | `/api/admin/courses/:id/eligibility-checks` | Authenticated | `counsellor`, `admin`, `super_admin` | View paginated list of student check attempts with user details and status filter. | `200 OK` |

---

## 6. Database and Migration Impact

- **Existing Tables Utilized**:
  - `course_eligibility_rules`: Configured during Migration `005_demo_and_eligibility.sql`.
  - `eligibility_checks`: Configured during Migration `005_demo_and_eligibility.sql`.
  - `audit_logs`: Configured during Migration `001_auth_and_users.sql`.
- **Database Schema Integrity**:
  - No DDL migrations were needed or created.
  - Zero existing tables were dropped, truncated, or modified destructively.
  - Live MariaDB database verified via direct table description queries.

---

## 7. Automated Test Results and Regression Comparison

### Baseline Before Phase 9 Implementation
- **Total Test Suites:** 45
- **Total Passing Tests:** 207
- **Failing Tests:** 0

### Phase 9 Test Suite Execution (`node --test tests/eligibility.test.js`)
```
TAP version 13
# Subtest: Phase 9: Course Eligibility Management & Evaluation Subsystem Automated Tests
    # Subtest: 1. Public Eligibility API (GET /api/courses/:id/eligibility)
        ok 1 - should return 404 if course does not exist
        ok 2 - should return 404 if course is not published
        ok 3 - should return default open eligibility criteria when no rules record exists
        ok 4 - should sanitize and scrub correct_answers from custom questions for public access
    ok 1 - 1. Public Eligibility API (GET /api/courses/:id/eligibility)
    # Subtest: 2. Admin Eligibility Rules API (GET & PUT /api/admin/courses/:id/eligibility-rules)
        ok 1 - should reject unauthenticated requests with 401
        ok 2 - should reject non-admin users (students and counsellors) with 403
        ok 3 - should validate invalid payload and reject with 400
        ok 4 - should successfully upsert rules and record an audit log
    ok 2 - 2. Admin Eligibility Rules API (GET & PUT /api/admin/courses/:id/eligibility-rules)
    # Subtest: 3. Student Eligibility Check Evaluation (POST /api/courses/:id/eligibility-checks)
        ok 1 - should reject unauthenticated request with 401
        ok 2 - should reject missing answers payload with 400
        ok 3 - should automatically pass when eligibility_enabled is false
        # Subtest: Server-Side Evaluation Rules Testing
            ok 1 - should fail qualification when student qualification is lower in hierarchy
            ok 2 - should pass qualification when student qualification is equal or higher in hierarchy
            ok 3 - should fail minimum percentage when below threshold
            ok 4 - should fail stream check when stream is not in whitelist
            ok 5 - should fail age check when student is younger than minimum or older than maximum
            ok 6 - should fail experience when prior experience is required but student is fresher
            ok 7 - should fail custom question when required question is missing or answer does not match criteria
            ok 8 - should report multiple simultaneous failed rules in failed_rules array
        ok 4 - Server-Side Evaluation Rules Testing
    ok 3 - 3. Student Eligibility Check Evaluation (POST /api/courses/:id/eligibility-checks)
    # Subtest: 4. Student Latest Result API (GET /api/me/courses/:id/eligibility-result)
        ok 1 - should return has_checked: false if student has never checked
        ok 2 - should return latest check result after student checks
    ok 4 - 4. Student Latest Result API (GET /api/me/courses/:id/eligibility-result)
    # Subtest: 5. Admin Student Checks Inspection (GET /api/admin/courses/:id/eligibility-checks)
        ok 1 - should reject unauthenticated and student requests with 401 and 403
        ok 2 - should allow counsellor and admin to view students check attempts
        ok 3 - should filter checks by result status (eligible vs not_eligible)
        ok 4 - should support pagination params (page, limit)
        ok 5 - should not expose sensitive tokens, passwords, or google_id in student checks response
    ok 5 - 5. Admin Student Checks Inspection (GET /api/admin/courses/:id/eligibility-checks)
    # Subtest: 6. Additional Edge Cases & Specification Discrepancy Audits
        ok 1 - should allow all authenticated roles (user, counsellor, admin) to submit checks per Section 3 Roles Matrix
        ok 2 - should treat minimum_qualification: "any" as open to all qualifications
        ok 3 - should expose required_skills as informational criteria and not falsely evaluate it as a required answer
        ok 4 - should enforce authentication, validation, and course existence even when eligibility is disabled
        ok 5 - should strictly isolate personal latest results between distinct authenticated users
    ok 6 - 6. Additional Edge Cases & Specification Discrepancy Audits
    # Subtest: 7. Exhaustive Role Matrix Verification (guest, user, counsellor, admin, super_admin)
        ok 1 - POST /api/courses/:id/eligibility-checks: guest returns 401, user, counsellor, admin, super_admin all permitted (201)
        ok 2 - GET & PUT /api/admin/courses/:id/eligibility-rules: guest 401, user 403, counsellor 403, admin 200, super_admin 200
        ok 3 - GET /api/admin/courses/:id/eligibility-checks: guest 401, user 403, counsellor 200, admin 200, super_admin 200
        ok 4 - GET /api/me/courses/:id/eligibility-result: strictly isolates results by authenticated user ID across all roles
    ok 7 - 7. Exhaustive Role Matrix Verification (guest, user, counsellor, admin, super_admin)
ok 1 - Phase 9: Course Eligibility Management & Evaluation Subsystem Automated Tests
1..1
# tests 35
# suites 9
# pass 35
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 1669.688
```

### Full Regression Test Suite Execution (`npm test`)
```
1..11
# tests 242
# suites 54
# pass 242
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3011.6025
```
**Comparison:**
- Tests increased from 207 to 242 (+35 new tests).
- 100% of all existing Phase 1 through Phase 8 tests passed without modification or regression.

---

## 8. Manual / Postman Verification Steps

### Step 1: Admin Sets Eligibility Rules
```bash
curl -X PUT http://localhost:5000/api/admin/courses/1/eligibility-rules \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=<ADMIN_TOKEN>" \
  -d '{
    "eligibility_enabled": true,
    "minimum_qualification": "graduate",
    "minimum_percentage": 60,
    "eligible_streams": ["B.Tech", "BCA", "B.Sc CS"],
    "minimum_age": 20,
    "maximum_age": 28,
    "required_skills": ["Basic Programming"],
    "experience_required": "fresher_allowed",
    "custom_questions": [
      {
        "key": "math_passed",
        "question": "Did you study Mathematics at +2 or higher level?",
        "field_type": "radio",
        "options": ["Yes", "No"],
        "required": true,
        "correct_answers": ["Yes"]
      }
    ],
    "disclaimer": "Eligibility does not guarantee seat allocation."
  }'
```
**Expected Response:** `200 OK` with `success: true` and configured rules.

---

### Step 2: Public User Inspects Eligibility Form
```bash
curl -X GET http://localhost:5000/api/courses/1/eligibility
```
**Expected Response:** `200 OK`. `custom_questions[0]` contains `key`, `question`, `field_type`, `options`, `required`, but **does NOT** contain `correct_answers`.

---

### Step 3: Student Submits Answers (Failing Criteria)
```bash
curl -X POST http://localhost:5000/api/courses/1/eligibility-checks \
  -H "Content-Type: application/json" \
  -H "Cookie: access_token=<STUDENT_TOKEN>" \
  -d '{
    "answers": {
      "qualification": "12th",
      "percentage": 55,
      "stream": "Arts",
      "age": 19,
      "math_passed": "No"
    }
  }'
```
**Expected Response:** `201 Created`
```json
{
  "success": true,
  "message": "Is course ke liye kam se kam graduate qualification chahiye.",
  "data": {
    "id": 1,
    "result": "not_eligible",
    "eligible": false,
    "failed_rules": [
      "minimum_qualification",
      "minimum_percentage",
      "eligible_streams",
      "minimum_age",
      "custom_question_math_passed"
    ],
    "checked_at": "2026-10-26T14:24:00.000Z"
  }
}
```

---

### Step 4: Student Checks Latest Eligibility Result
```bash
curl -X GET http://localhost:5000/api/me/courses/1/eligibility-result \
  -H "Cookie: access_token=<STUDENT_TOKEN>"
```
**Expected Response:** `200 OK` returning `has_checked: true`, `result: "not_eligible"`, `eligible: false`.

---

### Step 5: Counsellor / Admin Reviews Student Checks
```bash
curl -X GET "http://localhost:5000/api/admin/courses/1/eligibility-checks?result=not_eligible&page=1&limit=10" \
  -H "Cookie: access_token=<COUNSELLOR_TOKEN>"
```
**Expected Response:** `200 OK` with paginated check objects including `student_name`, `student_email`, `answers`, and `result`.

---

## 9. Security and Data-Integrity Checks

1. **Student Answer Secrecy & Cheat Prevention:**
   - Public endpoint `GET /api/courses/:id/eligibility` cleanses all instances of `correct_answers` from `custom_questions`. Students cannot inspect DevTools or network payloads to extract test answers.
2. **Strict Server-Side Evaluation:**
   - Clients only supply answer values (`{ answers: { ... } }`). All logic, qualification weights, age calculations, and percentage bounds are strictly evaluated on the server.
3. **Role-Based Access Control:**
   - Normal students (`user`) cannot access admin rules or inspect other students' check submissions.
   - Counsellors are granted read-only access to view student check attempts (`GET /api/admin/courses/:id/eligibility-checks`) for counselling workflows, but cannot alter course rules.
4. **Parameterized SQL:**
   - All repository functions utilize parameterized placeholders (`?`) preventing SQL injection.
5. **Data Immutability & Audit Logging:**
   - Every rule modification creates an immutable entry in `audit_logs` tracking `actor_id`, `old_value`, `new_value`, and IP address.
   - Student check attempts are immutable history records, preserving timestamped audit trails of student qualifications at the time of evaluation.

---

## 10. Known Limitations and Non-Scope Items

1. **Phase 10 Enrollment Enforcement:**
   - Phase 9 records student eligibility checks and provides the verification APIs. Phase 10 will consume this data to enforce `eligible: true` checks during checkout and enrollment workflows.
2. **External Notification Senders:**
   - Per specification rules, external email/SMS/WhatsApp senders remain unintegrated; notification entries are stored safely in internal database queues.
