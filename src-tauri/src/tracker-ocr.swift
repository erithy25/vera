import Cocoa
import Vision
import ScreenCaptureKit

// Check Screen Recording permission (macOS 10.15+)
if #available(macOS 10.15, *) {
    if !CGPreflightScreenCaptureAccess() {
        // Request permission
        _ = CGRequestScreenCaptureAccess()
        print("{\"status\": \"PermissionRequired\"}")
        exit(0)
    }
}

let semaphore = DispatchSemaphore(value: 0)

// Line-level noise filter: drop UI chrome fragments, keep substantive content.
// - very short fragments (< 25 chars) are menu items, buttons, tab titles
// - single words are almost always chrome; long single tokens (URLs, paths) stay
// - lines ending in an ellipsis are truncated UI labels
func isSubstantiveLine(_ text: String) -> Bool {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.isEmpty { return false }
    if trimmed.hasSuffix("...") || trimmed.hasSuffix("…") { return false }
    let words = trimmed.split(whereSeparator: { $0.isWhitespace })
    if words.count == 1 && trimmed.count < 40 { return false }
    if trimmed.count < 25 { return false }
    return true
}

Task {
    do {
        // Get shareable content
        let shareableContent = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = shareableContent.displays.first else {
            print("{\"status\": \"Error\", \"error\": \"No display found\"}")
            semaphore.signal()
            return
        }

        // Focus on the frontmost app's main window so the menu bar, dock and
        // other windows never enter the OCR at all. Fall back to the full
        // display only when no usable window is found.
        var isFullDisplay = false
        var filter: SCContentFilter
        var captureWidth: Int
        var captureHeight: Int

        let veraBundleId = "app.vera.desktop"
        let frontmostApp = NSWorkspace.shared.frontmostApplication
        let frontmostPid = frontmostApp?.processIdentifier

        // Never OCR Vera's own window, even if it is frontmost (defense in depth;
        // the Rust loop also skips this case before spawning the sidecar).
        if frontmostApp?.bundleIdentifier == veraBundleId {
            print("{\"status\": \"Skipped\", \"reason\": \"vera_frontmost\"}")
            semaphore.signal()
            return
        }

        // Vera's own SCRunningApplications, excluded from any full-display capture
        let veraApplications = shareableContent.applications.filter {
            $0.bundleIdentifier == veraBundleId
        }

        let candidateWindows = shareableContent.windows.filter { win in
            guard let pid = frontmostPid, let owner = win.owningApplication else { return false }
            return owner.processID == pid
                && owner.bundleIdentifier != veraBundleId
                && win.windowLayer == 0
                && win.isOnScreen
                && win.frame.width >= 300
                && win.frame.height >= 200
        }
        let focusedWindow = candidateWindows.max(by: {
            $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height
        })

        if let window = focusedWindow {
            filter = SCContentFilter(desktopIndependentWindow: window)
            captureWidth = Int(window.frame.width)
            captureHeight = Int(window.frame.height)
        } else {
            // Full-display fallback: exclude Vera so its window is never OCR'd
            filter = SCContentFilter(display: display, excludingApplications: veraApplications, exceptingWindows: [])
            captureWidth = display.width
            captureHeight = display.height
            isFullDisplay = true
        }

        // Configure stream to capture and downscale
        let config = SCStreamConfiguration()

        let maxDimension = 1600
        var targetWidth = captureWidth
        var targetHeight = captureHeight

        if captureWidth > maxDimension || captureHeight > maxDimension {
            if captureWidth > captureHeight {
                targetWidth = maxDimension
                targetHeight = Int(Double(captureHeight) * (Double(maxDimension) / Double(captureWidth)))
            } else {
                targetHeight = maxDimension
                targetWidth = Int(Double(captureWidth) * (Double(maxDimension) / Double(captureHeight)))
            }
        }

        config.width = targetWidth
        config.height = targetHeight

        // Capture image using modern async await directly inside the Task context
        let imageRef = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)

        // Setup Vision OCR request handler with the captured CGImage
        let fullDisplayCapture = isFullDisplay
        let requestHandler = VNImageRequestHandler(cgImage: imageRef, options: [:])
        let request = VNRecognizeTextRequest { (request, error) in
            if let error = error {
                print("{\"status\": \"Error\", \"error\": \"Vision OCR failed: \(error.localizedDescription)\"}")
                semaphore.signal()
                return
            }

            guard let observations = request.results as? [VNRecognizedTextObservation] else {
                print("{\"status\": \"Success\", \"text\": \"\", \"char_count\": 0}")
                semaphore.signal()
                return
            }

            // Split lines by region using the Vision bounding boxes
            // (normalized coordinates, origin at the bottom-left).
            var mainLines: [String] = []
            var edgeLines: [String] = []

            for observation in observations {
                guard let candidate = observation.topCandidates(1).first else { continue }
                let line = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
                let box = observation.boundingBox

                if fullDisplayCapture {
                    // Ignore the menu-bar strip and the dock region of the screen
                    if box.maxY > 0.97 { continue }
                    if box.minY < 0.06 { continue }
                }

                if !isSubstantiveLine(line) { continue }

                // Narrow edge columns are typically sidebars / tab strips
                if box.midX < 0.2 || box.midX > 0.8 {
                    edgeLines.append(line)
                } else {
                    mainLines.append(line)
                }
            }

            // Prefer the main content rectangle; keep edge text only when the
            // main area has too little to stand on its own.
            let mainText = mainLines.joined(separator: "\n")
            let finalText: String
            if mainText.count >= 200 {
                finalText = mainText
            } else {
                finalText = (mainLines + edgeLines).joined(separator: "\n")
            }
            let trimmedText = finalText.trimmingCharacters(in: .whitespacesAndNewlines)

            let response: [String: Any] = [
                "status": "Success",
                "text": trimmedText,
                "char_count": trimmedText.count
            ]

            if let jsonData = try? JSONSerialization.data(withJSONObject: response, options: []),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                print(jsonString)
            } else {
                print("{\"status\": \"Error\", \"error\": \"Failed to serialize JSON output\"}")
            }
            semaphore.signal()
        }

        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true

        try requestHandler.perform([request])

    } catch {
        let errorDescription = error.localizedDescription
        if errorDescription.contains("denied") || errorDescription.contains("permission") || errorDescription.contains("authorized") {
            print("{\"status\": \"PermissionRequired\"}")
        } else {
            print("{\"status\": \"Error\", \"error\": \"ScreenCaptureKit failed: \(errorDescription)\"}")
        }
        semaphore.signal()
    }
}

// Wait for the async task to signal completion
_ = semaphore.wait(timeout: .now() + 10.0)
