export interface IdempotencyKey {
  id: string;
  status: 'processing' | 'completed' | 'error';
  statusCode?: number;
  headers?: Record<string, any>;
  responseBody?: any;
  /** Unix timestamp in seconds when the idempotency key was created */
  createdAt: number;
  /** Unix timestamp in seconds when processing completed */
  completedAt?: number;
  path: string;
  method: string;
  account?: string;
  error?: string;
}
