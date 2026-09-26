import Foundation

/// The save file: the page's whole state as JSON, in Application Support, with the previous copy kept beside it.
final class SaveStore {
    let directory: URL
    private var lastBackup = Date.distantPast

    init(directory: URL? = nil) {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        self.directory = directory ?? base.appendingPathComponent("Lull", isDirectory: true)
        try? FileManager.default.createDirectory(at: self.directory, withIntermediateDirectories: true)
    }

    var fileURL: URL { directory.appendingPathComponent("save.json") }
    var backupURL: URL { directory.appendingPathComponent("save.previous.json") }

    func load() -> Data? {
        if let data = try? Data(contentsOf: fileURL), !data.isEmpty { return data }
        if let data = try? Data(contentsOf: backupURL), !data.isEmpty { return data }
        return nil
    }

    func save(_ json: String) {
        guard let data = json.data(using: .utf8), !data.isEmpty else { return }
        // A copy of the last good save every ten minutes, in case a write is ever cut short.
        if Date().timeIntervalSince(lastBackup) > 600, FileManager.default.fileExists(atPath: fileURL.path) {
            try? FileManager.default.removeItem(at: backupURL)
            try? FileManager.default.copyItem(at: fileURL, to: backupURL)
            lastBackup = Date()
        }
        do {
            try data.write(to: fileURL, options: .atomic)
        } catch {
            NSLog("Lull: could not write the save: %@", error.localizedDescription)
        }
    }
}
