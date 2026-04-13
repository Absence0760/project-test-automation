mod diff;

pub use diff::DomDiff;

use crate::selector::{ElementFingerprint, ResolvedSelector, SemanticSelector};
use serde::{Deserialize, Serialize};

/// The self-healing engine.
///
/// When a selector breaks, the healer:
/// 1. Captures the DOM diff between last-passing and current run
/// 2. Proposes the corrected selector
/// 3. Optionally auto-patches the test file (with git diff review step)
pub struct Healer {
    /// Whether to auto-apply fixes or just propose them.
    pub auto_apply: bool,
}

/// A proposed fix for a broken selector.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealingProposal {
    /// The original selector that broke.
    pub original: ResolvedSelector,

    /// The proposed replacement.
    pub proposed: ResolvedSelector,

    /// Confidence that the proposed fix is correct (0.0 to 1.0).
    pub confidence: f64,

    /// Human-readable explanation of what changed and why.
    pub explanation: String,

    /// The DOM diff that triggered the healing.
    pub dom_diff: DomDiff,
}

impl Default for Healer {
    fn default() -> Self {
        Self { auto_apply: false }
    }
}

impl Healer {
    pub fn new() -> Self {
        Self::default()
    }

    /// Enable auto-application of healing proposals.
    pub fn with_auto_apply(mut self) -> Self {
        self.auto_apply = true;
        self
    }

    /// Attempt to heal a broken selector by analyzing what changed.
    pub fn heal(
        &self,
        selector: &SemanticSelector,
        last_known: &ElementFingerprint,
        current_dom: &serde_json::Value,
    ) -> Option<HealingProposal> {
        // TODO: Implement healing logic
        // 1. Diff the last-known fingerprint against current DOM
        // 2. Find the closest matching element
        // 3. Generate a new ResolvedSelector for the match
        // 4. Produce an explanation

        let _ = (selector, last_known, current_dom);

        tracing::info!(
            intent = %selector.intent,
            "Healing not yet implemented"
        );

        None
    }
}
