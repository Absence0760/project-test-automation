@smoke @auth
Feature: User Login
  As a registered user
  I want to log in to my account
  So that I can access my dashboard

  Background:
    Given the user is on the login page

  @happy-path
  Scenario: Successful login with valid credentials
    When they enter valid credentials
    And they click the submit button
    Then they should see the dashboard
    And the welcome message should contain their name

  @error
  Scenario: Failed login with invalid password
    When they enter an invalid password
    And they click the submit button
    Then they should see an error message
    And the error should say "Invalid email or password"

  @security
  Scenario: Account lockout after multiple failures
    When they enter an invalid password 5 times
    Then the account should be locked
    And they should see "Account locked. Try again in 15 minutes."

  @a11y
  Scenario: Login form is accessible
    Then the email input should have a label
    And the password input should have a label
    And the submit button should be keyboard accessible
    And the form should have proper ARIA landmarks
