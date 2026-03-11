import { countLines, extractStringInput, extractNumberMetadata } from './tool-logger.interface';

describe('countLines', () => {
  it('returns 0 for empty string', () => {
    expect(countLines('')).toBe(0);
  });

  it('returns 1 for single line', () => {
    expect(countLines('single line')).toBe(1);
  });

  it('returns 3 for three lines', () => {
    expect(countLines('line1\nline2\nline3')).toBe(3);
  });
});

describe('extractStringInput', () => {
  it('returns the string value for an existing key', () => {
    expect(extractStringInput({ filePath: './foo.ts' }, 'filePath')).toBe('./foo.ts');
  });

  it('returns empty string when key is missing', () => {
    expect(extractStringInput({}, 'filePath')).toBe('');
  });

  it('returns empty string when value is not a string', () => {
    expect(extractStringInput({ filePath: 123 }, 'filePath')).toBe('');
  });
});

describe('extractNumberMetadata', () => {
  it('returns the number value for an existing key', () => {
    expect(extractNumberMetadata({ matches: 42 }, 'matches')).toBe(42);
  });

  it('returns undefined when key is missing', () => {
    expect(extractNumberMetadata({}, 'matches')).toBeUndefined();
  });

  it('returns undefined when metadata is undefined', () => {
    expect(extractNumberMetadata(undefined, 'matches')).toBeUndefined();
  });

  it('returns undefined when value is not a number', () => {
    expect(extractNumberMetadata({ matches: 'not a number' }, 'matches')).toBeUndefined();
  });
});
