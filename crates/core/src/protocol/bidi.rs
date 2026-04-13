use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio_tungstenite::{connect_async, tungstenite::Message};

use super::ProtocolError;

/// A WebDriver BiDi session connected to a browser instance.
pub struct BiDiSession {
    url: String,
    // The WebSocket connection will be stored here once established
    ws: Option<BiDiConnection>,
}

struct BiDiConnection {
    write: futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
        Message,
    >,
    read: futures_util::stream::SplitStream<
        tokio_tungstenite::WebSocketStream<
            tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
        >,
    >,
}

#[derive(Debug, Serialize)]
struct BiDiCommand {
    id: u64,
    method: String,
    params: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct BiDiResponse {
    id: u64,
    result: Option<serde_json::Value>,
    error: Option<BiDiError>,
}

#[derive(Debug, Deserialize)]
struct BiDiError {
    error: String,
    message: String,
}

impl BiDiSession {
    /// Create a new BiDi session targeting the given WebSocket URL.
    pub fn new(url: impl Into<String>) -> Self {
        Self {
            url: url.into(),
            ws: None,
        }
    }

    /// Connect to the browser's BiDi endpoint.
    pub async fn connect(&mut self) -> Result<(), ProtocolError> {
        let (ws_stream, _) = connect_async(&self.url)
            .await
            .map_err(|e| ProtocolError::Connection(e.to_string()))?;

        let (write, read) = ws_stream.split();
        self.ws = Some(BiDiConnection { write, read });

        tracing::info!("BiDi session connected to {}", self.url);
        Ok(())
    }

    /// Send a BiDi command and await the response.
    pub async fn send_command(
        &mut self,
        method: &str,
        params: serde_json::Value,
    ) -> Result<serde_json::Value, ProtocolError> {
        let conn = self.ws.as_mut().ok_or(ProtocolError::NoSession)?;

        let command = BiDiCommand {
            id: 1, // TODO: implement command ID counter
            method: method.to_string(),
            params,
        };

        let msg = serde_json::to_string(&command)
            .map_err(|e| ProtocolError::Command {
                method: method.to_string(),
                message: e.to_string(),
            })?;

        conn.write
            .send(Message::Text(msg))
            .await
            .map_err(|e| ProtocolError::WebSocket(e.to_string()))?;

        // Read response
        if let Some(Ok(Message::Text(text))) = conn.read.next().await {
            let response: BiDiResponse = serde_json::from_str(&text)
                .map_err(|e| ProtocolError::WebSocket(e.to_string()))?;

            if let Some(err) = response.error {
                return Err(ProtocolError::Command {
                    method: method.to_string(),
                    message: format!("{}: {}", err.error, err.message),
                });
            }

            Ok(response.result.unwrap_or(serde_json::Value::Null))
        } else {
            Err(ProtocolError::WebSocket(
                "No response received".to_string(),
            ))
        }
    }
}
