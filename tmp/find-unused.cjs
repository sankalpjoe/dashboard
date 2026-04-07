const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'frontend', 'src');

function walk(dir){
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if(stat && stat.isDirectory()){
      results = results.concat(walk(full));
    } else if(/\.(ts|tsx|js|jsx)$/.test(full)){
      results.push(full);
    }
  });
  return results;
}

const files = walk(root);
const idFromPath = p => path.relative(root, p).replace(/\\/g, '/');

// read imports
const importMap = new Map(); // file -> set of imported relative ids
files.forEach(f => {
  const src = fs.readFileSync(f, 'utf8');
  const imports = new Set();
  const re = /import\s+(?:[^'";]+)\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while((m = re.exec(src))){
    imports.add(m[1]);
  }
  importMap.set(idFromPath(f), imports);
});

// build reverse map: resolve imports to actual files under root when possible
const candidates = new Map(); // id -> {path, inbound: Set}
files.forEach(f => candidates.set(idFromPath(f), { path: f, inbound: new Set() }));

function resolveImport(fromId, imp){
  // handle alias '@/...' -> frontend/src/...
  if(imp.startsWith('@/')){
    const rel = imp.replace(/^@\//, '');
    // try with extensions
    const tryPaths = [rel, rel + '.tsx', rel + '.ts', rel + '/index.tsx', rel + '/index.ts'];
    for(const t of tryPaths){
      const full = path.join(root, t);
      if(fs.existsSync(full)) return idFromPath(full);
    }
    return null;
  }
  // relative paths
  if(imp.startsWith('.')){
    const dir = path.dirname(path.join(root, fromId));
    const tryPaths = [imp, imp + '.tsx', imp + '.ts', imp + '/index.tsx', imp + '/index.ts'];
    for(const t of tryPaths){
      const full = path.join(dir, t);
      if(fs.existsSync(full)) return idFromPath(full);
    }
    return null;
  }
  return null;
}

for(const [fid, imports] of importMap.entries()){
  for(const imp of imports){
    const resolved = resolveImport(fid, imp);
    if(resolved && candidates.has(resolved)){
      candidates.get(resolved).inbound.add(fid);
    }
  }
}

// Identify files under components/ with zero inbound references (excluding entrypoints like main.tsx, App.tsx, pages)
const unused = [];
for(const [id, info] of candidates.entries()){
  if(!id.startsWith('components/')) continue;
  const basename = path.basename(id);
  if(info.inbound.size === 0){
    if(id === 'main.tsx' || id === 'App.tsx') continue;
    unused.push({ id, path: info.path });
  }
}

console.log('Found', unused.length, 'component files with zero inbound imports:');
unused.forEach(u => console.log(u.id));
fs.writeFileSync(path.join(__dirname, 'unused-front-files.json'), JSON.stringify(unused, null, 2));
console.log('\nWrote tmp/unused-front-files.json');
