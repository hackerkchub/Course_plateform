import { AppError } from '../../middleware/errorHandler.js';
import * as repository from './analytics.repository.js';
import { getKolkataDateString, getKolkataHalfOpenRange, isBotUserAgent } from '../../utils/dateUtils.js';
import { withCourseViewLock } from '../../utils/advisoryLock.js';

/**
 * Calculates a date 30 days prior to a given YYYY-MM-DD date in UTC/Kolkata terms.
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {string} 'YYYY-MM-DD'
 */
function calculate30DaysPrior(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() - 30);
  const prevYear = dt.getUTCFullYear();
  const prevMonth = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const prevDay = String(dt.getUTCDate()).padStart(2, '0');
  return `${prevYear}-${prevMonth}-${prevDay}`;
}

/**
 * Records a course view event with bot filtering, session daily deduplication,
 * and distributed course/date advisory locking.
 */
export async function recordCourseViewService({
  courseId,
  userId = null,
  sessionId,
  referrer = null,
  source = 'direct',
  device_type = 'desktop',
  userAgent = '',
}) {
  const course = await repository.findCourseById(courseId);
  if (!course || course.status !== 'published') {
    throw new AppError('Course not found', 404);
  }

  // 1. Filter automated web bots silently without counter mutation (Section 16.1)
  if (isBotUserAgent(userAgent)) {
    return { recorded: true, message: 'View recorded' };
  }

  // 2. Derive Asia/Kolkata date boundaries for today
  const todayStr = getKolkataDateString();
  const { dayStart, nextDayStart } = getKolkataHalfOpenRange(todayStr);

  // 3. Coordinate under shared course/date advisory lock
  const lockResult = await withCourseViewLock(courseId, todayStr, 2, async (connection) => {
    // Check if session has already viewed this course today
    const alreadyViewedToday = await repository.checkViewExistsToday(
      courseId,
      sessionId,
      dayStart,
      nextDayStart,
      connection
    );

    if (alreadyViewedToday) {
      // Return 200 without double counting (Section 16.1)
      return { recorded: true, message: 'View recorded' };
    }

    // Insert view and atomically increment counters
    await repository.recordCourseView(
      {
        courseId,
        userId,
        sessionId,
        referrer,
        source,
        device_type,
      },
      connection
    );

    return { recorded: true, message: 'View recorded' };
  });

  if (!lockResult.acquired) {
    throw new AppError('Server busy, please retry view recording', 503);
  }

  return lockResult.result;
}

/**
 * Records a course share event (+1 to courses.share_count).
 */
export async function recordCourseShareService(courseId) {
  const course = await repository.findCourseById(courseId);
  if (!course || course.status !== 'published') {
    throw new AppError('Course not found', 404);
  }

  await repository.incrementShareCount(courseId);
  return { recorded: true, message: 'Share recorded' };
}

/**
 * Records an enquiry click atomically across courses and course_analytics_daily.
 */
export async function recordEnquiryClickService(courseId) {
  const course = await repository.findCourseById(courseId);
  if (!course || course.status !== 'published') {
    throw new AppError('Course not found', 404);
  }

  const todayStr = getKolkataDateString();
  await repository.recordEnquiryClick(courseId, todayStr);
  return { recorded: true, message: 'Enquiry click recorded' };
}

/**
 * Retrieves comprehensive analytics for a single course combining historical summaries
 * with live current-day events.
 */
export async function getCourseAnalyticsService(courseId, query = {}) {
  const course = await repository.findCourseById(courseId);
  if (!course) {
    throw new AppError('Course not found', 404);
  }

  const todayStr = getKolkataDateString();
  const to = query.to || todayStr;
  const from = query.from || calculate30DaysPrior(to);

  // 1. Fetch historical daily rows from course_analytics_daily where analytics_date < todayStr
  const historicalRows = await repository.getHistoricalDailyRows(courseId, from, todayStr);

  // 2. If range includes today, dynamically synthesize today's live stats
  if (to >= todayStr) {
    const { dayStart: todayStart, nextDayStart } = getKolkataHalfOpenRange(todayStr);
    const todayStats = await repository.getTodayLiveStats(courseId, todayStr, todayStart, nextDayStart);
    historicalRows.push(todayStats);
  }

  // Filter rows within requested [from, to] range
  const daily = historicalRows.filter(r => r.date >= from && r.date <= to);

  // 3. Totals block (lifetime monotonic numbers from courses table)
  const totalViews = Number(course.total_views || 0);
  const uniqueVisitors = Number(course.unique_visitors || 0);
  const enrollmentCount = Number(course.enrollment_count || 0);
  const conversionRate = uniqueVisitors > 0
    ? Number(((enrollmentCount / uniqueVisitors) * 100).toFixed(2))
    : 0.00;

  // 4. Breakdown distributions
  const { dayStart: rangeStart } = getKolkataHalfOpenRange(from);
  const { nextDayStart: rangeEnd } = getKolkataHalfOpenRange(to);
  const breakdown = await repository.getCourseBreakdown(courseId, rangeStart, rangeEnd);

  // 5. Total demo requests in range or overall
  const totalDemoCount = Object.values(breakdown.demo_funnel).reduce((a, b) => a + b, 0);

  return {
    course_id: Number(courseId),
    range: { from, to },
    totals: {
      total_views: totalViews,
      unique_visitors: uniqueVisitors,
      enquiry_count: Number(course.enquiry_count || 0),
      demo_request_count: totalDemoCount,
      wishlist_count: Number(course.wishlist_count || 0),
      share_count: Number(course.share_count || 0),
      enrollment_count: enrollmentCount,
      conversion_rate: conversionRate,
      last_viewed_at: breakdown.last_viewed_at,
    },
    daily,
    sources: breakdown.sources,
    devices: breakdown.devices,
    demo_funnel: breakdown.demo_funnel,
  };
}

/**
 * Returns comparison analytics across all courses with pagination and sorting.
 */
export async function getCoursesComparisonService(query = {}) {
  const page = Math.max(1, Number(query.page || 1));
  const limit = Math.max(1, Math.min(100, Number(query.limit || 10)));
  const offset = (page - 1) * limit;

  const result = await repository.getCoursesComparison({
    limit,
    offset,
    sortBy: query.sort_by,
    order: query.order,
  });

  return {
    courses: result.courses,
    pagination: {
      page,
      limit,
      total: result.total,
      total_pages: Math.ceil(result.total / limit) || 1,
    },
  };
}

/**
 * Returns platform-wide overview statistics for admin dashboard.
 */
export async function getAdminDashboardService(query = {}) {
  const todayStr = getKolkataDateString();
  const { dayStart: todayStart, nextDayStart } = getKolkataHalfOpenRange(todayStr);

  return await repository.getAdminDashboardOverview(todayStr, todayStart, nextDayStart);
}

export default {
  recordCourseViewService,
  recordCourseShareService,
  recordEnquiryClickService,
  getCourseAnalyticsService,
  getCoursesComparisonService,
  getAdminDashboardService,
};
