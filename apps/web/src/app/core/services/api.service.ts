import { Injectable, inject } from '@angular/core';
import { StorageService } from './storage.service';
import { environment } from '../../../environments/environment';

export interface ApiOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000; // 1 second

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private readonly storage = inject(StorageService);
  private readonly baseUrl = environment.apiUrl;

  /**
   * Make an API call with automatic retry and timeout handling
   */
  async Call<T>(
    method: string,
    endpoint: string,
    parameters: object = {},
    options: ApiOptions = {}
  ): Promise<T> {
    const {
      timeout = DEFAULT_TIMEOUT,
      retries = method.toUpperCase() === 'GET' ? DEFAULT_RETRIES : 1,
      retryDelay = DEFAULT_RETRY_DELAY,
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await this.ExecuteRequest<T>(
          method,
          endpoint,
          parameters,
          timeout
        );
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx) or if it's the last attempt
        if (this.IsClientError(lastError) || attempt === retries - 1) {
          throw lastError;
        }

        // Wait before retrying with exponential backoff
        await this.Sleep(retryDelay * Math.pow(2, attempt));
      }
    }

    throw lastError || new Error('Request failed');
  }

  /**
   * Execute a single API request with timeout
   */
  private async ExecuteRequest<T>(
    method: string,
    endpoint: string,
    parameters: object,
    timeout: number
  ): Promise<T> {
    const cleanEndpoint = endpoint.startsWith('/')
      ? endpoint.substring(1)
      : endpoint;
    let url = `${this.baseUrl}/${cleanEndpoint}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const options: RequestInit = {
        method: method,
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      };

      const token = this.storage.GetItemString('auth_token');
      if (token) {
        (options.headers as Record<string, string>)[
          'Authorization'
        ] = `Bearer ${token}`;
      }

      if (method.toUpperCase() === 'GET') {
        const urlParams = new URLSearchParams(
          parameters as Record<string, string>
        ).toString();
        if (urlParams) {
          url = `${url}?${urlParams}`;
        }
      } else {
        options.body = JSON.stringify(parameters);
      }

      const response = await fetch(url, options);

      if (!response.ok) {
        // Handle 401 Unauthorized - session expired
        if (response.status === 401) {
          this.HandleSessionExpired();
          const error = new Error('Session expired');
          (error as ApiError).status = 401;
          throw error;
        }

        const errorData = await response.json().catch(() => ({}));
        const error = new Error(
          errorData?.error?.message || `API Call failed: ${response.statusText}`
        );
        (error as ApiError).status = response.status;
        throw error;
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return (await response.json()) as T;
      } else {
        return (await response.text()) as unknown as T;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check if error is a client error (4xx) that shouldn't be retried
   */
  private IsClientError(error: Error): boolean {
    const apiError = error as ApiError;
    return (
      apiError.status !== undefined &&
      apiError.status >= 400 &&
      apiError.status < 500
    );
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private Sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Handle session expiration - clear token and redirect
   */
  private HandleSessionExpired(): void {
    this.storage.RemoveItem('auth_token');
    window.location.href = '/session-expired?reason=session_timeout';
  }
}

interface ApiError extends Error {
  status?: number;
}
