import fs from 'fs';

const text = fs.readFileSync('D:/Course_plateform/backend/scratch/step_147_prompt.txt', 'utf8');

// Find Section 16
const sec16Idx = text.indexOf('16. Views');
const sec17Idx = text.indexOf('17. Users');
const sec18Idx = text.indexOf('18. Key flows');
const sec19Idx = text.indexOf('19. Security');

console.log('=== SECTION 16 ===');
if (sec16Idx !== -1 && sec17Idx !== -1) {
  console.log(text.substring(sec16Idx, sec17Idx));
} else if (sec16Idx !== -1) {
  console.log(text.substring(sec16Idx, sec16Idx + 2000));
}

console.log('\n=== SECTION 18.2 ===');
if (sec18Idx !== -1) {
  const p182 = text.indexOf('18.2', sec18Idx);
  const p183 = text.indexOf('18.3', sec18Idx);
  if (p182 !== -1 && p183 !== -1) {
    console.log(text.substring(p182, p183));
  }
}

console.log('\n=== SECTION 19.2 ===');
if (sec19Idx !== -1) {
  const p192 = text.indexOf('19.2', sec19Idx);
  const p193 = text.indexOf('19.3', sec19Idx);
  if (p192 !== -1 && p193 !== -1) {
    console.log(text.substring(p192, p193));
  }
}
