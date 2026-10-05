import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, '..', 'public');
const rootFiles = await readdir(path.join(root, '..'), { withFileTypes: true });
const publicScripts = new Set(['admin.js', 'fortuneLogic.js', 'script.js', 'xp-config.js']);
const publicFiles = rootFiles
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => {
    const extension = path.extname(name).toLowerCase();
    return extension === '.html' || extension === '.png' || name === 'styles.css' || publicScripts.has(name);
  });

await mkdir(output, { recursive: true });
await Promise.all(publicFiles.map((name) => copyFile(path.join(root, '..', name), path.join(output, name))));
