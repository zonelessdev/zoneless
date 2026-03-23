import { EventModule, ExtractChangedFields } from '../modules/Event';
import { Database } from '../modules/Database';
import { Event } from '@zoneless/shared-types';
import {
  CreateMockDatabase,
  DeterministicId,
  ResetIdCounter,
  GetFixedTimestamp,
} from './Setup';

jest.mock('../modules/Database');
jest.mock('../utils/IdGenerator', () => ({
  GenerateId: jest.fn((prefix: string) => DeterministicId(prefix)),
}));
jest.mock('../utils/Timestamp', () => ({
  Now: jest.fn(() => GetFixedTimestamp()),
}));
jest.mock('../modules/AppConfig', () => ({
  GetAppConfig: jest.fn(() => ({
    dashboardUrl: 'http://localhost:4200',
    livemode: false,
    appSecret: 'test-secret',
  })),
}));

describe('EventModule', () => {
  let module: EventModule;
  let mockDb: jest.Mocked<Database>;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    module = new EventModule(mockDb);
  });

  describe('EventObject', () => {
    it('should create an event with correct fields', () => {
      const dataObject = { id: 'acct_z_1', object: 'account' };
      const event = module.EventObject(
        'account.created',
        'acct_z_1',
        'acct_z_platform',
        dataObject
      );

      expect(event.object).toBe('event');
      expect(event.type).toBe('account.created');
      expect(event.account).toBe('acct_z_1');
      expect(event.platform_account).toBe('acct_z_platform');
      expect(event.data.object).toEqual(dataObject);
      expect(event.data.previous_attributes).toBeNull();
      expect(event.livemode).toBe(false);
      expect(event.pending_webhooks).toBe(0);
      expect(event.id).toMatch(/^evt_z_test/);
    });

    it('should include previous_attributes when provided', () => {
      const event = module.EventObject(
        'account.updated',
        'acct_z_1',
        'acct_z_platform',
        { id: 'acct_z_1', object: 'account', email: 'new@example.com' },
        { previousAttributes: { email: 'old@example.com' } }
      );

      expect(event.data.previous_attributes).toEqual({
        email: 'old@example.com',
      });
    });

    it('should include request metadata when provided', () => {
      const event = module.EventObject(
        'account.created',
        'acct_z_1',
        'acct_z_platform',
        { id: 'acct_z_1', object: 'account' },
        { requestId: 'req_123', idempotencyKey: 'idem_456' }
      );

      expect(event.request).toEqual({
        id: 'req_123',
        idempotency_key: 'idem_456',
      });
    });
  });

  describe('CreateEvent', () => {
    it('should persist the event to the database', async () => {
      mockDb.Get = jest.fn().mockResolvedValue({
        id: 'acct_z_1',
        platform_account: 'acct_z_platform',
      });

      const event = await module.CreateEvent('account.created', 'acct_z_1', {
        id: 'acct_z_1',
        object: 'account',
      });

      expect(mockDb.Set).toHaveBeenCalledWith(
        'Events',
        event.id,
        expect.objectContaining({ type: 'account.created' })
      );
    });
  });

  describe('GetEvent', () => {
    it('should return the event when found', async () => {
      const mockEvent = { id: 'evt_z_1', object: 'event' } as Event;
      mockDb.Get = jest.fn().mockResolvedValue(mockEvent);

      const result = await module.GetEvent('evt_z_1');
      expect(result).toEqual(mockEvent);
    });

    it('should return null when not found', async () => {
      const result = await module.GetEvent('nonexistent');
      expect(result).toBeNull();
    });
  });
});

describe('ExtractChangedFields', () => {
  it('should return only fields that actually changed', () => {
    const previous = {
      name: 'John',
      email: 'john@example.com',
      age: 30,
    };
    const updates = {
      name: 'Jane',
      email: 'john@example.com', // unchanged
    };

    const result = ExtractChangedFields(previous, updates);

    expect(result).toEqual({ name: 'John' });
  });

  it('should return null when nothing changed', () => {
    const previous = { name: 'John', email: 'john@example.com' };
    const updates = { name: 'John', email: 'john@example.com' };

    const result = ExtractChangedFields(previous, updates);

    expect(result).toBeNull();
  });

  it('should handle nested object changes', () => {
    const previous = {
      settings: { theme: 'dark' },
      name: 'Test',
    };
    const updates = {
      settings: { theme: 'light' },
    };

    const result = ExtractChangedFields(previous, updates);

    expect(result).toEqual({ settings: { theme: 'dark' } });
  });

  it('should handle null values', () => {
    const previous = { name: 'John', email: null };
    const updates = { email: 'john@example.com' };

    const result = ExtractChangedFields(previous, updates);

    expect(result).toEqual({ email: null });
  });
});
