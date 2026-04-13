mod bidi;

pub use bidi::BiDiSession;

use thiserror::Error;

#[derive(Error, Debug)]
pub enum ProtocolError {
    #[error("Connection failed: {0}")]
    Connection(String),

    #[error("Command failed: {method} — {message}")]
    Command { method: String, message: String },

    #[error("WebSocket error: {0}")]
    WebSocket(String),

    #[error("Session not established")]
    NoSession,
}

/// Supported browser protocols.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Protocol {
    /// WebDriver BiDi (W3C standard) — preferred
    BiDi,
    /// Chrome DevTools Protocol — fallback
    Cdp,
}
