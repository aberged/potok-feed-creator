import { describe, expect, it } from 'vitest';
import { fittedSize } from './image';

describe('fittedSize', () => {
  it('leaves a small picture as it is', () => {
    expect(fittedSize(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it('brings the longer side down and keeps the shape', () => {
    expect(fittedSize(4000, 3000)).toEqual({ width: 1080, height: 810 });
    expect(fittedSize(3000, 4000)).toEqual({ width: 810, height: 1080 });
  });
});
