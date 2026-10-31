import fs from 'fs';
import path from 'path';

function searchInDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        searchInDirectory(fullPath);
      }
    } else {
      try {
        const text = fs.readFileSync(fullPath, 'utf8');
        if (text.includes('16. Views') || text.includes('16.1') || text.includes('19.2 Background jobs')) {
          console.log(`Found in: ${fullPath}`);
        }
      } catch (e) {}
    }
  }
}

console.log('Searching in D:/Course_plateform ...');
searchInDirectory('D:/Course_plateform');
