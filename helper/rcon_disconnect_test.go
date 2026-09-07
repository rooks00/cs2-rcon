package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net"
	"os"
	"strings"
	"testing"
	"time"
)

type observedConn struct {
	net.Conn
	readErr, writeErr error
}

func (c *observedConn) Read(p []byte) (int, error) {
	n, err := c.Conn.Read(p)
	if err != nil {
		c.readErr = err
	}
	return n, err
}
func (c *observedConn) Write(p []byte) (int, error) {
	n, err := c.Conn.Write(p)
	if err != nil {
		c.writeErr = err
	}
	return n, err
}

// Return a specific OS socket error without depending on TCP close timing.
type disconnectConn struct {
	net.Conn
	response  *bytes.Reader
	readErr   error
	writeErr  error
	failWrite int
	writes    int
}

func (c *disconnectConn) Read(p []byte) (int, error) {
	if c.response.Len() > 0 {
		return c.response.Read(p)
	}
	return 0, c.readErr
}
func (c *disconnectConn) Write(p []byte) (int, error) {
	c.writes++
	if c.writes == c.failWrite {
		return 0, c.writeErr
	}
	return len(p), nil
}
func (c *disconnectConn) SetDeadline(time.Time) error { return nil }

func TestCommandDisconnectHandling(t *testing.T) {
	reset := &net.OpError{Op: "read", Net: "tcp", Err: os.NewSyscallError("read", peerResetError)}
	for _, tc := range []struct {
		name, command, errorCode, response string
		readErr                            error
		data                               []byte
		failWrite                          int
		cancelled                          bool
	}{
		{name: "transition EOF", command: "changelevel de_nuke", readErr: io.EOF, response: "dispatched"},
		{name: "transition socket reset", command: "changelevel de_nuke", readErr: reset, response: "dispatched"},
		{name: "workshop socket reset", command: "host_workshop_map 123456", readErr: reset, response: "dispatched"},
		{name: "workshop changelevel reset", command: "ds_workshop_changelevel 123456", readErr: reset, response: "dispatched"},
		{name: "ordinary EOF", command: "status", readErr: io.EOF, errorCode: "CONNECTION_CLOSED"},
		{name: "ordinary socket reset", command: "status", readErr: reset, errorCode: "CONNECTION_CLOSED"},
		{name: "reset before command written", command: "changelevel de_nuke", readErr: reset, failWrite: 1, errorCode: "CONNECTION_CLOSED"},
		{name: "reset after command written", command: "changelevel de_nuke", readErr: reset, failWrite: 2, response: "dispatched"},
		{name: "cancelled transition", command: "changelevel de_nuke", readErr: reset, cancelled: true, errorCode: "REQUEST_TIMEOUT"},
		{name: "incomplete packet", command: "changelevel de_nuke", data: []byte{14, 0}, readErr: io.EOF, errorCode: "CONNECTION_CLOSED"},
		{name: "invalid packet", command: "changelevel de_nuke", data: []byte{255, 255, 255, 255}, readErr: reset, errorCode: "INVALID_PACKET"},
		{name: "complete response before reset", command: "status", data: fixturePacket(0, 1, []byte("server status")), readErr: reset, response: "server status"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			if tc.cancelled {
				cancel()
			}
			conn := &disconnectConn{response: bytes.NewReader(tc.data), readErr: tc.readErr, writeErr: reset, failWrite: tc.failWrite}
			s := &session{conn: conn, ctx: ctx}
			result, err := s.execute(1, tc.command)
			if tc.errorCode != "" {
				var failure *rconError
				if !errors.As(err, &failure) || failure.Code != tc.errorCode {
					t.Fatalf("expected %s, got %v", tc.errorCode, err)
				}
				return
			}
			if err != nil || !strings.Contains(result.Response, tc.response) {
				t.Fatalf("expected response containing %q, got %q, error %v", tc.response, result.Response, err)
			}
		})
	}
}
