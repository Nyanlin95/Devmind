export interface ProfileStep {
  name: string;
  ms: number;
}

export interface ProfileReport {
  totalMs: number;
  steps: ProfileStep[];
}

export class Profiler {
  private readonly enabled: boolean;
  private readonly startNs: bigint;
  private readonly steps: ProfileStep[] = [];

  constructor(enabled: boolean = false) {
    this.enabled = enabled;
    this.startNs = process.hrtime.bigint();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async section<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!this.enabled) return fn();
    const sectionStart = process.hrtime.bigint();
    const value = await fn();
    const sectionEnd = process.hrtime.bigint();
    this.steps.push({
      name,
      ms: Number(sectionEnd - sectionStart) / 1_000_000,
    });
    return value;
  }

  report(): ProfileReport | null {
    if (!this.enabled) return null;
    const totalMs = Number(process.hrtime.bigint() - this.startNs) / 1_000_000;
    return {
      totalMs,
      steps: this.steps,
    };
  }
}

export function createProfiler(enabled: boolean = false): Profiler {
  return new Profiler(enabled);
}
