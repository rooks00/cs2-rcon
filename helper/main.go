// Relay Helper runs a temporary, authenticated loopback workspace. The existing
// web interface comes from one fixed site; RCON credentials and TCP stay local.
package main

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"html/template"
	"io"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

var version = "0.2.2"

const defaultPort = 47391
const maxBodyBytes = 100_000

type helper struct {
	browserToken string
	site         *url.URL
	authority    string
	code         string
	session      string
	mu           sync.Mutex
	paired       bool
	slots        chan struct{}
	proxy        *httputil.ReverseProxy
	client       *http.Client
	ctx          context.Context
	limits       map[string]*attempts
}
type attempts struct {
	started            time.Time
	requests, failures int
}

func main() {
	siteFlag := flag.String("site", "", "Relay website origin (for example https://relay.example.com)")
	port := flag.Int("port", defaultPort, "loopback HTTP port")
	browserConnect := flag.Bool("browser-connect", false, "pair the existing website using a temporary token on port 47391")
	noOpen := flag.Bool("no-open", false, "print the workspace URL without opening a browser")
	printVersion := flag.Bool("version", false, "print version and exit")
	flag.Parse()
	if *printVersion {
		fmt.Println("Relay Helper " + version)
		return
	}
	site, err := parseSite(*siteFlag)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if *port < 1024 || *port > 65535 {
		fmt.Fprintln(os.Stderr, "Choose a local port between 1024 and 65535.")
		os.Exit(1)
	}
	if *browserConnect && *port != defaultPort {
		fmt.Fprintln(os.Stderr, "Browser connection uses port 47391. Omit --port or use the local workspace instead.")
		os.Exit(1)
	}
	listener, err := net.Listen("tcp4", net.JoinHostPort("127.0.0.1", strconv.Itoa(*port)))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Cannot start Relay Helper on port %d. Close the running helper or choose --port with another free port.\n", *port)
		os.Exit(1)
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	h := newHelper(ctx, site, listener.Addr().String())
	if *browserConnect {
		h.browserToken = randomSecret()
	}
	server := &http.Server{Handler: h, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 35 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 16_384, BaseContext: func(net.Listener) context.Context { return ctx }}
	launch := "http://" + h.authority + "/start?code=" + h.code
	fmt.Printf("\n  Relay Helper %s\n\n  Workspace: %s\n\n  RCON runs on this computer. Only UI files and Workshop metadata use %s.\n  Keep this terminal open. Press Ctrl+C to stop.\n\n", version, launch, site.String())
	if *browserConnect {
		fmt.Printf("  Pair on %s using this temporary token:\n\n  %s\n\n  Only this website origin is permitted. It can access your game server while paired.\n  Paste the token into Relay; keep it private. Restart the helper to revoke it.\n\n", site.String(), h.browserToken)
	}
	if !*noOpen && !*browserConnect {
		if err := openBrowser(launch); err != nil {
			fmt.Println("Open the workspace link above in your browser.")
		}
	}
	go func() {
		<-ctx.Done()
		shutdownCtx, done := context.WithTimeout(context.Background(), 3*time.Second)
		defer done()
		_ = server.Shutdown(shutdownCtx)
	}()
	if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fmt.Fprintln(os.Stderr, "The local workspace stopped unexpectedly.")
		os.Exit(1)
	}
	fmt.Println("Relay Helper stopped. TCP connections and the session are closed.")
}

func parseSite(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" || u.User != nil || (u.Path != "" && u.Path != "/") || u.RawQuery != "" || u.Fragment != "" {
		return nil, errors.New("Pass --site with your Relay website origin, for example https://relay.example.com")
	}
	local := u.Hostname() == "localhost" || net.ParseIP(u.Hostname()) != nil && net.ParseIP(u.Hostname()).IsLoopback()
	if u.Scheme != "https" && !(u.Scheme == "http" && local) {
		return nil, errors.New("The Relay website must use HTTPS (HTTP is allowed only for localhost development).")
	}
	if strings.ContainsAny(u.Host, "\r\n\t @\\\"'<>;|") {
		return nil, errors.New("Invalid Relay website origin.")
	}
	u.Path = ""
	u.Host = strings.ToLower(u.Host)
	// Browser Origin serialization omits default ports.
	if (u.Scheme == "https" && u.Port() == "443") || (u.Scheme == "http" && u.Port() == "80") {
		host := u.Hostname()
		if strings.Contains(host, ":") {
			host = "[" + host + "]"
		}
		u.Host = host
	}
	return u, nil
}
func randomSecret() string {
	data := make([]byte, 32)
	if _, err := rand.Read(data); err != nil {
		panic(err)
	}
	return hex.EncodeToString(data)
}
func newHelper(ctx context.Context, site *url.URL, authority string) *helper {
	h := &helper{ctx: ctx, site: site, authority: authority, code: randomSecret(), session: randomSecret(), slots: make(chan struct{}, 8), limits: map[string]*attempts{}}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.ResponseHeaderTimeout = 12 * time.Second
	transport.MaxIdleConnsPerHost = 12
	h.client = &http.Client{Transport: transport, Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	h.proxy = &httputil.ReverseProxy{Transport: transport, Rewrite: func(pr *httputil.ProxyRequest) {
		pr.SetURL(site)
		pr.Out.Host = site.Host
		// Never forward local authentication or caller-supplied forwarding headers.
		pr.Out.Header.Del("Cookie")
		pr.Out.Header.Del("Authorization")
		pr.Out.Header.Del("Origin")
		pr.Out.Header.Del("Referer")
		pr.Out.Header.Del("X-Relay-Key")
		pr.Out.Header.Del("X-Forwarded-For")
		pr.Out.Header.Del("X-Forwarded-Host")
		pr.Out.Header.Del("X-Forwarded-Proto")
	}, ModifyResponse: func(response *http.Response) error {
		response.Header.Del("Set-Cookie")
		// Public asset caching is fine; the local session is never part of the cache.
		if response.StatusCode >= 300 && response.StatusCode < 400 {
			target, err := response.Location()
			if err == nil && target.IsAbs() {
				return errors.New("unexpected website redirect")
			}
		}
		return nil
	}, ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
		writeError(w, 502, "SITE_UNREACHABLE", "The Relay website could not be loaded. Check --site and your internet connection.")
	}}
	return h
}
func (h *helper) cookieName() string {
	return "relay_session_" + strings.ReplaceAll(h.authority, ":", "_")
}
func (h *helper) authenticated(r *http.Request) bool {
	cookie, err := r.Cookie(h.cookieName())
	return err == nil && subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(h.session)) == 1
}
func (h *helper) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("X-Frame-Options", "DENY")
	// Literal loopback Host + random session prevents DNS rebinding and LAN access.
	if r.Host != h.authority || r.URL.IsAbs() {
		writeError(w, 403, "HOST_BLOCKED", "Use the loopback workspace URL printed in the terminal.")
		return
	}
	if h.browserToken != "" && r.Header.Get("Origin") == h.site.String() {
		h.browserRcon(w, r)
		return
	}
	if r.Header.Get("Origin") != "" && r.Header.Get("Origin") != "http://"+h.authority {
		writeError(w, 403, "ORIGIN_BLOCKED", "Only this local workspace may make requests.")
		return
	}
	if r.URL.Path == "/start" {
		w.Header().Set("Cache-Control", "no-store")
		if r.Method != "GET" {
			writeError(w, 405, "METHOD_NOT_ALLOWED", "Use the workspace link from the terminal.")
			return
		}
		h.mu.Lock()
		valid := !h.paired && subtle.ConstantTimeCompare([]byte(r.URL.Query().Get("code")), []byte(h.code)) == 1
		if valid {
			h.paired = true
		}
		h.mu.Unlock()
		if valid {
			http.SetCookie(w, &http.Cookie{Name: h.cookieName(), Value: h.session, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode})
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}
		if h.authenticated(r) {
			http.Redirect(w, r, "/", http.StatusSeeOther)
			return
		}
		writeError(w, 401, "PAIRING_EXPIRED", "This one-time link has expired. Restart the helper to pair another browser.")
		return
	}
	if !h.authenticated(r) {
		if r.URL.Path == "/" && r.Method == "GET" {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			w.Header().Set("Cache-Control", "no-store")
			_ = lockedPage.Execute(w, nil)
			return
		}
		writeError(w, 401, "SESSION_REQUIRED", "Open the workspace link printed in the helper terminal.")
		return
	}
	if r.URL.Path == "/api/rcon" {
		w.Header().Set("Cache-Control", "no-store")
		if r.Method == "GET" {
			writeJSON(w, 200, map[string]any{"ok": true, "transport": "local-tcp", "requiresAccessKey": false, "helperVersion": version, "hostedSite": h.site.String()})
			return
		}
		if r.Method == "POST" {
			h.rcon(w, r)
			return
		}
		writeError(w, 405, "METHOD_NOT_ALLOWED", "Use GET or POST.")
		return
	}
	if r.URL.Path == "/api/workshop" && r.Method == "POST" {
		h.workshop(w, r)
		return
	}
	if strings.HasPrefix(r.URL.Path, "/api/") || (r.Method != "GET" && r.Method != "HEAD") {
		writeError(w, 405, "METHOD_NOT_ALLOWED", "This helper only serves the Relay interface and RCON commands.")
		return
	}
	h.proxy.ServeHTTP(w, r)
}

// The token is independent of the local workspace cookie and never sent upstream.
func (h *helper) browserRcon(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Add("Vary", "Origin")
	if r.URL.Path != "/api/rcon" {
		writeError(w, 403, "PATH_BLOCKED", "Browser pairing permits only the RCON endpoint.")
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", h.site.String())
	if r.Method == "OPTIONS" {
		method := r.Header.Get("Access-Control-Request-Method")
		if method != "GET" && method != "POST" {
			writeError(w, 405, "METHOD_NOT_ALLOWED", "Use GET or POST.")
			return
		}
		for _, header := range strings.Split(r.Header.Get("Access-Control-Request-Headers"), ",") {
			header = strings.ToLower(strings.TrimSpace(header))
			if header != "" && header != "authorization" && header != "content-type" {
				writeError(w, 403, "HEADER_BLOCKED", "Unsupported browser request header.")
				return
			}
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		if r.Header.Get("Access-Control-Request-Private-Network") == "true" {
			w.Header().Set("Access-Control-Allow-Private-Network", "true")
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+h.browserToken)) != 1 {
		writeError(w, 401, "PAIRING_REQUIRED", "Paste the current helper token to connect.")
		return
	}
	switch r.Method {
	case "GET":
		writeJSON(w, 200, map[string]any{"ok": true, "transport": "local-tcp", "requiresAccessKey": false, "helperVersion": version, "hostedSite": h.site.String()})
	case "POST":
		h.rcon(w, r)
	default:
		writeError(w, 405, "METHOD_NOT_ALLOWED", "Use GET or POST.")
	}
}

func (h *helper) rcon(w http.ResponseWriter, r *http.Request) {
	if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		writeError(w, 415, "INVALID_CONTENT_TYPE", "Send a JSON request.")
		return
	}
	select {
	case h.slots <- struct{}{}:
		defer func() { <-h.slots }()
	default:
		writeError(w, 429, "SERVER_BUSY", "Too many active commands. Wait for them to finish.")
		return
	}
	var input commandRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes))
	if err := decoder.Decode(&input); err != nil {
		var large *http.MaxBytesError
		if errors.As(err, &large) {
			writeError(w, 413, "REQUEST_TOO_LARGE", "The request exceeds 100 KB.")
		} else {
			writeError(w, 400, "INVALID_JSON", "Invalid connection JSON.")
		}
		return
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		writeError(w, 400, "INVALID_JSON", "Send one JSON object.")
		return
	}
	if err := input.validate(); err != nil {
		writeError(w, 400, "INVALID_REQUEST", err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	address, err := resolveTarget(ctx, input.Host)
	if err != nil {
		writeError(w, 400, "HOST_BLOCKED", err.Error())
		return
	}
	target := net.JoinHostPort(address, strconv.Itoa(input.Port))
	h.mu.Lock()
	now := time.Now()
	for key, item := range h.limits {
		if now.Sub(item.started) >= time.Minute {
			delete(h.limits, key)
		}
	}
	bucket := h.limits[target]
	if bucket == nil {
		if len(h.limits) >= 512 {
			h.mu.Unlock()
			writeError(w, 429, "RATE_LIMITED", "Too many destinations. Wait a minute before retrying.")
			return
		}
		bucket = &attempts{started: now}
		h.limits[target] = bucket
	}
	blocked := bucket.requests >= 60 || bucket.failures >= 5
	if !blocked {
		bucket.requests++
	}
	h.mu.Unlock()
	if blocked {
		w.Header().Set("Retry-After", "60")
		writeError(w, 429, "RATE_LIMITED", "Wait a minute before retrying. Check the RCON password first.")
		return
	}
	results, err := executeCommands(ctx, target, input.Password, input.Commands)
	if err != nil {
		var failure *rconError
		if errors.As(err, &failure) {
			if failure.Code == "AUTH_FAILED" {
				h.mu.Lock()
				bucket.failures++
				h.mu.Unlock()
			}
			writeError(w, failure.Status, failure.Code, failure.Message)
			return
		}
		writeError(w, 502, "CONNECT_FAILED", "The TCP connection failed. Check the address, TCP port, and firewall.")
		return
	}
	writeJSON(w, 200, map[string]any{"ok": true, "results": results})
}
func (h *helper) workshop(w http.ResponseWriter, r *http.Request) {
	var input struct {
		IDs []string `json:"ids"`
	}
	if !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
		writeError(w, 415, "INVALID_CONTENT_TYPE", "Send JSON.")
		return
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 20_000)).Decode(&input); err != nil {
		writeError(w, 400, "INVALID_JSON", "Invalid Workshop IDs.")
		return
	}
	if len(input.IDs) > 100 {
		writeError(w, 400, "INVALID_REQUEST", "Too many Workshop IDs.")
		return
	}
	for _, id := range input.IDs {
		if len(id) < 5 || len(id) > 20 || strings.IndexFunc(id, func(r rune) bool { return r < '0' || r > '9' }) >= 0 {
			writeError(w, 400, "INVALID_REQUEST", "Use numeric Workshop IDs.")
			return
		}
	}
	body, _ := json.Marshal(input)
	request, err := http.NewRequestWithContext(r.Context(), "POST", h.site.String()+"/api/workshop", strings.NewReader(string(body)))
	if err != nil {
		writeError(w, 502, "WORKSHOP_FAILED", "Workshop titles are unavailable.")
		return
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", h.site.String())
	response, err := h.client.Do(request)
	if err != nil {
		writeError(w, 502, "WORKSHOP_FAILED", "Workshop titles are unavailable.")
		return
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		writeError(w, 502, "WORKSHOP_FAILED", "Workshop titles are unavailable.")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = io.Copy(w, io.LimitReader(response.Body, 100_000))
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"ok": false, "error": map[string]string{"code": code, "message": message}})
}
func openBrowser(address string) error {
	var command *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		command = exec.Command("rundll32", "url.dll,FileProtocolHandler", address)
	case "darwin":
		command = exec.Command("open", address)
	default:
		command = exec.Command("xdg-open", address)
	}
	if err := command.Start(); err != nil {
		return err
	}
	go func() { _ = command.Wait() }()
	return nil
}

var lockedPage = template.Must(template.New("locked").Parse(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Relay Helper</title><body style="background:#111315;color:#f1f2f3;font:16px/1.7 system-ui;max-width:520px;margin:15vh auto;padding:25px"><h1>Relay Helper is running.</h1><p>Open the one-time workspace link printed in your terminal to pair this browser. If it has already been used in another browser, restart the helper.</p><p>The helper stops when you press Ctrl+C. No background service is installed.</p></body></html>`))
