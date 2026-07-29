//! # vera-core
//!
//! Vera core logic, **free of any Tauri dependency**.
//!
//! ## Why this crate exists
//!
//! Before the rebuild, all logic lived in a single file: `src-tauri/src/lib.rs`,
//! 2,292 lines, not one `mod`, eight responsibilities side by side — FFI,
//! cryptography, SQL, HTTP clients, tray menu, capture supervisor, redaction,
//! migrations.
//!
//! That had two consequences:
//!
//! 1. **None of it was testable.** Tauri only builds on macOS (GTK is missing
//!    on Linux), so even the pure logic could not be exercised anywhere. The
//!    result was zero tests across 12,141 lines of code.
//! 2. **Logic was copied across language boundaries.** Redaction, the Luhn
//!    check and app categorisation existed several times over in Rust,
//!    TypeScript and Swift — with differences that produced security holes.
//!
//! This crate holds the logic that needs no platform. It builds and tests
//! anywhere. `src-tauri` stays a thin shell around it.

pub mod crypto;
pub mod paths;
pub mod privacy;
pub mod redact;
pub mod schema;
pub mod secrets;

pub use redact::{redact, REDACTED};

/// Core logic version. Deliberately pinned to the app version.
pub const CORE_VERSION: &str = env!("CARGO_PKG_VERSION");
