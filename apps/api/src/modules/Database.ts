/**
 * @fileOverview MongoDB Database module - type-safe database operations
 * @module Database
 */

import mongoose, { ClientSession } from 'mongoose';
import { QueryParameters, QueryOperators } from '@zoneless/shared-types';

export class Database {
  /**
   * Get a document from MongoDB by ID
   */
  async Get<T>(
    collection: string,
    documentId: string,
    session?: ClientSession
  ): Promise<T | null> {
    try {
      const model = this.GetModel(collection);
      const query = model.findOne({ id: documentId });
      if (session) query.session(session);
      const doc = await query.lean().exec();
      return doc ? this.StripMongoFields(doc as T) : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Update a document in MongoDB
   */
  async Update<T>(
    collection: string,
    documentId: string,
    data: Partial<T>,
    session?: ClientSession
  ): Promise<T | null> {
    const model = this.GetModel(collection);
    const options: mongoose.QueryOptions = { new: true };
    if (session) options.session = session;
    const result = await model
      .findOneAndUpdate({ id: documentId }, data, options)
      .lean()
      .exec();
    return result ? this.StripMongoFields(result as T) : null;
  }

  /**
   * Add a new document with auto-generated MongoDB _id
   */
  async Add<T>(collection: string, data: Partial<T>): Promise<T> {
    const model = this.GetModel(collection);
    const doc = new model(data);
    await doc.save();
    return this.StripMongoFields(doc.toObject() as T);
  }

  /**
   * Creates a new document with a custom ID field
   */
  async AddID<T>(collection: string, data: T): Promise<T> {
    const model = this.GetModel(collection);
    const doc = new model(data);
    await doc.save();
    return this.StripMongoFields(doc.toObject() as T);
  }

  /**
   * Set (upsert) a document - creates if doesn't exist, updates if exists
   */
  async Set<T>(
    collection: string,
    documentId: string,
    data: Partial<T>,
    session?: ClientSession
  ): Promise<T | null> {
    const model = this.GetModel(collection);
    const options: mongoose.QueryOptions = {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    };
    if (session) options.session = session;
    const result = await model
      .findOneAndUpdate({ id: documentId }, data, options)
      .lean()
      .exec();
    return result ? this.StripMongoFields(result as T) : null;
  }

  /**
   * Find documents where a field equals a value
   */
  async Find<T>(
    collection: string,
    field: string,
    value: unknown,
    session?: ClientSession
  ): Promise<T[]> {
    const model = this.GetModel(collection);
    const query = model.find({ [field]: value });
    if (session) query.session(session);
    const results = await query.lean().exec();
    return results.map((doc) => this.StripMongoFields(doc as T));
  }

  /**
   * Run a MongoDB transaction
   */
  async RunTransaction<T>(
    updateFunction: (session: ClientSession) => Promise<T>
  ): Promise<T> {
    const session = await mongoose.startSession();
    let commitCalled = false;
    try {
      session.startTransaction();
      const result = await updateFunction(session);
      commitCalled = true;
      await session.commitTransaction();
      return result;
    } catch (error) {
      // Only abort if we haven't attempted to commit yet
      // MongoDB doesn't allow abort after commit is called
      if (!commitCalled) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Find with custom operator
   */
  async FindCustom<T>(
    collection: string,
    field: string,
    operator: string,
    value: unknown
  ): Promise<T[]> {
    const model = this.GetModel(collection);
    const filter = this.BuildFilter(field, operator, value);
    const results = await model.find(filter).lean().exec();
    return results.map((doc) => this.StripMongoFields(doc as T));
  }

  /**
   * Find with two custom conditions
   */
  async Find2Custom<T>(
    collection: string,
    field1: string,
    operator1: string,
    value1: unknown,
    field2: string,
    operator2: string,
    value2: unknown
  ): Promise<T[]> {
    const model = this.GetModel(collection);
    const filter1 = this.BuildFilter(field1, operator1, value1);
    const filter2 = this.BuildFilter(field2, operator2, value2);
    const results = await model
      .find({ ...filter1, ...filter2 })
      .lean()
      .exec();
    return results.map((doc) => this.StripMongoFields(doc as T));
  }

  /**
   * Delete a document
   */
  async Delete(
    collection: string,
    documentId: string
  ): Promise<{ deletedCount: number }> {
    const model = this.GetModel(collection);
    const result = await model.deleteOne({ id: documentId }).exec();
    return { deletedCount: result.deletedCount };
  }

  /**
   * Get all documents from a collection
   */
  async GetAll<T>(collection: string): Promise<T[]> {
    const model = this.GetModel(collection);
    const results = await model.find().lean().exec();
    return results.map((doc) => this.StripMongoFields(doc as T));
  }

  /**
   * Get documents with a limit
   */
  async GetLimit<T>(collection: string, limit: number): Promise<T[]> {
    const model = this.GetModel(collection);
    const results = await model.find().limit(limit).lean().exec();
    return results.map((doc) => this.StripMongoFields(doc as T));
  }

  /**
   * Count documents matching a condition
   */
  async CountWhere(
    collection: string,
    field: string,
    operator: string,
    value: unknown
  ): Promise<number> {
    const model = this.GetModel(collection);
    const filter = this.BuildFilter(field, operator, value);
    return model.countDocuments(filter).exec();
  }

  /**
   * Complex query with parameters, ordering, and pagination
   */
  async Query<T>(options: QueryParameters): Promise<T[]> {
    const model = this.GetModel(options.collection);

    // Build MongoDB filter from parameters
    let filter: Record<string, unknown> = {};
    if (options.parameters) {
      for (const param of options.parameters) {
        const paramFilter = this.BuildFilter(
          param.key,
          param.operator,
          param.value
        );
        filter = { ...filter, ...paramFilter };
      }
    }

    // Build query
    let query = model.find(filter);

    // Add sorting
    if (options.orderBy && options.orderBy.length > 0) {
      const sort: Record<string, 1 | -1> = {};
      for (const order of options.orderBy) {
        sort[order.key] = order.direction === 'desc' ? -1 : 1;
      }
      query = query.sort(sort);
    }

    // Handle cursor-based pagination
    if (options.startAfter !== undefined) {
      const orderKey = options.orderBy?.[0]?.key || 'created';
      const direction = options.orderBy?.[0]?.direction || 'desc';
      if (direction === 'desc') {
        filter[orderKey] = {
          ...(filter[orderKey] as object),
          $lt: options.startAfter,
        };
      } else {
        filter[orderKey] = {
          ...(filter[orderKey] as object),
          $gt: options.startAfter,
        };
      }
      query = model.find(filter);
      if (options.orderBy) {
        const sort: Record<string, 1 | -1> = {};
        for (const order of options.orderBy) {
          sort[order.key] = order.direction === 'desc' ? -1 : 1;
        }
        query = query.sort(sort);
      }
    }

    if (options.startAt !== undefined) {
      const orderKey = options.orderBy?.[0]?.key || 'created';
      const direction = options.orderBy?.[0]?.direction || 'desc';
      if (direction === 'desc') {
        filter[orderKey] = {
          ...(filter[orderKey] as object),
          $lte: options.startAt,
        };
      } else {
        filter[orderKey] = {
          ...(filter[orderKey] as object),
          $gte: options.startAt,
        };
      }
      query = model.find(filter);
      if (options.orderBy) {
        const sort: Record<string, 1 | -1> = {};
        for (const order of options.orderBy) {
          sort[order.key] = order.direction === 'desc' ? -1 : 1;
        }
        query = query.sort(sort);
      }
    }

    if (options.endAt !== undefined) {
      const orderKey = options.orderBy?.[0]?.key || 'created';
      const direction = options.orderBy?.[0]?.direction || 'desc';
      if (direction === 'desc') {
        filter[orderKey] = {
          ...(filter[orderKey] as object),
          $gte: options.endAt,
        };
      } else {
        filter[orderKey] = {
          ...(filter[orderKey] as object),
          $lte: options.endAt,
        };
      }
      query = model.find(filter);
      if (options.orderBy) {
        const sort: Record<string, 1 | -1> = {};
        for (const order of options.orderBy) {
          sort[order.key] = order.direction === 'desc' ? -1 : 1;
        }
        query = query.sort(sort);
      }
    }

    // Add limit
    if (options.limit) {
      query = query.limit(options.limit);
    }

    // Execute based on method
    const docs = await query.lean().exec();

    switch (options.method) {
      case 'UPDATE':
        if (options.data) {
          const ids = docs.map((doc) => (doc as Record<string, unknown>).id);
          await model.updateMany({ id: { $in: ids } }, options.data).exec();
        }
        break;
      case 'DELETE': {
        const ids = docs.map((doc) => (doc as Record<string, unknown>).id);
        await model.deleteMany({ id: { $in: ids } }).exec();
        break;
      }
      case 'READ':
      default:
        break;
    }

    return docs.map((doc) => this.StripMongoFields(doc as T));
  }

  /**
   * Run a MongoDB aggregation pipeline on a collection.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async Aggregate<T>(collection: string, pipeline: any[]): Promise<T[]> {
    const model = this.GetModel(collection);
    return model.aggregate(pipeline).exec();
  }

  /**
   * Build MongoDB filter from operator
   */
  private BuildFilter(
    field: string,
    operator: string,
    value: unknown
  ): Record<string, unknown> {
    switch (operator) {
      case '<':
      case QueryOperators['<']:
        return { [field]: { $lt: value } };
      case '<=':
      case QueryOperators['<=']:
        return { [field]: { $lte: value } };
      case '==':
      case QueryOperators['==']:
        return { [field]: value };
      case '>':
      case QueryOperators['>']:
        return { [field]: { $gt: value } };
      case '>=':
      case QueryOperators['>=']:
        return { [field]: { $gte: value } };
      case '!=':
      case QueryOperators['!=']:
        return { [field]: { $ne: value } };
      case 'in':
      case QueryOperators['in']:
        return { [field]: { $in: value } };
      case 'not-in':
      case QueryOperators['not-in']:
        return { [field]: { $nin: value } };
      default:
        return { [field]: value };
    }
  }

  /**
   * Pre-create all known collections and their indexes so that concurrent
   * requests on a fresh database don't race to implicitly create them.
   */
  async EnsureCollections(): Promise<void> {
    const collections = [
      'Accounts',
      'AccountLinks',
      'ApiKeys',
      'AppSecrets',
      'Balances',
      'BalanceTransactions',
      'Events',
      'ExternalWallets',
      'LoginLinks',
      'Payouts',
      'Persons',
      'TopUps',
      'Transfers',
      'WebhookEndpoints',
    ];

    for (const name of collections) {
      const model = this.GetModel(name);
      await model.createCollection();
      await model.ensureIndexes();
    }
  }

  /**
   * Get or create a Mongoose model for a collection
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private GetModel(collectionName: string): mongoose.Model<any> {
    if (mongoose.models[collectionName]) {
      return mongoose.models[collectionName];
    }

    const flexibleSchema = new mongoose.Schema(
      {},
      {
        strict: false,
        collection: collectionName.toLowerCase(),
        autoCreate: false,
        autoIndex: false,
      }
    );

    flexibleSchema.index({ id: 1 }, { unique: true, sparse: true });

    return mongoose.model(collectionName, flexibleSchema);
  }

  /**
   * Strips MongoDB internal fields from a document
   */
  private StripMongoFields<T>(doc: T): T {
    if (!doc || typeof doc !== 'object') return doc;

    const result = { ...doc } as Record<string, unknown>;
    delete result._id;
    delete result.__v;

    return result as T;
  }
}

// Export singleton instance
export const db = new Database();
