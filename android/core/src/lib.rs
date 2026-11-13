//! Track's phone-side core, exposed to Kotlin through UniFFI.

mod dates;
mod engine;
mod store;

pub use engine::*;

uniffi::setup_scaffolding!();

#[cfg(test)]
mod tests;
