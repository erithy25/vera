// Vera frame-capture sidecar.
//
// A long-lived ScreenCaptureKit (SCStream) process that captures the main
// display at a low frame rate, keeps only frames that visibly changed
// (perceptual-hash gate), runs Apple Vision OCR on the kept frames, writes the
// downscaled image to disk, and emits one JSON line per kept frame on stdout
// for the Rust supervisor to persist.
//
// It is intentionally defensive: every fallible step is guarded, nothing
// force-unwraps, and any fatal capture error is reported as a status line and
// exits cleanly (exit code 0) so the supervisor can log + retry instead of the
// app crashing.
//
// Protocol (stdout, one JSON object per line):
//   {"type":"frame","timestamp":<ms>,"app":"..","bundle_id":"..",
//    "window_title":"..","ocr_text":"..","image_path":"..","perceptual_hash":".."}
//   {"type":"status","status":"PermissionRequired"|"Error","error":".."}
//   {"type":"log","message":".."}
//
// Args: --out-dir <dir> --fps <n> --max-width <px> --hash-threshold <bits>
//       --vera-bundle-id <id> --exclude <comma,separated,name-or-bundle tokens>

import Cocoa
import Vision
import ScreenCaptureKit
import CoreImage
import CoreMedia
import CoreVideo
import CoreGraphics

// MARK: - stdout helpers (line-buffered so the supervisor sees frames promptly)

setvbuf(stdout, nil, _IOLBF, 0)

func emit(_ obj: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: obj, options: []),
       let str = String(data: data, encoding: .utf8) {
        print(str)
        fflush(stdout)
    }
}

func emitLog(_ message: String) {
    emit(["type": "log", "message": message])
}

func emitStatus(_ status: String, error: String? = nil) {
    var obj: [String: Any] = ["type": "status", "status": status]
    if let error = error { obj["error"] = error }
    emit(obj)
}

// MARK: - Argument parsing

struct Args {
    var outDir: String = ""
    var fps: Int32 = 1
    var maxWidth: Int = 1280
    var hashThreshold: Int = 5
    var veraBundleId: String = "app.vera.desktop"
    var excludeTokens: [String] = []
}

func parseArgs() -> Args {
    var args = Args()
    let raw = CommandLine.arguments
    var i = 1
    func next() -> String? {
        if i + 1 < raw.count { i += 1; return raw[i] }
        return nil
    }
    while i < raw.count {
        switch raw[i] {
        case "--out-dir": if let v = next() { args.outDir = v }
        case "--fps": if let v = next(), let n = Int32(v), n > 0 { args.fps = n }
        case "--max-width": if let v = next(), let n = Int(v), n > 0 { args.maxWidth = n }
        case "--hash-threshold": if let v = next(), let n = Int(v), n >= 0 { args.hashThreshold = n }
        case "--vera-bundle-id": if let v = next() { args.veraBundleId = v }
        case "--exclude":
            if let v = next() {
                args.excludeTokens = v
                    .split(separator: ",")
                    .map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
                    .filter { !$0.isEmpty }
            }
        default: break
        }
        i += 1
    }
    return args
}

let options = parseArgs()

if options.outDir.isEmpty {
    emitStatus("Error", error: "Missing --out-dir")
    exit(0)
}

// MARK: - Screen Recording permission gate (degrade, never crash)

if !CGPreflightScreenCaptureAccess() {
    _ = CGRequestScreenCaptureAccess()
    emitStatus("PermissionRequired")
    exit(0)
}

// MARK: - Substantive-line filter (mirrors the one-shot OCR helper)

func isSubstantiveLine(_ text: String) -> Bool {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return false }
    if trimmed.hasSuffix("...") || trimmed.hasSuffix("\u{2026}") { return false }
    let words = trimmed.split(whereSeparator: { $0.isWhitespace })
    if words.count == 1 && trimmed.count < 40 { return false }
    if trimmed.count < 25 { return false }
    return true
}

// MARK: - Capturer

@available(macOS 13.0, *)
final class Capturer: NSObject, SCStreamOutput, SCStreamDelegate {
    private let opts: Args
    private let ciContext = CIContext(options: nil)
    private let sampleQueue = DispatchQueue(label: "app.vera.frame-capture.sample")
    private let processQueue = DispatchQueue(label: "app.vera.frame-capture.process")
    private var stream: SCStream?
    private var lastHash: UInt64?

    init(opts: Args) {
        self.opts = opts
    }

    func start() async {
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            guard let display = content.displays.first else {
                emitStatus("Error", error: "No display found")
                exit(0)
            }

            // Exclude Vera's own windows always, plus any app whose name or
            // bundle id matches an exclude token, from the captured pixels.
            let excluded = content.applications.filter { app in
                let name = app.applicationName.lowercased()
                let bundle = app.bundleIdentifier.lowercased()
                if bundle == self.opts.veraBundleId.lowercased() { return true }
                for token in self.opts.excludeTokens where name.contains(token) || bundle.contains(token) {
                    return true
                }
                return false
            }

            let filter = SCContentFilter(display: display, excludingApplications: excluded, exceptingWindows: [])

            // Downscale to <= maxWidth at capture time (keeps frames small).
            var targetW = display.width
            var targetH = display.height
            if targetW > self.opts.maxWidth {
                let scale = Double(self.opts.maxWidth) / Double(targetW)
                targetW = self.opts.maxWidth
                targetH = Int((Double(display.height) * scale).rounded())
            }

            let config = SCStreamConfiguration()
            config.width = max(targetW, 1)
            config.height = max(targetH, 1)
            config.minimumFrameInterval = CMTime(value: 1, timescale: self.opts.fps)
            config.queueDepth = 5
            config.showsCursor = false
            config.pixelFormat = kCVPixelFormatType_32BGRA

            let stream = SCStream(filter: filter, configuration: config, delegate: self)
            try stream.addStreamOutput(self, type: .screen, sampleHandlerQueue: sampleQueue)
            try await stream.startCapture()
            self.stream = stream
            emitLog("frame-capture started (\(config.width)x\(config.height) @ \(self.opts.fps)fps)")
        } catch {
            let desc = error.localizedDescription
            if desc.contains("denied") || desc.contains("permission") || desc.contains("authorized") {
                emitStatus("PermissionRequired")
            } else {
                emitStatus("Error", error: "ScreenCaptureKit failed: \(desc)")
            }
            exit(0)
        }
    }

    // MARK: SCStreamDelegate

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        emitStatus("Error", error: "Stream stopped: \(error.localizedDescription)")
        exit(0)
    }

    // MARK: SCStreamOutput

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen else { return }
        guard CMSampleBufferIsValid(sampleBuffer) else { return }

        // Only act on complete frames (ScreenCaptureKit marks idle/blank frames).
        guard let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let info = attachments.first,
              let statusRaw = info[.status] as? Int,
              let status = SCFrameStatus(rawValue: statusRaw),
              status == .complete else {
            return
        }

        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        let ciImage = CIImage(cvImageBuffer: pixelBuffer)
        guard let cgImage = ciContext.createCGImage(ciImage, from: ciImage.extent) else { return }

        // Cheap change detection: drop frames near-identical to the last kept one.
        guard let hash = Capturer.averageHash(cgImage) else { return }
        if let last = lastHash, Capturer.hamming(hash, last) <= opts.hashThreshold {
            return
        }

        // Frontmost-app exclude gate: store nothing while an excluded app (or
        // Vera itself) is frontmost.
        let frontmost = NSWorkspace.shared.frontmostApplication
        let appName = frontmost?.localizedName ?? "Unknown"
        let bundleId = frontmost?.bundleIdentifier ?? ""
        let pid = frontmost?.processIdentifier ?? -1
        if isExcludedFrontmost(name: appName, bundle: bundleId) {
            return
        }

        lastHash = hash
        let hashHex = String(format: "%016llx", hash)

        // Heavy work (disk write + OCR + window title) off the sample queue so
        // the stream is never blocked.
        processQueue.async { [weak self] in
            self?.processKeptFrame(cgImage, hashHex: hashHex, app: appName, bundle: bundleId, pid: pid)
        }
    }

    private func isExcludedFrontmost(name: String, bundle: String) -> Bool {
        let a = name.lowercased()
        let b = bundle.lowercased()
        if b == opts.veraBundleId.lowercased() || a == "vera" { return true }
        for token in opts.excludeTokens where a.contains(token) || b.contains(token) {
            return true
        }
        return false
    }

    private func processKeptFrame(_ cgImage: CGImage, hashHex: String, app: String, bundle: String, pid: pid_t) {
        let uuid = UUID().uuidString
        let path = (opts.outDir as NSString).appendingPathComponent("\(uuid).png")
        guard Capturer.savePNG(cgImage, to: path) else {
            emitLog("failed to write frame image")
            return
        }

        let ocr = Capturer.runOCR(cgImage)
        let title = pid >= 0 ? Capturer.windowTitle(forPID: pid) : nil

        var obj: [String: Any] = [
            "type": "frame",
            "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            "app": app,
            "bundle_id": bundle,
            "ocr_text": ocr,
            "image_path": path,
            "perceptual_hash": hashHex,
        ]
        if let title = title { obj["window_title"] = title }
        emit(obj)
    }

    // MARK: - Static helpers

    /// 8x8 grayscale average hash (aHash).
    static func averageHash(_ cgImage: CGImage) -> UInt64? {
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

    static func hamming(_ a: UInt64, _ b: UInt64) -> Int {
        (a ^ b).nonzeroBitCount
    }

    static func savePNG(_ cgImage: CGImage, to path: String) -> Bool {
        let rep = NSBitmapImageRep(cgImage: cgImage)
        guard let data = rep.representation(using: .png, properties: [:]) else { return false }
        do {
            try data.write(to: URL(fileURLWithPath: path))
            return true
        } catch {
            return false
        }
    }

    /// Synchronous Vision OCR with per-string bounding boxes. Boxes are used to
    /// separate main-content text from sidebar/menu chrome.
    static func runOCR(_ cgImage: CGImage) -> String {
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        do {
            try handler.perform([request])
        } catch {
            return ""
        }
        guard let observations = request.results as? [VNRecognizedTextObservation] else { return "" }

        var mainLines: [String] = []
        var edgeLines: [String] = []
        for observation in observations {
            guard let candidate = observation.topCandidates(1).first else { continue }
            let line = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
            if !isSubstantiveLine(line) { continue }
            let box = observation.boundingBox
            if box.midX < 0.2 || box.midX > 0.8 {
                edgeLines.append(line)
            } else {
                mainLines.append(line)
            }
        }
        let mainText = mainLines.joined(separator: "\n")
        let finalText = mainText.count >= 200 ? mainText : (mainLines + edgeLines).joined(separator: "\n")
        return finalText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// Frontmost window title via window metadata (not screenshotting). Requires
    /// Screen Recording permission for names, which this process already holds.
    static func windowTitle(forPID pid: pid_t) -> String? {
        let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        guard let infoList = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else { return nil }
        var bestArea: CGFloat = -1
        var bestTitle: String?
        for info in infoList {
            guard let owner = info[kCGWindowOwnerPID as String] as? pid_t, owner == pid else { continue }
            let layer = info[kCGWindowLayer as String] as? Int ?? 0
            if layer != 0 { continue }
            guard let name = info[kCGWindowName as String] as? String, !name.isEmpty else { continue }
            var area: CGFloat = 0
            if let bounds = info[kCGWindowBounds as String] as? [String: CGFloat],
               let w = bounds["Width"], let h = bounds["Height"] {
                area = w * h
            }
            if area > bestArea {
                bestArea = area
                bestTitle = name
            }
        }
        return bestTitle
    }
}

// MARK: - Entry point

if #available(macOS 13.0, *) {
    let capturer = Capturer(opts: options)
    Task {
        await capturer.start()
    }
    dispatchMain()
} else {
    emitStatus("Error", error: "ScreenCaptureKit streaming requires macOS 13 or later")
    exit(0)
}
