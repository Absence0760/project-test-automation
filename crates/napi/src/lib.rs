use napi_derive::napi;
use bettertest_core::selector::{ResolvedSelector, SemanticSelector};

#[napi]
pub fn create_selector(intent: String, scope: Option<String>) -> napi::Result<String> {
    let mut selector = SemanticSelector::new(intent);
    if let Some(s) = scope {
        selector = selector.within(s);
    }
    serde_json::to_string(&selector).map_err(|e| napi::Error::from_reason(e.to_string()))
}

#[napi]
pub fn parse_accessibility_intent(intent: String) -> napi::Result<String> {
    let query = bettertest_core::selector::accessibility::parse_intent(&intent);
    Ok(format!(
        "role: {:?}, name: {:?}",
        query.role, query.name_contains
    ))
}

/// Placeholder for the full test execution bridge.
/// This will be the main entry point from the TypeScript runner into the Rust core.
#[napi]
pub async fn run_tests(config_json: String) -> napi::Result<String> {
    let _config: serde_json::Value = serde_json::from_str(&config_json)
        .map_err(|e| napi::Error::from_reason(e.to_string()))?;

    // TODO: Bridge to bettertest-core execution engine
    Ok(r#"{"status": "not_implemented"}"#.to_string())
}
