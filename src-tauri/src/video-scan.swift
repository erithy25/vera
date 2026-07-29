// Vera video-scan sidecar.
//
// Walks a finished screen recording, samples it at a fixed rate, and OCRs the
// sampled frames. One process handles the whole file: spawning a helper per
// frame would cost more in process setup than the decode itself.
//
// Usage:
//   video-scan <video> [--fps N] [--hash-threshold N] [--max-width PX]
//
// Emits one JSON object per line on stdout:
//   {"type":"meta","duration_ms":N,"total_frames":N}
//   {"type":"frame","frame_index":N,"timestamp_ms":N,"text":"...","skipped":false}
//   {"type":"frame","frame_index":N,"timestamp_ms":N,"skipped":true}
//   {"type":"done","frames_scanned":N,"frames_ocred":N}
//   {"type":"error","error":"..."}
// Always exits 0; the caller decides what an error means.
//
// ## Two things here are load-bearing
//
// 1. **No frame ever reaches the disk.** Decoded images live in memory and are
//    released as soon as they are read. A tool that scans your recording for
//    leaked credentials must not scatter copies of those frames through the
//    temp directory.
// 2. **Language correction stays off.** Vision "corrects" strings it cannot
//    read as words, which turns `sk-proj-T3xK9m` into something word-shaped and
//    destroys the very thing we are looking for. Enforced by
//    src-tauri/core/tests/ocr_settings.rs.

import AVFoundation
import CoreGraphics
import CoreMedia
import Foundation
import Vision

// MARK: - Output

let emitQueue = DispatchQueue(label: "app.vera.video-scan.emit")

func emit(_ obj: [String: Any]) {
    emitQueue.sync {
        if let data = try? JSONSerialization.data(withJSONObject: obj, options: []),
           let str = String(data: data, encoding: .utf8) {
            print(str)
            fflush(stdout)
        }
    }
}

func fail(_ message: String) -> Never {
    emit(["type": "error", "error": message])
    exit(0)
}

// MARK: - Arguments

struct Options {
    var path: String = ""
    var fps: Double = 1.0
    // Hamming distance over a 64-bit average hash below which two frames count
    // as the same picture. 5 is the value the capture path already uses.
    var hashThreshold: Int = 5
    // 0 means "do not scale".
    //
    // Downscaling would be faster, and the old live-capture path did it at
    // 1600px. It is wrong here: the text we are hunting for is small terminal
    // type, and on a 4K recording, scaling to 1600 is exactly what turns a
    // legible key into an unreadable smear. Missing a key is the worst outcome
    // this product has, so full resolution is the default and scaling is
    // something you have to ask for.
    var maxWidth: Int = 0
}

var opts = Options()
do {
    var args = Array(CommandLine.arguments.dropFirst())
    guard let first = args.first, !first.hasPrefix("--") else {
        fail("usage: video-scan <video> [--fps N] [--hash-threshold N] [--max-width PX]")
    }
    opts.path = first
    args = Array(args.dropFirst())

    var i = 0
    while i < args.count {
        let flag = args[i]
        let value: String? = (i + 1 < args.count) ? args[i + 1] : nil
        switch flag {
        case "--fps":
            if let v = value, let n = Double(v), n > 0 { opts.fps = n }
            i += 2
        case "--hash-threshold":
            if let v = value, let n = Int(v), n >= 0 { opts.hashThreshold = n }
            i += 2
        case "--max-width":
            if let v = value, let n = Int(v), n > 0 { opts.maxWidth = n }
            i += 2
        default:
            i += 1
        }
    }
}

guard FileManager.default.fileExists(atPath: opts.path) else {
    fail("file not found: \(opts.path)")
}

// MARK: - Perceptual hash
//
// Same 8x8 average hash the capture sidecar uses. In a screen recording most
// consecutive frames are pixel-identical — skipping their OCR is where nearly
// all of the scan time is saved.

func averageHash(_ cgImage: CGImage) -> UInt64? {
    let side = 8
    let colorSpace = CGColorSpaceCreateDeviceGray()
    guard let ctx = CGContext(
        data: nil, width: side, height: side, bitsPerComponent: 8,
        bytesPerRow: side, space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.none.rawValue
    ) else { return nil }
    ctx.interpolationQuality = .low
    ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: side, height: side))
    guard let data = ctx.data else { return nil }
    let ptr = data.bindMemory(to: UInt8.self, capacity: side * side)
    var sum = 0
    for idx in 0..<(side * side) { sum += Int(ptr[idx]) }
    let avg = sum / (side * side)
    var hash: UInt64 = 0
    for idx in 0..<(side * side) where Int(ptr[idx]) >= avg {
        hash |= (UInt64(1) << UInt64(idx))
    }
    return hash
}

func hamming(_ a: UInt64, _ b: UInt64) -> Int { (a ^ b).nonzeroBitCount }

// MARK: - OCR

func recognizeText(_ cgImage: CGImage) -> String {
    let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    // Must stay false — see the header comment. Enforced by ocr_settings.rs.
    request.usesLanguageCorrection = false
    do {
        try handler.perform([request])
    } catch {
        return ""
    }
    guard let observations = request.results as? [VNRecognizedTextObservation] else {
        return ""
    }
    // Every line is kept, deliberately. The capture path filters out short
    // fragments as UI chrome; here a 20-character fragment may be the entire
    // secret, so nothing is dropped on length.
    var lines: [String] = []
    for observation in observations {
        guard let candidate = observation.topCandidates(1).first else { continue }
        let line = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
        if !line.isEmpty { lines.append(line) }
    }
    return lines.joined(separator: "\n")
}

// MARK: - Scan

let url = URL(fileURLWithPath: opts.path)
let asset = AVURLAsset(url: url)

let durationSeconds = CMTimeGetSeconds(asset.duration)
guard durationSeconds.isFinite, durationSeconds > 0 else {
    fail("could not read a duration from this file — is it a video?")
}

let interval = 1.0 / opts.fps
let totalFrames = max(1, Int(durationSeconds / interval))

emit([
    "type": "meta",
    "duration_ms": Int(durationSeconds * 1000.0),
    "total_frames": totalFrames,
])

let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
// A sample every `interval` seconds; snapping to a nearby decoded frame is
// fine and much faster than forcing an exact seek. The reported timestamp is
// the actual one, so the number the user sees still points at the right place.
let tolerance = CMTime(seconds: interval / 2.0, preferredTimescale: 600)
generator.requestedTimeToleranceBefore = tolerance
generator.requestedTimeToleranceAfter = tolerance
if opts.maxWidth > 0 {
    // Both dimensions must be set: the image is scaled to *fit inside* this
    // box with its aspect ratio preserved, so a height of 0 would collapse
    // every frame to nothing.
    generator.maximumSize = CGSize(width: opts.maxWidth, height: opts.maxWidth)
}

var lastHash: UInt64?
var framesScanned = 0
var framesOcred = 0

for index in 0..<totalFrames {
    let seconds = Double(index) * interval
    let time = CMTime(seconds: seconds, preferredTimescale: 600)

    var actual = CMTime.zero
    guard let image = try? generator.copyCGImage(at: time, actualTime: &actual) else {
        // A single undecodable frame is not a reason to abandon the scan.
        continue
    }

    let actualSeconds = CMTimeGetSeconds(actual)
    let timestampMs = Int((actualSeconds.isFinite ? actualSeconds : seconds) * 1000.0)
    framesScanned += 1

    // Unchanged picture? Then its text is unchanged too. The caller carries the
    // previous frame's text forward, so a secret that stays on screen still
    // gets the full time range attributed to it.
    let hash = averageHash(image)
    if let hash = hash, let previous = lastHash,
       hamming(hash, previous) <= opts.hashThreshold {
        emit([
            "type": "frame",
            "frame_index": index,
            "timestamp_ms": timestampMs,
            "skipped": true,
        ])
        continue
    }
    if let hash = hash { lastHash = hash }

    let text = recognizeText(image)
    framesOcred += 1
    emit([
        "type": "frame",
        "frame_index": index,
        "timestamp_ms": timestampMs,
        "text": text,
        "skipped": false,
    ])
}

emit([
    "type": "done",
    "frames_scanned": framesScanned,
    "frames_ocred": framesOcred,
])
exit(0)
