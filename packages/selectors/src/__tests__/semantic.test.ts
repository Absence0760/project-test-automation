import { describe, it, expect } from 'vitest';
import { select, within } from '../semantic.js';

describe('select', () => {
  it('creates a query with the given intent', () => {
    const query = select('the submit button');
    expect(query.intent).toBe('the submit button');
    expect(query.scope).toBeUndefined();
    expect(query.minConfidence).toBeUndefined();
  });

  it('supports scoping with .within()', () => {
    const query = select('the save button').within('the settings form');
    expect(query.intent).toBe('the save button');
    expect(query.scope).toBe('the settings form');
  });

  it('supports confidence override with .confidence()', () => {
    const query = select('the delete button').confidence(0.95);
    expect(query.intent).toBe('the delete button');
    expect(query.minConfidence).toBe(0.95);
  });

  it('chains .within() and .confidence()', () => {
    const query = select('the confirm button').within('the modal').confidence(0.9);
    expect(query.intent).toBe('the confirm button');
    expect(query.scope).toBe('the modal');
    expect(query.minConfidence).toBe(0.9);
  });

  it('does not mutate the original query', () => {
    const original = select('a button');
    const scoped = original.within('a form');

    expect(original.scope).toBeUndefined();
    expect(scoped.scope).toBe('a form');
  });
});

describe('within', () => {
  it('creates a scoped selector factory', () => {
    const form = within('the login form');
    const query = form.select('the email input');

    expect(query.intent).toBe('the email input');
    expect(query.scope).toBe('the login form');
  });

  it('can create multiple selectors with the same scope', () => {
    const form = within('the profile form');
    const nameInput = form.select('the name input');
    const saveButton = form.select('the save button');

    expect(nameInput.scope).toBe('the profile form');
    expect(saveButton.scope).toBe('the profile form');
    expect(nameInput.intent).toBe('the name input');
    expect(saveButton.intent).toBe('the save button');
  });
});
