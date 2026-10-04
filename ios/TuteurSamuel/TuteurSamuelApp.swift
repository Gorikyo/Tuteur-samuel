import SwiftUI

@main
struct TuteurSamuelApp: App {
    @StateObject private var homework = HomeworkViewModel()
    @StateObject private var archive = ArchiveStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(homework)
                .environmentObject(archive)
        }
    }
}
