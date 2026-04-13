use super::{ElementFingerprint, ResolvedSelector, ResolutionStrategy, SemanticSelector};

/// Resolves semantic selectors using the accessibility tree.
///
/// This is the primary resolution strategy — it reads ARIA roles, labels,
/// and semantic HTML the way a screen reader would. "Submit button in login form"
/// maps to `role=button` with accessible name containing "submit", scoped
/// inside a `role=form` or `<form>` landmark.
pub struct AccessibilityStrategy;

impl AccessibilityStrategy {
    /// Attempt to resolve a semantic selector via the accessibility tree.
    ///
    /// Returns `None` if the accessibility tree doesn't provide enough
    /// information for a confident match.
    pub fn resolve(
        &self,
        selector: &SemanticSelector,
        accessibility_tree: &serde_json::Value,
    ) -> Option<ResolvedSelector> {
        // TODO: Implement accessibility tree traversal
        // 1. Parse the intent into role + name components
        // 2. Walk the accessibility tree to find matching nodes
        // 3. Apply scope constraints if present
        // 4. Score matches by confidence
        // 5. Return the highest-confidence match

        let _ = (selector, accessibility_tree);

        tracing::debug!(
            intent = %selector.intent,
            "Accessibility resolution not yet implemented"
        );

        None
    }
}

/// Parse a natural language intent into structured accessibility query components.
///
/// Examples:
/// - "the submit button" -> role: button, name: "submit"
/// - "email input field" -> role: textbox, name: "email"
/// - "navigation menu" -> role: navigation
pub fn parse_intent(intent: &str) -> AccessibilityQuery {
    // TODO: Implement NLP-based intent parsing
    // For now, use simple keyword matching
    let lower = intent.to_lowercase();

    let role = if lower.contains("button") {
        Some("button".to_string())
    } else if lower.contains("input") || lower.contains("field") {
        Some("textbox".to_string())
    } else if lower.contains("link") {
        Some("link".to_string())
    } else if lower.contains("menu") || lower.contains("navigation") || lower.contains("nav") {
        Some("navigation".to_string())
    } else if lower.contains("heading") || lower.contains("title") {
        Some("heading".to_string())
    } else {
        None
    };

    AccessibilityQuery {
        role,
        name_contains: extract_name_hint(&lower),
    }
}

#[derive(Debug)]
pub struct AccessibilityQuery {
    pub role: Option<String>,
    pub name_contains: Option<String>,
}

fn extract_name_hint(intent: &str) -> Option<String> {
    // Strip common filler words and element type words to get the name hint
    let stop_words = [
        "the", "a", "an", "in", "on", "at", "button", "input", "field", "link", "menu",
        "navigation", "nav", "heading", "title", "form", "click", "find", "select",
    ];

    let words: Vec<&str> = intent
        .split_whitespace()
        .filter(|w| !stop_words.contains(w))
        .collect();

    if words.is_empty() {
        None
    } else {
        Some(words.join(" "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_button_intent() {
        let query = parse_intent("the submit button");
        assert_eq!(query.role, Some("button".to_string()));
        assert_eq!(query.name_contains, Some("submit".to_string()));
    }

    #[test]
    fn parse_input_intent() {
        let query = parse_intent("email input field");
        assert_eq!(query.role, Some("textbox".to_string()));
        assert_eq!(query.name_contains, Some("email".to_string()));
    }

    #[test]
    fn parse_nav_intent() {
        let query = parse_intent("navigation menu");
        assert_eq!(query.role, Some("navigation".to_string()));
    }
}
