use bettertest_core::selector::{
    ResolvedSelector, ResolutionStrategy, SemanticSelector, ElementFingerprint, BoundingBox,
    SelectorResolver,
    resolver::ResolutionContext,
};

#[test]
fn semantic_selector_builder() {
    let selector = SemanticSelector::new("the submit button");
    assert_eq!(selector.intent, "the submit button");
    assert!(selector.scope.is_none());
    assert!(selector.cached_resolution.is_none());
}

#[test]
fn semantic_selector_with_scope() {
    let selector = SemanticSelector::new("the save button").within("the settings form");
    assert_eq!(selector.intent, "the save button");
    assert_eq!(selector.scope.as_deref(), Some("the settings form"));
}

#[test]
fn semantic_selector_serializes_to_json() {
    let selector = SemanticSelector::new("the email input").within("login form");
    let json = serde_json::to_string(&selector).unwrap();
    let deserialized: SemanticSelector = serde_json::from_str(&json).unwrap();

    assert_eq!(deserialized.intent, "the email input");
    assert_eq!(deserialized.scope.as_deref(), Some("login form"));
}

#[test]
fn resolved_selector_roundtrips_through_json() {
    let resolved = ResolvedSelector {
        strategy: ResolutionStrategy::Accessibility,
        value: "[role='button'][name='Submit']".to_string(),
        confidence: 0.95,
        fingerprint: ElementFingerprint {
            tag_name: "button".to_string(),
            text_content: Some("Submit".to_string()),
            aria_role: Some("button".to_string()),
            aria_label: None,
            bounding_box: Some(BoundingBox {
                x: 100.0,
                y: 200.0,
                width: 120.0,
                height: 40.0,
            }),
            attributes: vec![("type".to_string(), "submit".to_string())],
        },
    };

    let json = serde_json::to_string(&resolved).unwrap();
    let deserialized: ResolvedSelector = serde_json::from_str(&json).unwrap();

    assert_eq!(deserialized.strategy, ResolutionStrategy::Accessibility);
    assert_eq!(deserialized.confidence, 0.95);
    assert_eq!(deserialized.fingerprint.tag_name, "button");
}

#[test]
fn resolver_returns_no_match_when_strategies_fail() {
    let resolver = SelectorResolver::new();
    let selector = SemanticSelector::new("the submit button");
    let context = ResolutionContext {
        accessibility_tree: serde_json::Value::Null,
        layout_nodes: vec![],
    };

    let result = resolver.resolve(&selector, &context);
    assert!(result.is_err());

    let err = result.unwrap_err();
    let msg = err.to_string();
    assert!(msg.contains("the submit button"));
}

#[test]
fn resolver_respects_confidence_threshold() {
    let resolver = SelectorResolver::new().with_min_confidence(0.99);
    let selector = SemanticSelector::new("something vague");
    let context = ResolutionContext {
        accessibility_tree: serde_json::Value::Null,
        layout_nodes: vec![],
    };

    // With an extremely high threshold, nothing should match
    let result = resolver.resolve(&selector, &context);
    assert!(result.is_err());
}

#[test]
fn element_fingerprint_serialization() {
    let fingerprint = ElementFingerprint {
        tag_name: "input".to_string(),
        text_content: None,
        aria_role: Some("textbox".to_string()),
        aria_label: Some("Email address".to_string()),
        bounding_box: None,
        attributes: vec![
            ("type".to_string(), "email".to_string()),
            ("placeholder".to_string(), "Enter your email".to_string()),
        ],
    };

    let json = serde_json::to_value(&fingerprint).unwrap();
    assert_eq!(json["tag_name"], "input");
    assert_eq!(json["aria_label"], "Email address");
    assert_eq!(json["attributes"][0][0], "type");
    assert_eq!(json["attributes"][0][1], "email");
}
