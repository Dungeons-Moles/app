/**
 * Performance Profiling Utilities
 * @see constitution.md P06: Mobile-First Performance (60 FPS)
 * @see T135: Performance profiling on target device
 *
 * Lightweight profiling utilities for measuring critical paths.
 * Uses React Native's Performance API when available.
 * Disabled in production builds to avoid overhead.
 */

// ============================================================================
// Configuration
// ============================================================================

const IS_DEV = __DEV__;

// Performance threshold constants (in ms)
const FRAME_BUDGET_MS = 16.67; // 60 FPS target
const RENDER_WARNING_MS = 8; // Warn if render takes > 8ms (half frame budget)
const MEASURE_BUFFER_SIZE = 100; // Keep last N measurements

// ============================================================================
// Types
// ============================================================================

interface PerfMeasurement {
  name: string;
  duration: number;
  timestamp: number;
}

interface PerfStats {
  name: string;
  count: number;
  avg: number;
  min: number;
  max: number;
  p95: number;
  overBudget: number; // count of measurements over FRAME_BUDGET_MS
}

// ============================================================================
// State
// ============================================================================

const measurements: Map<string, PerfMeasurement[]> = new Map();
const marks: Map<string, number> = new Map();

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Start a performance mark.
 * @param name - Unique identifier for this mark
 */
export function perfMark(name: string): void {
  if (!IS_DEV) return;
  marks.set(name, performance.now());
}

/**
 * End a performance mark and record the measurement.
 * @param name - The mark name to end
 * @param warnThreshold - Optional: warn if duration exceeds this (ms)
 * @returns Duration in milliseconds, or 0 if mark not found
 */
export function perfMeasure(name: string, warnThreshold?: number): number {
  if (!IS_DEV) return 0;

  const startTime = marks.get(name);
  if (startTime === undefined) {
    console.warn(`[Perf] Mark "${name}" not found`);
    return 0;
  }

  const endTime = performance.now();
  const duration = endTime - startTime;

  // Record measurement
  const existing = measurements.get(name) || [];
  existing.push({
    name,
    duration,
    timestamp: endTime,
  });

  // Keep buffer bounded per P07
  if (existing.length > MEASURE_BUFFER_SIZE) {
    existing.shift();
  }
  measurements.set(name, existing);

  // Clean up mark
  marks.delete(name);

  // Warn if over threshold
  const threshold = warnThreshold ?? RENDER_WARNING_MS;
  if (duration > threshold) {
    console.warn(
      `[Perf] "${name}" took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`
    );
  }

  return duration;
}

/**
 * Measure a synchronous function's execution time.
 * @param name - Identifier for this measurement
 * @param fn - Function to measure
 * @returns Result of the function
 */
export function perfWrap<T>(name: string, fn: () => T): T {
  if (!IS_DEV) return fn();

  perfMark(name);
  const result = fn();
  perfMeasure(name);
  return result;
}

/**
 * Measure an async function's execution time.
 * @param name - Identifier for this measurement
 * @param fn - Async function to measure
 * @returns Result of the function
 */
export async function perfWrapAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  if (!IS_DEV) return fn();

  perfMark(name);
  const result = await fn();
  perfMeasure(name);
  return result;
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get statistics for a named measurement.
 * @param name - The measurement name
 * @returns Stats object or null if no measurements
 */
export function perfStats(name: string): PerfStats | null {
  const data = measurements.get(name);
  if (!data || data.length === 0) return null;

  const durations = data.map(m => m.duration).sort((a, b) => a - b);
  const count = durations.length;
  const sum = durations.reduce((a, b) => a + b, 0);
  const avg = sum / count;
  const min = durations[0];
  const max = durations[count - 1];
  const p95Index = Math.floor(count * 0.95);
  const p95 = durations[p95Index] || max;
  const overBudget = durations.filter(d => d > FRAME_BUDGET_MS).length;

  return {
    name,
    count,
    avg,
    min,
    max,
    p95,
    overBudget,
  };
}

/**
 * Get statistics for all measurements.
 * @returns Array of stats for all named measurements
 */
export function perfStatsAll(): PerfStats[] {
  return Array.from(measurements.keys())
    .map(name => perfStats(name))
    .filter((s): s is PerfStats => s !== null);
}

/**
 * Log all performance statistics to console.
 */
export function perfLogStats(): void {
  if (!IS_DEV) return;

  const stats = perfStatsAll();
  if (stats.length === 0) {
    console.log('[Perf] No measurements recorded');
    return;
  }

  console.log('[Perf] Performance Statistics:');
  console.log('─'.repeat(80));
  console.log(
    'Name'.padEnd(30) +
    'Count'.padStart(8) +
    'Avg(ms)'.padStart(10) +
    'Min(ms)'.padStart(10) +
    'Max(ms)'.padStart(10) +
    'P95(ms)'.padStart(10) +
    'Over16ms'.padStart(10)
  );
  console.log('─'.repeat(80));

  for (const s of stats) {
    console.log(
      s.name.padEnd(30) +
      s.count.toString().padStart(8) +
      s.avg.toFixed(2).padStart(10) +
      s.min.toFixed(2).padStart(10) +
      s.max.toFixed(2).padStart(10) +
      s.p95.toFixed(2).padStart(10) +
      s.overBudget.toString().padStart(10)
    );
  }
  console.log('─'.repeat(80));
}

/**
 * Clear all measurements.
 */
export function perfClear(): void {
  measurements.clear();
  marks.clear();
}

// ============================================================================
// Constants Export (for reference in code comments)
// ============================================================================

export const PERF_CONSTANTS = {
  FRAME_BUDGET_MS,
  RENDER_WARNING_MS,
  MEASURE_BUFFER_SIZE,
} as const;
