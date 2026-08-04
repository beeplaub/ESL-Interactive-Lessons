import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
if args.count < 2 {
    print("Usage: swift ocr.swift <image_path>")
    exit(1)
}

let imagePath = args[1]
guard let image = NSImage(contentsOfFile: imagePath),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    print("Error loading image")
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try? handler.perform([request])

if let results = request.results {
    for observation in results {
        if let topCandidate = observation.topCandidates(1).first {
            print(topCandidate.string)
        }
    }
}
