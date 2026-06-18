"use client";

/**
 * Global fetch wrapper to trace client-side requests.
 * Enabled in ALL environments, but sampled at 5% in production
 * to provide real-world visibility without generating excessive log volume.
 * Call `initRequestTracing()` once early in the app lifecycle (e.g., in layout.tsx).
 */

let initialized = false;

const SAMPLE_RATE = process.env.NODE_ENV === "production" ? 0.05 : 1.0;

export function initRequestTracing() {
  if (typeof window === "undefined" || initialized) return;

  const originalFetch = window.fetch;

  window.fetch = async function (...args) {
    const start = performance.now();
    const urlStr =
      typeof args[0] === "string"
        ? args[0]
        : args[0] instanceof Request
          ? args[0].url
          : String(args[0]);

    // Only trace our own API routes
    const isApiRoute = urlStr.startsWith("/api") || urlStr.includes("/api/");

    try {
      const response = await originalFetch.apply(this, args);
      const duration = performance.now() - start;

      if (isApiRoute && Math.random() < SAMPLE_RATE) {
        const traceEvent = {
          event: "REQUEST_TRACE",
          route: urlStr,
          duration: Math.round(duration),
          status: response.status,
          timestamp: new Date().toISOString(),
        };
        console.log(JSON.stringify(traceEvent));
      }

      return response;
    } catch (error) {
      const duration = performance.now() - start;
      if (isApiRoute && Math.random() < SAMPLE_RATE) {
        const traceEvent = {
          event: "REQUEST_TRACE",
          route: urlStr,
          duration: Math.round(duration),
          status: 0,
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        };
        console.log(JSON.stringify(traceEvent));
      }
      throw error;
    }
  };

  initialized = true;
  if (process.env.NODE_ENV !== "production") {
    console.log("[Observability] Request tracing initialized (dev: 100% sample rate).");
  }
}
