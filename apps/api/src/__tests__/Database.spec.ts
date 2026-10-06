import { Database } from '../modules/Database';
import { QueryOperators } from '@zoneless/shared-types';

describe('Database', () => {
  let db: Database;
  let find: jest.Mock;

  beforeEach(() => {
    db = new Database();
    const query = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    find = jest.fn().mockReturnValue(query);
    jest
      .spyOn(db as unknown as { GetModel: () => unknown }, 'GetModel')
      .mockReturnValue({ find });
  });

  describe('Query', () => {
    it('should combine range conditions on the same field', async () => {
      await db.Query({
        collection: 'Charges',
        method: 'READ',
        parameters: [
          { key: 'created', operator: QueryOperators['>='], value: 1010 },
          { key: 'created', operator: QueryOperators['<='], value: 1020 },
          { key: 'account', operator: QueryOperators['=='], value: 'acct_1' },
        ],
      });

      expect(find).toHaveBeenCalledWith({
        created: { $gte: 1010, $lte: 1020 },
        account: 'acct_1',
      });
    });

    it('should keep range conditions when paginating with startAfter', async () => {
      await db.Query({
        collection: 'Charges',
        method: 'READ',
        parameters: [
          { key: 'created', operator: QueryOperators['>'], value: 1000 },
          { key: 'created', operator: QueryOperators['<'], value: 1030 },
        ],
        orderBy: [{ key: 'created', direction: 'desc' }],
        startAfter: 1025,
      });

      expect(find).toHaveBeenLastCalledWith({
        created: { $gt: 1000, $lt: 1025 },
      });
    });

    it('should replace an equality condition on the same field', async () => {
      await db.Query({
        collection: 'Charges',
        method: 'READ',
        parameters: [
          { key: 'status', operator: QueryOperators['=='], value: 'pending' },
          { key: 'status', operator: QueryOperators['=='], value: 'succeeded' },
        ],
      });

      expect(find).toHaveBeenCalledWith({ status: 'succeeded' });
    });
  });
});
