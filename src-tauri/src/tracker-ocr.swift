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

// Shareable content query must be done in a task or async context, or we can use semaphores with async tasks.
let semaphore = DispatchSemaphore(value: 0)

Task {
    do {
        // Get shareable content
        let shareableContent = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = shareableContent.displays.first else {
            print("{\"status\": \"Error\", \"error\": \"No display found\"}")
            semaphore.signal()
            return
        }

        // Define content filter for the display
        let filter = SCContentFilter(display: display, excludingApplications: [], exceptingWindows: [])
        
        // Configure stream to capture and downscale
        let config = SCStreamConfiguration()
        
        let width = display.width
        let height = display.height
        let maxDimension = 1600
        var targetWidth = width
        var targetHeight = height

        if width > maxDimension || height > maxDimension {
            if width > height {
                targetWidth = maxDimension
                targetHeight = Int(Double(height) * (Double(maxDimension) / Double(width)))
            } else {
                targetHeight = maxDimension
                targetWidth = Int(Double(width) * (Double(maxDimension) / Double(height)))
            }
        }

        config.width = targetWidth
        config.height = targetHeight

        // Capture image using modern async await directly inside the Task context
        let imageRef = try await SCScreenshotManager.captureImage(contentFilter: filter, configuration: config)

        // Setup Vision OCR request handler with the captured CGImage
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

            var recognizedText = ""
            for observation in observations {
                guard let candidate = observation.topCandidates(1).first else { continue }
                recognizedText += candidate.string + "\n"
            }

            let trimmedText = recognizedText.trimmingCharacters(in: .whitespacesAndNewlines)

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
