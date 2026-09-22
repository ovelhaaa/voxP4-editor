import { describe, it, expect } from 'vitest';
import { catalog } from '../src/domain/catalog';
import fs from 'node:fs';
import path from 'node:path';

describe('Wire ID Independence Rule', () => {
  it('ensures ParameterCatalog does not expose wire ID lookup', () => {
    // Parameter identity is strictly semantic name
    expect((catalog as any).getByWireId).toBeUndefined();
  });

  it('ensures authoring logic in src/ never indexes or searches by wireId', () => {
    const srcDir = path.resolve(__dirname, '../src');

    function checkFiles(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkFiles(full);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const content = fs.readFileSync(full, 'utf8');
          // Should not use wireId as an accessor or method
          expect(content).not.toContain('getByWireId');
          expect(content).not.toContain('parameters[wireId]');
        }
      }
    }

    checkFiles(srcDir);
  });
});
