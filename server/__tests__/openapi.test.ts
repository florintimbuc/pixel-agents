import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

import { createOpenApiJson } from '../src/openapi.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const openApiPath = path.resolve(testDir, '../openapi.json');

describe('OpenAPI spec', () => {
  it('matches the generated document', () => {
    expect(fs.readFileSync(openApiPath, 'utf8')).toBe(createOpenApiJson());
  });
});
