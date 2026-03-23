export class AppError extends Error {
  statusCode: number;
  type: string;

  constructor(
    message: string,
    statusCode: number = 500,
    type: string = 'internal_error'
  ) {
    super(message);
    this.statusCode = statusCode;
    this.type = type;
    // Restore prototype chain
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
