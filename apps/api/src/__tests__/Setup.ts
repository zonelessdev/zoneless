/**
 * Shared test setup and mock factories for Zoneless API unit tests.
 *
 * Provides a consistent `MockDatabase` and deterministic ID/timestamp
 * helpers so every test file can spin up modules the same way.
 */

import { Database } from '../modules/Database';

// ---------------------------------------------------------------------------
// Deterministic ID generator
// ---------------------------------------------------------------------------
let idCounter = 0;

export function ResetIdCounter(): void {
  idCounter = 0;
}

/**
 * Returns a deterministic ID using the given prefix.
 * Counter increments per call so multiple IDs in the same test are unique.
 */
export function DeterministicId(prefix: string): string {
  idCounter++;
  return `${prefix}_test${String(idCounter).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Fixed timestamp
// ---------------------------------------------------------------------------
const FIXED_TIMESTAMP = 1700000000; // 2023-11-14T22:13:20Z

export function GetFixedTimestamp(): number {
  return FIXED_TIMESTAMP;
}

// ---------------------------------------------------------------------------
// Mock Database factory
// ---------------------------------------------------------------------------
export function CreateMockDatabase(): jest.Mocked<Database> {
  const mockDb = new Database() as jest.Mocked<Database>;

  mockDb.Set = jest.fn().mockResolvedValue(undefined);
  mockDb.Get = jest.fn().mockResolvedValue(null);
  mockDb.Update = jest.fn().mockResolvedValue(undefined);
  mockDb.Delete = jest.fn().mockResolvedValue({ deletedCount: 1 });
  mockDb.Find = jest.fn().mockResolvedValue([]);
  mockDb.Find2Custom = jest.fn().mockResolvedValue([]);
  mockDb.FindCustom = jest.fn().mockResolvedValue([]);
  mockDb.GetAll = jest.fn().mockResolvedValue([]);
  mockDb.Query = jest.fn().mockResolvedValue([]);
  mockDb.Aggregate = jest.fn().mockResolvedValue([]);
  mockDb.RunTransaction = jest.fn().mockImplementation(async (fn) => {
    const fakeSession = {} as any;
    return fn(fakeSession);
  });

  return mockDb;
}
