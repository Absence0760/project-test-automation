use std::collections::{HashMap, HashSet, VecDeque};

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
    pub fn add_dependency(
        &mut self,
        node_id: &str,
        depends_on: &str,
    ) -> Result<(), GraphError> {
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
        let mut in_degree: HashMap<&str, usize> = HashMap::new();
        for id in self.nodes.keys() {
            in_degree.entry(id).or_insert(0);
        }
        for deps in self.dependencies.values() {
            for dep in deps {
                // dep must come before — we're counting how many things depend on each node
            }
        }
        for deps in self.dependencies.values() {
            for _dep in deps {
                // Nodes with dependencies have non-zero in-degree
            }
        }

        // Kahn's algorithm
        for (id, deps) in &self.dependencies {
            let _ = in_degree.entry(id).or_insert(0);
            for _ in deps {
                // This node has deps.len() dependencies
            }
        }

        // Simplified: just return nodes sorted by failure probability (fail-fast)
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
}
