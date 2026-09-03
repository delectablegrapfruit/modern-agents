import SwiftUI
import WinnowCore

struct SweepSheet: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            switch model.sweep {
            case .found(let items, _, let label):
                if items.isEmpty {
                    Text("Nothing to remove in \(label).")
                    Spacer()
                    HStack {
                        Spacer()
                        Button("Done") { model.dismissSweep() }
                            .keyboardShortcut(.defaultAction)
                    }
                } else {
                    Text("\(items.count) item\(items.count == 1 ? "" : "s") · \(Format.bytes(items.reduce(0) { $0 + $1.size })) · \(label)")
                        .font(.headline)
                    List(items) { item in
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.name)
                                Text(item.parentPath)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                            }
                            Spacer()
                            Text(Format.bytes(item.size))
                                .font(.caption)
                                .monospacedDigit()
                                .foregroundStyle(.secondary)
                        }
                    }
                    HStack {
                        Button("Cancel") { model.dismissSweep() }
                            .keyboardShortcut(.cancelAction)
                        Spacer()
                        Button("Remove \(items.count) Item\(items.count == 1 ? "" : "s")") { model.removeFound() }
                            .buttonStyle(.borderedProminent)
                            .keyboardShortcut(.defaultAction)
                    }
                }
            case .removing(let done, let total):
                ProgressView(value: Double(done), total: Double(max(total, 1))) {
                    Text("Removing…")
                }
                Spacer()
            case .finished(let result):
                Text("Removed \(result.removedCount) item\(result.removedCount == 1 ? "" : "s") · \(Format.bytes(result.bytesFreed))")
                    .font(.headline)
                if !result.failed.isEmpty {
                    let locked = result.lockedItems.count
                    Text(locked > 0
                         ? "\(locked) item\(locked == 1 ? "" : "s") belong to the system and need administrator access."
                         : "\(result.failed.count) could not be removed")
                        .foregroundStyle(.secondary)
                    if model.needsFullDiskAccess(result) {
                        Text("The Trash on other disks is readable only with Full Disk Access for Winnow.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    List(result.failed, id: \.item.path) { failure in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(failure.item.path)
                                .lineLimit(1)
                                .truncationMode(.middle)
                            Text(failure.reason)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                } else {
                    Spacer()
                }
                HStack {
                    if model.needsFullDiskAccess(result) {
                        Button("Open Privacy Settings") { model.openFullDiskAccessSettings() }
                    }
                    Spacer()
                    if !result.lockedItems.isEmpty {
                        Button("Remove as Administrator…") { model.removeLockedItems() }
                            .buttonStyle(.borderedProminent)
                    }
                    Button("Done") { model.dismissSweep() }
                        .keyboardShortcut(.defaultAction)
                }
            case .idle, .scanning:
                EmptyView()
            }
        }
        .padding(20)
        .frame(width: 520, height: 400)
    }
}
