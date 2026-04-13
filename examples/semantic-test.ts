/**
 * Example: Better Test Automation semantic test (non-BDD style).
 *
 * Shows the DX difference between Better Test Automation and Cypress/Playwright.
 */
import { select, within } from '@bettertest/selectors';

// ─── WHAT CYPRESS LOOKS LIKE ────────────────────────────────
//
// cy.visit('/login');
// cy.get('[data-testid="email-input"]').type('user@example.com');
// cy.get('[data-testid="password-input"]').type('secret');
// cy.get('#login-form > div:nth-child(3) > button.MuiButton-root').click();
// cy.get('[data-testid="dashboard-title"]').should('be.visible');

// ─── WHAT PLAYWRIGHT LOOKS LIKE ─────────────────────────────
//
// await page.goto('/login');
// await page.locator('[data-testid="email-input"]').fill('user@example.com');
// await page.locator('[data-testid="password-input"]').fill('secret');
// await page.getByRole('button', { name: 'Sign in' }).click();
// await expect(page.locator('[data-testid="dashboard-title"]')).toBeVisible();

// ─── WHAT BETTER TEST AUTOMATION LOOKS LIKE ────────────────────────────────

export default {
  name: 'User can log in and see their dashboard',
  tags: ['@smoke', '@auth'],

  steps: [
    { navigate: '/login' },

    // Semantic selectors — no data-testid, no CSS paths
    { fill: select('the email input'), value: 'user@example.com' },
    { fill: select('the password input'), value: 'secret' },
    { click: select('the submit button') },

    // Assertions are also semantic
    { assertVisible: select('the dashboard heading') },
    { assertText: select('the welcome message'), contains: 'Welcome' },
  ],
};

// ─── SCOPED SELECTORS ───────────────────────────────────────

export const scopedExample = {
  name: 'Scoped selectors within a form',
  steps: [
    { navigate: '/settings' },

    // "within" scopes all selectors to a parent element
    {
      fill: select('the name input').within('the profile form'),
      value: 'Jared Howard',
    },
    {
      click: within('the profile form').select('the save button'),
    },
    {
      assertVisible: select('the success notification'),
    },
  ],
};
