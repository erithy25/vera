// Vera frame-capture sidecar.
//
// A long-lived ScreenCaptureKit (SCStream) process that captures the main
// display at a low frame rate, keeps only frames that visibly changed
// (perceptual-hash gate), encodes the kept frames into HEVC video segments
// (VideoToolbox via AVAssetWriter), writes a small JPEG thumbnail per kept
// frame, runs Apple Vision OCR, and emits one JSON line per kept frame on
// stdout for the Rust supervisor to persist.
//
// It is intentionally defensive: every fallible step is guarded, nothing
// force-unwraps, and any fatal capture error is reported as a status line and
// exits cleanly (exit code 0) so the supervisor can log + retry instead of the
// app crashing. On SIGTERM it finalizes the open segment before exiting so the
// .mov is valid.
//
// Protocol (stdout, one JSON object per line):
//   {"type":"segment_opened","segment_id":"..","path":"..","started_at":<ms>}
//   {"type":"frame","timestamp":<ms>,"app":"..","bundle_id":"..",
//    "window_title":"..","ocr_text":"..","thumbnail_path":"..",
//    "perceptual_hash":"..","segment_id":"..","frame_index":<n>}
//   {"type":"segment_closed","segment_id":"..","frame_count":<n>,
//    "size_bytes":<n>,"ended_at":<ms>}
//   {"type":"status","status":"PermissionRequired"|"Error","error":".."}
//   {"type":"log","message":".."}
//
// Args: --out-dir <dir> --fps <n> --max-width <px> --hash-threshold <bits>
//       --vera-bundle-id <id> --exclude <comma tokens>
//       --segment-seconds <n> --thumb-width <px>

import Cocoa
import Vision
import ScreenCaptureKit
import CoreImage
import CoreMedia
import CoreVideo
import CoreGraphics
import AVFoundation

// MARK: - stdout helpers (line-buffered + locked so lines never interleave)

setvbuf(stdout, nil, _IOLBF, 0)
let emitLock = NSLock()

func emit(_ obj: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: obj, options: []),
       let str = String(data: data, encoding: .utf8) {
        emitLock.lock()
        print(str)
        fflush(stdout)
        emitLock.unlock()
    }
}

func emitLog(_ message: String) { emit(["type": "log", "message": message]) }

func emitStatus(_ status: String, error: String? = nil) {
    var obj: [String: Any] = ["type": "status", "status": status]
    if let error = error { obj["error"] = error }
    emit(obj)
}

func nowMs() -> Int { Int(Date().timeIntervalSince1970 * 1000) }

// MARK: - Argument parsing

struct Args {
    var outDir: String = ""
    var fps: Int32 = 1
    var maxWidth: Int = 1280
    var hashThreshold: Int = 5
    var veraBundleId: String = "app.vera.desktop"
    var excludeTokens: [String] = []
    var segmentSeconds: Double = 600
    var thumbWidth: Int = 320
    var maxFramesPerSegment: Int = 5000
    var probe: Bool = false
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
        case "--segment-seconds": if let v = next(), let n = Double(v), n > 0 { args.segmentSeconds = n }
        case "--thumb-width": if let v = next(), let n = Int(v), n > 0 { args.thumbWidth = n }
        case "--exclude":
            if let v = next() {
                args.excludeTokens = v.split(separator: ",")
                    .map { $0.trimmingCharacters(in: .whitespaces).lowercased() }
                    .filter { !$0.isEmpty }
            }
        case "--probe": args.probe = true
        default: break
        }
        i += 1
    }
    return args
}

let options = parseArgs()

// Probe mode: report screen-recording permission via the exit code (0 = granted,
// 3 = not), then quit. The supervisor runs this as a fresh child because the
// main app process caches its own preflight result until relaunch. It only
// PREFLIGHTS — it never prompts — so it registers no permission entry of its own.
if options.probe {
    if #available(macOS 10.15, *) {
        exit(CGPreflightScreenCaptureAccess() ? 0 : 3)
    }
    exit(0)
}

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
    // Keep almost all readable text so Vera can actually read the whole screen
    // (not just Terminal). Only drop empty / single-character OCR noise.
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed.count >= 2
}

// MARK: - HEVC segment writer (VideoToolbox via AVAssetWriter)

@available(macOS 13.0, *)
final class SegmentWriter {
    let id: String
    let url: URL
    private let fps: Int32
    private let writer: AVAssetWriter
    private let input: AVAssetWriterInput
    private let adaptor: AVAssetWriterInputPixelBufferAdaptor
    private(set) var frameCount: Int = 0
    private(set) var failed: Bool = false

    init?(dir: String, width: Int, height: Int, fps: Int32) {
        self.id = UUID().uuidString
        self.fps = fps
        let segDir = (dir as NSString).appendingPathComponent("segments")
        try? FileManager.default.createDirectory(atPath: segDir, withIntermediateDirectories: true)
        self.url = URL(fileURLWithPath: (segDir as NSString).appendingPathComponent("\(id).mov"))

        guard let writer = try? AVAssetWriter(url: url, fileType: .mov) else { return nil }
        let settings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.hevc,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: [
                AVVideoMaxKeyFrameIntervalKey: 30,
                AVVideoAverageBitRateKey: 400_000,
            ],
        ]
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
                kCVPixelBufferWidthKey as String: width,
                kCVPixelBufferHeightKey as String: height,
            ]
        )
        guard writer.canAdd(input) else { return nil }
        writer.add(input)
        guard writer.startWriting() else { return nil }
        writer.startSession(atSourceTime: .zero)
        self.writer = writer
        self.input = input
        self.adaptor = adaptor
    }

    /// Append a frame. Returns the assigned frame index, or nil if not appended.
    func append(_ pixelBuffer: CVPixelBuffer) -> Int? {
        guard !failed, writer.status == .writing, input.isReadyForMoreMediaData else {
            if writer.status == .failed { failed = true }
            return nil
        }
        let index = frameCount
        let pts = CMTime(value: Int64(index), timescale: fps)
        if adaptor.append(pixelBuffer, withPresentationTime: pts) {
            frameCount += 1
            return index
        }
        failed = true
        return nil
    }

    func finish(_ completion: @escaping (Int64) -> Void) {
        let url = self.url
        if writer.status == .writing { input.markAsFinished() }
        writer.finishWriting {
            let size = (try? FileManager.default.attributesOfItem(atPath: url.path))
                .flatMap { ($0[.size] as? NSNumber)?.int64Value } ?? 0
            completion(size)
        }
    }
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
    private var lastKeptTime: Date = .distantPast
    // Keep at least one frame this often even if the screen looks unchanged, so
    // a static window (reading, watching) is still recorded.
    private let maxIntervalSeconds: TimeInterval = 25
    // Segment state — only ever touched on sampleQueue.
    private var segment: SegmentWriter?
    private var segmentStart: Date = .distantPast

    init(opts: Args) { self.opts = opts }

    func start() async {
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            guard let display = content.displays.first else {
                emitStatus("Error", error: "No display found")
                exit(0)
            }

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
            emitLog("frame-capture started (\(config.width)x\(config.height) @ \(self.opts.fps)fps, HEVC segments)")
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

        // Never record the lock screen, login window, or fast-user-switch
        // screen — it is not activity and otherwise pollutes the visual memory
        // (and dominates the "most recent frames" once you walk away).
        if Capturer.isSessionLockedOrSwitched() { return }

        guard let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let info = attachments.first,
              let statusRaw = info[.status] as? Int,
              let status = SCFrameStatus(rawValue: statusRaw),
              status == .complete else {
            return
        }

        guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        // CGImage is an independent bitmap (safe to use off the sample queue);
        // the pixel buffer itself is pool-backed and only valid synchronously.
        let ciImage = CIImage(cvImageBuffer: pixelBuffer)
        guard let cgImage = ciContext.createCGImage(ciImage, from: ciImage.extent) else { return }

        guard let hash = Capturer.averageHash(cgImage) else { return }
        let unchanged = (lastHash != nil && Capturer.hamming(hash, lastHash!) <= opts.hashThreshold)
        let stale = Date().timeIntervalSince(lastKeptTime) >= maxIntervalSeconds
        // Drop only if it looks unchanged AND we kept one recently; otherwise a
        // static screen would never be recorded.
        if unchanged && !stale {
            return
        }

        let frontmost = NSWorkspace.shared.frontmostApplication
        let appName = frontmost?.localizedName ?? "Unknown"
        let bundleId = frontmost?.bundleIdentifier ?? ""
        let pid = frontmost?.processIdentifier ?? -1
        if isExcludedFrontmost(name: appName, bundle: bundleId) {
            return
        }
        // Skip macOS system UI (Dock, Spotlight, Notification Centre, the login
        // window, …). It is not user activity and otherwise becomes junk frames.
        if Capturer.isSystemProcess(name: appName, bundle: bundleId) {
            return
        }

        // OCR synchronously so on-frame secrets are painted out BEFORE encoding.
        let observations = Capturer.recognizeText(cgImage)
        let redaction = Capturer.redactFrame(
            pixelBuffer: pixelBuffer, cgImage: cgImage, ciImage: ciImage,
            observations: observations, ciContext: ciContext
        )
        // Fail-safe: if a frame had secrets but could not be redacted, store nothing.
        guard let frameBuffer = redaction.buffer, let frameImage = redaction.image else {
            emitLog("skipped a frame: redaction could not be applied")
            return
        }

        // Encode the (redacted) frame into the current segment (synchronous: the
        // pixel buffer is only valid for the duration of this callback).
        rotateIfNeeded(width: cgImage.width, height: cgImage.height)
        guard let seg = segment, let index = seg.append(frameBuffer) else {
            if let s = segment, s.failed { closeSegment() }
            return
        }
        let segId = seg.id

        lastHash = hash
        lastKeptTime = Date()
        let hashHex = String(format: "%016llx", hash)
        let safeText = redaction.text

        processQueue.async { [weak self] in
            self?.emitKeptFrame(frameImage, ocrText: safeText, hashHex: hashHex, app: appName,
                                bundle: bundleId, pid: pid, segmentId: segId, frameIndex: index)
        }
    }

    // MARK: Segment lifecycle (sampleQueue only)

    private func rotateIfNeeded(width: Int, height: Int) {
        if let seg = segment {
            let age = Date().timeIntervalSince(segmentStart)
            if seg.failed || age >= opts.segmentSeconds || seg.frameCount >= opts.maxFramesPerSegment {
                closeSegment()
            }
        }
        if segment == nil {
            openSegment(width: width, height: height)
        }
    }

    private func openSegment(width: Int, height: Int) {
        guard let seg = SegmentWriter(dir: opts.outDir, width: width, height: height, fps: opts.fps) else {
            emitLog("failed to open segment writer")
            return
        }
        segment = seg
        segmentStart = Date()
        emit(["type": "segment_opened", "segment_id": seg.id, "path": seg.url.path, "started_at": nowMs()])
    }

    private func closeSegment() {
        guard let seg = segment else { return }
        segment = nil
        let endedAt = nowMs()
        let count = seg.frameCount
        seg.finish { size in
            emit([
                "type": "segment_closed", "segment_id": seg.id,
                "frame_count": count, "size_bytes": Int(size), "ended_at": endedAt,
            ])
        }
    }

    /// SIGTERM handler: finalize the open segment so its .mov is valid, then exit.
    func finalizeAndExit() {
        sampleQueue.async { [weak self] in
            guard let self = self else { exit(0) }
            guard let seg = self.segment else { exit(0) }
            self.segment = nil
            let endedAt = nowMs()
            let count = seg.frameCount
            seg.finish { size in
                emit([
                    "type": "segment_closed", "segment_id": seg.id,
                    "frame_count": count, "size_bytes": Int(size), "ended_at": endedAt,
                ])
                exit(0)
            }
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

    /// Write the thumbnail (already redacted) and emit the frame line. No OCR
    /// here — recognition + redaction happened synchronously before encoding.
    private func emitKeptFrame(_ cgImage: CGImage, ocrText: String, hashHex: String, app: String,
                               bundle: String, pid: pid_t, segmentId: String, frameIndex: Int) {
        let thumbDir = (opts.outDir as NSString).appendingPathComponent("thumbs")
        try? FileManager.default.createDirectory(atPath: thumbDir, withIntermediateDirectories: true)
        let thumbPath = (thumbDir as NSString).appendingPathComponent("\(UUID().uuidString).jpg")
        guard Capturer.saveJPEGThumbnail(cgImage, to: thumbPath, maxWidth: opts.thumbWidth) else {
            emitLog("failed to write thumbnail")
            return
        }

        let title = pid >= 0 ? Capturer.windowTitle(forPID: pid) : nil

        var obj: [String: Any] = [
            "type": "frame",
            "timestamp": nowMs(),
            "app": app,
            "bundle_id": bundle,
            "ocr_text": ocrText,
            "thumbnail_path": thumbPath,
            "perceptual_hash": hashHex,
            "segment_id": segmentId,
            "frame_index": frameIndex,
        ]
        if let title = title { obj["window_title"] = title }
        emit(obj)
    }

    // MARK: - Static helpers

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

    static func hamming(_ a: UInt64, _ b: UInt64) -> Int { (a ^ b).nonzeroBitCount }

    /// True when the session is locked or this is not the active console
    /// session, so the lock screen / login window is never recorded.
    static func isSessionLockedOrSwitched() -> Bool {
        guard let dict = CGSessionCopyCurrentDictionary() as? [String: AnyObject] else { return false }
        if let locked = dict["CGSSessionScreenIsLocked"] as? NSNumber, locked.boolValue { return true }
        if let onConsole = dict["kCGSSessionOnConsoleKey"] as? NSNumber, !onConsole.boolValue { return true }
        return false
    }

    /// macOS system UI that is not "user activity" and must never be recorded
    /// as a captured app (lock screen, Dock, Spotlight, Notification Centre, …).
    static let systemProcessNames: Set<String> = [
        "loginwindow", "login window", "windowserver", "window server",
        "dock", "systemuiserver", "controlcenter", "control center",
        "notificationcenter", "notification center", "usernotificationcenter",
        "spotlight", "screensaverengine", "screensaver", "screen saver",
        "coreautha", "universalcontrol", "wallpaper", "talagent",
        "screencaptureui", "lockoutagent",
    ]

    static func isSystemProcess(name: String, bundle: String) -> Bool {
        let n = name.lowercased()
        let b = bundle.lowercased()
        if systemProcessNames.contains(n) { return true }
        for frag in ["loginwindow", "windowserver", "screensaver", "systemuiserver",
                     "notificationcenter", "controlcenter", "com.apple.dock",
                     "spotlight", "wallpaper"] where b.contains(frag) {
            return true
        }
        return false
    }

    /// Downscale to maxWidth and JPEG-encode a thumbnail.
    static func saveJPEGThumbnail(_ cgImage: CGImage, to path: String, maxWidth: Int) -> Bool {
        let w = cgImage.width, h = cgImage.height
        var tw = w, th = h
        if w > maxWidth {
            let scale = Double(maxWidth) / Double(w)
            tw = maxWidth
            th = max(1, Int((Double(h) * scale).rounded()))
        }
        let cs = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(
            data: nil, width: tw, height: th, bitsPerComponent: 8, bytesPerRow: 0,
            space: cs, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        ) else { return false }
        ctx.interpolationQuality = .medium
        ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: tw, height: th))
        guard let scaled = ctx.makeImage() else { return false }
        let rep = NSBitmapImageRep(cgImage: scaled)
        guard let data = rep.representation(using: .jpeg, properties: [.compressionFactor: 0.7]) else { return false }
        do {
            try data.write(to: URL(fileURLWithPath: path))
            return true
        } catch {
            return false
        }
    }

    /// Run Vision OCR and return the raw observations (text + bounding boxes).
    static func recognizeText(_ cgImage: CGImage) -> [VNRecognizedTextObservation] {
        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        // Language correction must stay OFF. Vision "corrects" strings it does
        // not recognise as words — sk-proj-T3xK… becomes something word-like,
        // and the key stops matching every redaction pattern on both the Rust
        // and the Swift side. It also corrupts identifiers, file paths and
        // commands, which are exactly what Vera is meant to remember.
        // Enforced by src-tauri/core/tests/swift_parity.rs.
        request.usesLanguageCorrection = false
        do {
            try handler.perform([request])
        } catch {
            return []
        }
        return (request.results as? [VNRecognizedTextObservation]) ?? []
    }

    /// Result of on-frame redaction: the pixel buffer to encode + the image to
    /// thumbnail (both with secrets painted black) + the safe OCR text.
    struct Redaction {
        let buffer: CVPixelBuffer?
        let image: CGImage?
        let text: String
    }

    /// Detect likely secrets among the OCR observations, paint a filled black
    /// rectangle over each on a copy of the frame (Core Image, same bottom-left
    /// space as Vision), and build the safe OCR text. Returns nil buffer/image
    /// only when secrets were found but could not be painted — the caller drops
    /// the frame (fail-safe: never store an un-redacted secret).
    static func redactFrame(pixelBuffer: CVPixelBuffer, cgImage: CGImage, ciImage: CIImage,
                            observations: [VNRecognizedTextObservation], ciContext: CIContext) -> Redaction {
        var lines: [String] = []
        var secretBoxes: [CGRect] = []

        // Keep all readable text across the whole frame (left, center, right) so
        // Vera reads the full screen of every app, not just the main column.
        for observation in observations {
            guard let candidate = observation.topCandidates(1).first else { continue }
            var line = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
            let wasSecret = isLikelySecret(line)
            if wasSecret {
                secretBoxes.append(observation.boundingBox)
                line = redactText(line)
            }
            if !wasSecret && !isSubstantiveLine(line) { continue }
            lines.append(line)
        }
        let safeText = lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)

        if secretBoxes.isEmpty {
            return Redaction(buffer: pixelBuffer, image: cgImage, text: safeText)
        }

        let extent = ciImage.extent
        var composited = ciImage
        for box in secretBoxes {
            let rect = CGRect(
                x: box.minX * extent.width - 6,
                y: box.minY * extent.height - 6,
                width: box.width * extent.width + 12,
                height: box.height * extent.height + 12
            ).intersection(extent)
            if rect.isNull || rect.isEmpty { continue }
            let black = CIImage(color: CIColor.black).cropped(to: rect)
            composited = black.composited(over: composited)
        }

        var outBuffer: CVPixelBuffer?
        let attrs: [String: Any] = [
            kCVPixelBufferCGImageCompatibilityKey as String: true,
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
            kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
        ]
        CVPixelBufferCreate(kCFAllocatorDefault, Int(extent.width), Int(extent.height),
                            kCVPixelFormatType_32BGRA, attrs as CFDictionary, &outBuffer)
        guard let outBuffer = outBuffer else {
            return Redaction(buffer: nil, image: nil, text: safeText)
        }
        ciContext.render(composited, to: outBuffer)
        guard let redactedImage = ciContext.createCGImage(composited, from: extent) else {
            return Redaction(buffer: nil, image: nil, text: safeText)
        }
        return Redaction(buffer: outBuffer, image: redactedImage, text: safeText)
    }

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
               let bw = bounds["Width"], let bh = bounds["Height"] {
                area = bw * bh
            }
            if area > bestArea {
                bestArea = area
                bestTitle = name
            }
        }
        return bestTitle
    }
}

// MARK: - Secret detection + text redaction (extends the app's redaction logic)

func shannonEntropy(_ s: String) -> Double {
    if s.isEmpty { return 0 }
    var counts: [Character: Int] = [:]
    for c in s { counts[c, default: 0] += 1 }
    let n = Double(s.count)
    var e = 0.0
    for (_, c) in counts {
        let p = Double(c) / n
        e -= p * log2(p)
    }
    return e
}

func luhnValid(_ s: String) -> Bool {
    let ds = s.compactMap { $0.wholeNumberValue }
    if ds.count < 13 || ds.count > 19 { return false }
    var sum = 0
    var alt = false
    for d in ds.reversed() {
        var x = d
        if alt { x *= 2; if x > 9 { x -= 9 } }
        sum += x
        alt.toggle()
    }
    return sum % 10 == 0
}

// BEGIN CANONICAL SECRET PATTERNS
// Mirrored from src-tauri/core/src/redact.rs — the single source of truth.
// tests/swift_parity.rs fails the build if these two lists drift apart.
// Do not edit by hand: change redact.rs, then update this block.
let secretPatterns: [String] = [
    "sk-(proj-)?[A-Za-z0-9_\\-]{20,}",  // openai
    "sk-ant-(api03-)?[A-Za-z0-9_\\-]{20,}",  // anthropic
    "rk_(live|test)_[A-Za-z0-9]{16,}",  // stripe_restricted
    "sk_(live|test)_[A-Za-z0-9]{16,}",  // stripe_secret
    "gh[pousr]_[A-Za-z0-9]{36,}",  // github
    "github_pat_[A-Za-z0-9_]{40,}",  // github_fine_grained
    "(AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}",  // aws_access_key
    "AIza[0-9A-Za-z\\-_]{20,}",  // google_api
    "xox[baprs]-[A-Za-z0-9\\-]{10,}",  // slack
    "SG\\.[A-Za-z0-9_\\-]{20,}",  // sendgrid
    "glpat-[A-Za-z0-9_\\-]{16,}",  // gitlab
    "npm_[A-Za-z0-9]{30,}",  // npm
    "eyJ[A-Za-z0-9_\\-]{8,}\\.[A-Za-z0-9_\\-]{8,}\\.[A-Za-z0-9_\\-]*",  // jwt
    "\\b[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}\\b",  // iban
    "-----BEGIN [A-Z ]*PRIVATE KEY-----",  // pem_header
]
// END CANONICAL SECRET PATTERNS{2}[0-9]{2}[A-Z0-9]{11,30}\\b",
]

func matchesRegex(_ s: String, _ pattern: String) -> Bool {
    s.range(of: pattern, options: .regularExpression) != nil
}

func isLikelySecret(_ raw: String) -> Bool {
    let s = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.count < 6 { return false }
    let lower = s.lowercased()

    for label in ["password", "passwd", "secret", "api_key", "apikey", "api key", "token", "bearer", "client_secret"] {
        if lower.contains(label), matchesRegex(s, "[:=]\\s*\\S{4,}") {
            return true
        }
    }
    for pattern in secretPatterns where matchesRegex(s, pattern) {
        return true
    }
    let stripped = s.filter { !$0.isWhitespace && $0 != "-" }
    if stripped.count >= 13, stripped.count <= 19, stripped.allSatisfy({ $0.isNumber }), luhnValid(stripped) {
        return true
    }
    if matchesRegex(s, "\\b[0-9]{10,}\\b") {
        return true
    }
    for token in s.split(whereSeparator: { $0.isWhitespace }) {
        let t = String(token)
        if t.count >= 24, t.allSatisfy({ $0.isLetter || $0.isNumber || "+/=_-.".contains($0) }), shannonEntropy(t) >= 3.6 {
            return true
        }
    }
    return false
}

func redactText(_ s: String) -> String {
    var out = s
    for pattern in secretPatterns {
        out = out.replacingOccurrences(of: pattern, with: "[redacted]", options: .regularExpression)
    }
    out = out.replacingOccurrences(
        of: "(?i)(password|passwd|secret|api[_ ]?key|token|bearer|client_secret)(\\s*[:=]\\s*)\\S+",
        with: "$1$2[redacted]", options: .regularExpression
    )
    out = out.replacingOccurrences(of: "\\b[0-9]{10,}\\b", with: "[redacted]", options: .regularExpression)
    if isLikelySecret(out) { return "[redacted]" }
    return out
}

// MARK: - Entry point

if #available(macOS 13.0, *) {
    let capturer = Capturer(opts: options)

    // Graceful shutdown: finalize the open HEVC segment on SIGTERM.
    signal(SIGTERM, SIG_IGN)
    let sigSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
    sigSource.setEventHandler { capturer.finalizeAndExit() }
    sigSource.resume()

    Task { await capturer.start() }
    dispatchMain()
} else {
    emitStatus("Error", error: "ScreenCaptureKit streaming requires macOS 13 or later")
    exit(0)
}
