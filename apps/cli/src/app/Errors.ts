import { exitCodes, type ExitCode, type PartialResources } from './Types';

export class CliError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly exitCode: ExitCode,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CliError';
  }
}

export class ApiError extends CliError {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId?: string
  ) {
    super(message, 'api_error', exitCodes.apiError, {
      request_id: requestId,
      status,
    });
    this.name = 'ApiError';
  }
}

export class PartialFailureError extends CliError {
  constructor(cause: unknown, partialResources: PartialResources) {
    const causeMessage =
      cause instanceof Error ? cause.message : 'An unknown API error occurred';
    super(
      `Store initialization stopped after creating some resources: ${causeMessage}`,
      'partial_failure',
      exitCodes.partialFailure,
      { partial_resources: partialResources }
    );
    this.name = 'PartialFailureError';
  }
}

export function InvalidInput(message: string): CliError {
  return new CliError(message, 'invalid_input', exitCodes.invalidInput);
}
