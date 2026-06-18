export interface PerformanceLog {
  metric: string;
  duration?: number;
  timestamp: string;
  requestId?: string;
  [key: string]: any;
}

/**
 * Frontend-only diagnostic logger.
 * Silenced in production so logs never appear in user browsers.
 * Use this for all client-side [Diagnostics] statements.
 */
export function diagLog(message: string, ...args: any[]) {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[Diagnostics] ${message}`, ...args);
  }
}

/**
 * Logs a structured performance metric to the console as JSON.
 * Captured by Vercel Function Logs on the server side.
 * Accepts an optional requestId for cross-log correlation.
 */
export function logPerformanceMetric(
  metric: string,
  duration: number,
  extra?: Record<string, any>
) {
  const logObj: PerformanceLog = {
    metric,
    duration: Math.round(duration),
    timestamp: new Date().toISOString(),
    ...extra,
  };

  // Output as a single JSON string for easy log parsing
  console.log(JSON.stringify(logObj));
}

/**
 * Logs a route invocation (count) without a duration.
 * Lets the report script compute frequency × duration = actual CPU cost.
 * Use at the start of any API route handler.
 */
export function logInvocation(
  metric: string,
  extra?: Record<string, any>
) {
  const logObj: PerformanceLog = {
    metric,
    timestamp: new Date().toISOString(),
    ...extra,
  };
  console.log(JSON.stringify(logObj));
}

/**
 * Helper to measure the execution time of an async function.
 */
export async function measureAsync<T>(
  metric: string,
  fn: () => Promise<T>,
  extra?: Record<string, any>
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const duration = performance.now() - start;
    logPerformanceMetric(metric, duration, extra);
  }
}
