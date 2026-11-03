const fs = require('fs');
const path = require('path');

const targets = [
  {
    filePath: path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'build', 'swc', 'index.js'),
    from: 'const importedRawBindings = await import((0, _url.pathToFileURL)(pkgPath).toString());',
    to: 'const importedRawBindings = await import(importPath ? (0, _url.pathToFileURL)(pkgPath).toString() : pkg);'
  },
  {
    filePath: path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'esm', 'build', 'swc', 'index.js'),
    from: 'const importedRawBindings = await import(pathToFileURL(pkgPath).toString());',
    to: 'const importedRawBindings = await import(importPath ? pathToFileURL(pkgPath).toString() : pkg);'
  }
];

for (const { filePath, from, to } of targets) {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    if (content.includes(from)) {
      content = content.replace(from, to);
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`[patch-next-swc] Successfully patched ${filePath}`);
    } else {
      console.log(`[patch-next-swc] Already patched or pattern not found in ${filePath}`);
    }
  }
}
