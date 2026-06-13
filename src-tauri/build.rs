fn main() {
  cc::Build::new()
    .file("src/tracker.m")
    .flag("-fobjc-arc")
    .compile("tracker");

  println!("cargo:rustc-link-lib=framework=AppKit");
  println!("cargo:rustc-link-lib=framework=ApplicationServices");

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

  // Sign the bundled OCR sidecar so the app passes notarization. Tauri signs
  // the main binary and the .app, but not this extra resource binary — without
  // a Developer ID signature that has a secure timestamp and the hardened
  // runtime enabled, Apple rejects notarization. Only runs when a signing
  // identity is provided (release builds); plain dev builds skip it.
  println!("cargo:rerun-if-env-changed=APPLE_SIGNING_IDENTITY");
  if let Ok(identity) = std::env::var("APPLE_SIGNING_IDENTITY") {
      let identity = identity.trim().to_string();
      if !identity.is_empty() {
          println!("Signing OCR helper sidecar with Developer ID + hardened runtime...");
          let sign = std::process::Command::new("codesign")
              .args([
                  "--force",
                  "--timestamp",
                  "--options",
                  "runtime",
                  "--sign",
                  &identity,
                  ocr_binary,
              ])
              .status();
          match sign {
              Ok(s) if s.success() => {
                  println!("OCR helper sidecar signed for notarization.");
              }
              Ok(s) => {
                  panic!("codesign of ocr-helper failed with status: {:?}", s);
              }
              Err(e) => {
                  panic!("Failed to run codesign for ocr-helper: {:?}", e);
              }
          }
      }
  }

  tauri_build::build()
}
