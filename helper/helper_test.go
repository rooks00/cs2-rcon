package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"
)

func testHelper(t *testing.T) (*helper, *httptest.Server, *http.Client, chan *http.Request) {
	t.Helper()
	requests := make(chan *http.Request, 20)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests <- r.Clone(context.Background())
		w.Header().Set("Content-Type", "text/html")
		_, _ = io.WriteString(w, "<html>Relay test UI</html>")
	}))
	t.Cleanup(upstream.Close)
	site, _ := url.Parse(upstream.URL)
	server := httptest.NewUnstartedServer(nil)
	h := newHelper(context.Background(), site, server.Listener.Addr().String())
	server.Config.Handler = h
	server.Start()
	t.Cleanup(server.Close)
	client := &http.Client{Timeout: 3 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	return h, server, client, requests
}
func request(t *testing.T, client *http.Client, method, address, body string, headers map[string]string) *http.Response {
	t.Helper()
	r, err := http.NewRequest(method, address, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	for k, v := range headers {
		if k == "Host" {
			r.Host = v
		} else {
			r.Header.Set(k, v)
		}
	}
	response, err := client.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { response.Body.Close() })
	return response
}
func pair(t *testing.T, h *helper, server *httptest.Server, client *http.Client) *http.Cookie {
	t.Helper()
	response := request(t, client, "GET", server.URL+"/start?code="+h.code, "", nil)
	if response.StatusCode != 303 {
		t.Fatalf("pair status %d", response.StatusCode)
	}
	cookies := response.Cookies()
	if len(cookies) != 1 || !cookies[0].HttpOnly {
		t.Fatal("Expected an HttpOnly session cookie")
	}
	return cookies[0]
}
func TestPairingAndProxyIsolation(t *testing.T) {
	h, server, client, upstream := testHelper(t)
	unauthorized := request(t, client, "POST", server.URL+"/api/rcon", "{}", map[string]string{"Content-Type": "application/json"})
	if unauthorized.StatusCode != 401 {
		t.Fatal("unauthenticated RCON was accepted")
	}
	if len(upstream) != 0 {
		t.Fatal("RCON reached the upstream website")
	}
	cookie := pair(t, h, server, client)
	reused := request(t, client, "GET", server.URL+"/start?code="+h.code, "", nil)
	if reused.StatusCode != 401 {
		t.Fatal("Pairing code could be reused by another browser")
	}
	headers := map[string]string{"Cookie": cookie.String(), "Authorization": "do-not-forward", "X-Relay-Key": "do-not-forward", "X-Forwarded-Host": "attacker.example"}
	page := request(t, client, "GET", server.URL+"/", "", headers)
	if page.StatusCode != 200 {
		t.Fatalf("proxy status %d", page.StatusCode)
	}
	remote := <-upstream
	if remote.Header.Get("Cookie") != "" || remote.Header.Get("Authorization") != "" || remote.Header.Get("X-Relay-Key") != "" || remote.Header.Get("X-Forwarded-Host") != "" {
		t.Fatal("Local credentials leaked to the website")
	}
	if remote.URL.Path != "/" {
		t.Fatal("Incorrect upstream path")
	}
	capabilities := request(t, client, "GET", server.URL+"/api/rcon", "", headers)
	data, _ := io.ReadAll(capabilities.Body)
	if !bytes.Contains(data, []byte(`"transport":"local-tcp"`)) || bytes.Contains(data, []byte(h.session)) {
		t.Fatal("Incorrect or secret-bearing capabilities")
	}
	if len(upstream) != 0 {
		t.Fatal("Capability request reached upstream")
	}
}
func TestHostAndOriginValidation(t *testing.T) {
	h, server, client, _ := testHelper(t)
	cookie := pair(t, h, server, client)
	for name, headers := range map[string]map[string]string{
		"origin": {"Cookie": cookie.String(), "Origin": "https://evil.example"},
		"host":   {"Cookie": cookie.String(), "Host": "evil.example"},
	} {
		t.Run(name, func(t *testing.T) {
			response := request(t, client, "POST", server.URL+"/api/rcon", "{}", headers)
			if response.StatusCode != 403 {
				t.Fatalf("expected 403, got %d", response.StatusCode)
			}
		})
	}
}
func TestBodyAndMethodLimits(t *testing.T) {
	h, server, client, _ := testHelper(t)
	cookie := pair(t, h, server, client)
	headers := map[string]string{"Cookie": cookie.String(), "Content-Type": "application/json", "Origin": server.URL}
	for _, body := range []string{`{"host":"localhost","port":27015,"password":"x","commands":["status",2]}`, `{} {}`, `{"host":"localhost","port":true}`} {
		if response := request(t, client, "POST", server.URL+"/api/rcon", body, headers); response.StatusCode != 400 {
			t.Fatalf("bad body accepted: %d", response.StatusCode)
		}
	}
	if response := request(t, client, "POST", server.URL+"/api/rcon", `{"host":"`+strings.Repeat("x", 100_001)+`"}`, headers); response.StatusCode != 413 {
		t.Fatalf("large body accepted: %d", response.StatusCode)
	}
	if response := request(t, client, "POST", server.URL+"/arbitrary", "{}", headers); response.StatusCode != 405 {
		t.Fatal("arbitrary POST was proxied")
	}
}
func TestAddressPolicy(t *testing.T) {
	for _, ip := range []string{"127.0.0.1", "10.0.0.2", "192.168.1.5", "100.100.1.2", "fd00::1", "::1", "8.8.8.8", "2606:4700::1111"} {
		if !allowedAddress(netip.MustParseAddr(ip)) {
			t.Errorf("valid address blocked: %s", ip)
		}
	}
	for _, ip := range []string{"0.0.0.0", "169.254.169.254", "224.1.2.3", "255.255.255.255", "::", "fe80::1", "2001:db8::1", "::ffff:169.254.169.254", "2002:7f00:1::", "64:ff9b::7f00:1"} {
		if allowedAddress(netip.MustParseAddr(ip)) {
			t.Errorf("restricted address allowed: %s", ip)
		}
	}
}
func TestSiteValidation(t *testing.T) {
	for _, site := range []string{"https://relay.example.com", "http://127.0.0.1:3000", "http://localhost:3000"} {
		if _, err := parseSite(site); err != nil {
			t.Fatal(err)
		}
	}
	for _, site := range []string{"http://example.com", "https://user:pass@example.com", "https://example.com/path", "https://example.com?token=x", "file:///etc/passwd", "javascript:alert(1)"} {
		if _, err := parseSite(site); err == nil {
			t.Errorf("bad site accepted: %s", site)
		}
	}
}

func fixturePacket(kind, id int32, body []byte) []byte {
	data := make([]byte, len(body)+14)
	binary.LittleEndian.PutUint32(data, uint32(len(body)+10))
	binary.LittleEndian.PutUint32(data[4:], uint32(id))
	binary.LittleEndian.PutUint32(data[8:], uint32(kind))
	copy(data[12:], body)
	return data
}
func tcpFixture(t *testing.T, behavior string) (string, *[]string, *sync.Mutex) {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	commands := []string{}
	connections := []net.Conn{}
	t.Cleanup(func() {
		listener.Close()
		mu.Lock()
		defer mu.Unlock()
		for _, conn := range connections {
			conn.Close()
		}
	})
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			mu.Lock()
			connections = append(connections, conn)
			mu.Unlock()
			go func() {
				defer conn.Close()
				authenticated := false
				for {
					var size [4]byte
					if _, err := io.ReadFull(conn, size[:]); err != nil {
						return
					}
					body := make([]byte, binary.LittleEndian.Uint32(size[:]))
					if _, err := io.ReadFull(conn, body); err != nil {
						return
					}
					id := int32(binary.LittleEndian.Uint32(body))
					kind := int32(binary.LittleEndian.Uint32(body[4:]))
					text := string(body[8 : len(body)-2])
					if kind == 3 {
						if behavior == "silent" {
							continue
						}
						if text != "correct" {
							_, _ = conn.Write(fixturePacket(2, -1, nil))
							continue
						}
						authenticated = true
						data := fixturePacket(2, id, nil)
						_, _ = conn.Write(data[:3])
						_, _ = conn.Write(data[3:])
						continue
					}
					if !authenticated {
						continue
					}
					if kind == 2 {
						mu.Lock()
						commands = append(commands, text)
						mu.Unlock()
						if behavior == "transition" {
							return
						}
						if behavior == "malformed" {
							_, _ = conn.Write([]byte{255, 255, 255, 255})
							return
						}
						if behavior == "idle-command" {
							continue
						}
						if behavior == "large" {
							for i := 0; i < 510; i++ {
								_, _ = conn.Write(fixturePacket(0, id, bytes.Repeat([]byte("x"), 4000)))
							}
						} else {
							// UTF-8 deliberately split across both RCON packets and TCP chunks.
							value := []byte(text + ": player 日本語")
							one := fixturePacket(0, id, value[:len(value)-2])
							two := fixturePacket(0, id, value[len(value)-2:])
							_, _ = conn.Write(one[:6])
							_, _ = conn.Write(one[6:])
							_, _ = conn.Write(two)
						}
					} else if kind == 0 && behavior != "idle-command" {
						_, _ = conn.Write(append(fixturePacket(0, id, nil), fixturePacket(0, id, []byte{0, 1, 0, 0})...))
					}
				}
			}()
		}
	}()
	return listener.Addr().String(), &commands, &mu
}
func TestRconFramingAuthenticationAndBatches(t *testing.T) {
	target, commands, mu := tcpFixture(t, "normal")
	results, err := executeCommands(context.Background(), target, "correct", []string{"status", "listid"})
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 2 || results[0].Response != "status: player 日本語" {
		t.Fatalf("bad results %#v", results)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(*commands) != 2 {
		t.Fatal("batch not sent")
	}
}
func TestBadPasswordNeverRunsCommands(t *testing.T) {
	target, commands, mu := tcpFixture(t, "normal")
	_, err := executeCommands(context.Background(), target, "wrong", []string{"status"})
	failure, ok := err.(*rconError)
	if !ok || failure.Code != "AUTH_FAILED" {
		t.Fatalf("bad auth error: %v", err)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(*commands) != 0 {
		t.Fatal("command executed before auth")
	}
}
func TestCancellationClosesPendingAuthentication(t *testing.T) {
	target, _, _ := tcpFixture(t, "silent")
	ctx, cancel := context.WithTimeout(context.Background(), 40*time.Millisecond)
	defer cancel()
	start := time.Now()
	_, err := executeCommands(ctx, target, "correct", []string{"status"})
	if err == nil || time.Since(start) > time.Second {
		t.Fatalf("cancellation failed: %v", err)
	}
}
func TestTransitionDisconnect(t *testing.T) {
	target, _, _ := tcpFixture(t, "transition")
	results, err := executeCommands(context.Background(), target, "correct", []string{"changelevel de_nuke"})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(results[0].Response, "dispatched") {
		t.Fatal("transition was not acknowledged")
	}
}
func TestResponseLimitAndMalformedPackets(t *testing.T) {
	target, _, _ := tcpFixture(t, "large")
	results, err := executeCommands(context.Background(), target, "correct", []string{"cvarlist"})
	if err != nil {
		t.Fatal(err)
	}
	if !results[0].Truncated || len(results[0].Response) != 2_000_000 {
		t.Fatal("response budget was not enforced")
	}
	malformed, _, _ := tcpFixture(t, "malformed")
	if _, err := executeCommands(context.Background(), malformed, "correct", []string{"status"}); err == nil {
		t.Fatal("malformed packet accepted")
	}
}
func TestBrowserAPIUsesLocalTCPAndNeverUpstream(t *testing.T) {
	h, server, client, upstream := testHelper(t)
	cookie := pair(t, h, server, client)
	address, _, _ := tcpFixture(t, "normal")
	host, port, _ := net.SplitHostPort(address)
	payload := fmtJSON(host, port)
	response := request(t, client, "POST", server.URL+"/api/rcon", payload, map[string]string{"Cookie": cookie.String(), "Origin": server.URL, "Content-Type": "application/json"})
	data, _ := io.ReadAll(response.Body)
	if response.StatusCode != 200 || !bytes.Contains(data, []byte("日本語")) {
		t.Fatalf("TCP API failed: %d %s", response.StatusCode, data)
	}
	if len(upstream) != 0 {
		t.Fatal("RCON credentials reached the hosted website")
	}
}
func fmtJSON(host, port string) string {
	data, _ := json.Marshal(map[string]any{"host": host, "port": json.Number(port), "password": "correct", "commands": []string{"status"}})
	return string(data)
}

func TestBrowserPairingBoundary(t *testing.T) {
	h, server, client, upstream := testHelper(t)
	h.browserToken = randomSecret()
	origin := h.site.String()
	for _, tc := range []struct {
		name, method, path, origin, token, host string
		status                                  int
	}{
		{"paired", "GET", "/api/rcon", origin, h.browserToken, "", 200},
		{"missing token", "GET", "/api/rcon", origin, "", "", 401},
		{"wrong token", "GET", "/api/rcon", origin, "wrong", "", 401},
		{"wrong origin", "GET", "/api/rcon", "https://other.example", h.browserToken, "", 403},
		{"no origin", "GET", "/api/rcon", "", h.browserToken, "", 401},
		{"wrong host", "GET", "/api/rcon", origin, h.browserToken, "other.example", 403},
		{"proxy path", "GET", "/", origin, h.browserToken, "", 403},
		{"workshop path", "POST", "/api/workshop", origin, h.browserToken, "", 403},
		{"invalid method", "DELETE", "/api/rcon", origin, h.browserToken, "", 405},
	} {
		t.Run(tc.name, func(t *testing.T) {
			response := request(t, client, tc.method, server.URL+tc.path, "", map[string]string{"Origin": tc.origin, "Authorization": "Bearer " + tc.token, "Host": func() string {
				if tc.host != "" {
					return tc.host
				}
				return h.authority
			}()})
			if response.StatusCode != tc.status {
				t.Fatalf("status %d, expected %d", response.StatusCode, tc.status)
			}
			if response.Header.Get("Access-Control-Allow-Credentials") != "" || len(response.Cookies()) != 0 {
				t.Fatal("browser pairing must not use cookies")
			}
		})
	}
	if len(upstream) != 0 {
		t.Fatal("paired requests reached upstream")
	}
}

func TestBrowserPairingPreflight(t *testing.T) {
	h, server, client, _ := testHelper(t)
	h.browserToken = randomSecret()
	for _, tc := range []struct {
		method, headers string
		status          int
	}{
		{"POST", "authorization, content-type", 204},
		{"GET", "authorization", 204},
		{"DELETE", "authorization", 405},
		{"POST", "cookie", 403},
	} {
		response := request(t, client, "OPTIONS", server.URL+"/api/rcon", "", map[string]string{"Origin": h.site.String(), "Access-Control-Request-Method": tc.method, "Access-Control-Request-Headers": tc.headers, "Access-Control-Request-Private-Network": "true"})
		if response.StatusCode != tc.status {
			t.Fatalf("status %d, expected %d", response.StatusCode, tc.status)
		}
		if tc.status == 204 && (response.Header.Get("Access-Control-Allow-Origin") != h.site.String() || response.Header.Get("Access-Control-Allow-Private-Network") != "true") {
			t.Fatal("missing scoped network preflight")
		}
	}
}

func TestSiteNormalizesDefaultPortForBrowserOrigin(t *testing.T) {
	for raw, expected := range map[string]string{"https://relay.example:443": "https://relay.example", "http://localhost:80": "http://localhost", "http://[::1]:80": "http://[::1]"} {
		site, err := parseSite(raw)
		if err != nil || site.String() != expected {
			t.Fatalf("origin normalization failed for %s", raw)
		}
	}
}
