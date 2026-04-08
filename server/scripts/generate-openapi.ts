import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { createOpenApiJson } from '../src/openapi.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(scriptDir, '../openapi.json');
const nextJson = createOpenApiJson();
const previousJson = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : null;

if (previousJson === nextJson) {
  console.log(`[Pixel Agents] OpenAPI spec already up to date: ${outputPath}`);
} else {
  fs.writeFileSync(outputPath, nextJson, 'utf8');
  console.log(`[Pixel Agents] Wrote OpenAPI spec: ${outputPath}`);
}
