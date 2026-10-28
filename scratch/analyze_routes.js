import app from '../src/app.js';

function getRoutes(stack, prefix = '') {
  let routes = [];
  stack.forEach(layer => {
    if (layer.route) {
      const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase());
      methods.forEach(method => {
        routes.push({
          method,
          path: (prefix + layer.route.path).replace(/\/+/g, '/').replace(/\/$/, '') || '/'
        });
      });
    } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
      let nextPrefix = prefix;
      // Get mount prefix from regex
      const match = layer.regexp.source.match(/\\\/(api[^\/\\?]*)/);
      if (match) {
        nextPrefix = '/' + match[1];
      }
      routes = routes.concat(getRoutes(layer.handle.stack, nextPrefix));
    }
  });
  return routes;
}

const rawRoutes = getRoutes(app._router.stack);
console.log('Total raw routes (method + path):', rawRoutes.length);

// Deduplicate if any exact method+path appears twice
const seen = new Set();
const uniqueRoutes = [];
rawRoutes.forEach(r => {
  const key = `${r.method} ${r.path}`;
  if (!seen.has(key)) {
    seen.add(key);
    uniqueRoutes.push(r);
  } else {
    console.log('Duplicate route registered:', key);
  }
});

console.log('Unique routes count:', uniqueRoutes.length);

// Group by prefix
const groups = {};
uniqueRoutes.forEach(r => {
  let group = 'Other';
  if (r.path.startsWith('/api/health')) group = 'Health';
  else if (r.path.startsWith('/api/auth')) group = 'Auth';
  else if (r.path.startsWith('/api/categories')) group = 'Categories';
  else if (r.path.startsWith('/api/instructors')) group = 'Instructors';
  else if (r.path.startsWith('/api/courses')) group = 'Courses';
  else if (r.path.startsWith('/api/me')) group = 'Student (Me)';
  else if (r.path.startsWith('/api/admin')) group = 'Admin';
  else if (r.path === '/api/search') group = 'Search';
  else if (r.path === '/api') group = 'Root';

  if (!groups[group]) groups[group] = [];
  groups[group].push(r);
});

for (const [grp, rts] of Object.entries(groups)) {
  console.log(`\n=== ${grp} (${rts.length} routes) ===`);
  rts.forEach(r => console.log(`  ${r.method.padEnd(6)} ${r.path}`));
}
