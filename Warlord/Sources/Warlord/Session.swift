import Foundation
import WarlordCore

/// The campaign in play: the game, where it is saved, and who to tell when it changes.
@MainActor
final class Session {
    private(set) var game: Game
    let store: GameStore
    var onChange: [() -> Void] = []

    init(store: GameStore) {
        self.store = store
        game = store.loadOrStart()
        game.accrue(now: Date())
    }

    /// Makes one change to the game, saves it and tells the views.
    @discardableResult
    func apply<T>(_ change: (inout Game) throws -> T) rethrows -> T {
        let result = try change(&game)
        save()
        changed()
        return result
    }

    /// Lets the clock run: orders come back, gold comes in. Saved with the next order, or on quit.
    func tick(now: Date = Date()) {
        game.accrue(now: now)
        changed()
    }

    func save() {
        do {
            try store.save(game)
        } catch {
            NSLog("Warlord: could not save the campaign: \(error)")
        }
    }

    private func changed() {
        for handler in onChange { handler() }
    }
}
