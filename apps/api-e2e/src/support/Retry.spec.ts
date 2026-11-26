import { RetryWhile } from './Retry';

const IsTimeout = (error: unknown) =>
  error instanceof Error && error.message === 'timed out';

describe('RetryWhile', () => {
  it('returns the first success without trying again', async () => {
    const action = jest.fn().mockResolvedValue('paid');

    await expect(RetryWhile(3, IsTimeout, action)).resolves.toBe('paid');
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('tries again after an error it should retry', async () => {
    const action = jest
      .fn()
      .mockRejectedValueOnce(new Error('timed out'))
      .mockResolvedValue('paid');

    await expect(RetryWhile(3, IsTimeout, action)).resolves.toBe('paid');
    expect(action).toHaveBeenCalledTimes(2);
  });

  it('gives up after the allowed number of attempts', async () => {
    const action = jest.fn().mockRejectedValue(new Error('timed out'));

    await expect(RetryWhile(3, IsTimeout, action)).rejects.toThrow('timed out');
    expect(action).toHaveBeenCalledTimes(3);
  });

  it('throws any other error at once', async () => {
    const action = jest.fn().mockRejectedValue(new Error('amount mismatch'));

    await expect(RetryWhile(3, IsTimeout, action)).rejects.toThrow(
      'amount mismatch'
    );
    expect(action).toHaveBeenCalledTimes(1);
  });
});
