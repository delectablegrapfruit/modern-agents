import AppKit
import LimiterCore
import SwiftUI

/// The menu bar window: a switch for the whole app, then every output device with its ceiling.
struct MenuView: View {
    @Environment(LimiterModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Audio Limiter").font(.headline)
                Spacer()
                Toggle("Limit Volume", isOn: Binding(get: { model.isEnabled }, set: { model.setEnabled($0) }))
                    .toggleStyle(.switch)
                    .labelsHidden()
                    .controlSize(.small)
            }
            if model.needsPermission {
                PermissionNotice()
            }
            if model.devices.isEmpty {
                Text("No output devices").foregroundStyle(.secondary)
            } else {
                ForEach(model.devices) { device in
                    DeviceRow(device: device)
                }
            }
            Divider()
            Toggle("Open at Login", isOn: Binding(get: { model.launchAtLogin }, set: { model.setLaunchAtLogin($0) }))
            HStack {
                Spacer()
                Button("Quit Audio Limiter") { NSApp.terminate(nil) }
                    .keyboardShortcut("q")
            }
        }
        .padding(14)
        .frame(width: 320)
        .onAppear { model.checkPermission() }
    }
}

/// One device: its name and state, the ceiling slider, and what the system volume now amounts to.
struct DeviceRow: View {
    @Environment(LimiterModel.self) private var model
    let device: LimiterModel.Device

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 8) {
                Image(systemName: device.symbol)
                    .foregroundStyle(.secondary)
                    .frame(width: 18)
                Text(device.name)
                    .fontWeight(device.isDefault ? .semibold : .regular)
                    .lineLimit(1)
                    .truncationMode(.tail)
                Spacer(minLength: 4)
                StatusBadge(status: device.status)
            }
            HStack(spacing: 8) {
                Slider(
                    value: Binding(get: { Double(device.ceiling) }, set: { model.setCeiling(Float($0), for: device.id) }),
                    in: Double(LimiterSettings.minimumCeiling)...1
                )
                .controlSize(.small)
                .accessibilityLabel("Maximum volume of \(device.name)")
                Text(device.isLimited ? percent(device.ceiling) : "Off")
                    .monospacedDigit()
                    .frame(width: 38, alignment: .trailing)
            }
            .padding(.leading, 26)
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, 26)
        }
    }

    private var detail: String {
        if case .failed(let message) = device.status { return message }
        guard device.isLimited else { return "Full range. Drag left to lower the maximum." }
        let top = decibels(device.curve.attenuation(ceiling: device.ceiling))
        guard let volume = device.volume else { return "No volume control: plays \(top) below full." }
        return "Volume \(percent(volume)) plays like \(percent(volume * device.ceiling)) · top \(top)"
    }

    private func percent(_ value: Float) -> String {
        "\(Int((value * 100).rounded()))%"
    }

    private func decibels(_ value: Float) -> String {
        let rounded = Int(value.rounded())
        return rounded < 0 ? "\u{2212}\(-rounded) dB" : "\(rounded) dB"
    }
}

struct StatusBadge: View {
    let status: LimiterModel.Status

    var body: some View {
        switch status {
        case .off: EmptyView()
        case .ready: badge("Ready", .secondary)
        case .limiting: badge("Limiting", .green)
        case .needsPermission: badge("Needs Access", .orange)
        case .failed: badge("Error", .red)
        }
    }

    private func badge(_ text: String, _ color: Color) -> some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text(text).font(.caption).foregroundStyle(.secondary)
        }
    }
}

/// Shown while a ceiling is set but macOS has not let the app capture audio.
struct PermissionNotice: View {
    @Environment(LimiterModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Allow System Audio Access").font(.callout.weight(.semibold))
            Text("Audio Limiter lowers the sound on its way to the device through a Core Audio tap, which macOS lists under Screen & System Audio Recording. Nothing is recorded or kept.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if model.permission == .denied {
                Button("Open Privacy & Security…") { model.openPrivacySettings() }
            } else {
                Button("Allow…") { model.requestPermission() }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
    }
}
