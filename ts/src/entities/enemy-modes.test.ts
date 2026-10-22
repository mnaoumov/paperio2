import {
  describe,
  expect,
  it
} from 'vitest';

import { botStates } from './bot-ai.ts';
import {
  DEFAULT_ENEMY_SETTINGS,
  ENEMY_STATE_TABLES,
  enemyStateTableById,
  enemyStateTableId,
  parseEnemySettings
} from './enemy-modes.ts';

describe('parseEnemySettings', () => {
  it('falls back to the defaults for nothing stored or broken JSON', () => {
    expect(parseEnemySettings(null)).toEqual(DEFAULT_ENEMY_SETTINGS);
    expect(parseEnemySettings('{')).toEqual(DEFAULT_ENEMY_SETTINGS);
    expect(parseEnemySettings('"chase"')).toEqual(DEFAULT_ENEMY_SETTINGS);
  });

  it('keeps every known value', () => {
    expect(parseEnemySettings(JSON.stringify({ count: 30, level: 0.25, mode: 'pack', vision: 'blackbox' }))).toEqual({ count: 30, level: 0.25, mode: 'pack', vision: 'blackbox' });
  });

  it('drops unknown values field by field', () => {
    expect(parseEnemySettings(JSON.stringify({ count: 7, level: 2, mode: 'zombies', vision: 'xray' }))).toEqual(DEFAULT_ENEMY_SETTINGS);
    expect(parseEnemySettings(JSON.stringify({ mode: 'suicidal' }))).toEqual({ ...DEFAULT_ENEMY_SETTINGS, mode: 'suicidal' });
  });
});

describe('the state tables', () => {
  it('starts with the original and gives every table an id a save can name it by', () => {
    expect(ENEMY_STATE_TABLES[0]).toBe(botStates);
    for (const table of ENEMY_STATE_TABLES) {
      const id = enemyStateTableId(table);
      expect(id).toBeDefined();
      expect(enemyStateTableById(id ?? '')).toBe(table);
    }
    expect(new Set(ENEMY_STATE_TABLES.map((table) => enemyStateTableId(table))).size).toBe(ENEMY_STATE_TABLES.length);
  });

  it('carries every state of the original, so a switch mid-run never strands a bot', () => {
    for (const table of ENEMY_STATE_TABLES) {
      for (const state of Object.keys(botStates)) {
        expect(table[state], `${String(enemyStateTableId(table))} lacks ${state}`).toBeDefined();
      }
    }
  });

  it('knows no table for an object that is none', () => {
    expect(enemyStateTableId({})).toBeUndefined();
    expect(enemyStateTableById('zombies')).toBeUndefined();
  });
});
