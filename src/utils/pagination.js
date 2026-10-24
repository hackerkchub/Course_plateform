/**
 * Pagination query parser utility
 * Aligns with Section 5 of Course Platform Backend Plan:
 * "page: int default 1; limit: int default 12 (admin 20), max 100; sort: newest"
 */

function parsePagination(query = {}, defaultLimit = 12, maxLimit = 100) {
  let page = parseInt(query.page, 10);
  if (isNaN(page) || page < 1) {
    page = 1;
  }

  let limit = parseInt(query.limit, 10);
  if (isNaN(limit) || limit < 1) {
    limit = defaultLimit;
  } else if (limit > maxLimit) {
    limit = maxLimit;
  }

  const offset = (page - 1) * limit;

  const allowedSorts = ['newest', 'popular', 'price_asc', 'price_desc', 'rating', 'name'];
  let sort = query.sort && typeof query.sort === 'string' ? query.sort.toLowerCase() : 'newest';
  if (!allowedSorts.includes(sort)) {
    sort = 'newest';
  }

  return {
    page,
    limit,
    offset,
    sort,
  };
}

module.exports = {
  parsePagination,
};
