import Foundation
import UIKit

@MainActor
final class ArchiveStore: ObservableObject {
    @Published private(set) var homeworks: [ArchivedHomework] = []

    private let fileManager = FileManager.default
    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }()
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    init() {
        load()
    }

    private var directory: URL {
        let root = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return root.appendingPathComponent("TuteurSamuel/Archives", isDirectory: true)
    }

    private var indexURL: URL {
        directory.appendingPathComponent("index.json")
    }

    func image(for homework: ArchivedHomework) -> UIImage? {
        UIImage(contentsOfFile: directory.appendingPathComponent(homework.imageFilename).path)
    }

    func save(image: UIImage, correction: CorrectionResponse?, strokeCount: Int) throws {
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        let id = UUID()
        let filename = "\(id.uuidString).jpg"
        guard let data = image.jpegData(compressionQuality: 0.86) else {
            throw CocoaError(.fileWriteUnknown)
        }
        try data.write(to: directory.appendingPathComponent(filename), options: .atomic)

        let issues = correction?.issues ?? []
        let state: String
        if correction != nil && issues.isEmpty {
            state = "Terminé"
        } else if correction != nil {
            state = "Corrigé — à revoir"
        } else if strokeCount > 0 {
            state = "En cours"
        } else {
            state = "Non commencé"
        }

        let record = ArchivedHomework(
            id: id,
            savedAt: Date(),
            state: state,
            summary: correction?.displaySummary ?? (strokeCount > 0 ? "Devoir annoté avec le Pencil." : "Photo chargée, sans annotation."),
            nextAction: correction?.nextAction ?? "",
            issues: issues,
            imageFilename: filename
        )
        homeworks.insert(record, at: 0)
        try persist()
    }

    func delete(_ homework: ArchivedHomework) throws {
        try? fileManager.removeItem(at: directory.appendingPathComponent(homework.imageFilename))
        homeworks.removeAll { $0.id == homework.id }
        try persist()
    }

    private func load() {
        do {
            let data = try Data(contentsOf: indexURL)
            homeworks = try decoder.decode([ArchivedHomework].self, from: data)
                .sorted { $0.savedAt > $1.savedAt }
        } catch {
            homeworks = []
        }
    }

    private func persist() throws {
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        try encoder.encode(homeworks).write(to: indexURL, options: .atomic)
    }
}
