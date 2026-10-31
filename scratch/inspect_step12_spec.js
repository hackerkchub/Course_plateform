import fs from 'fs';

function searchFile(filePath, regex) {
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  console.log(`\n=== Matches in ${filePath} ===`);
  lines.forEach((line, idx) => {
    if (regex.test(line)) {
      console.log(`${idx + 1}: ${line.trim()}`);
    }
  });
}

searchFile('D:/Course_plateform/Course_Platform_Backend_Plan.txt', /16\.|16\s|views|analytics|dashboard|cron|19\.2/i);
searchFile('docs/COURSE_PLATFORM_BACKEND_MANUAL.md', /16\.|16\s|analytics|dashboard|course_views|cron|19\.2/i);
searchFile('docs/API_DOCUMENTATION.md', /views|analytics|dashboard|cron/i);
searchFile('docs/SECTION_19_PHASE_10_SCOPE_AND_DATABASE_AUDIT.md', /16\.|16\s|analytics|dashboard|course_views|cron|19\.2/i);
