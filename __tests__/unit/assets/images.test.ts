/**
 * T102-T104: Asset validation tests
 * Verifies that all entity images exist and are mapped correctly.
 */

import fs from 'fs';
import path from 'path';
import { ENEMY_IMAGES, BOSS_IMAGES, POI_IMAGES } from '../../../src/components/game/entityImages';
import { ENEMY_DEFINITIONS } from '../../../src/game/entities/enemies';
import { BOSSES } from '../../../src/data/bosses';
import { POI_DEFINITIONS } from '../../../src/data/pois';
import type { EnemyId } from '../../../src/game/map/types';
import type { BossId, POIId } from '../../../src/game/engine/types';

describe('Asset Validation', () => {
  // ============================================================================
  // T102: Enemy Images
  // ============================================================================
  it('should have images for all defined enemies', () => {
    const definedEnemies = Object.keys(ENEMY_DEFINITIONS) as EnemyId[];

    definedEnemies.forEach((id) => {
      expect(ENEMY_IMAGES[id]).toBeDefined();
    });

    // Check consistency count
    expect(Object.keys(ENEMY_IMAGES).length).toBe(definedEnemies.length);
  });

  // ============================================================================
  // T103: Boss Images
  // ============================================================================
  it('should have images for all defined bosses', () => {
    const definedBosses = Object.keys(BOSSES) as BossId[];

    definedBosses.forEach((id) => {
      expect(BOSS_IMAGES[id]).toBeDefined();
    });

    // Check consistency count
    expect(Object.keys(BOSS_IMAGES).length).toBe(definedBosses.length);
  });

  // ============================================================================
  // T104: POI Images
  // ============================================================================
  it('should have images for all defined POIs', () => {
    const definedPOIs = Object.keys(POI_DEFINITIONS) as POIId[];

    definedPOIs.forEach((id) => {
      expect(POI_IMAGES[id]).toBeDefined();
    });

    // Check consistency count
    expect(Object.keys(POI_IMAGES).length).toBe(definedPOIs.length);
  });

  // ============================================================================
  // Physical File Verification
  // ============================================================================
  it('verifies asset files exist on disk', () => {
    const mappingPath = path.join(__dirname, '../../../src/components/game/entityImages.ts');
    const fileContent = fs.readFileSync(mappingPath, 'utf8');
    const requireMatches = fileContent.matchAll(/require\('([^']+)'\)/g);

    let matchCount = 0;
    for (const match of requireMatches) {
      const relPath = match[1];
      const absPath = path.resolve(path.dirname(mappingPath), relPath);

      // Use expect inside loop to identify missing file
      if (!fs.existsSync(absPath)) {
        console.error(`Missing asset: ${absPath}`);
      }
      expect(fs.existsSync(absPath)).toBe(true);
      matchCount++;
    }

    expect(matchCount).toBeGreaterThan(0);
  });
});
