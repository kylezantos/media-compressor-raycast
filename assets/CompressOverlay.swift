import AppKit
import SwiftUI

// MARK: - Job Models

// One queued video, written by src/lib/video-compress.ts
struct CompressConfig: Codable {
    let input: String
    let output: String
    let finalPath: String
    let keepPath: String
    let workDir: String
    let duration: Double
    let originalSize: Int64
    let filename: String
    let trashOriginal: Bool
    let ffmpegPath: String
    let passes: [PassConfig]
}

struct PassConfig: Codable {
    let args: [String]
    let label: String
}

struct JobResult {
    enum Outcome: Equatable {
        case compressed
        case alreadyOptimal
        case failed(String)
    }

    let filename: String
    let outcome: Outcome
    let originalSize: Int64
    let compressedSize: Int64
    let finalPath: String?
    let note: String?
}

// MARK: - State

class CompressState: ObservableObject {
    enum Status: Equatable {
        case compressing
        case finished
    }

    @Published var status: Status = .compressing
    @Published var job: CompressConfig?
    @Published var jobNumber: Int = 1
    @Published var jobCount: Int = 1
    @Published var progress: Double = 0
    @Published var currentPass: Int = 0
    @Published var totalPasses: Int = 1
    @Published var passLabel: String = "Compressing..."
    @Published var eta: String = ""
    @Published var results: [JobResult] = []

    var compressed: [JobResult] { results.filter { $0.outcome == .compressed } }
    var alreadyOptimal: [JobResult] { results.filter { $0.outcome == .alreadyOptimal } }
    var failures: [String] {
        results.compactMap {
            if case .failed(let message) = $0.outcome { return message }
            return nil
        }
    }

    var totalOriginal: Int64 { compressed.reduce(0) { $0 + $1.originalSize } }
    var totalCompressed: Int64 { compressed.reduce(0) { $0 + $1.compressedSize } }

    var savedPercent: Int {
        guard totalOriginal > 0 else { return 0 }
        return Int(Double(totalOriginal - totalCompressed) / Double(totalOriginal) * 100)
    }
}

// MARK: - Design Tokens

private enum Tok {
    // Warm neutral tint instead of cold blue-purple
    static let accent = Color(red: 0.45, green: 0.72, blue: 0.55)       // muted sage green
    static let accentBright = Color(red: 0.40, green: 0.78, blue: 0.52)  // brighter for success
    static let trackBg = Color.white.opacity(0.08)
    static let trackFill = Color.white.opacity(0.55)
    static let dimText = Color.white.opacity(0.45)
    static let bodyText = Color.white.opacity(0.75)
    static let brightText = Color.white.opacity(0.92)
}

// MARK: - Overlay View

struct OverlayView: View {
    @ObservedObject var state: CompressState
    let onShowInFinder: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // ── Header ──
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    headerLabel
                    Text(subtitle)
                        .font(.system(size: 11))
                        .foregroundColor(Tok.dimText)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                Spacer(minLength: 12)
                Button(action: onDismiss) {
                    Image(systemName: "xmark")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(Tok.dimText)
                        .frame(width: 18, height: 18)
                        .background(Color.white.opacity(0.06))
                        .clipShape(Circle())
                        .contentShape(Circle())
                }
                .buttonStyle(.plain)
            }
            .padding(.bottom, 14)

            // ── Content ──
            switch state.status {
            case .compressing:
                progressContent
            case .finished:
                finishedContent
            }
        }
        .padding(16)
        .frame(width: 300, alignment: .leading)
    }

    private var subtitle: String {
        switch state.status {
        case .compressing:
            let name = state.job?.filename ?? ""
            return state.jobCount > 1 ? "\(state.jobNumber) of \(state.jobCount) \u{00B7} \(name)" : name
        case .finished:
            return state.results.count == 1
                ? state.results[0].filename
                : "\(state.results.count) videos"
        }
    }

    // MARK: Header Label

    @ViewBuilder
    private var headerLabel: some View {
        switch state.status {
        case .compressing:
            HStack(spacing: 5) {
                ProgressView()
                    .controlSize(.small)
                Text(state.passLabel)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Tok.bodyText)
            }
        case .finished:
            if !state.failures.isEmpty {
                statusLabel(
                    icon: "exclamationmark.circle.fill",
                    iconColor: .orange,
                    text: state.failures.count == state.results.count ? "Failed" : "Done with errors",
                    textColor: Tok.bodyText
                )
            } else if state.compressed.isEmpty {
                statusLabel(icon: "equal.circle.fill", iconColor: Tok.dimText, text: "Already optimal", textColor: Tok.bodyText)
            } else {
                statusLabel(icon: "checkmark.circle.fill", iconColor: Tok.accentBright, text: "Done", textColor: Tok.brightText)
            }
        }
    }

    private func statusLabel(icon: String, iconColor: Color, text: String, textColor: Color) -> some View {
        HStack(spacing: 5) {
            Image(systemName: icon)
                .font(.system(size: 12))
                .foregroundColor(iconColor)
            Text(text)
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(textColor)
        }
    }

    // MARK: Progress

    @ViewBuilder
    private var progressContent: some View {
        // Large percentage — the hero number
        HStack(alignment: .firstTextBaseline, spacing: 0) {
            Text("\(Int(state.progress * 100))")
                .font(.system(size: 28, weight: .semibold, design: .rounded).monospacedDigit())
                .foregroundColor(Tok.brightText)
            Text("%")
                .font(.system(size: 15, weight: .medium, design: .rounded))
                .foregroundColor(Tok.dimText)
                .baselineOffset(6)
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                if state.totalPasses > 1 {
                    Text("Pass \(state.currentPass + 1)/\(state.totalPasses)")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Tok.dimText)
                }
                if !state.eta.isEmpty {
                    Text(state.eta)
                        .font(.system(size: 10))
                        .foregroundColor(Tok.dimText)
                }
            }
        }
        .padding(.bottom, 8)

        // Progress track
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 2.5)
                    .fill(Tok.trackBg)
                RoundedRectangle(cornerRadius: 2.5)
                    .fill(Tok.trackFill)
                    .frame(width: max(0, geo.size.width * state.progress))
                    .animation(.easeOut(duration: 0.4), value: state.progress)
            }
        }
        .frame(height: 4)
    }

    // MARK: Finished

    @ViewBuilder
    private var finishedContent: some View {
        if !state.compressed.isEmpty {
            // Savings hero
            HStack(alignment: .firstTextBaseline, spacing: 0) {
                if state.savedPercent > 0 {
                    Text("\(state.savedPercent)")
                        .font(.system(size: 28, weight: .semibold, design: .rounded).monospacedDigit())
                        .foregroundColor(Tok.accentBright)
                    Text("% smaller")
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .foregroundColor(Tok.accent)
                        .baselineOffset(4)
                }
                Spacer()
            }
            .padding(.bottom, 4)

            // Size breakdown
            HStack(spacing: 4) {
                Text(formatBytes(state.totalOriginal))
                    .font(.system(size: 11).monospacedDigit())
                    .foregroundColor(Tok.dimText)
                Text("\u{2192}")
                    .font(.system(size: 10))
                    .foregroundColor(Tok.dimText)
                Text(formatBytes(state.totalCompressed))
                    .font(.system(size: 11, weight: .medium).monospacedDigit())
                    .foregroundColor(Tok.bodyText)
            }
            .padding(.bottom, 8)
        }

        if state.results.count > 1 {
            Text(countsLine)
                .font(.system(size: 11))
                .foregroundColor(Tok.dimText)
                .padding(.bottom, 6)
        } else if state.compressed.isEmpty && state.failures.isEmpty {
            Text("File can\u{2019}t be compressed further.")
                .font(.system(size: 11))
                .foregroundColor(Tok.dimText)
        }

        if let failure = state.failures.first {
            Text(failure)
                .font(.system(size: 11))
                .foregroundColor(.orange.opacity(0.8))
                .lineLimit(6)
                .padding(.bottom, 6)
        }

        ForEach(Array(Set(state.results.compactMap { $0.note })), id: \.self) { note in
            Text(note)
                .font(.system(size: 11))
                .foregroundColor(Tok.dimText)
                .padding(.bottom, 6)
        }

        if !state.compressed.isEmpty {
            // Primary action only — no redundant dismiss
            Button(action: onShowInFinder) {
                HStack(spacing: 5) {
                    Image(systemName: "folder")
                        .font(.system(size: 10))
                    Text("Show in Finder")
                        .font(.system(size: 11, weight: .medium))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
                .background(Tok.accent.opacity(0.2))
                .foregroundColor(Tok.accentBright)
                .cornerRadius(6)
            }
            .buttonStyle(.plain)
            .padding(.top, 4)
        }
    }

    private var countsLine: String {
        var parts: [String] = []
        if !state.compressed.isEmpty { parts.append("\(state.compressed.count) compressed") }
        if !state.alreadyOptimal.isEmpty { parts.append("\(state.alreadyOptimal.count) already optimal") }
        if !state.failures.isEmpty { parts.append("\(state.failures.count) failed") }
        return parts.joined(separator: " \u{00B7} ")
    }

    // MARK: Helpers

    private func formatBytes(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter.string(fromByteCount: bytes)
    }
}

// MARK: - Floating Panel

class FloatingPanel: NSPanel {
    override var canBecomeKey: Bool { true }

    init(size: NSSize) {
        super.init(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.nonactivatingPanel, .fullSizeContentView],
            backing: .buffered,
            defer: true
        )

        level = .floating
        isOpaque = false
        backgroundColor = .clear
        hasShadow = true
        isMovableByWindowBackground = true
        collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        titleVisibility = .hidden
        titlebarAppearsTransparent = true
    }

    func positionTopRight() {
        guard let screen = NSScreen.main else { return }
        let visible = screen.visibleFrame
        let margin: CGFloat = 16
        let x = visible.maxX - frame.width - margin
        let y = visible.maxY - frame.height - margin
        setFrameOrigin(NSPoint(x: x, y: y))
    }
}

// MARK: - Job Queue

// Jobs are JSON files in the queue directory, named so that sorting gives
// submission order. Only the overlay holding the queue lock claims jobs, and
// claiming a job deletes its file.
enum JobQueue {
    static func pendingJobFiles(in dir: String) -> [String] {
        let names = (try? FileManager.default.contentsOfDirectory(atPath: dir)) ?? []
        return names.filter { $0.hasSuffix(".json") }.sorted().map { (dir as NSString).appendingPathComponent($0) }
    }

    static func hasPendingJobs(in dir: String) -> Bool {
        !pendingJobFiles(in: dir).isEmpty
    }

    /// Removes the oldest job file and returns its contents (nil job if unreadable).
    static func claimNext(in dir: String) -> (job: CompressConfig?, path: String)? {
        guard let path = pendingJobFiles(in: dir).first else { return nil }
        let data = FileManager.default.contents(atPath: path)
        try? FileManager.default.removeItem(atPath: path)
        let job = data.flatMap { try? JSONDecoder().decode(CompressConfig.self, from: $0) }
        return (job, path)
    }

    /// Drops every pending job along with its work directory.
    static func discardPending(in dir: String) {
        while let claimed = claimNext(in: dir) {
            if let job = claimed.job { try? FileManager.default.removeItem(atPath: job.workDir) }
        }
    }
}

/// Last few lines of a stream, safe to append from a pipe's handler thread.
final class LineTail {
    private let lock = NSLock()
    private var lines: [String] = []
    private let limit: Int

    init(limit: Int) { self.limit = limit }

    func append(_ text: String) {
        lock.lock()
        defer { lock.unlock() }
        lines.append(contentsOf: text.components(separatedBy: "\n").filter { !$0.isEmpty })
        if lines.count > limit { lines = Array(lines.suffix(limit)) }
    }

    func last(_ n: Int) -> [String] {
        lock.lock()
        defer { lock.unlock() }
        return Array(lines.suffix(n))
    }
}

// MARK: - App Controller

class AppController: NSObject, NSApplicationDelegate {
    var panel: FloatingPanel!
    let state = CompressState()
    var hostingView: NSHostingView<OverlayView>!

    private let queueDir: String
    private let lockFD: Int32

    // Guards cancelled, currentJob and ffmpegProcess across the worker and main threads
    private let processLock = NSLock()
    private var cancelled = false
    private var currentJob: CompressConfig?
    private var ffmpegProcess: Process?

    // Held while a finished file is moved into place so closing can't interrupt it
    private let finalizeLock = NSLock()

    init(queueDir: String, lockFD: Int32) {
        self.queueDir = queueDir
        self.lockFD = lockFD
    }

    private var isCancelled: Bool {
        processLock.lock()
        defer { processLock.unlock() }
        return cancelled
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        createPanel()

        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            self?.workLoop()
        }
    }

    // MARK: Panel Setup

    private func createPanel() {
        let view = OverlayView(
            state: state,
            onShowInFinder: { [weak self] in self?.showInFinder() },
            onDismiss: { [weak self] in self?.dismiss() }
        )

        hostingView = NSHostingView(rootView: view)
        hostingView.translatesAutoresizingMaskIntoConstraints = false

        let blur = NSVisualEffectView()
        blur.material = .hudWindow
        blur.state = .active
        blur.blendingMode = .behindWindow
        blur.wantsLayer = true
        blur.layer?.cornerRadius = 14
        blur.layer?.masksToBounds = true

        blur.addSubview(hostingView)
        NSLayoutConstraint.activate([
            hostingView.topAnchor.constraint(equalTo: blur.topAnchor),
            hostingView.bottomAnchor.constraint(equalTo: blur.bottomAnchor),
            hostingView.leadingAnchor.constraint(equalTo: blur.leadingAnchor),
            hostingView.trailingAnchor.constraint(equalTo: blur.trailingAnchor),
        ])

        let fitting = hostingView.fittingSize
        let width = max(fitting.width, 332)
        let height = max(fitting.height, 100)

        panel = FloatingPanel(size: NSSize(width: width, height: height))
        panel.contentView = blur
        panel.positionTopRight()
        panel.makeKeyAndOrderFront(nil)
    }

    private func refreshPanel() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            guard let self = self, let panel = self.panel else { return }

            self.hostingView.layoutSubtreeIfNeeded()
            let fitting = self.hostingView.fittingSize
            let width = max(fitting.width, 332)
            let height = max(fitting.height, 100)

            guard let screen = NSScreen.main else { return }
            let visible = screen.visibleFrame
            let margin: CGFloat = 16
            let x = visible.maxX - width - margin
            let y = visible.maxY - height - margin

            panel.setFrame(
                NSRect(x: x, y: y, width: width, height: height),
                display: true,
                animate: true
            )
        }
    }

    // MARK: Queue

    private func workLoop() {
        while true {
            processLock.lock()
            if cancelled {
                processLock.unlock()
                return
            }
            let claimed = JobQueue.claimNext(in: queueDir)
            currentJob = claimed?.job
            processLock.unlock()

            guard let claimed = claimed else {
                // Queue drained: show the summary and keep picking up new jobs until closed
                DispatchQueue.main.sync {
                    self.state.status = .finished
                    self.state.progress = 1
                }
                refreshPanel()
                waitForNewJobs()
                continue
            }

            let result: JobResult
            if let job = claimed.job {
                result = runJob(job)
            } else {
                let name = (claimed.path as NSString).lastPathComponent
                result = JobResult(filename: name, outcome: .failed("Couldn\u{2019}t read the queued job."),
                                   originalSize: 0, compressedSize: 0, finalPath: nil, note: nil)
            }

            processLock.lock()
            currentJob = nil
            processLock.unlock()

            DispatchQueue.main.sync { self.state.results.append(result) }
        }
    }

    private func waitForNewJobs() {
        while !isCancelled {
            Thread.sleep(forTimeInterval: 1)
            if JobQueue.hasPendingJobs(in: queueDir) { return }
        }
    }

    private func updateJobCount() {
        let pending = JobQueue.pendingJobFiles(in: queueDir).count
        DispatchQueue.main.sync {
            self.state.jobNumber = self.state.results.count + 1
            self.state.jobCount = self.state.results.count + 1 + pending
        }
    }

    // MARK: Compression

    private func runJob(_ job: CompressConfig) -> JobResult {
        var keepWorkDir = false
        defer { if !keepWorkDir { try? FileManager.default.removeItem(atPath: job.workDir) } }

        // Jobs are built when queued, so the file may have changed since, e.g. an earlier job
        // for the same video already replaced it. stat follows symlinks, like the queued size.
        var info = stat()
        guard stat(job.input, &info) == 0 else {
            return failed(job, "The file was moved or deleted before it could be compressed.")
        }
        guard info.st_size == job.originalSize else {
            return failed(job, "Skipped \u{2014} the file changed after it was queued.")
        }

        DispatchQueue.main.sync {
            self.state.job = job
            self.state.totalPasses = job.passes.count
            self.state.status = .compressing
        }
        refreshPanel()

        for (i, pass) in job.passes.enumerated() {
            updateJobCount()
            DispatchQueue.main.sync {
                self.state.currentPass = i
                self.state.passLabel = pass.label
                self.state.progress = 0
                self.state.eta = ""
            }

            if let error = runFFmpegPass(pass, duration: job.duration, ffmpegPath: job.ffmpegPath) {
                return failed(job, error)
            }
        }

        return finish(job, keepWorkDir: &keepWorkDir)
    }

    /// Runs one ffmpeg pass; returns an error message, or nil on success.
    private func runFFmpegPass(_ pass: PassConfig, duration: Double, ffmpegPath: String) -> String? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: ffmpegPath)
        process.arguments = pass.args
        process.standardInput = FileHandle.nullDevice

        let stdoutPipe = Pipe()
        let stderrPipe = Pipe()
        process.standardOutput = stdoutPipe
        process.standardError = stderrPipe

        let startTime = Date()

        let stderrTail = LineTail(limit: 10)
        stderrPipe.fileHandleForReading.readabilityHandler = { handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }
            stderrTail.append(text)
        }

        // -progress output can split a line across reads, so carry the partial line over
        var partialLine = ""
        stdoutPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty, let text = String(data: data, encoding: .utf8) else { return }

            var lines = (partialLine + text).components(separatedBy: "\n")
            partialLine = lines.removeLast()

            for line in lines where line.hasPrefix("out_time_us=") {
                let val = String(line.dropFirst("out_time_us=".count))
                guard let us = Double(val), us > 0 else { continue }
                let sec = us / 1_000_000
                let pct = min(max(sec / duration, 0), 0.99)
                let elapsed = Date().timeIntervalSince(startTime)

                var etaText = ""
                if pct > 0.02 && elapsed > 2 {
                    let remaining = (elapsed / pct) - elapsed
                    if remaining > 0 {
                        let m = Int(remaining) / 60
                        let s = Int(remaining) % 60
                        etaText = m > 0 ? "\(m)m \(s)s left" : "\(s)s left"
                    }
                }

                DispatchQueue.main.async {
                    self?.state.progress = pct
                    self?.state.eta = etaText
                }
            }
        }

        processLock.lock()
        if cancelled {
            processLock.unlock()
            return "Cancelled"
        }
        do {
            try process.run()
        } catch {
            processLock.unlock()
            return error.localizedDescription
        }
        ffmpegProcess = process
        processLock.unlock()

        process.waitUntilExit()

        processLock.lock()
        ffmpegProcess = nil
        processLock.unlock()
        stdoutPipe.fileHandleForReading.readabilityHandler = nil
        stderrPipe.fileHandleForReading.readabilityHandler = nil

        if isCancelled { return "Cancelled" }
        if process.terminationStatus != 0 {
            let errorText = stderrTail.last(3).joined(separator: " ")
            return errorText.isEmpty ? "FFmpeg exited with code \(process.terminationStatus)" : errorText
        }
        return nil
    }

    private func finish(_ job: CompressConfig, keepWorkDir: inout Bool) -> JobResult {
        let fm = FileManager.default

        guard let attrs = try? fm.attributesOfItem(atPath: job.output),
              let size = attrs[.size] as? Int64 else {
            return failed(job, "Output file not found")
        }

        if size >= job.originalSize {
            return JobResult(filename: job.filename, outcome: .alreadyOptimal, originalSize: job.originalSize,
                             compressedSize: job.originalSize, finalPath: nil, note: nil)
        }

        finalizeLock.lock()
        defer { finalizeLock.unlock() }
        if isCancelled { return failed(job, "Cancelled") }

        var destination = job.finalPath
        var note: String?
        var originalTrashed = false
        var trashedURL: NSURL?
        if job.trashOriginal {
            do {
                try fm.trashItem(at: URL(fileURLWithPath: job.input), resultingItemURL: &trashedURL)
                originalTrashed = true
            } catch {
                // Never replace an original that didn't make it to the Trash
                destination = job.keepPath
                note = "Original kept \u{2014} it couldn\u{2019}t be moved to the Trash."
            }
        }
        destination = availablePath(destination)

        do {
            try fm.moveItem(atPath: job.output, toPath: destination)
        } catch {
            let reason = error.localizedDescription
            if putBack(trashedURL, to: job.input) {
                return failed(job, "Couldn\u{2019}t save the compressed file, so the original was left in place. \(reason)")
            }
            // The work dir now holds the only compressed copy. Keep it, and clear currentJob
            // so closing the overlay doesn't delete it either.
            keepWorkDir = true
            processLock.lock()
            currentJob = nil
            processLock.unlock()
            let original = originalTrashed ? " The original is in the Trash." : ""
            return failed(job, "Couldn\u{2019}t save the compressed file.\(original) The compressed copy is at \(job.output). \(reason)")
        }
        _ = "true".withCString { setxattr(destination, "com.mediacompressor.compressed", $0, 4, 0, 0) }

        return JobResult(filename: job.filename, outcome: .compressed, originalSize: job.originalSize,
                         compressedSize: size, finalPath: destination, note: note)
    }

    private func failed(_ job: CompressConfig, _ message: String) -> JobResult {
        JobResult(filename: job.filename, outcome: .failed(message), originalSize: job.originalSize,
                  compressedSize: job.originalSize, finalPath: nil, note: nil)
    }

    /// Moves a trashed original back to where it was; returns whether that worked.
    private func putBack(_ trashedURL: NSURL?, to path: String) -> Bool {
        guard let trashedURL = trashedURL as URL? else { return false }
        do {
            try FileManager.default.moveItem(at: trashedURL, to: URL(fileURLWithPath: path))
            return true
        } catch {
            return false
        }
    }

    /// "clip.mp4" -> "clip 2.mp4" when taken, so an existing file is never replaced.
    private func availablePath(_ path: String) -> String {
        let fm = FileManager.default
        guard fm.fileExists(atPath: path) else { return path }
        let url = URL(fileURLWithPath: path)
        let ext = url.pathExtension
        let stem = url.deletingPathExtension().lastPathComponent
        let dir = url.deletingLastPathComponent()
        var n = 2
        while true {
            let name = ext.isEmpty ? "\(stem) \(n)" : "\(stem) \(n).\(ext)"
            let candidate = dir.appendingPathComponent(name).path
            if !fm.fileExists(atPath: candidate) { return candidate }
            n += 1
        }
    }

    // MARK: Actions

    private func showInFinder() {
        let urls = state.compressed.compactMap { $0.finalPath }.map { URL(fileURLWithPath: $0) }
        if !urls.isEmpty { NSWorkspace.shared.activateFileViewerSelecting(urls) }
        dismiss()
    }

    /// Closing stops everything: the running encode and anything still queued.
    private func dismiss() {
        finalizeLock.lock()  // let a file that's being saved land first

        processLock.lock()
        cancelled = true
        ffmpegProcess?.terminate()
        let inFlight = currentJob
        processLock.unlock()

        if let job = inFlight {
            try? FileManager.default.removeItem(atPath: job.workDir)
        }
        if inFlight != nil || state.status == .compressing {
            JobQueue.discardPending(in: queueDir)
        }
        finalizeLock.unlock()

        panel?.close()

        // Release the queue, then hand any job that arrived meanwhile to a fresh overlay
        flock(lockFD, LOCK_UN)
        close(lockFD)
        if JobQueue.hasPendingJobs(in: queueDir) {
            let next = Process()
            next.executableURL = URL(fileURLWithPath: CommandLine.arguments[0])
            next.arguments = ["--queue", queueDir]
            try? next.run()
        }

        NSApp.terminate(nil)
    }
}

// MARK: - Entry Point

func queueDirArgument() -> String? {
    let args = CommandLine.arguments
    guard let idx = args.firstIndex(of: "--queue"), idx + 1 < args.count else { return nil }
    return args[idx + 1]
}

/// Only one overlay drains the queue. Returns the locked file descriptor, or nil
/// if another overlay already holds it (that one will pick up our jobs).
func acquireQueueLock(in dir: String) -> Int32? {
    try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    let fd = open((dir as NSString).appendingPathComponent(".lock"), O_CREAT | O_RDWR, 0o644)
    guard fd >= 0 else { return nil }
    if flock(fd, LOCK_EX | LOCK_NB) != 0 {
        close(fd)
        return nil
    }
    return fd
}

guard let queueDir = queueDirArgument() else {
    fputs("Usage: compress-overlay --queue <queue-dir>\n", stderr)
    exit(64)
}
guard let lockFD = acquireQueueLock(in: queueDir) else { exit(0) }
guard JobQueue.hasPendingJobs(in: queueDir) else { exit(0) }

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let controller = AppController(queueDir: queueDir, lockFD: lockFD)
app.delegate = controller
app.run()
