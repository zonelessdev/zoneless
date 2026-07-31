export enum QueryOperators {
  '<' = '<',
  '<=' = '<=',
  '==' = '==',
  '>' = '>',
  '>=' = '>=',
  '!=' = '!=',
  'in' = 'in',
  'not-in' = 'not-in',
  /** Field existence check — value should be boolean */
  exists = 'exists',
}

export interface QueryParameters {
  method: 'READ' | 'UPDATE' | 'DELETE';
  collection: string;
  parameters?: { key: string; operator: QueryOperators; value: any }[];
  orderBy?: { key: string; direction?: 'asc' | 'desc' }[];
  data?: { [key: string]: any };
  limit?: number;
  startAfter?: number;
  startAt?: number;
  endAt?: number;
}
