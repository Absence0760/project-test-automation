mod graph;

pub use graph::{ExecutionGraph, TestNode, TestNodeId};

use serde::{Deserialize, Serialize};

/// The result of executing a single test node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestResult {
    pub node_id: TestNodeId,
    pub status: TestStatus,
    pub duration_ms: u64,
    pub error: Option<TestError>,
    /// Steps executed within this test.
    pub steps: Vec<StepResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TestStatus {
    Passed,
    Failed,
    Skipped,
    /// Test was flaky — passed on retry but failed initially.
    Flaky {
        attempts: u32,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestError {
    pub message: String,
    pub stack: Option<String>,
    /// Flakiness classification if the failure is suspected to be flaky.
    pub flakiness: Option<FlakinessClassification>,
}

/// Classification of why a test is flaky — not just "it's flaky",
/// but actionable root cause analysis.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum FlakinessClassification {
    /// Race condition between test and app state.
    RaceCondition,
    /// Animation or transition timing issue.
    AnimationTiming,
    /// Network request timing or ordering.
    NetworkTiming,
    /// Test depends on data that varies between runs.
    DataDependency,
    /// Environment-specific issue (different in CI vs local).
    Environment,
    /// Unknown — needs manual investigation.
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepResult {
    pub description: String,
    pub status: TestStatus,
    pub duration_ms: u64,
    pub selector_used: Option<String>,
}
