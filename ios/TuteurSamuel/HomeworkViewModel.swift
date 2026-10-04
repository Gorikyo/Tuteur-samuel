import Foundation
import PencilKit
import UIKit

@MainActor
final class HomeworkViewModel: ObservableObject {
    @Published var image: UIImage?
    @Published var drawing = PKDrawing()
    @Published var canvasSize: CGSize = .zero
    @Published var correction: CorrectionResponse?
    @Published var isErasing = false
    @Published var isChecking = false
    @Published var message: String?

    func replaceImage(with newImage: UIImage, archive: ArchiveStore) throws {
        if image != nil {
            try archiveCurrent(in: archive)
        }
        image = newImage.preparedForHomework(maxDimension: 2400)
        drawing = PKDrawing()
        correction = nil
        isErasing = false
        message = nil
    }

    func undo() {
        guard !drawing.strokes.isEmpty else { return }
        drawing = PKDrawing(strokes: Array(drawing.strokes.dropLast()))
    }

    func archiveCurrent(in archive: ArchiveStore) throws {
        guard let snapshot = compositeImage() else { return }
        try archive.save(image: snapshot, correction: correction, strokeCount: drawing.strokes.count)
    }

    func verify(serverAddress: String) async {
        guard let snapshot = compositeImage() else {
            message = "Ajoute d’abord une photo du devoir."
            return
        }
        isChecking = true
        message = nil
        do {
            let client = try APIClient(serverAddress: serverAddress)
            correction = try await client.verify(image: snapshot, annotationCount: drawing.strokes.count)
        } catch {
            message = error.localizedDescription
        }
        isChecking = false
    }

    func compositeImage() -> UIImage? {
        guard let image else { return nil }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: image.size, format: format)
        return renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: image.size))
            guard canvasSize.width > 0, canvasSize.height > 0 else { return }
            let scale = image.size.width / canvasSize.width
            let overlay = drawing.image(
                from: CGRect(origin: .zero, size: canvasSize),
                scale: scale
            )
            overlay.draw(in: CGRect(origin: .zero, size: image.size))
        }
    }
}

private extension UIImage {
    func preparedForHomework(maxDimension: CGFloat) -> UIImage {
        let longestSide = max(size.width, size.height)
        let factor = min(1, maxDimension / longestSide)
        let targetSize = CGSize(width: size.width * factor, height: size.height * factor)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        return UIGraphicsImageRenderer(size: targetSize, format: format).image { _ in
            draw(in: CGRect(origin: .zero, size: targetSize))
        }
    }
}
