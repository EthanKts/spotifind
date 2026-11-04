import Foundation

/// Runs Spotifind's bundled Next.js server (Contents/Resources/server/server.js) with the bundled
/// Node runtime (Contents/Resources/node) on a fixed local port. A fixed port keeps the web view's
/// storage origin stable, so your ratings survive relaunches.
final class ServerController {
    static let port = 47320
    static let origin = "http://127.0.0.1:\(port)"

    private var process: Process?
    private var stopping = false
    private var recentCrashes: [Date] = []

    /// Called on the main thread when the server died unexpectedly and was restarted (true) or gave up (false).
    var onUnexpectedExit: ((Bool) -> Void)?

    static var supportDir: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Spotifind", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static var configFile: URL { supportDir.appendingPathComponent("config.env") }

    private static var logFile: URL {
        let dir = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Logs/Spotifind", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("server.log")
    }

    private static var pidFile: URL { supportDir.appendingPathComponent("server.pid") }

    /// KEY=VALUE lines from config.env (comments and blanks ignored).
    static func readConfig() -> [String: String] {
        guard let text = try? String(contentsOf: configFile, encoding: .utf8) else { return [:] }
        var env: [String: String] = [:]
        for raw in text.split(whereSeparator: \.isNewline) {
            let line = raw.trimmingCharacters(in: .whitespaces)
            guard !line.isEmpty, !line.hasPrefix("#"), let eq = line.firstIndex(of: "=") else { continue }
            let key = String(line[..<eq]).trimmingCharacters(in: .whitespaces)
            var value = String(line[line.index(after: eq)...]).trimmingCharacters(in: .whitespaces)
            if value.count >= 2, value.hasPrefix("\""), value.hasSuffix("\"") { value = String(value.dropFirst().dropLast()) }
            if !key.isEmpty, !value.isEmpty { env[key] = value }
        }
        return env
    }

    /// A server left behind by a previous run that didn't quit cleanly (e.g. force-quit) still holds the port.
    private func killLeftoverServer() {
        guard let text = try? String(contentsOf: Self.pidFile, encoding: .utf8),
              let pid = pid_t(text.trimmingCharacters(in: .whitespacesAndNewlines)), pid > 0 else { return }
        // Only kill it if it really is our node server.
        let path = UnsafeMutablePointer<CChar>.allocate(capacity: 4096)
        defer { path.deallocate() }
        if proc_pidpath(pid, path, 4096) > 0, String(cString: path).hasSuffix("/Contents/Resources/node") {
            kill(pid, SIGTERM)
            for _ in 0..<20 where kill(pid, 0) == 0 { usleep(100_000) }
            if kill(pid, 0) == 0 { kill(pid, SIGKILL) }
        }
        try? FileManager.default.removeItem(at: Self.pidFile)
    }

    func start() throws {
        killLeftoverServer()
        let res = Bundle.main.resourceURL!
        let node = res.appendingPathComponent("node")
        let serverDir = res.appendingPathComponent("server", isDirectory: true)

        let p = Process()
        p.executableURL = node
        p.arguments = [serverDir.appendingPathComponent("server.js").path]
        p.currentDirectoryURL = serverDir
        var env = ProcessInfo.processInfo.environment
        for (k, v) in Self.readConfig() { env[k] = v }
        env["PORT"] = String(Self.port)
        env["HOSTNAME"] = "127.0.0.1"
        env["NODE_ENV"] = "production"
        env["NEXT_TELEMETRY_DISABLED"] = "1"
        p.environment = env

        FileManager.default.createFile(atPath: Self.logFile.path, contents: nil)
        if let log = try? FileHandle(forWritingTo: Self.logFile) {
            p.standardOutput = log
            p.standardError = log
        }
        p.terminationHandler = { [weak self] proc in
            DispatchQueue.main.async { self?.handleExit(proc) }
        }
        stopping = false
        try p.run()
        process = p
        try? String(p.processIdentifier).write(to: Self.pidFile, atomically: true, encoding: .utf8)
    }

    private func handleExit(_ proc: Process) {
        guard proc === process, !stopping else { return }
        process = nil
        let now = Date()
        recentCrashes = recentCrashes.filter { now.timeIntervalSince($0) < 60 } + [now]
        if recentCrashes.count <= 3, (try? start()) != nil {
            onUnexpectedExit?(true)
        } else {
            onUnexpectedExit?(false)
        }
    }

    func stop() {
        stopping = true
        guard let p = process, p.isRunning else { return }
        p.terminate() // SIGTERM
        let deadline = Date().addingTimeInterval(2)
        while p.isRunning && Date() < deadline { usleep(50_000) }
        if p.isRunning { kill(p.processIdentifier, SIGKILL) }
        process = nil
        try? FileManager.default.removeItem(at: Self.pidFile)
    }

    /// Polls /api/status until the server answers as Spotifind, or the timeout passes.
    func waitUntilReady(timeout: TimeInterval = 30, completion: @escaping (Bool) -> Void) {
        let deadline = Date().addingTimeInterval(timeout)
        func attempt() {
            var req = URLRequest(url: URL(string: "\(Self.origin)/api/status")!)
            req.timeoutInterval = 1.5
            URLSession.shared.dataTask(with: req) { data, _, _ in
                let ok = data.flatMap { String(data: $0, encoding: .utf8) }?.contains("\"spotifind\"") ?? false
                if ok { return DispatchQueue.main.async { completion(true) } }
                if Date() > deadline || (self.process?.isRunning == false) {
                    return DispatchQueue.main.async { completion(false) }
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { attempt() }
            }.resume()
        }
        attempt()
    }

    static var logPath: String { logFile.path }
}
