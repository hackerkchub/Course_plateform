/**
 * Date and Timezone Utilities for Course Platform Backend
 * Strictly enforces Asia/Kolkata timezone rules across aggregation,
 * boundary definitions, and retention pruning.
 */

const KOLKATA_TIMEZONE = 'Asia/Kolkata';

/**
 * Returns the current calendar date formatted as 'YYYY-MM-DD' in Asia/Kolkata time.
 * @param {Date} [date=new Date()]
 * @returns {string} 'YYYY-MM-DD'
 */
export function getKolkataDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KOLKATA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Computes a half-open timestamp range [dayStart, nextDayStart) in Asia/Kolkata time.
 * Covers all seconds and fractional seconds of the target date without gaps or overlaps.
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {{ dayStart: string, nextDayStart: string, dateStr: string, nextDateStr: string }}
 */
export function getKolkataHalfOpenRange(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error(`Invalid date string format: ${dateStr}. Expected YYYY-MM-DD.`);
  }

  const [y, m, d] = dateStr.split('-').map(Number);
  // Construct UTC date at noon to avoid DST/offset boundary jitter
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + 1);

  const nextYear = dt.getUTCFullYear();
  const nextMonth = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const nextDay = String(dt.getUTCDate()).padStart(2, '0');
  const nextDateStr = `${nextYear}-${nextMonth}-${nextDay}`;

  return {
    dayStart: `${dateStr} 00:00:00`,
    nextDayStart: `${nextDateStr} 00:00:00`,
    dateStr,
    nextDateStr,
  };
}

/**
 * Formats a Date object to 'YYYY-MM-DD HH:mm:ss' in Asia/Kolkata timezone.
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
export function formatKolkataTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KOLKATA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

/**
 * Checks whether a User-Agent header belongs to an automated crawler or bot.
 * @param {string} [userAgent='']
 * @returns {boolean}
 */
export function isBotUserAgent(userAgent = '') {
  if (!userAgent || typeof userAgent !== 'string') {
    return false;
  }
  const botPattern = /bot|crawler|spider|crawling|slurp|duckduckbot|baiduspider|yandexbot|facebookexternalhit|bingbot|googlebot/i;
  return botPattern.test(userAgent);
}

export default {
  getKolkataDateString,
  getKolkataHalfOpenRange,
  formatKolkataTimestamp,
  isBotUserAgent,
};
