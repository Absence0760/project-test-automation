import { describe, it, expect, beforeEach } from 'vitest';
import { StepRegistry } from '../steps.js';
import type { StepHandler } from '../steps.js';

const noop: StepHandler = async () => {};

describe('StepRegistry', () => {
  let registry: StepRegistry;

  beforeEach(() => {
    registry = new StepRegistry();
  });

  it('starts empty', () => {
    expect(registry.count).toBe(0);
  });

  it('registers and finds exact string matches', () => {
    registry.register({ keyword: 'Given', pattern: 'the user is logged in', handler: noop });

    const result = registry.find('the user is logged in');
    expect(result).not.toBeNull();
    expect(result!.definition.keyword).toBe('Given');
    expect(result!.args).toEqual([]);
  });

  it('returns null for unmatched steps', () => {
    registry.register({ keyword: 'Given', pattern: 'the user is logged in', handler: noop });

    const result = registry.find('the user is on the home page');
    expect(result).toBeNull();
  });

  it('matches parameterized string patterns', () => {
    registry.register({
      keyword: 'When',
      pattern: 'they enter {value} in the {field} field',
      handler: noop,
    });

    const result = registry.find('they enter hello in the email field');
    expect(result).not.toBeNull();
    expect(result!.args).toEqual(['hello', 'email']);
  });

  it('matches regex patterns', () => {
    registry.register({
      keyword: 'Then',
      pattern: /the count should be (\d+)/,
      handler: noop,
    });

    const result = registry.find('the count should be 42');
    expect(result).not.toBeNull();
    expect(result!.args).toEqual(['42']);
  });

  it('returns first matching definition', () => {
    registry.register({ keyword: 'Given', pattern: 'a step', handler: noop });
    registry.register({ keyword: 'When', pattern: 'a step', handler: noop });

    const result = registry.find('a step');
    expect(result!.definition.keyword).toBe('Given');
  });

  it('tracks count correctly', () => {
    registry.register({ keyword: 'Given', pattern: 'step one', handler: noop });
    registry.register({ keyword: 'When', pattern: 'step two', handler: noop });
    registry.register({ keyword: 'Then', pattern: 'step three', handler: noop });

    expect(registry.count).toBe(3);
  });

  it('clears all definitions', () => {
    registry.register({ keyword: 'Given', pattern: 'a step', handler: noop });
    expect(registry.count).toBe(1);

    registry.clear();
    expect(registry.count).toBe(0);
    expect(registry.find('a step')).toBeNull();
  });

  it('handles regex with multiple capture groups', () => {
    registry.register({
      keyword: 'When',
      pattern: /they navigate from "(.+)" to "(.+)"/,
      handler: noop,
    });

    const result = registry.find('they navigate from "/login" to "/dashboard"');
    expect(result).not.toBeNull();
    expect(result!.args).toEqual(['/login', '/dashboard']);
  });

  it('matches quoted strings with spaces in {param} patterns', () => {
    registry.register({
      keyword: 'Then',
      pattern: 'the error should say {message}',
      handler: noop,
    });

    const result = registry.find('the error should say "Invalid email or password"');
    expect(result).not.toBeNull();
    expect(result!.args).toEqual(['Invalid email or password']);
  });

  it('strips quotes from captured {param} args', () => {
    registry.register({
      keyword: 'When',
      pattern: 'they enter {value} in the {field} field',
      handler: noop,
    });

    const result = registry.find('they enter "hello world" in the email field');
    expect(result).not.toBeNull();
    expect(result!.args).toEqual(['hello world', 'email']);
  });

  it('handles string pattern with no params as exact match', () => {
    registry.register({
      keyword: 'Given',
      pattern: 'the server is running',
      handler: noop,
    });

    expect(registry.find('the server is running')).not.toBeNull();
    expect(registry.find('the server is running fast')).toBeNull();
    expect(registry.find('the server is')).toBeNull();
  });
});
