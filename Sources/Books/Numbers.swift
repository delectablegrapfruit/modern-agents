import Foundation

/// A whole number for display from a value that may have come from JavaScript, where it can be NaN or infinite.
/// Those, and absurd magnitudes, become 0 instead of trapping the way `Int(_:)` does.
func whole(_ value: Double) -> Int {
    guard value.isFinite, abs(value) < 1e15 else { return 0 }
    return Int(value)
}
