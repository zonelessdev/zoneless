/**
 * Runs an action up to `attempts` times, trying again only while it fails
 * with an error `shouldRetry` accepts. Any other error is thrown at once.
 */
export async function RetryWhile<T>(
  attempts: number,
  shouldRetry: (error: unknown) => boolean,
  action: () => Promise<T>
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await action();
    } catch (error) {
      if (attempt >= attempts || !shouldRetry(error)) throw error;
    }
  }
}
