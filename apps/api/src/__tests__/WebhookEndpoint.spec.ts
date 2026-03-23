import { WebhookEndpointModule } from '../modules/WebhookEndpoint';
import { Database } from '../modules/Database';
import { WebhookEndpointRecord } from '@zoneless/shared-types';
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

describe('WebhookEndpointModule', () => {
  let module: WebhookEndpointModule;
  let mockDb: jest.Mocked<Database>;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    module = new WebhookEndpointModule(mockDb);
  });

  describe('CreateWebhookEndpointRecord', () => {
    it('should build a record with a generated secret', () => {
      const record = module.CreateWebhookEndpointRecord('acct_z_platform', {
        url: 'https://example.com/webhooks',
        enabled_events: ['account.created', 'payout.paid'],
      });

      expect(record.object).toBe('webhook_endpoint');
      expect(record.account).toBe('acct_z_platform');
      expect(record.platform_account).toBe('acct_z_platform');
      expect(record.url).toBe('https://example.com/webhooks');
      expect(record.enabled_events).toEqual(['account.created', 'payout.paid']);
      expect(record.status).toBe('enabled');
      expect(record.secret).toMatch(/^whsec_z_test/);
    });

    it('should support wildcard event subscription', () => {
      const record = module.CreateWebhookEndpointRecord('acct_z_platform', {
        url: 'https://example.com/webhooks',
        enabled_events: ['*'],
      });

      expect(record.enabled_events).toEqual(['*']);
    });
  });

  describe('CreateWebhookEndpoint', () => {
    it('should persist and return the endpoint with secret', async () => {
      const endpoint = await module.CreateWebhookEndpoint('acct_z_platform', {
        url: 'https://example.com/webhooks',
        enabled_events: ['*'],
      });

      expect(mockDb.Set).toHaveBeenCalledTimes(1);
      expect(endpoint.object).toBe('webhook_endpoint');
      expect(endpoint.url).toBe('https://example.com/webhooks');
      expect(endpoint.secret).toBeTruthy();
    });
  });

  describe('GetWebhookEndpointsForEvent', () => {
    it('should return endpoints subscribed to the exact event', async () => {
      const endpoints: WebhookEndpointRecord[] = [
        {
          id: 'we_z_1',
          object: 'webhook_endpoint',
          account: 'acct_z_platform',
          platform_account: 'acct_z_platform',
          url: 'https://example.com/webhooks',
          enabled_events: ['account.created'],
          status: 'enabled',
          secret: 'whsec_z_abc',
          created: GetFixedTimestamp(),
          livemode: false,
          metadata: {},
          api_version: null,
          application: null,
          description: null,
        },
      ];
      mockDb.Find = jest.fn().mockResolvedValue(endpoints);

      const result = await module.GetWebhookEndpointsForEvent(
        'acct_z_platform',
        'account.created'
      );

      expect(result).toHaveLength(1);
    });

    it('should return endpoints with wildcard subscription', async () => {
      const endpoints: WebhookEndpointRecord[] = [
        {
          id: 'we_z_1',
          object: 'webhook_endpoint',
          account: 'acct_z_platform',
          platform_account: 'acct_z_platform',
          url: 'https://example.com/webhooks',
          enabled_events: ['*'],
          status: 'enabled',
          secret: 'whsec_z_abc',
          created: GetFixedTimestamp(),
          livemode: false,
          metadata: {},
          api_version: null,
          application: null,
          description: null,
        },
      ];
      mockDb.Find = jest.fn().mockResolvedValue(endpoints);

      const result = await module.GetWebhookEndpointsForEvent(
        'acct_z_platform',
        'payout.paid'
      );

      expect(result).toHaveLength(1);
    });

    it('should exclude disabled endpoints', async () => {
      const endpoints: WebhookEndpointRecord[] = [
        {
          id: 'we_z_1',
          object: 'webhook_endpoint',
          account: 'acct_z_platform',
          platform_account: 'acct_z_platform',
          url: 'https://example.com/webhooks',
          enabled_events: ['*'],
          status: 'disabled',
          secret: 'whsec_z_abc',
          created: GetFixedTimestamp(),
          livemode: false,
          metadata: {},
          api_version: null,
          application: null,
          description: null,
        },
      ];
      mockDb.Find = jest.fn().mockResolvedValue(endpoints);

      const result = await module.GetWebhookEndpointsForEvent(
        'acct_z_platform',
        'account.created'
      );

      expect(result).toHaveLength(0);
    });

    it('should exclude endpoints not subscribed to the event', async () => {
      const endpoints: WebhookEndpointRecord[] = [
        {
          id: 'we_z_1',
          object: 'webhook_endpoint',
          account: 'acct_z_platform',
          platform_account: 'acct_z_platform',
          url: 'https://example.com/webhooks',
          enabled_events: ['payout.paid'],
          status: 'enabled',
          secret: 'whsec_z_abc',
          created: GetFixedTimestamp(),
          livemode: false,
          metadata: {},
          api_version: null,
          application: null,
          description: null,
        },
      ];
      mockDb.Find = jest.fn().mockResolvedValue(endpoints);

      const result = await module.GetWebhookEndpointsForEvent(
        'acct_z_platform',
        'account.created'
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('DeleteWebhookEndpoint', () => {
    it('should delete the endpoint and return confirmation', async () => {
      const result = await module.DeleteWebhookEndpoint('we_z_1');

      expect(mockDb.Delete).toHaveBeenCalledWith('WebhookEndpoints', 'we_z_1');
      expect(result).toEqual({
        id: 'we_z_1',
        object: 'webhook_endpoint',
        deleted: true,
      });
    });
  });
});
