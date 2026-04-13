import { describe, it, expect } from 'vitest';
import { DryRunContext } from '../context.js';

describe('DryRunContext', () => {
  it('implements navigate', async () => {
    const ctx = new DryRunContext('http://localhost:3000');
    await ctx.navigate('/login');
    expect(ctx.getLog()).toEqual(['[navigate] http://localhost:3000/login']);
  });

  it('resolves absolute URLs without baseUrl', async () => {
    const ctx = new DryRunContext();
    await ctx.navigate('http://example.com/page');
    expect(ctx.getLog()).toEqual(['[navigate] http://example.com/page']);
  });

  it('implements click', async () => {
    const ctx = new DryRunContext();
    await ctx.click('the submit button');
    expect(ctx.getLog()).toEqual(['[click] the submit button']);
  });

  it('implements fill', async () => {
    const ctx = new DryRunContext();
    await ctx.fill('the email input', 'user@test.com');
    expect(ctx.getLog()).toEqual(['[fill] the email input = "user@test.com"']);
  });

  it('implements assertVisible', async () => {
    const ctx = new DryRunContext();
    await ctx.assertVisible('the dashboard heading');
    expect(ctx.getLog()).toEqual(['[assertVisible] the dashboard heading']);
  });

  it('implements assertText', async () => {
    const ctx = new DryRunContext();
    await ctx.assertText('the welcome message', 'Hello');
    expect(ctx.getLog()).toEqual(['[assertText] the welcome message contains "Hello"']);
  });

  it('supports set/get for cross-step state', () => {
    const ctx = new DryRunContext();
    ctx.set('token', 'abc123');
    expect(ctx.get('token')).toBe('abc123');
  });

  it('get returns undefined for missing keys', () => {
    const ctx = new DryRunContext();
    expect(ctx.get('nonexistent')).toBeUndefined();
  });

  it('reset clears state and log', async () => {
    const ctx = new DryRunContext();
    await ctx.click('something');
    ctx.set('key', 'value');

    ctx.reset();

    expect(ctx.getLog()).toEqual([]);
    expect(ctx.get('key')).toBeUndefined();
  });

  it('accumulates multiple actions in log', async () => {
    const ctx = new DryRunContext('http://localhost:3000');
    await ctx.navigate('/login');
    await ctx.fill('the email input', 'user@test.com');
    await ctx.click('the submit button');

    expect(ctx.getLog()).toHaveLength(3);
    expect(ctx.getLog()[0]).toContain('[navigate]');
    expect(ctx.getLog()[1]).toContain('[fill]');
    expect(ctx.getLog()[2]).toContain('[click]');
  });

  it('verbose mode does not affect log contents', async () => {
    const ctx = new DryRunContext('', true);
    await ctx.click('button');
    expect(ctx.getLog()).toEqual(['[click] button']);
  });

  it('getLog returns a copy, not a reference', async () => {
    const ctx = new DryRunContext();
    await ctx.click('a');
    const log1 = ctx.getLog();
    await ctx.click('b');
    const log2 = ctx.getLog();

    expect(log1).toHaveLength(1);
    expect(log2).toHaveLength(2);
  });
});
