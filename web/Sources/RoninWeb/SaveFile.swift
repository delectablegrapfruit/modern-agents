import RoninCore

// The save file without Foundation (JSONCoding.swift): read and written as the app does it.

/// Reads a save file as `SaveGame.load` does: the fight in progress if it still reads, else a fresh roll of the
/// career's stage at the hearts carried. Nil only when not even the career can be read.
func loadSave(_ bytes: [UInt8]) -> SaveGame? {
    struct Header: Decodable {
        var version: Int?
        var career: Career
    }
    struct Saved: Decodable { var fight: Fight }
    guard let header = try? JSON.decode(Header.self, from: bytes) else { return nil }
    if header.version == SaveGame.currentVersion, let saved = try? JSON.decode(Saved.self, from: bytes) {
        return SaveGame(career: header.career, fight: saved.fight)
    }
    return SaveGame(career: header.career, fight: header.career.makeFight())
}

/// The save file, as the app's `Store` writes it (`JSONEncoder().encode(game)`).
func saveFile(_ game: SaveGame) -> [UInt8] {
    (try? JSON.encode(game)) ?? []
}
