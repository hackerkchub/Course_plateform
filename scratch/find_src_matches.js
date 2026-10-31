import fs from 'fs';
import path from 'path';

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(path.join(dir, f));
    }
  });
}

const matches = [];
walkDir('src', (filePath) => {
  if (filePath.endsWith('.js')) {
    const content = fs.readFileSync(filePath, 'utf8');
    if (/course_views|course_analytics_daily|analytics|views|view_count|total_views|unique_visitors|node-cron/i.test(content)) {
      matches.push(filePath);
    }
  }
});

console.log('Matching files in src:', matches);
