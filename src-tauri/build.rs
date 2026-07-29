// Two Swift sidecars are compiled into `binaries/` and bundled as resources:
//
//   video-scan     samples a recording and OCRs the frames (the scanner)
//   frame-extract  pulls one still out of a file, to show where a finding is
//
// The Objective-C natives are gone with the product that needed them. There was
// a `tracker.m` that polled the frontmost window, a `vault.m` that held an
// encryption key behind Touch ID, an `ocr-helper` that read the live screen and
// a `frame-capture` that recorded it continuously. A tool that scans a file you
// hand it needs none of that, and a tool that looks for leaked credentials has
// no business running any of it.

fn main() {
    // Swift only compiles on macOS. Before this guard, `cargo check` on any
    // other host panicked here ("Failed to execute swiftc"), which meant none
    // of the Rust in this crate could be checked by a compiler outside a Mac —
    // it was reviewed by hand instead. Skipping the native step lets any host
    // type-check the crate. It cannot link or run it, and macOS is unaffected:
    // there the guard is true and every step below runs.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        build_swift_sidecars();
    } else {
        write_sidecar_placeholders();
    }

    tauri_build::build()
}

/// Sidecars declared as resources in `tauri.conf.json`, in the order they are
/// built. Each is `<name>.swift` in `src/` and `binaries/<name>` when compiled.
const SIDECARS: &[&str] = &["video-scan", "frame-extract"];

/// tauri_build refuses to run if a declared resource is missing. Off macOS the
/// sidecars were never produced, so the check fails on files that could not
/// possibly be there. These stubs keep `cargo check` working; they are
/// git-ignored and never reach a bundle, since a bundle can only be built on
/// macOS in the first place.
fn write_sidecar_placeholders() {
    std::fs::create_dir_all("binaries").expect("failed to create binaries directory");
    for name in SIDECARS {
        let path = format!("binaries/{name}");
        if !std::path::Path::new(&path).exists() {
            std::fs::write(&path, b"#!/bin/sh\nexit 1\n")
                .expect("failed to write sidecar placeholder");
        }
    }
}

fn build_swift_sidecars() {
    std::fs::create_dir_all("binaries").expect("failed to create binaries directory");
    let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR is not set");

    for name in SIDECARS {
        let source = format!("src/{name}.swift");
        let binary = format!("binaries/{name}");

        // Compile from a copy in OUT_DIR: building straight out of the source
        // tree trips over iCloud sync metadata locks.
        let temp = std::path::Path::new(&out_dir).join(format!("{name}.swift"));
        std::fs::copy(&source, &temp)
            .unwrap_or_else(|e| panic!("failed to stage {source}: {e:?}"));
        println!("cargo:rerun-if-changed={source}");

        println!("Compiling Swift sidecar {name}...");
        let status = std::process::Command::new("swiftc")
            .arg("-O")
            .arg(&temp)
            .arg("-o")
            .arg(&binary)
            .status();

        match status {
            Ok(s) if s.success() => println!("Sidecar {name} compiled to {binary}."),
            Ok(s) => panic!("swiftc failed for {name} with status: {s:?}"),
            Err(e) => panic!("could not run swiftc for {name}: {e:?}"),
        }
    }

    // Sign the sidecars so the app passes notarization. Tauri signs the main
    // binary and the .app, but not these extra resource binaries — without a
    // Developer ID signature carrying a secure timestamp and the hardened
    // runtime, Apple rejects the notarization. Only runs when a signing
    // identity is provided (release builds); plain dev builds skip it.
    println!("cargo:rerun-if-env-changed=APPLE_SIGNING_IDENTITY");
    let Ok(identity) = std::env::var("APPLE_SIGNING_IDENTITY") else {
        return;
    };
    let identity = identity.trim().to_string();
    if identity.is_empty() {
        return;
    }

    for name in SIDECARS {
        let binary = format!("binaries/{name}");
        println!("Signing {binary} with Developer ID + hardened runtime...");
        let sign = std::process::Command::new("codesign")
            .args([
                "--force",
                "--timestamp",
                "--options",
                "runtime",
                "--sign",
                &identity,
                &binary,
            ])
            .status();
        match sign {
            Ok(s) if s.success() => println!("Sidecar {binary} signed for notarization."),
            Ok(s) => panic!("codesign of {binary} failed with status: {s:?}"),
            Err(e) => panic!("could not run codesign for {binary}: {e:?}"),
        }
    }
}
