import fs from 'fs';
import path from 'path';

const logDir = 'C:\\Users\\Kapil Chilhate\\.gemini\\antigravity-ide\\brain\\2c55edcd-27eb-4579-949b-c3d21f187361\\.system_generated\\logs';
if (fs.existsSync(logDir)) {
  const files = fs.readdirSync(logDir);
  console.log('Log files:', files);
  for (const f of files) {
    if (f.endsWith('.jsonl')) {
      const p = path.join(logDir, f);
      const text = fs.readFileSync(p, 'utf8');
      const lines = text.split('\n');
      console.log(`${f} has ${lines.length} lines`);
      for (const line of lines) {
        if (line.includes('16. Views') || line.includes('16.1 Track') || line.includes('16.2 Admin analytics')) {
          console.log('Found match in log:', line.substring(0, 300));
        }
      }
    }
  }
} else {
  console.log('Log dir not found');
}
