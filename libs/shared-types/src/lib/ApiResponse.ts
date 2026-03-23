export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface ListResponse<T> {
  object: 'list';
  url: string;
  has_more: boolean;
  data: T[];
}
