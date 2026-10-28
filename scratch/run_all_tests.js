import { spawn } from 'child_process';
import path from 'path';

const testFiles = [
  'tests/auth.test.js',
  'tests/catalog.test.js',
  'tests/course_content.test.js',
  'tests/demo_classes.test.js',
  'tests/eligibility.test.js',
  'tests/enrollments.test.js',
  'tests/esm-import.test.js',
  'tests/health.test.js',
  'tests/schema.test.js',
  'tests/server-startup.test.js',
  'tests/uploads_materials.test.js',
  'tests/utils.test.js',
  'tests/wishlist_reviews.test.js'
];

async function runTest(file) {
  return new Promise((resolve) => {
    const start = Date.now();
    const proc = spawn('node', ['--test', file], {
      cwd: 'D:\\Course_plateform\\backend',
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('close', (code) => {
      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const passMatch = stdout.match(/(?:#|ℹ)\s+tests\s+(\d+)/);
      const failMatch = stdout.match(/(?:#|✖)\s+fail\s+(\d+)/);
      const suitesMatch = stdout.match(/(?:#|ℹ)\s+suites\s+(\d+)/);
      const tests = passMatch ? parseInt(passMatch[1], 10) : 0;
      const suites = suitesMatch ? parseInt(suitesMatch[1], 10) : 1;
      const fails = failMatch ? parseInt(failMatch[1], 10) : 0;

      if (code === 0 && fails === 0) {
        console.log(`Executing ${file}... PASS (${duration}s, ${tests} tests, ${suites} suites)`);
        resolve({ file, passed: true, tests, suites, duration });
      } else {
        console.error(`Executing ${file}... FAIL (code ${code}, ${fails} failed)`);
        console.error(stderr || stdout);
        resolve({ file, passed: false, tests, suites, duration });
      }
    });
  });
}

async function main() {
  console.log(`Starting execution of ${testFiles.length} test files sequentially...\n`);
  let totalTests = 0;
  let totalSuites = 0;
  let allPassed = true;

  for (const file of testFiles) {
    const res = await runTest(file);
    totalTests += res.tests;
    totalSuites += res.suites;
    if (!res.passed) allPassed = false;
  }

  console.log('\n=============================================');
  if (allPassed) {
    console.log(`ALL ${testFiles.length} TEST FILES PASSED! Total tests: ${totalTests}, Total suites: ${totalSuites}`);
  } else {
    console.error(`SOME TESTS FAILED! Total tests run: ${totalTests}`);
    process.exit(1);
  }
}

main();
