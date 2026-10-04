import Foundation
import UIKit

struct APIClient {
    enum ClientError: LocalizedError {
        case invalidServer
        case invalidImage
        case server(String)

        var errorDescription: String? {
            switch self {
            case .invalidServer: "L’adresse du serveur n’est pas valide."
            case .invalidImage: "La copie du devoir n’a pas pu être préparée."
            case .server(let message): message
            }
        }
    }

    private struct VerifyPayload: Encodable {
        let image: String
        let annotationCount: Int
    }

    private struct ErrorPayload: Decodable {
        let message: String?
    }

    let baseURL: URL

    init(serverAddress: String) throws {
        guard let url = URL(string: serverAddress), ["http", "https"].contains(url.scheme?.lowercased()) else {
            throw ClientError.invalidServer
        }
        baseURL = url
    }

    func verify(image: UIImage, annotationCount: Int) async throws -> CorrectionResponse {
        guard let jpeg = image.jpegData(compressionQuality: 0.88) else {
            throw ClientError.invalidImage
        }

        let payload = VerifyPayload(
            image: "data:image/jpeg;base64,\(jpeg.base64EncodedString())",
            annotationCount: annotationCount
        )
        var request = URLRequest(url: baseURL.appendingPathComponent("api/verify"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(payload)
        request.timeoutInterval = 120

        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 120
        let (data, response) = try await URLSession(configuration: configuration).data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ClientError.server("Le serveur n’a pas répondu correctement.")
        }
        guard (200 ... 299).contains(httpResponse.statusCode) else {
            let errorPayload = try? JSONDecoder().decode(ErrorPayload.self, from: data)
            throw ClientError.server(errorPayload?.message ?? "La correction n’a pas abouti.")
        }
        return try JSONDecoder().decode(CorrectionResponse.self, from: data)
    }

    var voiceURL: URL {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        components.path = "/"
        components.queryItems = [URLQueryItem(name: "voice", value: "1")]
        return components.url!
    }
}
