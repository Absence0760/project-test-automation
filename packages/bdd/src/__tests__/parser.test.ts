import { describe, it, expect } from 'vitest';
import { GherkinParser } from '../parser.js';

const parser = new GherkinParser();

describe('GherkinParser', () => {
  it('parses a minimal feature', () => {
    const feature = parser.parse(
      `Feature: Login
  Scenario: Basic
    Given the user is on the login page`,
      'login.feature',
    );

    expect(feature.name).toBe('Login');
    expect(feature.filePath).toBe('login.feature');
    expect(feature.scenarios).toHaveLength(1);
    expect(feature.scenarios[0]!.name).toBe('Basic');
    expect(feature.scenarios[0]!.steps).toHaveLength(1);
    expect(feature.scenarios[0]!.steps[0]!.keyword).toBe('Given');
    expect(feature.scenarios[0]!.steps[0]!.text).toBe('the user is on the login page');
  });

  it('parses feature-level tags', () => {
    const feature = parser.parse(
      `@smoke @auth
Feature: Login`,
      'login.feature',
    );

    expect(feature.tags).toEqual(['@smoke', '@auth']);
  });

  it('parses scenario-level tags', () => {
    const feature = parser.parse(
      `Feature: Login

  @happy-path
  Scenario: Valid credentials
    Given the user is logged in`,
      'login.feature',
    );

    expect(feature.scenarios[0]!.tags).toEqual(['@happy-path']);
  });

  it('parses multiple scenarios', () => {
    const feature = parser.parse(
      `Feature: Login

  Scenario: Valid login
    Given the user is on the login page
    When they enter valid credentials

  Scenario: Invalid login
    Given the user is on the login page
    When they enter invalid credentials`,
      'login.feature',
    );

    expect(feature.scenarios).toHaveLength(2);
    expect(feature.scenarios[0]!.name).toBe('Valid login');
    expect(feature.scenarios[1]!.name).toBe('Invalid login');
  });

  it('parses all step keywords', () => {
    const feature = parser.parse(
      `Feature: Steps

  Scenario: All keywords
    Given a precondition
    When an action
    Then a result
    And another result
    But not this`,
      'test.feature',
    );

    const steps = feature.scenarios[0]!.steps;
    expect(steps).toHaveLength(5);
    expect(steps[0]!.keyword).toBe('Given');
    expect(steps[1]!.keyword).toBe('When');
    expect(steps[2]!.keyword).toBe('Then');
    expect(steps[3]!.keyword).toBe('And');
    expect(steps[4]!.keyword).toBe('But');
  });

  it('parses background steps', () => {
    const feature = parser.parse(
      `Feature: Login

  Background:
    Given the user is on the login page

  Scenario: Valid login
    When they enter valid credentials`,
      'login.feature',
    );

    expect(feature.background).toBeDefined();
    expect(feature.background!.steps).toHaveLength(1);
    expect(feature.background!.steps[0]!.text).toBe('the user is on the login page');
  });

  it('parses feature description', () => {
    const feature = parser.parse(
      `Feature: Login
  As a user
  I want to log in

  Scenario: Basic
    Given something`,
      'login.feature',
    );

    expect(feature.description).toContain('As a user');
    expect(feature.description).toContain('I want to log in');
  });

  it('parses data tables', () => {
    const feature = parser.parse(
      `Feature: Users

  Scenario: Multiple users
    Given the following users exist
      | name  | email          |
      | Alice | alice@test.com |
      | Bob   | bob@test.com   |`,
      'users.feature',
    );

    const step = feature.scenarios[0]!.steps[0]!;
    expect(step.dataTable).toBeDefined();
    expect(step.dataTable!.headers).toEqual(['name', 'email']);
    expect(step.dataTable!.rows).toHaveLength(2);
    expect(step.dataTable!.rows[0]).toEqual(['Alice', 'alice@test.com']);
    expect(step.dataTable!.rows[1]).toEqual(['Bob', 'bob@test.com']);
  });

  it('parses doc strings', () => {
    const feature = parser.parse(
      `Feature: API

  Scenario: POST request
    Given the request body is
      """
      {"name": "test"}
      """`,
      'api.feature',
    );

    const step = feature.scenarios[0]!.steps[0]!;
    expect(step.docString).toBe('      {"name": "test"}');
  });

  it('parses Scenario Outline', () => {
    const feature = parser.parse(
      `Feature: Login

  Scenario Outline: Login with credentials
    Given the user enters "<email>"
    When they submit the form`,
      'login.feature',
    );

    expect(feature.scenarios[0]!.name).toBe('Login with credentials');
    expect(feature.scenarios[0]!.steps).toHaveLength(2);
  });

  it('tracks line numbers for steps', () => {
    const feature = parser.parse(
      `Feature: Lines

  Scenario: Check lines
    Given step one
    When step two
    Then step three`,
      'lines.feature',
    );

    const steps = feature.scenarios[0]!.steps;
    expect(steps[0]!.line).toBe(4);
    expect(steps[1]!.line).toBe(5);
    expect(steps[2]!.line).toBe(6);
  });

  it('skips comments', () => {
    const feature = parser.parse(
      `# This is a comment
Feature: Comments
  # Another comment
  Scenario: With comments
    # Step comment
    Given a step`,
      'comments.feature',
    );

    expect(feature.name).toBe('Comments');
    expect(feature.scenarios[0]!.steps).toHaveLength(1);
  });

  it('handles empty feature file', () => {
    const feature = parser.parse('', 'empty.feature');

    expect(feature.name).toBe('');
    expect(feature.scenarios).toHaveLength(0);
  });
});
