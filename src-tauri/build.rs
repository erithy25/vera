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

  tauri_build::build()
}
