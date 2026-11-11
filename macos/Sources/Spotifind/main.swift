import AppKit
import WebKit

// Spotifind for macOS: a native window around Spotifind's local web UI.
// The Node server is bundled and managed by ServerController; this file owns the window,
// the web view, menus, and routing "Open in Spotify" into the Spotify desktop app.

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private let server = ServerController()
    private var appLoaded = false

    // MARK: launch / quit

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        buildWindow()
        showSplash("Starting Spotifind…")

        server.onUnexpectedExit = { [weak self] restarted in
            guard let self else { return }
            if restarted {
                self.server.waitUntilReady { ok in if ok { self.webView.reload() } else { self.showError() } }
            } else {
                self.showError()
            }
        }
        startServer()
        NSApp.activate(ignoringOtherApps: true)
    }

    private func startServer() {
        do {
            try server.start()
        } catch {
            showError(detail: error.localizedDescription)
            return
        }
        server.waitUntilReady { [weak self] ok in
            guard let self else { return }
            if ok {
                self.appLoaded = true
                self.webView.load(URLRequest(url: URL(string: ServerController.origin + "/")!))
            } else {
                self.showError()
            }
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        server.stop()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    // MARK: window + web view

    private func buildWindow() {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // persistent: keeps your ratings
        config.mediaTypesRequiringUserActionForPlayback = [] // previews start on click
        config.preferences.isElementFullscreenEnabled = true

        // Tell the page it's running inside the Mac app (for small layout tweaks).
        let marker = WKUserScript(
            source: "document.documentElement.classList.add('sf-mac')",
            injectionTime: .atDocumentStart, forMainFrameOnly: true)
        config.userContentController.addUserScript(marker)

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsMagnification = true
        webView.isInspectable = true
        webView.setValue(false, forKey: "drawsBackground") // black window shows through while loading
        webView.customUserAgent = nil

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1320, height: 860),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        window.title = "Spotifind"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.appearance = NSAppearance(named: .darkAqua)
        window.backgroundColor = .black
        window.minSize = NSSize(width: 900, height: 600)
        window.contentView = webView
        window.center()
        window.setFrameAutosaveName("SpotifindMainWindow")
        window.tabbingMode = .disallowed
        window.makeKeyAndOrderFront(nil)
    }

    private func showSplash(_ message: String) {
        let icon = Bundle.main.url(forResource: "splash-mark", withExtension: "svg")
            .flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? ""
        webView.loadHTMLString(Self.page(body: """
            <div class="mark">\(icon)</div>
            <p class="msg"><span class="dot"></span>\(message)</p>
            """), baseURL: nil)
    }

    private func showError(detail: String? = nil) {
        appLoaded = false
        let extra = detail.map { "<p class='sub'>\(Self.escape($0))</p>" } ?? ""
        webView.loadHTMLString(Self.page(body: """
            <h1>Spotifind couldn't start</h1>
            <p class="sub">Its local server didn't respond on port \(ServerController.port).
            Another app may be using that port.</p>\(extra)
            <p class="sub">Log: \(Self.escape(ServerController.logPath))</p>
            <a class="btn" href="spotifind-app://retry">Try again</a>
            """), baseURL: nil)
    }

    private static func escape(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;").replacingOccurrences(of: "<", with: "&lt;")
    }

    private static func page(body: String) -> String {
        """
        <!doctype html><html><head><meta charset="utf-8"><style>
        html,body{margin:0;height:100%;background:#000;color:#fff;font:15px -apple-system,system-ui,sans-serif}
        body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center}
        .mark svg{width:96px;height:96px} h1{font-size:22px;margin:0}
        .msg{color:#b3b3b3;display:flex;align-items:center;gap:8px;margin:0}
        .dot{width:8px;height:8px;border-radius:50%;background:#1ed760;animation:p 1s ease-in-out infinite alternate}
        @keyframes p{from{opacity:.25}to{opacity:1}}
        .sub{color:#b3b3b3;max-width:520px;margin:0}
        .btn{margin-top:8px;background:#1ed760;color:#000;font-weight:700;padding:10px 22px;border-radius:999px;text-decoration:none}
        </style></head><body>\(body)</body></html>
        """
    }

    // MARK: links

    private func isAppURL(_ url: URL) -> Bool {
        url.host == "127.0.0.1" && url.port == ServerController.port
    }

    /// open.spotify.com/{track|album|artist}/ID → spotify:{kind}:ID ; /search/q → spotify:search:q
    private func spotifyAppURL(for web: URL) -> URL? {
        guard web.host == "open.spotify.com" else { return nil }
        let parts = web.pathComponents.filter { $0 != "/" && !$0.hasPrefix("intl-") }
        guard parts.count >= 2 else { return nil }
        switch parts[0] {
        case "track", "album", "artist", "playlist":
            return URL(string: "spotify:\(parts[0]):\(parts[1])")
        case "search":
            let q = parts[1...].joined(separator: " ")
            let enc = q.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? q
            return URL(string: "spotify:search:\(enc)")
        default:
            return nil
        }
    }

    /// Open an external link: Spotify links go to the Spotify desktop app when it's installed.
    private func openExternally(_ url: URL) {
        if let app = spotifyAppURL(for: url), NSWorkspace.shared.urlForApplication(toOpen: app) != nil {
            NSWorkspace.shared.open(app)
        } else {
            NSWorkspace.shared.open(url)
        }
    }

    /// "Open in Spotify" buttons point at our /api/open endpoint; ask it for the destination as JSON.
    private func resolveAndOpen(_ url: URL) {
        guard var comps = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return }
        comps.queryItems = (comps.queryItems ?? []) + [URLQueryItem(name: "json", value: "1")]
        guard let jsonURL = comps.url else { return }
        URLSession.shared.dataTask(with: jsonURL) { [weak self] data, _, _ in
            guard let data,
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let s = obj["url"] as? String, let dest = URL(string: s) else { return }
            DispatchQueue.main.async { self?.openExternally(dest) }
        }.resume()
    }

    private func route(_ url: URL) {
        if isAppURL(url) && url.path == "/api/spotify/login" {
            // Spotify login happens in your default browser, where you're already signed in to Spotify.
            // Its callback returns to this app's local server, which stores the login.
            NSWorkspace.shared.open(url)
        } else if isAppURL(url) && url.path == "/api/open" {
            resolveAndOpen(url)
        } else if isAppURL(url) {
            webView.load(URLRequest(url: url))
        } else if ["http", "https", "spotify", "mailto"].contains(url.scheme ?? "") {
            openExternally(url)
        }
    }

    // target=_blank / window.open
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { route(url) }
        return nil
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
        if url.scheme == "spotifind-app" {
            decisionHandler(.cancel)
            if url.host == "retry" { showSplash("Starting Spotifind…"); startServer() }
            return
        }
        if url.scheme == "about" || url.scheme == "data" || (isAppURL(url) && url.path != "/api/open" && url.path != "/api/spotify/login") {
            return decisionHandler(.allow)
        }
        decisionHandler(.cancel)
        route(url)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {}

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        if appLoaded { webView.reload() }
    }

    // JS alert/confirm (used by "Reset everything").
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        alert.beginSheetModal(for: window) { completionHandler($0 == .alertFirstButtonReturn) }
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }

    // MARK: menus

    @objc private func reload() { if appLoaded { webView.reload() } else { startServer() } }
    @objc private func goBack() { webView.goBack() }
    @objc private func goForward() { webView.goForward() }
    @objc private func goHome() { if appLoaded { webView.load(URLRequest(url: URL(string: ServerController.origin + "/")!)) } }
    @objc private func goTo(_ sender: NSMenuItem) {
        if appLoaded, let path = sender.representedObject as? String {
            webView.load(URLRequest(url: URL(string: ServerController.origin + path)!))
        }
    }
    @objc private func openSettingsFile() {
        let file = ServerController.configFile
        if !FileManager.default.fileExists(atPath: file.path) {
            let template = """
            # Spotifind settings — edit, save, then quit and reopen Spotifind.
            LASTFM_API_KEY=
            # Optional: exact "Open in Spotify" links
            SPOTIFY_CLIENT_ID=
            SPOTIFY_CLIENT_SECRET=

            """
            try? template.write(to: file, atomically: true, encoding: .utf8)
        }
        NSWorkspace.shared.open([file], withApplicationAt: URL(fileURLWithPath: "/System/Applications/TextEdit.app"),
                                configuration: NSWorkspace.OpenConfiguration())
    }

    private func buildMenu() {
        let main = NSMenu()

        let appItem = NSMenuItem()
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Spotifind", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        let settings = NSMenuItem(title: "API Keys…", action: #selector(openSettingsFile), keyEquivalent: ",")
        settings.target = self
        appMenu.addItem(settings)
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Hide Spotifind", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = appMenu.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Quit Spotifind", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        main.addItem(appItem)

        let editItem = NSMenuItem()
        let edit = NSMenu(title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = edit
        main.addItem(editItem)

        let goItem = NSMenuItem()
        let go = NSMenu(title: "Go")
        func add(_ title: String, _ sel: Selector, _ key: String, _ mods: NSEvent.ModifierFlags = [.command], path: String? = nil) {
            let item = NSMenuItem(title: title, action: sel, keyEquivalent: key)
            item.keyEquivalentModifierMask = mods
            item.target = self
            item.representedObject = path
            go.addItem(item)
        }
        add("Home", #selector(goHome), "1")
        add("Search", #selector(goTo(_:)), "2", path: "/search")
        add("Discover", #selector(goTo(_:)), "3", path: "/discover")
        add("Playlists", #selector(goTo(_:)), "4", path: "/playlists")
        add("History", #selector(goTo(_:)), "5", path: "/recent")
        add("My Ratings", #selector(goTo(_:)), "6", path: "/ratings")
        add("Rapid-fire", #selector(goTo(_:)), "7", path: "/rapid")
        go.addItem(.separator())
        add("Back", #selector(goBack), "[")
        add("Forward", #selector(goForward), "]")
        add("Reload", #selector(reload), "r")
        goItem.submenu = go
        main.addItem(goItem)

        let winItem = NSMenuItem()
        let win = NSMenu(title: "Window")
        win.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        win.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        win.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
            .keyEquivalentModifierMask = [.command, .control]
        winItem.submenu = win
        main.addItem(winItem)
        NSApp.windowsMenu = win

        NSApp.mainMenu = main
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
