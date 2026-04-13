#!/bin/sh
# Better Test Automation — standalone installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/jaredhoward/better-test-automation/main/scripts/install.sh | sh
#
# Options (via env vars):
#   VERSION=0.2.0  — install a specific version (default: latest)
#   INSTALL_DIR=~/.local/bin — custom install directory

set -e

REPO="jaredhoward/better-test-automation"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="bettertest"

# ─── Detect platform ──────────────────────────────────────────

detect_platform() {
  OS="$(uname -s)"
  ARCH="$(uname -m)"

  case "$OS" in
    Linux)  PLATFORM="linux" ;;
    Darwin) PLATFORM="darwin" ;;
    *)
      echo "Error: Unsupported OS: $OS"
      echo "Better Test Automation supports Linux and macOS."
      echo "For Windows, use: npm install -g @bettertest/cli"
      exit 1
      ;;
  esac

  case "$ARCH" in
    x86_64|amd64) ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *)
      echo "Error: Unsupported architecture: $ARCH"
      exit 1
      ;;
  esac

  ARTIFACT="bettertest-${PLATFORM}-${ARCH}"
  echo "Detected platform: ${PLATFORM}-${ARCH}"
}

# ─── Get version ──────────────────────────────────────────────

get_version() {
  if [ -n "$VERSION" ]; then
    echo "Installing version: v${VERSION}"
    return
  fi

  echo "Fetching latest version..."
  VERSION=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' \
    | sed -E 's/.*"v([^"]+)".*/\1/')

  if [ -z "$VERSION" ]; then
    echo "Error: Could not determine latest version."
    echo "Try setting VERSION explicitly: VERSION=0.1.0 sh install.sh"
    exit 1
  fi

  echo "Latest version: v${VERSION}"
}

# ─── Download ─────────────────────────────────────────────────

download() {
  URL="https://github.com/${REPO}/releases/download/v${VERSION}/${ARTIFACT}"
  TMPFILE=$(mktemp)

  echo "Downloading ${ARTIFACT}..."
  echo "  ${URL}"

  HTTP_CODE=$(curl -fsSL -w "%{http_code}" -o "$TMPFILE" "$URL" 2>/dev/null || true)

  if [ "$HTTP_CODE" != "200" ] || [ ! -s "$TMPFILE" ]; then
    rm -f "$TMPFILE"
    echo ""
    echo "Error: Download failed (HTTP ${HTTP_CODE})"
    echo ""
    echo "This can happen if:"
    echo "  - Version v${VERSION} does not exist"
    echo "  - No binary was built for ${PLATFORM}-${ARCH}"
    echo ""
    echo "Alternative install methods:"
    echo "  npm install -g @bettertest/cli"
    echo "  cargo install bettertest-cli"
    exit 1
  fi

  echo "Downloaded successfully."
}

# ─── Install ──────────────────────────────────────────────────

install() {
  TARGET="${INSTALL_DIR}/${BINARY_NAME}"

  # Check if we need sudo
  if [ -w "$INSTALL_DIR" ]; then
    mv "$TMPFILE" "$TARGET"
    chmod +x "$TARGET"
  else
    echo "Installing to ${INSTALL_DIR} (requires sudo)..."
    sudo mv "$TMPFILE" "$TARGET"
    sudo chmod +x "$TARGET"
  fi

  echo ""
  echo "Installed: ${TARGET}"
  echo ""

  # Verify
  if command -v bettertest >/dev/null 2>&1; then
    echo "Verify: $(bettertest --version 2>/dev/null || echo 'installed')"
  else
    echo "Note: ${INSTALL_DIR} may not be in your PATH."
    echo "Add it with:"
    echo "  export PATH=\"${INSTALL_DIR}:\$PATH\""
  fi

  echo ""
  echo "Get started:"
  echo "  bettertest init"
  echo "  bettertest run"
  echo ""
  echo "Docs: https://github.com/${REPO}#readme"
}

# ─── Main ─────────────────────────────────────────────────────

main() {
  echo ""
  echo "  Better Test Automation Installer"
  echo "  ─────────────────────────────────"
  echo ""

  detect_platform
  get_version
  download
  install
}

main
