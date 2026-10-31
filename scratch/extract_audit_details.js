import fs from 'fs';

const doc = fs.readFileSync('D:/Course_plateform/backend/docs/SECTION_19_PHASE_10_SCOPE_AND_DATABASE_AUDIT.md', 'utf8');
const lines = doc.split('\n');

let printing = false;
lines.forEach((line, idx) => {
  if (line.includes('Section 19') || line.includes('Section 16') || line.includes('19.2') || line.includes('Step 12')) {
    console.log(`Line ${idx+1}: ${line}`);
  }
});
