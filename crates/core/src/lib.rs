pub mod executor;
pub mod healing;
pub mod protocol;
pub mod selector;

/// Core result type using bettertest errors.
pub type Result<T> = std::result::Result<T, error::Error>;

pub mod error {
    use thiserror::Error;

    #[derive(Error, Debug)]
    pub enum Error {
        #[error("Protocol error: {0}")]
        Protocol(#[from] crate::protocol::ProtocolError),

        #[error("Selector resolution failed: {0}")]
        Selector(String),

        #[error("Execution error: {0}")]
        Execution(String),

        #[error("Self-healing failed: {0}")]
        Healing(String),

        #[error("IO error: {0}")]
        Io(#[from] std::io::Error),

        #[error("JSON error: {0}")]
        Json(#[from] serde_json::Error),
    }
}
