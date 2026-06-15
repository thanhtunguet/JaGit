export interface RetryOpts {
  maxRetries: number;
  baseDelayMs: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < opts.maxRetries) {
        await sleep(opts.baseDelayMs * 2 ** attempt);
      }
    }
  }
  throw lastError;
}
