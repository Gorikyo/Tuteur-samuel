import PhotosUI
import PencilKit
import SwiftUI
import UIKit

struct ContentView: View {
    @EnvironmentObject private var homework: HomeworkViewModel
    @EnvironmentObject private var archive: ArchiveStore
    @AppStorage("serverAddress") private var serverAddress = "https://Gery-McBookAirM2.local:4174"

    @State private var selectedPhoto: PhotosPickerItem?
    @State private var showingCamera = false
    @State private var showingArchives = false
    @State private var showingCorrection = false
    @State private var showingSettings = false
    @State private var showingVoice = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                toolBar
                Divider()
                Group {
                    if homework.image != nil {
                        HomeworkCanvas(homework: homework)
                    } else {
                        emptyState
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                if homework.image != nil {
                    verificationBar
                }
            }
            .background(Color(red: 0.91, green: 0.95, blue: 0.97))
            .navigationTitle("Tuteur Samuel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Réglages", systemImage: "gearshape") {
                        showingSettings = true
                    }
                }
            }
        }
        .sheet(isPresented: $showingCamera) {
            ImagePicker(sourceType: .camera) { image in
                importImage(image)
            }
            .ignoresSafeArea()
        }
        .sheet(isPresented: $showingArchives) {
            ArchiveView()
                .environmentObject(archive)
        }
        .sheet(isPresented: $showingCorrection) {
            if let correction = homework.correction {
                CorrectionView(correction: correction)
            }
        }
        .sheet(isPresented: $showingSettings) {
            SettingsView(serverAddress: $serverAddress)
        }
        .sheet(isPresented: $showingVoice) {
            VoiceSheet(serverAddress: serverAddress)
        }
        .onChange(of: selectedPhoto) { _, item in
            guard let item else { return }
            Task {
                defer { selectedPhoto = nil }
                guard let data = try? await item.loadTransferable(type: Data.self),
                      let image = UIImage(data: data) else {
                    homework.message = "Cette photo n’a pas pu être ouverte."
                    return
                }
                importImage(image)
            }
        }
        .onChange(of: homework.correction) { _, correction in
            if correction != nil { showingCorrection = true }
        }
        .alert("Tuteur Samuel", isPresented: messagePresented) {
            Button("D’accord", role: .cancel) { homework.message = nil }
        } message: {
            Text(homework.message ?? "")
        }
    }

    private var messagePresented: Binding<Bool> {
        Binding(
            get: { homework.message != nil },
            set: { if !$0 { homework.message = nil } }
        )
    }

    private var toolBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Label(homework.image == nil ? "Photothèque" : "Nouveau devoir", systemImage: "photo")
                }
                .buttonStyle(.borderedProminent)

                Button("Appareil photo", systemImage: "camera") {
                    showingCamera = true
                }
                .buttonStyle(.bordered)
                .disabled(!UIImagePickerController.isSourceTypeAvailable(.camera))

                Button("Annuler", systemImage: "arrow.uturn.backward") {
                    homework.undo()
                }
                .disabled(homework.drawing.strokes.isEmpty)

                Button(homework.isErasing ? "Crayon" : "Gomme", systemImage: homework.isErasing ? "pencil" : "eraser") {
                    homework.isErasing.toggle()
                }
                .disabled(homework.image == nil)

                Button("Archives", systemImage: "archivebox") {
                    showingArchives = true
                }

                Button("Parler", systemImage: "waveform") {
                    showingVoice = true
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .background(.regularMaterial)
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("Ajoute ton devoir", systemImage: "doc.viewfinder")
        } description: {
            Text("Prends une photo ou choisis une image, puis écris avec l’Apple Pencil.")
        } actions: {
            HStack {
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Label("Choisir une photo", systemImage: "photo")
                }
                .buttonStyle(.borderedProminent)

                if UIImagePickerController.isSourceTypeAvailable(.camera) {
                    Button("Prendre une photo", systemImage: "camera") {
                        showingCamera = true
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
    }

    private var verificationBar: some View {
        HStack(spacing: 12) {
            if let correction = homework.correction {
                Button("Voir le rapport", systemImage: "checkmark.bubble") {
                    showingCorrection = true
                }
                .buttonStyle(.bordered)
                .accessibilityHint(correction.displaySummary)
            }

            Button {
                Task { await homework.verify(serverAddress: serverAddress) }
            } label: {
                if homework.isChecking {
                    ProgressView().tint(.white)
                } else {
                    Label("Vérifie-moi", systemImage: "sparkles")
                }
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 0.91, green: 0.35, blue: 0.25))
            .disabled(homework.isChecking)
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(.regularMaterial)
    }

    private func importImage(_ image: UIImage) {
        do {
            try homework.replaceImage(with: image, archive: archive)
        } catch {
            homework.message = "L’ancien devoir n’a pas pu être archivé. Il a été conservé."
        }
    }
}

private struct HomeworkCanvas: View {
    @ObservedObject var homework: HomeworkViewModel

    var body: some View {
        GeometryReader { geometry in
            let fittedSize = aspectFit(
                image: homework.image?.size ?? .zero,
                inside: geometry.size
            )

            ZStack {
                Color(red: 0.85, green: 0.91, blue: 0.94)
                ZStack(alignment: .topLeading) {
                    if let image = homework.image {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFit()
                            .frame(width: fittedSize.width, height: fittedSize.height)
                    }

                    PencilCanvasView(drawing: $homework.drawing, isErasing: homework.isErasing)
                        .frame(width: fittedSize.width, height: fittedSize.height)

                    ForEach(homework.correction?.issues ?? []) { issue in
                        Text("\(issue.id)")
                            .font(.headline.bold())
                            .foregroundStyle(.white)
                            .frame(width: 42, height: 42)
                            .background(Color(red: 0.84, green: 0.28, blue: 0.20).opacity(0.46), in: Circle())
                            .overlay(Circle().stroke(.white.opacity(0.9), lineWidth: 2))
                            .position(
                                x: CGFloat(issue.x / 999) * fittedSize.width,
                                y: CGFloat(issue.y / 999) * fittedSize.height
                            )
                            .allowsHitTesting(false)
                    }
                }
                .frame(width: fittedSize.width, height: fittedSize.height)
                .background(.white)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .shadow(color: .black.opacity(0.14), radius: 18, y: 8)
            }
            .onAppear { homework.canvasSize = fittedSize }
            .onChange(of: fittedSize) { _, newValue in
                homework.canvasSize = newValue
            }
        }
    }

    private func aspectFit(image: CGSize, inside container: CGSize) -> CGSize {
        guard image.width > 0, image.height > 0 else { return .zero }
        let scale = min(container.width / image.width, container.height / image.height)
        return CGSize(width: image.width * scale, height: image.height * scale)
    }
}

private struct CorrectionView: View {
    let correction: CorrectionResponse
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Résumé") {
                    Text(correction.displaySummary)
                }
                if let issues = correction.issues, !issues.isEmpty {
                    Section("Points à revoir") {
                        ForEach(issues) { issue in
                            VStack(alignment: .leading, spacing: 5) {
                                Text("\(issue.id). \(issue.title)").font(.headline)
                                Text(issue.hint).foregroundStyle(.secondary)
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
                if let nextAction = correction.nextAction, !nextAction.isEmpty {
                    Section("À toi de jouer") {
                        Text(nextAction)
                    }
                }
            }
            .navigationTitle("Mon rapport")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Continuer") { dismiss() }
                }
            }
        }
    }
}

private struct ArchiveView: View {
    @EnvironmentObject private var archive: ArchiveStore
    @Environment(\.dismiss) private var dismiss
    @State private var pendingDeletion: ArchivedHomework?

    var body: some View {
        NavigationStack {
            Group {
                if archive.homeworks.isEmpty {
                    ContentUnavailableView("Aucun devoir archivé", systemImage: "archivebox")
                } else {
                    List(archive.homeworks) { homework in
                        HStack(spacing: 14) {
                            Group {
                                if let image = archive.image(for: homework) {
                                    Image(uiImage: image).resizable().scaledToFill()
                                } else {
                                    Color.gray.opacity(0.2)
                                }
                            }
                            .frame(width: 96, height: 82)
                            .clipShape(RoundedRectangle(cornerRadius: 10))

                            VStack(alignment: .leading, spacing: 5) {
                                Text(homework.state).font(.headline)
                                Text(homework.savedAt, format: .dateTime.day().month().year().hour().minute())
                                    .font(.caption).foregroundStyle(.secondary)
                                Text(homework.summary).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                                if !homework.issues.isEmpty {
                                    Text("\(homework.issues.count) point(s) à revoir")
                                        .font(.caption.bold()).foregroundStyle(.red)
                                }
                            }
                        }
                        .swipeActions {
                            Button("Supprimer", role: .destructive) {
                                pendingDeletion = homework
                            }
                        }
                    }
                }
            }
            .navigationTitle("Mes devoirs")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Fermer") { dismiss() }
                }
            }
            .alert("Supprimer définitivement ce devoir ?", isPresented: deletionPresented) {
                Button("Annuler", role: .cancel) { pendingDeletion = nil }
                Button("Supprimer", role: .destructive) {
                    if let homework = pendingDeletion { try? archive.delete(homework) }
                    pendingDeletion = nil
                }
            }
        }
    }

    private var deletionPresented: Binding<Bool> {
        Binding(
            get: { pendingDeletion != nil },
            set: { if !$0 { pendingDeletion = nil } }
        )
    }
}

private struct SettingsView: View {
    @Binding var serverAddress: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Serveur Tuteur Samuel") {
                    TextField("https://…", text: $serverAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                    Text("La clé OpenAI reste sur ce serveur et n’est jamais enregistrée dans l’application.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Réglages")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Terminé") { dismiss() }
                }
            }
        }
    }
}

private struct VoiceSheet: View {
    let serverAddress: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Group {
                if let client = try? APIClient(serverAddress: serverAddress) {
                    VoiceWebView(url: client.voiceURL)
                } else {
                    ContentUnavailableView("Adresse du serveur invalide", systemImage: "exclamationmark.triangle")
                }
            }
            .navigationTitle("Parler au tuteur")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fermer") { dismiss() }
                }
            }
        }
    }
}
