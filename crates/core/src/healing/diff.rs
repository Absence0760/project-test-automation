use serde::{Deserialize, Serialize};

/// A diff between two DOM snapshots, used by the self-healing engine
/// to understand what changed between a passing and failing test run.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DomDiff {
    pub changes: Vec<DomChange>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DomChange {
    /// An element was added.
    Added {
        path: String,
        tag: String,
        attributes: Vec<(String, String)>,
    },
    /// An element was removed.
    Removed {
        path: String,
        tag: String,
    },
    /// An element's attributes changed.
    AttributeChanged {
        path: String,
        attribute: String,
        old_value: Option<String>,
        new_value: Option<String>,
    },
    /// An element moved in the tree.
    Moved {
        old_path: String,
        new_path: String,
        tag: String,
    },
    /// Text content changed.
    TextChanged {
        path: String,
        old_text: String,
        new_text: String,
    },
}

impl DomDiff {
    /// Compute the diff between two DOM snapshots.
    pub fn compute(
        _before: &serde_json::Value,
        _after: &serde_json::Value,
    ) -> Self {
        // TODO: Implement DOM tree diffing algorithm
        // This will compare two serialized DOM trees and produce
        // a minimal set of changes.
        Self {
            changes: Vec::new(),
        }
    }

    /// Check if this diff contains changes that would break a selector
    /// targeting the given element path.
    pub fn affects_path(&self, path: &str) -> bool {
        self.changes.iter().any(|change| match change {
            DomChange::Removed { path: p, .. } => p == path,
            DomChange::Moved { old_path, .. } => old_path == path,
            DomChange::AttributeChanged { path: p, .. } => p == path,
            _ => false,
        })
    }
}
