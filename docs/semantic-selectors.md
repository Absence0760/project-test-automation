# Semantic Selectors — Deep Dive

How Better Test Automation resolves elements by intent instead of DOM structure.

---

## The Problem

Every test automation tool today makes you describe elements by their technical implementation:

```javascript
// Cypress — CSS selectors, data attributes
cy.get('[data-testid="submit-btn"]');
cy.get('#login-form > div:nth-child(3) > button.MuiButton-root');

// Playwright — slightly better, but still structural
page.locator('[data-testid="submit-btn"]');
page.getByRole('button', { name: 'Submit' });

// Selenium — XPath soup
driver.findElement(By.xpath("//form[@id='login']//button[@type='submit']"));
```

These are all **structural selectors** — they describe the DOM's shape, not the user's intent.

The moment a developer:

- Renames a CSS class
- Restructures the form layout
- Swaps a UI library (MUI to shadcn)
- Adds a wrapper div
- Changes button text from "Submit" to "Continue"

...your test breaks. The test had no idea it was clicking "the submit button on the login form." It only knew a CSS path.

---

## The Solution

Better Test Automation introduces semantic selectors — you describe **what** you want, not **where** it is:

```typescript
// Better Test Automation — semantic
click('the submit button')
fill('the email input', 'user@example.com')
assertVisible('the welcome heading')

// Scoped
click(select('the save button').within('the profile form'))

// In Gherkin steps — it's just English
When they click the submit button
And they fill in the email input with "user@example.com"
```

The engine resolves the intent to a concrete element at runtime. If the DOM changes, the resolution adapts.

---

## Resolution Pipeline

When you write `click('the submit button')`, here's what happens:

### Step 1: Cache Check

```
Intent: "the submit button"
Cache lookup → found previous resolution?
  → YES: validate the cached element still exists
    → Still valid? Return it (fastest path)
    → Invalid? Mark as stale, continue to step 2
  → NO: continue to step 2
```

### Step 2: Intent Parsing

The natural language intent is decomposed into structured query components:

| Intent                                | Parsed Role  | Parsed Name | Parsed Scope                 |
| ------------------------------------- | ------------ | ----------- | ---------------------------- |
| "the submit button"                   | `button`     | "submit"    | —                            |
| "the email input field"               | `textbox`    | "email"     | —                            |
| "the save button in the profile form" | `button`     | "save"      | "profile form"               |
| "the navigation menu"                 | `navigation` | —           | —                            |
| "the first item in the results list"  | `listitem`   | —           | "results list" (position: 1) |

Keywords map to ARIA roles:

- button, btn → `role="button"`
- input, field, textbox → `role="textbox"`
- link → `role="link"`
- menu, nav, navigation → `role="navigation"`
- heading, title → `role="heading"`
- list → `role="list"`
- checkbox, toggle → `role="checkbox"`
- dropdown, select → `role="combobox"`

### Step 3: Accessibility Tree Resolution (Primary)

The browser exposes an accessibility tree (the same tree screen readers consume). We query it:

```
Accessibility tree for the page:
└── role="document"
    └── role="form" name="Login"
        ├── role="textbox" name="Email address"
        ├── role="textbox" name="Password"
        └── role="button" name="Sign in"    ← match!
```

Matching logic:

1. Filter by role (`button`)
2. Score by name similarity ("submit" vs "Sign in" — semantic similarity, not exact match)
3. Apply scope constraints ("in the login form" → filter to descendants of `role="form"` named "Login")
4. Return highest-scoring match with confidence

**Why accessibility-first?** Because:

- It's what the browser already computes for screen readers
- It reflects semantic meaning, not visual implementation
- It's stable across UI library changes (MUI and shadcn both produce the same ARIA tree)
- It makes your tests automatically validate accessibility

### Step 4: Visual/Spatial Heuristics (Fallback)

If the accessibility tree is ambiguous (poorly-structured HTML, missing ARIA labels), we fall back to visual layout analysis:

```
Page layout:
┌────────────────────────────────┐
│  ┌─── Login Form ───────────┐  │
│  │  [Email input]           │  │
│  │  [Password input]        │  │
│  │                          │  │
│  │  [ Sign in ] ← button    │  │  ← A button at the bottom
│  │     at bottom of a        │  │    of a form group is likely
│  │     form group             │  │    the submission action
│  └──────────────────────────┘  │
└────────────────────────────────┘
```

Heuristics used:

- **Position in form**: Button at bottom of a form group → likely submit action
- **Proximity to inputs**: Button near labeled inputs → likely related form action
- **Size relative to siblings**: Primary action buttons are typically larger
- **Visual grouping**: Elements within the same bounding region belong together

### Step 5: NLP Text Matching (Final Fallback)

Scan all text content in the DOM for semantic matches:

```
Candidates for "submit button":
- textContent: "Sign in"     → synonym of "submit" in auth context → score: 0.8
- textContent: "Cancel"      → antonym → score: 0.1
- placeholder: "Submit"      → exact match → score: 0.95
- aria-label: "Submit form"  → contains "submit" → score: 0.9
- tooltip: "Click to log in" → related intent → score: 0.6
```

The NLP matcher understands that in a login context:

- "Submit" = "Sign in" = "Log in" = "Continue" = "Go"
- These are all the same _intent_ expressed differently

### Step 6: Cache + Return

The winning resolution is:

1. Cached for future runs (with the element's fingerprint)
2. Returned to the test step for interaction

---

## Confidence Scoring

Every resolution strategy returns a confidence score from 0.0 to 1.0:

| Score    | Meaning            | Example                                       |
| -------- | ------------------ | --------------------------------------------- |
| 0.95+    | Near-certain match | Exact role + exact name in accessibility tree |
| 0.8-0.95 | Strong match       | Right role, close name ("submit" → "Sign in") |
| 0.7-0.8  | Probable match     | Visual heuristics confirm position + context  |
| 0.5-0.7  | Uncertain          | Multiple candidates, weak differentiation     |
| < 0.5    | Unlikely           | No good match found                           |

The default threshold is **0.7** (configurable in `bettertest.config.ts`). Below this, the selector fails rather than clicking the wrong element.

---

## Element Fingerprinting

When a selector resolves, we capture a fingerprint of the matched element:

```json
{
  "tag_name": "button",
  "text_content": "Sign in",
  "aria_role": "button",
  "aria_label": null,
  "bounding_box": { "x": 150, "y": 340, "width": 120, "height": 40 },
  "attributes": [
    ["type", "submit"],
    ["class", "btn-primary"]
  ]
}
```

On the next run, the cache check validates the fingerprint:

- Is there still a `<button>` with text "Sign in" at roughly (150, 340)?
- If yes → use cached resolution (fast path)
- If no → the element drifted, trigger re-resolution or self-healing

---

## Self-Healing Connection

Semantic selectors are what make self-healing **possible**. Consider:

| Selector type                             | Can it heal? | Why?                                                                                       |
| ----------------------------------------- | ------------ | ------------------------------------------------------------------------------------------ |
| `div:nth-child(3) > button`               | No           | The structural path is just wrong. There's nothing to infer intent from.                   |
| `[data-testid="submit-btn"]`              | No           | The attribute was removed or renamed. No semantic context to find the new one.             |
| `getByRole('button', { name: 'Submit' })` | Partially    | Knows the role, but if the name changes to "Continue", it fails.                           |
| `select('the submit button')`             | **Yes**      | The engine knows the _intent_. It can re-resolve against the new DOM using all strategies. |

When healing triggers:

1. The semantic intent is preserved ("the submit button")
2. The fingerprint from the last-passing run is loaded
3. The current DOM is searched for the closest matching element
4. A new resolution is proposed with a confidence score
5. If confidence > threshold, the test continues and the cache is updated
6. If auto-heal is enabled, the resolution cache file is patched (git-reviewable diff)

---

## API Reference

### In test files (TypeScript)

```typescript
import { select, within } from '@bettertest/selectors';

// Basic semantic selector
select('the submit button');

// Scoped selector
select('the save button').within('the profile form');

// With confidence override
select('the delete button').confidence(0.9);

// Shorthand for scoping
const form = within('the settings form');
form.select('the email input');
form.select('the save button');
```

### In Gherkin steps

Semantic selectors are implicit in step definitions — the step text IS the selector:

```gherkin
When they click the submit button
# "the submit button" is passed to the selector engine

And they fill in the email input with "user@example.com"
# "the email input" is the selector, "user@example.com" is the value
```

### Configuration

```typescript
// bettertest.config.ts
export default defineConfig({
  selectors: {
    minConfidence: 0.7, // reject matches below this
    autoHeal: true, // auto-update resolution cache on drift
    cachePath: '.bettertest/selector-cache.json',
  },
});
```

---

## Comparison: Before and After

### Scenario: Dev swaps UI library from MUI to shadcn

**Cypress / Playwright (before):**

```javascript
// These all break:
cy.get('.MuiButton-root.MuiButton-contained'); // MUI class gone
cy.get('.MuiTextField-root input'); // MUI structure gone
page.locator('.MuiCard-root >> .MuiCardHeader-title'); // entire component tree changed
```

**Better Test Automation:**

```typescript
// These all still work:
click('the submit button'); // resolved via ARIA, not CSS class
fill('the email input', '...'); // resolved via role + label, not structure
assertVisible('the card title'); // resolved via heading role + proximity
```

### Scenario: Form restructured with extra wrapper divs

**Cypress:**

```javascript
cy.get('#login-form > div:nth-child(3) > button'); // BREAKS — nth-child shifted
```

**Better Test Automation:**

```typescript
select('the submit button').within('the login form'); // WORKS — structure irrelevant
```

### Scenario: Button text changes "Submit" → "Continue"

**Playwright:**

```javascript
page.getByRole('button', { name: 'Submit' }); // BREAKS — name changed
```

**Better Test Automation:**

```typescript
select('the submit button'); // WORKS — re-resolves via context
// "Continue" is recognized as a submit-intent synonym in a form context
```

### Scenario: New developer writes their first test

**Traditional:**

```
1. Open browser DevTools
2. Inspect element
3. Copy selector / find data-testid
4. Hope it doesn't change
```

**Better Test Automation:**

```
1. Describe what you want in English
2. Done
```
