import PencilKit
import SwiftUI

struct PencilCanvasView: UIViewRepresentable {
    @Binding var drawing: PKDrawing
    let isErasing: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(parent: self)
    }

    func makeUIView(context: Context) -> PKCanvasView {
        let canvas = PKCanvasView()
        canvas.delegate = context.coordinator
        canvas.backgroundColor = .clear
        canvas.isOpaque = false
        canvas.drawingPolicy = .pencilOnly
        canvas.isScrollEnabled = false
        canvas.minimumZoomScale = 1
        canvas.maximumZoomScale = 1
        canvas.bounces = false
        canvas.tool = penTool
        return canvas
    }

    func updateUIView(_ canvas: PKCanvasView, context: Context) {
        if canvas.drawing.strokes.count != drawing.strokes.count {
            canvas.drawing = drawing
        }
        canvas.tool = isErasing
            ? PKEraserTool(.vector)
            : penTool
        canvas.contentSize = canvas.bounds.size
    }

    private var penTool: PKInkingTool {
        PKInkingTool(.pen, color: UIColor(red: 23 / 255, green: 79 / 255, blue: 122 / 255, alpha: 1), width: 4.5)
    }

    final class Coordinator: NSObject, PKCanvasViewDelegate {
        var parent: PencilCanvasView

        init(parent: PencilCanvasView) {
            self.parent = parent
        }

        func canvasViewDidEndUsingTool(_ canvasView: PKCanvasView) {
            parent.drawing = canvasView.drawing
        }
    }
}
