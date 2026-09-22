import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Contract Independence Test (Architectural Invariant)', () => {
  const projectRoot = path.resolve(__dirname, '..');
  const srcDir = path.join(projectRoot, 'src');

  it('ensures no C/C++ firmware files or headers exist in the Web Editor source tree', () => {
    function scanForCppFiles(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanForCppFiles(fullPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          expect(['.c', '.cpp', '.h', '.hpp', '.inl']).not.toContain(ext);
        }
      }
    }

    scanForCppFiles(srcDir);
  });

  it('ensures src/ contains zero imports or references to firmware runtimes (LVGL, Arduino, ESP-IDF, PlatformIO, CompactParamSet)', () => {
    const forbiddenPatterns = [
      'Arduino.h',
      'esp_err.h',
      'lvgl.h',
      'CompactParamSet',
      'dense parameter',
      'voxlink',
      'PlatformIO',
      'freertos',
    ];

    function scanFileContents(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanFileContents(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const content = fs.readFileSync(fullPath, 'utf8');
          for (const pattern of forbiddenPatterns) {
            const hasPattern = content.toLowerCase().includes(pattern.toLowerCase());
            expect(
              hasPattern,
              `File '${path.relative(projectRoot, fullPath)}' must not reference '${pattern}'`
            ).toBe(false);
          }
        }
      }
    }

    scanFileContents(srcDir);
  });
});
