package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestJSONRequestValidation(t *testing.T) {
	for _, tc := range []struct {
		name, contentType, body string
		limit                   int64
		status                  int
	}{
		{"valid parameters", "Application/JSON; charset=utf-8", `{"ids":["12345"]}`, 100, 200},
		{"wrong media type suffix", "application/json-extra", `{}`, 100, 415},
		{"invalid parameters", "application/json; broken", `{}`, 100, 415},
		{"multiple values", "application/json", `{} {}`, 100, 400},
		{"null", "application/json", `null`, 100, 400},
		{"whitespace", "application/json", `   `, 100, 400},
		{"trailing bytes exceed limit", "application/json", `{}` + strings.Repeat(" ", 100), 100, 413},
	} {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tc.body))
			r.Header.Set("Content-Type", tc.contentType)
			w := httptest.NewRecorder()
			var input struct {
				IDs []string `json:"ids"`
			}
			valid := decodeJSON(w, r, &input, tc.limit)
			if w.Code != tc.status || valid != (tc.status == 200) {
				t.Fatalf("valid=%v status=%d", valid, w.Code)
			}
		})
	}
}

func TestProxyRedirectsStayRelative(t *testing.T) {
	site, _ := url.Parse("https://relay.example")
	h := newHelper(context.Background(), site, "127.0.0.1:47391")
	for _, tc := range []struct {
		location string
		allowed  bool
	}{
		{"/next", true}, {"next", true}, {"https://other.example/next", false}, {"//other.example/next", false}, {"http://%", false},
	} {
		response := &http.Response{StatusCode: 302, Header: http.Header{"Location": []string{tc.location}}, Request: &http.Request{URL: site}}
		err := h.proxy.ModifyResponse(response)
		if (err == nil) != tc.allowed {
			t.Errorf("location=%q error=%v", tc.location, err)
		}
	}
}

func TestWorkshopRejectsInvalidUpstreamResponse(t *testing.T) {
	for _, body := range []string{`not-json`, `{"data":"` + strings.Repeat("x", maxBodyBytes) + `"}`} {
		upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(body)) }))
		site, _ := url.Parse(upstream.URL)
		h := newHelper(context.Background(), site, "127.0.0.1:47391")
		request := httptest.NewRequest(http.MethodPost, "/api/workshop", strings.NewReader(`{"ids":["12345"]}`))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		h.workshop(response, request)
		upstream.Close()
		if response.Code != 502 {
			t.Fatalf("invalid upstream response returned %d", response.Code)
		}
	}
}
