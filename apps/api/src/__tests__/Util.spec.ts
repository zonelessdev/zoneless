import { z } from 'zod';
import {
  GetValidUpdateObject,
  ValidStringLength,
  ValidateUpdate,
  StripUndefined,
} from '../modules/Util';

describe('Util', () => {
  describe('GetValidUpdateObject', () => {
    it('should only keep allowed fields', () => {
      const result = GetValidUpdateObject(['email', 'name'], {
        email: 'test@example.com',
        name: 'Test',
        id: 'should_be_stripped',
      });

      expect(result).toEqual({
        email: 'test@example.com',
        name: 'Test',
      });
      expect(result.id).toBeUndefined();
    });

    it('should skip undefined and null values', () => {
      const result = GetValidUpdateObject(['email', 'name'], {
        email: undefined,
        name: null,
      });

      expect(result).toEqual({});
    });
  });

  describe('ValidStringLength', () => {
    it('should return true when within bounds', () => {
      expect(ValidStringLength('hello', 1, 10)).toBe(true);
    });

    it('should return true at exact boundaries', () => {
      expect(ValidStringLength('abc', 3, 3)).toBe(true);
    });

    it('should return false when too short', () => {
      expect(ValidStringLength('', 1, 10)).toBe(false);
    });

    it('should return false when too long', () => {
      expect(ValidStringLength('hello world', 1, 5)).toBe(false);
    });
  });

  describe('ValidateUpdate', () => {
    const testSchema = z.object({
      email: z.string().email().optional(),
      name: z.string().min(1).optional(),
    });

    it('should return validated data for valid input', () => {
      const result = ValidateUpdate(testSchema, {
        email: 'test@example.com',
        name: 'Test',
      });

      expect(result).toEqual({
        email: 'test@example.com',
        name: 'Test',
      });
    });

    it('should throw AppError for invalid input', () => {
      expect(() =>
        ValidateUpdate(testSchema, { email: 'not-an-email' })
      ).toThrow();
    });
  });

  describe('StripUndefined', () => {
    it('should remove undefined values', () => {
      const result = StripUndefined({
        a: 'keep',
        b: undefined,
        c: null,
        d: 0,
        e: '',
      });

      expect(result).toEqual({
        a: 'keep',
        c: null,
        d: 0,
        e: '',
      });
    });

    it('should return empty object when all values are undefined', () => {
      const result = StripUndefined({
        a: undefined,
        b: undefined,
      });

      expect(result).toEqual({});
    });
  });
});
