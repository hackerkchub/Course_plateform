import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  ALLOWED_PRODUCTION_DATABASES,
  isAllowedDatabase,
} from '../src/config/db.js';

describe('Production Database Guard & Allowlist Verification', () => {
  it('should export the exact explicit allowlist without wildcard patterns', () => {
    assert.deepStrictEqual([...ALLOWED_PRODUCTION_DATABASES], [
      'course_platform_db',
      'softmaxs_course_platform_db',
    ]);
  });

  // Test matrix required:
  // 1. Development | course_platform_db          | Allowed
  it('Development | course_platform_db -> Allowed', () => {
    assert.strictEqual(
      isAllowedDatabase('course_platform_db', 'development'),
      true,
      'course_platform_db should be allowed in development'
    );
  });

  // 2. Production | course_platform_db           | Allowed
  it('Production | course_platform_db -> Allowed', () => {
    assert.strictEqual(
      isAllowedDatabase('course_platform_db', 'production'),
      true,
      'course_platform_db should be allowed in production'
    );
  });

  // 3. Production | softmaxs_course_platform_db  | Allowed
  it('Production | softmaxs_course_platform_db -> Allowed', () => {
    assert.strictEqual(
      isAllowedDatabase('softmaxs_course_platform_db', 'production'),
      true,
      'softmaxs_course_platform_db should be allowed in production'
    );
  });

  // 4. Production | unrelated_database           | Rejected
  it('Production | unrelated_database -> Rejected', () => {
    assert.strictEqual(
      isAllowedDatabase('unrelated_database', 'production'),
      false,
      'unrelated_database must be strictly rejected in production'
    );
  });

  // 5. Production | another_course_platform_db   | Rejected
  it('Production | another_course_platform_db -> Rejected (No generic endsWith rule)', () => {
    assert.strictEqual(
      isAllowedDatabase('another_course_platform_db', 'production'),
      false,
      'another_course_platform_db must be rejected; no generic endsWith rule permitted'
    );
  });

  // 6. Production | softmaxs_g9expert_db         | Rejected
  it('Production | softmaxs_g9expert_db -> Rejected', () => {
    assert.strictEqual(
      isAllowedDatabase('softmaxs_g9expert_db', 'production'),
      false,
      'softmaxs_g9expert_db must be strictly rejected in production'
    );
  });

  describe('Database Guard Exception Behavior Verification', () => {
    function simulateDatabaseGuard(dbName, nodeEnv) {
      if (nodeEnv === 'production' && !ALLOWED_PRODUCTION_DATABASES.includes(dbName)) {
        throw new Error(
          `Invalid database target: ${dbName}. Must be one of: ${ALLOWED_PRODUCTION_DATABASES.join(', ')}`
        );
      }
      return true;
    }

    it('should not throw for approved database names in production', () => {
      assert.doesNotThrow(() => simulateDatabaseGuard('course_platform_db', 'production'));
      assert.doesNotThrow(() => simulateDatabaseGuard('softmaxs_course_platform_db', 'production'));
    });

    it('should throw an informative error when a non-allowlisted database is configured in production', () => {
      assert.throws(
        () => simulateDatabaseGuard('unrelated_database', 'production'),
        /Invalid database target: unrelated_database/
      );
      assert.throws(
        () => simulateDatabaseGuard('another_course_platform_db', 'production'),
        /Invalid database target: another_course_platform_db/
      );
      assert.throws(
        () => simulateDatabaseGuard('softmaxs_g9expert_db', 'production'),
        /Invalid database target: softmaxs_g9expert_db/
      );
    });
  });
});
