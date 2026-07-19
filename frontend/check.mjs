import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.resolve(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src').filter(f => f.endsWith('.js') || f.endsWith('.jsx'));
let errors = 0;

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  // Check standard imports
  const importRegex = /import\s+.*?from\s+['"](.*?)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    checkImport(file, match[1]);
  }
  // Check dynamic imports
  const dynamicImportRegex = /import\(['"](.*?)['"]\)/g;
  while ((match = dynamicImportRegex.exec(content)) !== null) {
    checkImport(file, match[1]);
  }
});

function checkImport(file, importPath) {
  if (importPath.startsWith('.')) {
    const dir = path.dirname(file);
    let targetPath = path.resolve(dir, importPath);
    const targetDir = path.dirname(targetPath);
    const targetName = path.basename(targetPath);
    
    try {
      const filesInDir = fs.readdirSync(targetDir);
      let found = false;
      for (const f of filesInDir) {
         if (f === targetName) { found = true; break; }
         if (f === targetName + '.js' || f === targetName + '.jsx' || f === targetName + '.css') { found = true; break; }
         if (targetName === f && fs.statSync(path.join(targetDir, f)).isDirectory()) { found = true; break; }
      }
      
      if (!found) {
         const lowerName = targetName.toLowerCase();
         const mismatch = filesInDir.find(f => f.toLowerCase() === lowerName || f.toLowerCase() === lowerName + '.js' || f.toLowerCase() === lowerName + '.jsx' || f.toLowerCase() === lowerName + '.css');
         if (mismatch) {
            console.log(`Case mismatch in ${file}:\n  imported: ${importPath}\n  found: ${mismatch}`);
            errors++;
         }
      }
    } catch(e) {}
  }
}

if (errors === 0) console.log('No case mismatches found.');
