import app from '../src/app.js';

function split(thing) {
  if (typeof thing === 'string') {
    return thing.split('/');
  } else if (thing.fast_slash) {
    return '';
  } else {
    var match = thing.toString()
      .replace('\\/?', '')
      .replace('(?=\\/|$)', '$')
      .match(/^\/\^\\((?:\\[*+?(){}.^$|\\/]|[^\\/])*)\\\?\$$/);
    return match
      ? match[1].replace(/\\(.)/g, '$1').split('/')
      : '<complex:' + thing.toString() + '>';
  }
}

function getRoutes(app) {
  const routes = [];

  function print(path, layer) {
    if (layer.route) {
      layer.route.stack.forEach(print.bind(null, path.concat(split(layer.route.path))));
    } else if (layer.name === 'router' && layer.handle.stack) {
      layer.handle.stack.forEach(print.bind(null, path.concat(split(layer.regexp))));
    } else if (layer.method) {
      routes.push({
        method: layer.method.toUpperCase(),
        path: path.concat(split(layer.params)).filter(Boolean).join('/')
      });
    }
  }

  app._router.stack.forEach(print.bind(null, []));
  return routes;
}

const all = getRoutes(app);
console.log('Total route entries in router stack:', all.length);

// Format each route as Method /path
const formatted = all.map(r => `${r.method.padEnd(7)} /${r.path.replace(/\/\//g, '/')}`);

// Sort and unique
const uniqueList = Array.from(new Set(formatted)).sort();
console.log('Unique routes count:', uniqueList.length);

uniqueList.forEach((r, idx) => console.log(`${String(idx + 1).padStart(3, ' ')}. ${r}`));
