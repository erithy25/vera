// Vera video-scan sidecar.
//
// Walks a finished screen recording, samples it at a fixed rate, and OCRs the
// sampled frames. One process handles the whole file: spawning a helper per
// frame would cost more in process setup than the decode itself.
//
// Usage:
//   video-scan <video> [--fps N] [--hash-threshold N] [--max-skip-run N] [--max-width PX]
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
    // Hamming distance over the 256-bit difference hash below which two frames
    // count as the same picture. Chosen from measurement, not taste: on the test
    // recording a blinking cursor moves 0 bits and the smallest real change of
    // screen moves 17, so anything in 0...16 separates them. 8 sits in the
    // middle of that gap, leaving room for mouse movement and compression noise
    // without coming near a genuine change.
    var hashThreshold: Int = 8
    // The safety net, and the more important of the two numbers.
    //
    // A threshold is a judgement about a hash, and a hash can be wrong. This is
    // not: however identical the frames look, OCR runs again after this many
    // consecutive skips. At the default 1 fps that means anything on screen for
    // more than four seconds is read at least once no matter what the hash
    // believes — a bound the product can actually promise, instead of a hope.
    var maxSkipRun: Int = 4
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
        fail("usage: video-scan <video> [--fps N] [--hash-threshold N] [--max-skip-run N] [--max-width PX]")
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
        case "--max-skip-run":
            if let v = value, let n = Int(v), n >= 0 { opts.maxSkipRun = n }
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
// In a screen recording most consecutive frames really are the same picture, and
// skipping their OCR is where nearly all of the scan time is saved. What matters
// is that "the same picture" is decided by something that can actually tell two
// screens of text apart.
//
// This used to be an 8x8 average hash: the whole frame squeezed into 64 grey
// cells, one bit each for "brighter than this frame's own average". On a
// terminal — a light field with a little dark text on it — every screen looks
// the same after that. Measured on the project's own 56-second test recording,
// four completely different screens sat within 2 bits of each other, and the
// stretch holding two of the four planted keys sat at exactly the threshold. The
// scanner read 3 frames out of 56 and reported one of the four secrets. It did
// not fail loudly; it came back green.
//
// A 16x16 difference hash fixes the diagnosis rather than the symptom. Each bit
// compares a pixel with its right-hand neighbour, so it encodes local structure
// instead of overall brightness — which is what distinguishes one page of text
// from another. On the same recording: 0 bits of difference while only the
// cursor blinks, never fewer than 17 across a real change of screen. It reads
// exactly the eight moments the screen changes, and finds all four keys.

let hashSide = 16
let hashWords = (hashSide * hashSide) / 64 // 256 bits

func differenceHash(_ cgImage: CGImage) -> [UInt64]? {
    // One extra column: each bit is a comparison with the pixel to its right.
    let width = hashSide + 1
    let height = hashSide
    let colorSpace = CGColorSpaceCreateDeviceGray()
    guard let ctx = CGContext(
        data: nil, width: width, height: height, bitsPerComponent: 8,
        bytesPerRow: 0, space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.none.rawValue
    ) else { return nil }
    ctx.interpolationQuality = .low
    ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
    guard let data = ctx.data else { return nil }
    // `bytesPerRow: 0` lets CoreGraphics pick its own alignment, so rows must be
    // addressed through the stride it chose rather than through `width`.
    let rowBytes = ctx.bytesPerRow
    let ptr = data.bindMemory(to: UInt8.self, capacity: rowBytes * height)

    var bits = [UInt64](repeating: 0, count: hashWords)
    var idx = 0
    for y in 0..<height {
        let row = y * rowBytes
        for x in 0..<hashSide {
            if ptr[row + x] > ptr[row + x + 1] {
                bits[idx >> 6] |= (UInt64(1) << UInt64(idx & 63))
            }
            idx += 1
        }
    }
    return bits
}

func hamming(_ a: [UInt64], _ b: [UInt64]) -> Int {
    var total = 0
    for i in 0..<min(a.count, b.count) { total += (a[i] ^ b[i]).nonzeroBitCount }
    return total
}

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

var lastHash: [UInt64]?
var skipRun = 0
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
    let hash = differenceHash(image)
    if let hash = hash, let previous = lastHash,
       hamming(hash, previous) <= opts.hashThreshold,
       skipRun < opts.maxSkipRun {
        skipRun += 1
        emit([
            "type": "frame",
            "frame_index": index,
            "timestamp_ms": timestampMs,
            "skipped": true,
        ])
        continue
    }
    skipRun = 0
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
