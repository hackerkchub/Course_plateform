import {
  findCourseById,
  findEligibilityRulesByCourseId,
  upsertEligibilityRules,
  createEligibilityCheck,
  findLatestEligibilityCheck,
  findFilteredEligibilityChecks,
} from './eligibility.repository.js';
import { recordAuditLog } from '../../utils/auditLogger.js';

export class EligibilityServiceError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = 'EligibilityServiceError';
    this.statusCode = statusCode;
  }
}

const QUALIFICATION_LEVELS = {
  any: 0,
  '10th': 1,
  '12th': 2,
  diploma: 3,
  graduate: 4,
  post_graduate: 5,
};

/**
 * Server-side evaluation of student answers against course eligibility criteria
 */
export function evaluateEligibilityRules(rules, answers = {}) {
  // If eligibility is disabled or no rules exist, student is automatically eligible
  if (!rules || !rules.eligibility_enabled) {
    return {
      eligible: true,
      result: 'eligible',
      failed_rules: [],
      message: 'Aap is course ke liye eligible hain.',
    };
  }

  const failed_rules = [];
  const failure_messages = [];

  // 1. Qualification Check
  if (rules.minimum_qualification && rules.minimum_qualification !== 'any') {
    const requiredLevel = QUALIFICATION_LEVELS[rules.minimum_qualification.toLowerCase()] || 0;
    const rawStudentQual = String(
      answers.qualification || answers.current_qualification || answers.minimum_qualification || ''
    ).toLowerCase().trim();

    const studentLevel = QUALIFICATION_LEVELS[rawStudentQual] !== undefined
      ? QUALIFICATION_LEVELS[rawStudentQual]
      : -1;

    if (studentLevel < requiredLevel) {
      failed_rules.push('minimum_qualification');
      failure_messages.push(`Is course ke liye kam se kam ${rules.minimum_qualification} qualification chahiye.`);
    }
  }

  // 2. Minimum Percentage Check
  if (rules.minimum_percentage !== null && rules.minimum_percentage !== undefined) {
    const studentPct = parseFloat(
      answers.percentage !== undefined ? answers.percentage : answers.marks_percentage
    );

    if (isNaN(studentPct) || studentPct < rules.minimum_percentage) {
      failed_rules.push('minimum_percentage');
      failure_messages.push(`Is course ke liye kam se kam ${rules.minimum_percentage}% chahiye.`);
    }
  }

  // 3. Eligible Streams Check
  if (
    rules.eligible_streams &&
    Array.isArray(rules.eligible_streams) &&
    rules.eligible_streams.length > 0
  ) {
    const normalizedRulesStreams = rules.eligible_streams.map((s) => String(s).toLowerCase().trim());
    const isAnyStreamAllowed = normalizedRulesStreams.includes('any') || normalizedRulesStreams.includes('all');

    if (!isAnyStreamAllowed) {
      const studentStream = String(answers.stream || answers.eligible_stream || '').toLowerCase().trim();
      if (!studentStream || !normalizedRulesStreams.includes(studentStream)) {
        failed_rules.push('eligible_streams');
        failure_messages.push(`Eligible streams hain: ${rules.eligible_streams.join(', ')}.`);
      }
    }
  }

  // 4. Age Boundary Checks
  const studentAge = parseInt(answers.age, 10);
  const hasMinAge = rules.minimum_age !== null && rules.minimum_age !== undefined;
  const hasMaxAge = rules.maximum_age !== null && rules.maximum_age !== undefined;

  if (hasMinAge || hasMaxAge) {
    if (isNaN(studentAge)) {
      if (hasMinAge) {
        failed_rules.push('minimum_age');
        failure_messages.push(`Minimum age required is ${rules.minimum_age} years.`);
      } else {
        failed_rules.push('maximum_age');
        failure_messages.push(`Maximum age allowed is ${rules.maximum_age} years.`);
      }
    } else {
      if (hasMinAge && studentAge < rules.minimum_age) {
        failed_rules.push('minimum_age');
        failure_messages.push(`Minimum age required is ${rules.minimum_age} years.`);
      }
      if (hasMaxAge && studentAge > rules.maximum_age) {
        failed_rules.push('maximum_age');
        failure_messages.push(`Maximum age allowed is ${rules.maximum_age} years.`);
      }
    }
  }

  // 5. Experience Check
  if (rules.experience_required === 'experience_required') {
    const rawExp = String(
      answers.experience || answers.experience_level || answers.experience_required || ''
    ).toLowerCase().trim();

    const isFresherOrNone =
      !rawExp ||
      rawExp === 'fresher' ||
      rawExp === 'none' ||
      rawExp === '0' ||
      rawExp === 'false' ||
      rawExp === 'fresher_allowed';

    if (isFresherOrNone) {
      failed_rules.push('experience_required');
      failure_messages.push('Is course ke liye prior experience hona zaruri hai.');
    }
  }

  // 6. Custom Questions Check
  if (rules.custom_questions && Array.isArray(rules.custom_questions)) {
    for (const q of rules.custom_questions) {
      if (!q || typeof q !== 'object') continue;
      const studentAns = answers[q.key];

      // Required check
      if (q.required && (studentAns === undefined || studentAns === null || String(studentAns).trim() === '')) {
        failed_rules.push(`custom_question_${q.key}`);
        failure_messages.push(`Question "${q.question}" ka jawab dena zaruri hai.`);
        continue;
      }

      // Correct answers check (if question defines criteria)
      if (
        q.correct_answers &&
        Array.isArray(q.correct_answers) &&
        q.correct_answers.length > 0 &&
        studentAns !== undefined &&
        studentAns !== null
      ) {
        const normalizedStudentAns = String(studentAns).toLowerCase().trim();
        const normalizedCorrect = q.correct_answers.map((a) => String(a).toLowerCase().trim());

        if (!normalizedCorrect.includes(normalizedStudentAns)) {
          failed_rules.push(`custom_question_${q.key}`);
          failure_messages.push(`Question "${q.question}" criteria poora nahi karta.`);
        }
      }
    }
  }

  if (failed_rules.length === 0) {
    return {
      eligible: true,
      result: 'eligible',
      failed_rules: [],
      message: 'Aap is course ke liye eligible hain.',
    };
  }

  return {
    eligible: false,
    result: 'not_eligible',
    failed_rules,
    message: failure_messages[0] || 'Aap is course ki eligibility criteria poori nahi karte hain.',
  };
}

/**
 * Public: Get course eligibility requirements and form fields (sensitive keys scrubbed)
 */
export async function getPublicCourseEligibility(courseId) {
  const course = await findCourseById(courseId);
  if (!course || course.deleted_at || course.status !== 'published') {
    throw new EligibilityServiceError('Course not found or is not published', 404);
  }

  const rules = await findEligibilityRulesByCourseId(courseId);
  if (!rules) {
    return {
      course_id: course.id,
      eligibility_enabled: false,
      minimum_qualification: 'any',
      minimum_percentage: null,
      eligible_streams: ['Any'],
      minimum_age: null,
      maximum_age: null,
      required_skills: [],
      experience_required: 'fresher_allowed',
      custom_questions: [],
      disclaimer: null,
    };
  }

  // Scrub sensitive correct_answers from custom questions for public display
  const scrubbedQuestions = (Array.isArray(rules.custom_questions) ? rules.custom_questions : []).map((q) => {
    if (!q || typeof q !== 'object') return {};
    const { correct_answers, correct_answer, ...publicQuestionProps } = q;
    return publicQuestionProps;
  });

  return {
    course_id: rules.course_id,
    eligibility_enabled: rules.eligibility_enabled,
    minimum_qualification: rules.minimum_qualification,
    minimum_percentage: rules.minimum_percentage,
    eligible_streams: rules.eligible_streams,
    minimum_age: rules.minimum_age,
    maximum_age: rules.maximum_age,
    required_skills: rules.required_skills,
    experience_required: rules.experience_required,
    custom_questions: scrubbedQuestions,
    disclaimer: rules.disclaimer,
  };
}

/**
 * Student: Submit answers and evaluate eligibility
 */
export async function submitStudentEligibilityCheck(userId, courseId, answers) {
  const course = await findCourseById(courseId);
  if (!course || course.deleted_at || course.status !== 'published') {
    throw new EligibilityServiceError('Course not found or is not published', 404);
  }

  const rules = await findEligibilityRulesByCourseId(courseId);
  const evaluation = evaluateEligibilityRules(rules, answers);

  const checkRecord = await createEligibilityCheck({
    userId,
    courseId,
    answers,
    result: evaluation.result,
    message: evaluation.message,
  });

  return {
    id: checkRecord.id,
    result: checkRecord.result,
    eligible: evaluation.eligible,
    message: checkRecord.message,
    failed_rules: evaluation.failed_rules,
    checked_at: checkRecord.checked_at,
  };
}

/**
 * Student: Get personal latest eligibility result for a course
 */
export async function getStudentLatestEligibilityResult(userId, courseId) {
  const course = await findCourseById(courseId);
  if (!course || course.deleted_at) {
    throw new EligibilityServiceError('Course not found', 404);
  }

  const latest = await findLatestEligibilityCheck(userId, courseId);
  if (!latest) {
    return {
      has_checked: false,
      result: null,
      eligible: null,
      message: null,
      checked_at: null,
    };
  }

  return {
    has_checked: true,
    id: latest.id,
    result: latest.result,
    eligible: latest.result === 'eligible',
    message: latest.message,
    checked_at: latest.checked_at,
  };
}

/**
 * Admin: Get course eligibility rules
 */
export async function getAdminCourseEligibilityRules(courseId) {
  const course = await findCourseById(courseId);
  if (!course || course.deleted_at) {
    throw new EligibilityServiceError('Course not found', 404);
  }

  const rules = await findEligibilityRulesByCourseId(courseId);
  if (!rules) {
    return {
      course_id: course.id,
      eligibility_enabled: false,
      minimum_qualification: null,
      minimum_percentage: null,
      eligible_streams: [],
      minimum_age: null,
      maximum_age: null,
      required_skills: [],
      experience_required: null,
      custom_questions: [],
      disclaimer: null,
    };
  }

  return rules;
}

/**
 * Admin: Save (upsert) course eligibility rules
 */
export async function saveAdminCourseEligibilityRules(courseId, rulesData, user, ip) {
  const course = await findCourseById(courseId);
  if (!course || course.deleted_at) {
    throw new EligibilityServiceError('Course not found', 404);
  }

  const currentRules = await findEligibilityRulesByCourseId(courseId);
  const updatedRules = await upsertEligibilityRules(courseId, rulesData);

  await recordAuditLog({
    actor_id: user.id,
    action: 'course.eligibility_rules.update',
    entity_type: 'course',
    entity_id: courseId,
    old_value: currentRules ? { eligibility_enabled: currentRules.eligibility_enabled } : null,
    new_value: { eligibility_enabled: updatedRules.eligibility_enabled },
    ip_address: ip,
  });

  return updatedRules;
}

/**
 * Admin: View student eligibility checks for a course
 */
export async function getAdminCourseEligibilityChecks(courseId, queryFilters) {
  const course = await findCourseById(courseId);
  if (!course || course.deleted_at) {
    throw new EligibilityServiceError('Course not found', 404);
  }

  return findFilteredEligibilityChecks(courseId, queryFilters);
}

export default {
  evaluateEligibilityRules,
  getPublicCourseEligibility,
  submitStudentEligibilityCheck,
  getStudentLatestEligibilityResult,
  getAdminCourseEligibilityRules,
  saveAdminCourseEligibilityRules,
  getAdminCourseEligibilityChecks,
};
