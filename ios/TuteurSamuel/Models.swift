import Foundation

struct CorrectionIssue: Codable, Identifiable, Hashable {
    let id: Int
    let title: String
    let hint: String
    let x: Double
    let y: Double
}

struct CorrectionResponse: Codable, Hashable {
    let summary: String?
    let issues: [CorrectionIssue]?
    let nextAction: String?
    let message: String?
    let mode: String?

    var displaySummary: String {
        summary ?? message ?? "Vérification terminée."
    }
}

struct ArchivedHomework: Codable, Identifiable, Hashable {
    let id: UUID
    let savedAt: Date
    let state: String
    let summary: String
    let nextAction: String
    let issues: [CorrectionIssue]
    let imageFilename: String
}
