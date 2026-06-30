const counters = { legacy: 0, dual: 0, plaintext: 0 };

export const writeModeTelemetry = {
  record(mode: 'legacy' | 'dual' | 'plaintext') {
    counters[mode]++;
    if (counters[mode] % 100 === 0) {
      console.info('[WriteModeTelemetry] Write mode distribution snapshot:', JSON.stringify(counters));
    }
  },
  snapshot: () => ({ ...counters }),
};
