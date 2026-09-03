use std::collections::{HashMap, HashSet};

use serde::{Deserialize, Serialize};

/// Unique identifier for a test node in the execution graph.
pub type TestNodeId = String;

/// A directed acyclic graph of test nodes with dependency edges.
///
/// Unlike sequential test runners, the execution graph determines
/// optimal execution order and parallelism automatically. Tests
/// declare their dependencies, and the graph scheduler runs
/// independent tests concurrently.
#[derive(Debug, Default)]
pub struct ExecutionGraph {
    nodes: HashMap<TestNodeId, TestNode>,
    /// node_id -> set of node_ids it depends on (must run before)
    dependencies: HashMap<TestNodeId, HashSet<TestNodeId>>,
}

/// A single test or test group in the execution graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestNode {
    pub id: TestNodeId,
    pub name: String,
    pub file_path: String,
    /// Tags for filtering (e.g., @smoke, @regression).
    pub tags: Vec<String>,
    /// Estimated duration from previous runs (for smart ordering).
    pub estimated_duration_ms: Option<u64>,
    /// Priority for fail-fast ordering (higher = run first).
    pub failure_probability: Option<f64>,
}

impl ExecutionGraph {
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a test node to the graph.
    pub fn add_node(&mut self, node: TestNode) {
        let id = node.id.clone();
        self.nodes.insert(id.clone(), node);
        self.dependencies.entry(id).or_default();
    }

    /// Declare that `node_id` depends on `depends_on` (must run after it).
    pub fn add_dependency(&mut self, node_id: &str, depends_on: &str) -> Result<(), GraphError> {
        if !self.nodes.contains_key(node_id) || !self.nodes.contains_key(depends_on) {
            return Err(GraphError::NodeNotFound);
        }

        self.dependencies
            .entry(node_id.to_string())
            .or_default()
            .insert(depends_on.to_string());

        // Check for cycles
        if self.has_cycle() {
            self.dependencies
                .get_mut(node_id)
                .unwrap()
                .remove(depends_on);
            return Err(GraphError::CyclicDependency);
        }

        Ok(())
    }

    /// Get nodes that are ready to execute (all dependencies satisfied).
    pub fn ready_nodes(&self, completed: &HashSet<TestNodeId>) -> Vec<&TestNode> {
        self.nodes
            .values()
            .filter(|node| {
                !completed.contains(&node.id)
                    && self
                        .dependencies
                        .get(&node.id)
                        .is_some_and(|deps| deps.iter().all(|d| completed.contains(d)))
            })
            .collect()
    }

    /// Compute a topological ordering of the graph for sequential fallback.
    pub fn topological_order(&self) -> Result<Vec<&TestNode>, GraphError> {
        // TODO: Implement full Kahn's algorithm for topological ordering
        // For now, sort by failure probability (fail-fast)
        let mut nodes: Vec<&TestNode> = self.nodes.values().collect();
        nodes.sort_by(|a, b| {
            b.failure_probability
                .unwrap_or(0.0)
                .partial_cmp(&a.failure_probability.unwrap_or(0.0))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        Ok(nodes)
    }

    /// Check if the graph contains a cycle.
    fn has_cycle(&self) -> bool {
        let mut visited = HashSet::new();
        let mut in_stack = HashSet::new();

        for id in self.nodes.keys() {
            if self.dfs_cycle(id, &mut visited, &mut in_stack) {
                return true;
            }
        }
        false
    }

    fn dfs_cycle(
        &self,
        node: &str,
        visited: &mut HashSet<String>,
        in_stack: &mut HashSet<String>,
    ) -> bool {
        if in_stack.contains(node) {
            return true;
        }
        if visited.contains(node) {
            return false;
        }

        visited.insert(node.to_string());
        in_stack.insert(node.to_string());

        if let Some(deps) = self.dependencies.get(node) {
            for dep in deps {
                if self.dfs_cycle(dep, visited, in_stack) {
                    return true;
                }
            }
        }

        in_stack.remove(node);
        false
    }

    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }
}

#[derive(Debug, thiserror::Error)]
pub enum GraphError {
    #[error("Node not found in graph")]
    NodeNotFound,

    #[error("Adding this dependency would create a cycle")]
    CyclicDependency,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_node(id: &str) -> TestNode {
        TestNode {
            id: id.to_string(),
            name: id.to_string(),
            file_path: format!("tests/{id}.ts"),
            tags: vec![],
            estimated_duration_ms: None,
            failure_probability: None,
        }
    }

    #[test]
    fn empty_graph_has_no_ready_nodes() {
        let graph = ExecutionGraph::new();
        assert!(graph.ready_nodes(&HashSet::new()).is_empty());
    }

    #[test]
    fn independent_nodes_are_all_ready() {
        let mut graph = ExecutionGraph::new();
        graph.add_node(make_node("a"));
        graph.add_node(make_node("b"));
        graph.add_node(make_node("c"));

        let ready = graph.ready_nodes(&HashSet::new());
        assert_eq!(ready.len(), 3);
    }

    #[test]
    fn dependency_blocks_execution() {
        let mut graph = ExecutionGraph::new();
        graph.add_node(make_node("login"));
        graph.add_node(make_node("dashboard"));
        graph.add_dependency("dashboard", "login").unwrap();

        let ready = graph.ready_nodes(&HashSet::new());
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].id, "login");

        let mut completed = HashSet::new();
        completed.insert("login".to_string());
        let ready = graph.ready_nodes(&completed);
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].id, "dashboard");
    }

    #[test]
    fn cycle_detection() {
        let mut graph = ExecutionGraph::new();
        graph.add_node(make_node("a"));
        graph.add_node(make_node("b"));
        graph.add_dependency("a", "b").unwrap();

        let result = graph.add_dependency("b", "a");
        assert!(matches!(result, Err(GraphError::CyclicDependency)));
    }

    #[test]
    fn dependency_on_missing_node_fails() {
        let mut graph = ExecutionGraph::new();
        graph.add_node(make_node("a"));

        let result = graph.add_dependency("a", "nonexistent");
        assert!(matches!(result, Err(GraphError::NodeNotFound)));
    }

    #[test]
    fn node_count_tracks_additions() {
        let mut graph = ExecutionGraph::new();
        assert_eq!(graph.node_count(), 0);

        graph.add_node(make_node("a"));
        assert_eq!(graph.node_count(), 1);

        graph.add_node(make_node("b"));
        assert_eq!(graph.node_count(), 2);
    }

    #[test]
    fn completed_nodes_are_not_ready() {
        let mut graph = ExecutionGraph::new();
        graph.add_node(make_node("a"));
        graph.add_node(make_node("b"));

        let mut completed = HashSet::new();
        completed.insert("a".to_string());

        let ready = graph.ready_nodes(&completed);
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].id, "b");
    }

    #[test]
    fn diamond_dependency_graph() {
        // A diamond: login -> [profile, settings] -> checkout
        let mut graph = ExecutionGraph::new();
        graph.add_node(make_node("login"));
        graph.add_node(make_node("profile"));
        graph.add_node(make_node("settings"));
        graph.add_node(make_node("checkout"));

        graph.add_dependency("profile", "login").unwrap();
        graph.add_dependency("settings", "login").unwrap();
        graph.add_dependency("checkout", "profile").unwrap();
        graph.add_dependency("checkout", "settings").unwrap();

        // Only login is ready initially
        let ready = graph.ready_nodes(&HashSet::new());
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].id, "login");

        // After login, profile and settings are ready (parallel)
        let mut completed = HashSet::from(["login".to_string()]);
        let ready = graph.ready_nodes(&completed);
        assert_eq!(ready.len(), 2);
        let ids: HashSet<&str> = ready.iter().map(|n| n.id.as_str()).collect();
        assert!(ids.contains("profile"));
        assert!(ids.contains("settings"));

        // After profile + settings, checkout is ready
        completed.insert("profile".to_string());
        completed.insert("settings".to_string());
        let ready = graph.ready_nodes(&completed);
        assert_eq!(ready.len(), 1);
        assert_eq!(ready[0].id, "checkout");
    }

    #[test]
    fn three_node_cycle_is_detected() {
        let mut graph = ExecutionGraph::new();
        graph.add_node(make_node("a"));
        graph.add_node(make_node("b"));
        graph.add_node(make_node("c"));

        graph.add_dependency("a", "b").unwrap();
        graph.add_dependency("b", "c").unwrap();
        let result = graph.add_dependency("c", "a");
        assert!(matches!(result, Err(GraphError::CyclicDependency)));
    }

    #[test]
    fn topological_order_prioritizes_high_failure_probability() {
        let mut graph = ExecutionGraph::new();

        let mut slow = make_node("slow");
        slow.failure_probability = Some(0.1);
        graph.add_node(slow);

        let mut flaky = make_node("flaky");
        flaky.failure_probability = Some(0.9);
        graph.add_node(flaky);

        let mut medium = make_node("medium");
        medium.failure_probability = Some(0.5);
        graph.add_node(medium);

        let order = graph.topological_order().unwrap();
        assert_eq!(order[0].id, "flaky");
        assert_eq!(order[1].id, "medium");
        assert_eq!(order[2].id, "slow");
    }
}
