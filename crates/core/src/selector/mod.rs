pub mod accessibility;
pub mod resolver;
pub mod visual;

pub use accessibility::AccessibilityStrategy;
pub use resolver::SelectorResolver;
pub use visual::VisualStrategy;

use serde::{Deserialize, Serialize};

/// A semantic selector expressed as natural language intent.
///
/// Instead of CSS selectors or XPath, users describe what they want:
/// - "the submit button in the login form"
/// - "the email input field"
/// - "the navigation menu"
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SemanticSelector {
    /// The natural language description of the target element.
    pub intent: String,

    /// Optional scope to narrow the search.
    pub scope: Option<String>,

    /// Cached resolution from a previous successful match.
    pub cached_resolution: Option<ResolvedSelector>,
}

/// A resolved selector — the concrete way to find an element after semantic resolution.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedSelector {
    /// The strategy that successfully resolved the selector.
    pub strategy: ResolutionStrategy,

    /// The concrete selector value (CSS, XPath, ARIA, etc.).
    pub value: String,

    /// Confidence score from 0.0 to 1.0.
    pub confidence: f64,

    /// Fingerprint of the element for drift detection.
    pub fingerprint: ElementFingerprint,
}

/// How the semantic selector was resolved to a concrete element.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ResolutionStrategy {
    /// Resolved via accessibility tree (ARIA roles, labels).
    Accessibility,
    /// Resolved via visual/spatial heuristics (position, size, proximity).
    Visual,
    /// Resolved via NLP text matching (button text, placeholders, tooltips).
    TextMatch,
    /// Resolved via cached mapping from a previous run.
    Cached,
}

/// Fingerprint of an element for detecting drift between test runs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElementFingerprint {
    pub tag_name: String,
    pub text_content: Option<String>,
    pub aria_role: Option<String>,
    pub aria_label: Option<String>,
    pub bounding_box: Option<BoundingBox>,
    pub attributes: Vec<(String, String)>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoundingBox {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl SemanticSelector {
    /// Create a new semantic selector from an intent string.
    pub fn new(intent: impl Into<String>) -> Self {
        Self {
            intent: intent.into(),
            scope: None,
            cached_resolution: None,
        }
    }

    /// Scope this selector within a parent context.
    pub fn within(mut self, scope: impl Into<String>) -> Self {
        self.scope = Some(scope.into());
        self
    }
}
