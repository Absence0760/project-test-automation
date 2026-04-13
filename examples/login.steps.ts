/**
 * Example step definitions for the login feature.
 *
 * Notice: selectors are semantic ("the submit button"),
 * not structural ('[data-testid="submit-btn"]').
 */
import { Given, When, Then } from '@bettertest/bdd';

Given('the user is on the login page', async (ctx) => {
  await ctx.navigate('/login');
});

When('they enter valid credentials', async (ctx) => {
  await ctx.fill('the email input', 'user@example.com');
  await ctx.fill('the password input', 'correct-password');
});

When('they enter an invalid password', async (ctx) => {
  await ctx.fill('the email input', 'user@example.com');
  await ctx.fill('the password input', 'wrong-password');
});

When('they click the submit button', async (ctx) => {
  await ctx.click('the submit button');
});

When('they enter an invalid password {count} times', async (ctx, count) => {
  for (let i = 0; i < Number(count); i++) {
    await ctx.fill('the email input', 'user@example.com');
    await ctx.fill('the password input', 'wrong-password');
    await ctx.click('the submit button');
  }
});

Then('they should see the dashboard', async (ctx) => {
  await ctx.assertVisible('the dashboard heading');
});

Then('the welcome message should contain their name', async (ctx) => {
  await ctx.assertText('the welcome message', 'Welcome');
});

Then('they should see an error message', async (ctx) => {
  await ctx.assertVisible('the error message');
});

Then('the error should say {message}', async (ctx, message) => {
  await ctx.assertText('the error message', message);
});

Then('the account should be locked', async (ctx) => {
  await ctx.assertVisible('the account locked message');
});

Then('they should see {message}', async (ctx, message) => {
  await ctx.assertText('the alert message', message);
});

Then('the email input should have a label', async (ctx) => {
  await ctx.assertVisible('the email label');
});

Then('the password input should have a label', async (ctx) => {
  await ctx.assertVisible('the password label');
});

Then('the submit button should be keyboard accessible', async (_ctx) => {
  // TODO: Implement keyboard accessibility check
});

Then('the form should have proper ARIA landmarks', async (_ctx) => {
  // TODO: Implement ARIA landmark validation
});
