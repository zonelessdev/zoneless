import { PersonModule } from '../modules/Person';
import { Database } from '../modules/Database';
import { Person } from '@zoneless/shared-types';
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

describe('PersonModule', () => {
  let module: PersonModule;
  let mockDb: jest.Mocked<Database>;

  beforeEach(() => {
    jest.clearAllMocks();
    ResetIdCounter();
    mockDb = CreateMockDatabase();
    module = new PersonModule(mockDb);
  });

  describe('CreatePersonObject', () => {
    it('should create a person with sensible defaults', () => {
      const person = module.CreatePersonObject(
        'acct_z_1',
        'acct_z_platform',
        {}
      );

      expect(person.object).toBe('person');
      expect(person.account).toBe('acct_z_1');
      expect(person.platform_account).toBe('acct_z_platform');
      expect(person.first_name).toBeNull();
      expect(person.last_name).toBeNull();
      expect(person.email).toBeNull();
      expect(person.id_number_provided).toBe(false);
      expect(person.ssn_last_4_provided).toBe(false);
      expect(person.verification?.status).toBe('unverified');
      expect(person.relationship?.representative).toBe(false);
    });

    it('should accept provided input fields', () => {
      const person = module.CreatePersonObject('acct_z_1', 'acct_z_platform', {
        first_name: 'Alice',
        last_name: 'Smith',
        email: 'alice@example.com',
        phone: '+15551234567',
        dob: { day: 15, month: 3, year: 1990 },
        relationship: { representative: true, title: 'CEO' },
      });

      expect(person.first_name).toBe('Alice');
      expect(person.last_name).toBe('Smith');
      expect(person.email).toBe('alice@example.com');
      expect(person.phone).toBe('+15551234567');
      expect(person.dob).toEqual({ day: 15, month: 3, year: 1990 });
      expect(person.relationship?.representative).toBe(true);
      expect(person.relationship?.title).toBe('CEO');
    });

    it('should mark id_number_provided when id_number is given', () => {
      const person = module.CreatePersonObject('acct_z_1', 'acct_z_platform', {
        id_number: '123456789',
      });

      expect(person.id_number_provided).toBe(true);
    });

    it('should mark ssn_last_4_provided when ssn_last_4 is given', () => {
      const person = module.CreatePersonObject('acct_z_1', 'acct_z_platform', {
        ssn_last_4: '1234',
      });

      expect(person.ssn_last_4_provided).toBe(true);
    });

    it('should handle address input', () => {
      const person = module.CreatePersonObject('acct_z_1', 'acct_z_platform', {
        address: {
          line1: '123 Main St',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94105',
          country: 'US',
        },
      });

      expect(person.address?.line1).toBe('123 Main St');
      expect(person.address?.city).toBe('San Francisco');
      expect(person.address?.country).toBe('US');
    });
  });

  describe('CreatePerson', () => {
    it('should persist the person to the database', async () => {
      mockDb.Get = jest.fn().mockResolvedValue({
        id: 'acct_z_1',
        platform_account: 'acct_z_platform',
      });

      const person = await module.CreatePerson('acct_z_1', {
        first_name: 'Bob',
        last_name: 'Jones',
      });

      expect(mockDb.Set).toHaveBeenCalledWith(
        'Persons',
        person.id,
        expect.objectContaining({
          first_name: 'Bob',
          last_name: 'Jones',
          account: 'acct_z_1',
        })
      );
    });

    it('should throw when the parent account is not found', async () => {
      await expect(
        module.CreatePerson('nonexistent', { first_name: 'Test' })
      ).rejects.toThrow('Account not found');
    });
  });

  describe('GetPerson', () => {
    it('should return the person when found', async () => {
      const mockPerson = { id: 'person_z_1', object: 'person' } as Person;
      mockDb.Get = jest.fn().mockResolvedValue(mockPerson);

      const result = await module.GetPerson('person_z_1');
      expect(result).toEqual(mockPerson);
    });

    it('should return null when not found', async () => {
      const result = await module.GetPerson('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('DeletePerson', () => {
    it('should delete the person and return confirmation', async () => {
      mockDb.Get = jest.fn().mockResolvedValue({
        id: 'person_z_1',
        object: 'person',
        account: 'acct_z_1',
      });

      const result = await module.DeletePerson('person_z_1');

      expect(mockDb.Delete).toHaveBeenCalledWith('Persons', 'person_z_1');
      expect(result).toEqual({
        id: 'person_z_1',
        object: 'person',
        deleted: true,
      });
    });

    it('should throw when person not found', async () => {
      await expect(module.DeletePerson('nonexistent')).rejects.toThrow(
        'Person not found'
      );
    });
  });

  describe('IsOwnerOfPerson', () => {
    it('should return true if person belongs to the account', async () => {
      mockDb.Get = jest.fn().mockResolvedValue({
        id: 'person_z_1',
        account: 'acct_z_1',
      });

      const result = await module.IsOwnerOfPerson('person_z_1', 'acct_z_1');
      expect(result).toBe(true);
    });

    it('should return false if person belongs to a different account', async () => {
      mockDb.Get = jest.fn().mockResolvedValue({
        id: 'person_z_1',
        account: 'acct_z_other',
      });

      const result = await module.IsOwnerOfPerson('person_z_1', 'acct_z_1');
      expect(result).toBe(false);
    });

    it('should return false if person not found', async () => {
      const result = await module.IsOwnerOfPerson('nonexistent', 'acct_z_1');
      expect(result).toBe(false);
    });
  });
});
