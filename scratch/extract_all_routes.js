import app from '../src/app.js';

function getRoutes(app) {
  const routes = [];

  function print(path, layer) {
    if (layer.route) {
      layer.route.stack.forEach((stackItem) => {
        const method = stackItem.method ? stackItem.method.toUpperCase() : 'ALL';
        routes.push({
          method,
          path: (path + (layer.route.path === '/' ? '' : layer.route.path)).replace(/\/+/g, '/')
        });
      });
    } else if (layer.name === 'router' && layer.handle.stack) {
      let subPath = '';
      if (layer.regexp) {
        const str = layer.regexp.source;
        // extract prefix from regex
        const match = str.match(/^\^\\?(\/.*?)(?:\\\/\?\(?=\\\/\|\$\)\?)?\/?\?\(?:\(\?=\\\/\|\$\)\)\?/);
        if (match) {
          subPath = match[1].replace(/\\\//g, '/').replace(/\\\./g, '.');
        } else {
          // fallback cleaner regex extract
          const clean = str
            .replace('\\/?(?=\\/|$)', '')
            .replace('^', '')
            .replace('/?(?=\\/|$)', '')
            .replace('(?=\\/|$)', '')
            .replace('\\', '')
            .replace('\\', '')
            .replace(/\\\//g, '/');
          subPath = clean;
        }
      }
      layer.handle.stack.forEach((subLayer) => {
        print(path + (subPath.startsWith('/') ? subPath : '/' + subPath), subLayer);
      });
    }
  }

  app._router.stack.forEach((layer) => {
    print('', layer);
  });

  return routes;
}

const routes = getRoutes(app);
console.log(`Total registered endpoint handlers: ${routes.length}`);

// Deduplicate by method + path
const uniqueMap = new Map();
routes.forEach(r => {
  const key = `${r.method} ${r.path}`;
  uniqueMap.set(key, r);
});

console.log(`Total unique endpoints: ${uniqueMap.size}\n`);

const sorted = Array.from(uniqueMap.values()).sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
sorted.forEach(r => {
  console.log(`${r.method.padEnd(7)} ${r.path}`);
});
