fn main() {
  cc::Build::new()
    .file("src/tracker.m")
    .file("src/vault.m")
    .flag("-fobjc-arc")
    .compile("tracker");

  println!("cargo:rustc-link-lib=framework=AppKit");
  println!("cargo:rustc-link-lib=framework=ApplicationServices");
  println!("cargo:rustc-link-lib=framework=Security");
  println!("cargo:rustc-link-lib=framework=LocalAuthentication");
  println!("cargo:rerun-if-changed=src/vault.m");

  // Compile Swift OCR helper at build time
  let ocr_source = "src/tracker-ocr.swift";
  let ocr_binary = "binaries/ocr-helper";

  // Ensure binaries directory exists
  std::fs::create_dir_all("binaries").expect("failed to create binaries directory");

  // Copy swift source to cargo OUT_DIR to bypass iCloud sync metadata locks during compilation
  let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR is not set");
  let temp_source = std::path::Path::new(&out_dir).join("tracker-ocr.swift");
  std::fs::copy(ocr_source, &temp_source).expect("failed to copy swift source to out_dir");

  println!("cargo:rerun-if-changed={}", ocr_source);

  println!("Compiling Swift OCR helper sidecar at build time...");
  let status = std::process::Command::new("swiftc")
      .arg("-O")
      .arg(&temp_source)
      .arg("-o")
      .arg(ocr_binary)
      .status();

  match status {
      Ok(s) if s.success() => {
          println!("Swift OCR helper sidecar compiled successfully to {}", ocr_binary);
      }
      Ok(s) => {
          panic!("swiftc compilation failed with status: {:?}", s);
      }
      Err(e) => {
          panic!("Failed to execute swiftc compiler at build time: {:?}", e);
      }
  }

  // Compile the long-lived ScreenCaptureKit frame-capture sidecar.
  let frame_source = "src/frame-capture.swift";
  let frame_binary = "binaries/frame-capture";
  let temp_frame_source = std::path::Path::new(&out_dir).join("frame-capture.swift");
  std::fs::copy(frame_source, &temp_frame_source)
      .expect("failed to copy frame-capture swift source to out_dir");
  println!("cargo:rerun-if-changed={}", frame_source);

  println!("Compiling Swift frame-capture sidecar at build time...");
  let frame_status = std::process::Command::new("swiftc")
      .arg("-O")
      .arg(&temp_frame_source)
      .arg("-o")
      .arg(frame_binary)
      .status();

  match frame_status {
      Ok(s) if s.success() => {
          println!("Swift frame-capture sidecar compiled successfully to {}", frame_binary);
      }
      Ok(s) => {
          panic!("swiftc compilation of frame-capture failed with status: {:?}", s);
      }
      Err(e) => {
          panic!("Failed to execute swiftc compiler for frame-capture: {:?}", e);
      }
  }

  // Compile the frame-extract helper (time-seek retrieval from HEVC segments).
  let extract_source = "src/frame-extract.swift";
  let extract_binary = "binaries/frame-extract";
  let temp_extract_source = std::path::Path::new(&out_dir).join("frame-extract.swift");
  std::fs::copy(extract_source, &temp_extract_source)
      .expect("failed to copy frame-extract swift source to out_dir");
  println!("cargo:rerun-if-changed={}", extract_source);

  println!("Compiling Swift frame-extract helper at build time...");
  let extract_status = std::process::Command::new("swiftc")
      .arg("-O")
      .arg(&temp_extract_source)
      .arg("-o")
      .arg(extract_binary)
      .status();

  match extract_status {
      Ok(s) if s.success() => {
          println!("Swift frame-extract helper compiled successfully to {}", extract_binary);
      }
      Ok(s) => {
          panic!("swiftc compilation of frame-extract failed with status: {:?}", s);
      }
      Err(e) => {
          panic!("Failed to execute swiftc compiler for frame-extract: {:?}", e);
      }
  }

  // Sign the bundled sidecars so the app passes notarization. Tauri signs the
  // main binary and the .app, but not these extra resource binaries — without a
  // Developer ID signature that has a secure timestamp and the hardened runtime
  // enabled, Apple rejects notarization. Only runs when a signing identity is
  // provided (release builds); plain dev builds skip it.
  println!("cargo:rerun-if-env-changed=APPLE_SIGNING_IDENTITY");
  if let Ok(identity) = std::env::var("APPLE_SIGNING_IDENTITY") {
      let identity = identity.trim().to_string();
      if !identity.is_empty() {
          for sidecar in [ocr_binary, frame_binary, extract_binary] {
              println!("Signing sidecar {} with Developer ID + hardened runtime...", sidecar);
              let sign = std::process::Command::new("codesign")
                  .args([
                      "--force",
                      "--timestamp",
                      "--options",
                      "runtime",
                      "--sign",
                      &identity,
                      sidecar,
                  ])
                  .status();
              match sign {
                  Ok(s) if s.success() => {
                      println!("Sidecar {} signed for notarization.", sidecar);
                  }
                  Ok(s) => {
                      panic!("codesign of {} failed with status: {:?}", sidecar, s);
                  }
                  Err(e) => {
                      panic!("Failed to run codesign for {}: {:?}", sidecar, e);
                  }
              }
          }
      }
  }

  tauri_build::build()
}
