import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateSlug, isValidSlug } from '../src/utils/slug.js';
import { parsePagination } from '../src/utils/pagination.js';
import { calculateDiscountedPrice, isOfferActive } from '../src/utils/pricing.js';
import { validateBody } from '../src/middleware/validate.js';
import { z } from 'zod';

describe('Structural Utilities & Shared Infrastructure Tests', () => {
  describe('Slug Utility (Section 19.3)', () => {
    it('should generate valid lowercase alphanumeric slugs with hyphens', () => {
      assert.strictEqual(generateSlug('Complete JavaScript DSA'), 'complete-javascript-dsa');
      assert.strictEqual(generateSlug('  React & Node.js 2026!  '), 'react-nodejs-2026');
      assert.strictEqual(generateSlug('Python---Data---Science'), 'python-data-science');
    });

    it('should accurately validate slug format', () => {
      assert.strictEqual(isValidSlug('complete-javascript-dsa'), true);
      assert.strictEqual(isValidSlug('dsa-101'), true);
      assert.strictEqual(isValidSlug('invalid_slug_with_underscore'), false);
      assert.strictEqual(isValidSlug('SlugWithUpperCase'), false);
      assert.strictEqual(isValidSlug('-leading-hyphen'), false);
      assert.strictEqual(isValidSlug('trailing-hyphen-'), false);
    });
  });

  describe('Pagination Utility (Section 5)', () => {
    it('should parse valid pagination query parameters', () => {
      const res = parsePagination({ page: '2', limit: '20', sort: 'popular' });
      assert.strictEqual(res.page, 2);
      assert.strictEqual(res.limit, 20);
      assert.strictEqual(res.offset, 20);
      assert.strictEqual(res.sort, 'popular');
    });

    it('should apply defaults for missing or invalid parameters', () => {
      const res = parsePagination({});
      assert.strictEqual(res.page, 1);
      assert.strictEqual(res.limit, 12);
      assert.strictEqual(res.offset, 0);
      assert.strictEqual(res.sort, 'newest');
    });

    it('should enforce maxLimit boundary', () => {
      const res = parsePagination({ limit: '500' }, 12, 100);
      assert.strictEqual(res.limit, 100);
    });
  });

  describe('Pricing Utility (Section 10.3)', () => {
    it('should calculate percentage discount accurately', () => {
      const offer = {
        is_active: true,
        discount_type: 'percentage',
        discount_value: 50,
        starts_at: '2020-01-01',
        ends_at: '2030-01-01',
      };
      const res = calculateDiscountedPrice(9999, offer);
      assert.strictEqual(res.price, 9999);
      assert.strictEqual(res.offer_price, 4999.5);
      assert.strictEqual(res.discount_percentage, 50);
      assert.strictEqual(res.offer_active, true);
    });

    it('should calculate fixed discount and prevent negative price', () => {
      const offer = {
        is_active: true,
        discount_type: 'fixed',
        discount_value: 2000,
        starts_at: '2020-01-01',
        ends_at: '2030-01-01',
      };
      const res = calculateDiscountedPrice(1500, offer);
      assert.strictEqual(res.offer_price, 0);
      assert.strictEqual(res.discount_percentage, 100);
    });

    it('should recognize expired or inactive offers', () => {
      const expiredOffer = {
        is_active: true,
        discount_type: 'percentage',
        discount_value: 20,
        starts_at: '2020-01-01',
        ends_at: '2021-01-01', // Expired
      };
      assert.strictEqual(isOfferActive(expiredOffer), false);

      const res = calculateDiscountedPrice(1000, expiredOffer);
      assert.strictEqual(res.offer_price, null);
      assert.strictEqual(res.offer_active, false);
    });
  });

  describe('Validation Middleware (Section 2 & 5)', () => {
    it('should pass validated body to next middleware', () => {
      const schema = z.object({ name: z.string().min(2) });
      const req = { body: { name: 'Valid Course' } };
      let called = false;
      const middleware = validateBody(schema);
      middleware(req, {}, (err) => {
        assert.strictEqual(err, undefined);
        called = true;
      });
      assert.strictEqual(called, true);
      assert.strictEqual(req.body.name, 'Valid Course');
    });

    it('should forward Zod error when body validation fails', () => {
      const schema = z.object({ name: z.string().min(5) });
      const req = { body: { name: 'Hi' } };
      let capturedError;
      const middleware = validateBody(schema);
      middleware(req, {}, (err) => {
        capturedError = err;
      });
      assert.ok(capturedError instanceof z.ZodError);
    });
  });
});
