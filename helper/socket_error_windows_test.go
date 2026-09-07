package main

import (
	"bytes"
	"context"
	"errors"
	"net"
	"os"
	"strings"
	"syscall"
	"testing"
)

func TestWindowsDisconnectCodes(t *testing.T) {
	for _, code := range []syscall.Errno{syscall.WSAECONNRESET, syscall.WSAECONNABORTED, syscall.ERROR_NETNAME_DELETED} {
		t.Run(code.Error(), func(t *testing.T) {
			for _, command := range []string{"changelevel de_nuke", "status"} {
				conn := &disconnectConn{response: bytes.NewReader(nil), readErr: &net.OpError{Op: "read", Net: "tcp", Err: os.NewSyscallError("wsarecv", code)}}
				s := &session{conn: conn, ctx: context.Background()}
				result, err := s.execute(1, command)
				if command == "status" {
					var failure *rconError
					if !errors.As(err, &failure) || failure.Code != "CONNECTION_CLOSED" {
						t.Fatalf("ordinary command must fail after disconnect: %v", err)
					}
				} else if err != nil || !strings.Contains(result.Response, "dispatched") {
					t.Fatalf("transition should be dispatched: %v", err)
				}
			}
		})
	}
}
