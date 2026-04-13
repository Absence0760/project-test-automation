use bettertest_core::executor::{
    TestResult, TestStatus, TestError, FlakinessClassification, StepResult,
};

#[test]
fn test_result_serializes_to_json() {
    let result = TestResult {
        node_id: "login-test".to_string(),
        status: TestStatus::Passed,
        duration_ms: 1500,
        error: None,
        steps: vec![
            StepResult {
                description: "navigate to /login".to_string(),
                status: TestStatus::Passed,
                duration_ms: 200,
                selector_used: None,
            },
            StepResult {
                description: "fill the email input".to_string(),
                status: TestStatus::Passed,
                duration_ms: 50,
                selector_used: Some("the email input".to_string()),
            },
        ],
    };

    let json = serde_json::to_value(&result).unwrap();
    assert_eq!(json["node_id"], "login-test");
    assert_eq!(json["status"], "Passed");
    assert_eq!(json["steps"].as_array().unwrap().len(), 2);
}

#[test]
fn flaky_status_includes_attempt_count() {
    let result = TestResult {
        node_id: "flaky-test".to_string(),
        status: TestStatus::Flaky { attempts: 3 },
        duration_ms: 4500,
        error: None,
        steps: vec![],
    };

    let json = serde_json::to_value(&result).unwrap();
    assert_eq!(json["status"]["Flaky"]["attempts"], 3);
}

#[test]
fn test_error_with_flakiness_classification() {
    let error = TestError {
        message: "Element not found within timeout".to_string(),
        stack: Some("at selector.resolve (core/selector.rs:42)".to_string()),
        flakiness: Some(FlakinessClassification::RaceCondition),
    };

    let json = serde_json::to_value(&error).unwrap();
    assert_eq!(json["flakiness"], "RaceCondition");
}

#[test]
fn all_flakiness_classifications_serialize() {
    let classifications = vec![
        FlakinessClassification::RaceCondition,
        FlakinessClassification::AnimationTiming,
        FlakinessClassification::NetworkTiming,
        FlakinessClassification::DataDependency,
        FlakinessClassification::Environment,
        FlakinessClassification::Unknown,
    ];

    for classification in classifications {
        let json = serde_json::to_value(&classification).unwrap();
        assert!(json.is_string(), "Classification should serialize as string");
    }
}

#[test]
fn test_status_equality() {
    assert_eq!(TestStatus::Passed, TestStatus::Passed);
    assert_eq!(TestStatus::Failed, TestStatus::Failed);
    assert_ne!(TestStatus::Passed, TestStatus::Failed);
    assert_eq!(
        TestStatus::Flaky { attempts: 2 },
        TestStatus::Flaky { attempts: 2 }
    );
    assert_ne!(
        TestStatus::Flaky { attempts: 2 },
        TestStatus::Flaky { attempts: 3 }
    );
}
