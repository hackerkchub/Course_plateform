import app from '../src/app.js';

function printRoutes(stack, prefix = '') {
  let routes = [];
  stack.forEach(middleware => {
    if (middleware.route) {
      const methods = Object.keys(middleware.route.methods).map(m => m.toUpperCase()).join(',');
      routes.push({ path: (prefix + middleware.route.path).replace(/\/\//g, '/'), methods });
    } else if (middleware.name === 'router' && middleware.handle && middleware.handle.stack) {
      let nextPrefix = prefix;
      // Express layer regex inspect
      const match = middleware.regexp.source.match(/\\\/(api[^\/\\?]*)/);
      if (match) {
        nextPrefix = '/' + match[1];
      }
      routes = routes.concat(printRoutes(middleware.handle.stack, nextPrefix));
    }
  });
  return routes;
}

const routes = printRoutes(app._router.stack);
console.log('Total routes count:', routes.length);
routes.sort((a,b) => a.path.localeCompare(b.path));
routes.forEach((r, idx) => console.log(`${idx + 1}. [${r.methods}] ${r.path}`));
