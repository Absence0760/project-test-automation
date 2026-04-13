use bettertest_core::healing::{DomDiff};
use bettertest_core::healing::diff::DomChange;

#[test]
fn empty_diff_from_identical_snapshots() {
    let before = serde_json::json!({"tag": "div", "children": []});
    let after = serde_json::json!({"tag": "div", "children": []});

    let diff = DomDiff::compute(&before, &after);
    assert!(diff.changes.is_empty());
}

#[test]
fn affects_path_detects_removal() {
    let diff = DomDiff {
        changes: vec![DomChange::Removed {
            path: "body > form > button".to_string(),
            tag: "button".to_string(),
        }],
    };

    assert!(diff.affects_path("body > form > button"));
    assert!(!diff.affects_path("body > form > input"));
}

#[test]
fn affects_path_detects_move() {
    let diff = DomDiff {
        changes: vec![DomChange::Moved {
            old_path: "body > div > button".to_string(),
            new_path: "body > form > button".to_string(),
            tag: "button".to_string(),
        }],
    };

    assert!(diff.affects_path("body > div > button"));
    assert!(!diff.affects_path("body > form > button")); // new path is not "affected"
}

#[test]
fn affects_path_detects_attribute_change() {
    let diff = DomDiff {
        changes: vec![DomChange::AttributeChanged {
            path: "body > form > input".to_string(),
            attribute: "class".to_string(),
            old_value: Some("old-class".to_string()),
            new_value: Some("new-class".to_string()),
        }],
    };

    assert!(diff.affects_path("body > form > input"));
}

#[test]
fn affects_path_ignores_additions() {
    let diff = DomDiff {
        changes: vec![DomChange::Added {
            path: "body > form > span".to_string(),
            tag: "span".to_string(),
            attributes: vec![],
        }],
    };

    // An addition doesn't "affect" an existing path
    assert!(!diff.affects_path("body > form > span"));
}

#[test]
fn affects_path_ignores_text_changes() {
    let diff = DomDiff {
        changes: vec![DomChange::TextChanged {
            path: "body > form > button".to_string(),
            old_text: "Submit".to_string(),
            new_text: "Continue".to_string(),
        }],
    };

    // Text changes don't break structural selectors
    assert!(!diff.affects_path("body > form > button"));
}

#[test]
fn diff_with_multiple_changes() {
    let diff = DomDiff {
        changes: vec![
            DomChange::Removed {
                path: "header > nav".to_string(),
                tag: "nav".to_string(),
            },
            DomChange::Added {
                path: "header > menu".to_string(),
                tag: "menu".to_string(),
                attributes: vec![("role".to_string(), "navigation".to_string())],
            },
            DomChange::AttributeChanged {
                path: "footer > a".to_string(),
                attribute: "href".to_string(),
                old_value: Some("/old".to_string()),
                new_value: Some("/new".to_string()),
            },
        ],
    };

    assert!(diff.affects_path("header > nav"));
    assert!(!diff.affects_path("header > menu")); // addition, not affected
    assert!(diff.affects_path("footer > a"));
    assert!(!diff.affects_path("body > main"));
}
