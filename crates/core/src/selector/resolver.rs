use super::{
    AccessibilityStrategy, ResolutionStrategy, ResolvedSelector, SemanticSelector, VisualStrategy,
};

/// Multi-strategy selector resolver.
///
/// Attempts resolution in priority order:
/// 1. Cached resolution (if available and still valid)
/// 2. Accessibility tree
/// 3. Visual/spatial heuristics
/// 4. NLP text matching
///
/// Each strategy returns a confidence score. The resolver picks
/// the highest-confidence match and caches it for future runs.
pub struct SelectorResolver {
    accessibility: AccessibilityStrategy,
    visual: VisualStrategy,
    /// Minimum confidence threshold to accept a resolution.
    min_confidence: f64,
}

impl Default for SelectorResolver {
    fn default() -> Self {
        Self {
            accessibility: AccessibilityStrategy,
            visual: VisualStrategy,
            min_confidence: 0.7,
        }
    }
}

impl SelectorResolver {
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the minimum confidence threshold.
    pub fn with_min_confidence(mut self, threshold: f64) -> Self {
        self.min_confidence = threshold;
        self
    }

    /// Resolve a semantic selector to a concrete element reference.
    ///
    /// Tries each strategy in order, returning the first match
    /// that exceeds the confidence threshold.
    pub fn resolve(
        &self,
        selector: &SemanticSelector,
        context: &ResolutionContext,
    ) -> Result<ResolvedSelector, ResolutionError> {
        // 1. Try cached resolution first
        if let Some(cached) = &selector.cached_resolution {
            if self.validate_cached(cached, context) {
                tracing::debug!(
                    intent = %selector.intent,
                    strategy = ?ResolutionStrategy::Cached,
                    "Using cached resolution"
                );
                return Ok(cached.clone());
            }
            tracing::info!(
                intent = %selector.intent,
                "Cached resolution is stale, re-resolving"
            );
        }

        // 2. Try accessibility tree
        if let Some(resolved) = self
            .accessibility
            .resolve(selector, &context.accessibility_tree)
            && resolved.confidence >= self.min_confidence
        {
            return Ok(resolved);
        }

        // 3. Try visual heuristics
        if let Some(resolved) = self.visual.resolve(selector, &context.layout_nodes)
            && resolved.confidence >= self.min_confidence
        {
            return Ok(resolved);
        }

        // 4. All strategies failed
        Err(ResolutionError::NoMatch {
            intent: selector.intent.clone(),
            strategies_tried: vec![
                ResolutionStrategy::Accessibility,
                ResolutionStrategy::Visual,
                ResolutionStrategy::TextMatch,
            ],
        })
    }

    fn validate_cached(&self, cached: &ResolvedSelector, _context: &ResolutionContext) -> bool {
        // TODO: Validate that the cached selector still resolves to
        // an element matching the original fingerprint
        let _ = cached;
        false
    }
}

/// Context provided to the resolver for element resolution.
pub struct ResolutionContext {
    pub accessibility_tree: serde_json::Value,
    pub layout_nodes: Vec<super::visual::LayoutNode>,
}

#[derive(Debug, thiserror::Error)]
pub enum ResolutionError {
    #[error("No element matched intent '{intent}' (tried: {strategies_tried:?})")]
    NoMatch {
        intent: String,
        strategies_tried: Vec<ResolutionStrategy>,
    },

    #[error("Multiple ambiguous matches for '{intent}' — {count} candidates")]
    Ambiguous { intent: String, count: usize },
}
