import { describe, expect, it } from 'vitest';
import { parseGpuMemory } from './snapshot';

describe('NVIDIA VRAM summary', () => {
  it('totals numeric rows for multiple GPUs', () => {
    expect(parseGpuMemory('1024, 8192\r\n4096, 16384\r\n')).toEqual({
      usedMiB: 5120,
      totalMiB: 24576,
    });
  });

  it.each(['', 'N/A, 8192', '1024, 8192, unexpected'])('rejects malformed output %j', (output) => {
    expect(() => parseGpuMemory(output)).toThrow();
  });
});
