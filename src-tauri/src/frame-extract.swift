// Vera frame-extract helper.
//
// Given an HEVC segment and a frame index, decode that frame and write it as a
// JPEG. Used for time-seek retrieval: the Rust side maps a timestamp to the
// nearest (segment_id, frame_index) via the database, then calls this to
// produce a viewable image.
//
// Usage: frame-extract <segment.mov> <frame_index> <out.jpg> [fps=1]
// Prints one JSON line: {"status":"ok","out":".."} or {"status":"error","error":".."}.
// Always exits 0 (the caller inspects the JSON), never crashes.

import AVFoundation
import Cocoa
import CoreMedia

func emit(_ obj: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: obj, options: []),
       let str = String(data: data, encoding: .utf8) {
        print(str)
        fflush(stdout)
    }
}

let args = CommandLine.arguments
guard args.count >= 4 else {
    emit(["status": "error", "error": "Usage: frame-extract <segment.mov> <frame_index> <out.jpg> [fps]"])
    exit(0)
}

let segmentPath = args[1]
let frameIndex = Int64(args[2]) ?? 0
let outPath = args[3]
let fps: Int32 = args.count > 4 ? (Int32(args[4]) ?? 1) : 1

if !FileManager.default.fileExists(atPath: segmentPath) {
    emit(["status": "error", "error": "segment not found: \(segmentPath)"])
    exit(0)
}

let asset = AVURLAsset(url: URL(fileURLWithPath: segmentPath))
let generator = AVAssetImageGenerator(asset: asset)
generator.appliesPreferredTrackTransform = true
// Exact frame, no snapping to the nearest keyframe.
generator.requestedTimeToleranceBefore = .zero
generator.requestedTimeToleranceAfter = .zero

let time = CMTime(value: max(0, frameIndex), timescale: fps)

do {
    let cgImage = try generator.copyCGImage(at: time, actualTime: nil)
    let rep = NSBitmapImageRep(cgImage: cgImage)
    guard let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.9]) else {
        emit(["status": "error", "error": "failed to encode JPEG"])
        exit(0)
    }
    try data.write(to: URL(fileURLWithPath: outPath))
    emit(["status": "ok", "out": outPath])
} catch {
    emit(["status": "error", "error": "extract failed: \(error.localizedDescription)"])
}
exit(0)
