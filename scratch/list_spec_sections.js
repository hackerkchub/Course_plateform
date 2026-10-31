import fs from 'fs';

const content = fs.readFileSync('D:/Course_plateform/Course_Platform_Backend_Plan.txt', 'utf8');
const lines = content.split('\n');
console.log(`Total lines: ${lines.length}, Total characters: ${content.length}`);

// Print section headers
lines.forEach((line, i) => {
  if (/^[0-9]+(\.[0-9]+)*\s+[A-Za-z]/.test(line.trim())) {
    console.log(`Line ${i + 1}: ${line.trim()}`);
  }
});
