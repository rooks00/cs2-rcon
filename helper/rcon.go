package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"io"
	"net"
	"net/netip"
	"strings"
	"time"
	"unicode/utf8"
)

type commandRequest struct {
	Host     string   `json:"host"`
	Port     int      `json:"port"`
	Password string   `json:"password"`
	Commands []string `json:"commands"`
	Command  string   `json:"command"`
}
type commandResult struct {
	Command    string `json:"command"`
	Response   string `json:"response"`
	DurationMS int64  `json:"durationMs"`
	Truncated  bool   `json:"truncated,omitempty"`
}
type rconError struct {
	Status        int
	Code, Message string
}

func (e *rconError) Error() string { return e.Message }
func (input *commandRequest) validate() error {
	input.Host = strings.TrimSpace(input.Host)
	if input.Host == "" || len(input.Host) > 253 || strings.ContainsAny(input.Host, " \t\r\n/@?#\\") {
		return errors.New("Enter a hostname or IP address without a URL or path.")
	}
	if input.Port < 1 || input.Port > 65535 {
		return errors.New("RCON port must be between 1 and 65535.")
	}
	if input.Password == "" || len(input.Password) > 1000 || strings.ContainsRune(input.Password, 0) || !utf8.ValidString(input.Password) {
		return errors.New("Enter a valid RCON password up to 1000 bytes.")
	}
	if input.Commands == nil && input.Command != "" {
		input.Commands = []string{input.Command}
	}
	if len(input.Commands) == 0 || len(input.Commands) > 100 {
		return errors.New("Send 1–100 commands.")
	}
	for i, command := range input.Commands {
		command = strings.TrimSpace(command)
		if command == "" || len(command) > 4000 || strings.ContainsRune(command, 0) || !utf8.ValidString(command) {
			return errors.New("Each command must contain 1–4000 bytes of text without null characters.")
		}
		input.Commands[i] = command
	}
	return nil
}

var blockedNetworks = func() []netip.Prefix {
	prefixes := []string{"0.0.0.0/8", "169.254.0.0/16", "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4", "2001::/23", "2001:db8::/32", "2002::/16", "3fff::/20", "64:ff9b::/96", "64:ff9b:1::/48"}
	result := make([]netip.Prefix, 0, len(prefixes))
	for _, prefix := range prefixes {
		result = append(result, netip.MustParsePrefix(prefix))
	}
	return result
}()

func allowedAddress(address netip.Addr) bool {
	address = address.Unmap()
	if !address.IsValid() || address.Zone() != "" || address.IsUnspecified() || address.IsMulticast() || address.IsLinkLocalUnicast() || address.IsLinkLocalMulticast() {
		return false
	}
	for _, prefix := range blockedNetworks {
		if prefix.Contains(address) {
			return false
		}
	}
	return address.IsLoopback() || address.IsGlobalUnicast()
}
func resolveTarget(ctx context.Context, host string) (string, error) {
	host = strings.TrimPrefix(strings.TrimSuffix(host, "]"), "[")
	if address, err := netip.ParseAddr(host); err == nil {
		if !allowedAddress(address) {
			return "", errors.New("Metadata, link-local, multicast and reserved destinations are blocked.")
		}
		return address.Unmap().String(), nil
	}
	lookupCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	addresses, err := net.DefaultResolver.LookupNetIP(lookupCtx, "ip", host)
	if err != nil || len(addresses) == 0 {
		return "", errors.New("The server hostname could not be resolved from this computer.")
	}
	for _, address := range addresses {
		if !allowedAddress(address) {
			return "", errors.New("The hostname resolves to a restricted address.")
		}
	}
	// Prefer IPv4 when available, while checking every answer against the policy.
	for _, address := range addresses {
		if address.Unmap().Is4() {
			return address.Unmap().String(), nil
		}
	}
	return addresses[0].String(), nil
}

type packet struct {
	id, kind int32
	body     []byte
}
type session struct {
	conn              net.Conn
	received, packets int
	ctx               context.Context
}

func encodePacket(kind, id int32, body []byte) ([]byte, error) {
	if len(body) > 4086 {
		return nil, &rconError{400, "COMMAND_TOO_LONG", "Command exceeds the Source packet limit."}
	}
	buffer := make([]byte, len(body)+14)
	binary.LittleEndian.PutUint32(buffer, uint32(len(body)+10))
	binary.LittleEndian.PutUint32(buffer[4:], uint32(id))
	binary.LittleEndian.PutUint32(buffer[8:], uint32(kind))
	copy(buffer[12:], body)
	return buffer, nil
}
func (s *session) write(kind, id int32, body []byte) error {
	data, err := encodePacket(kind, id, body)
	if err != nil {
		return err
	}
	for len(data) > 0 {
		n, err := s.conn.Write(data)
		if err != nil {
			return err
		}
		if n == 0 {
			return io.ErrUnexpectedEOF
		}
		data = data[n:]
	}
	return nil
}
func (s *session) read() (packet, error) {
	var prefix [4]byte
	if _, err := io.ReadFull(s.conn, prefix[:]); err != nil {
		return packet{}, err
	}
	size := int(binary.LittleEndian.Uint32(prefix[:]))
	if size < 10 || size > 65536 {
		return packet{}, &rconError{502, "INVALID_PACKET", "Server returned an invalid RCON packet size."}
	}
	s.received += size + 4
	s.packets++
	if s.received > 4_000_000 || s.packets > 16_384 {
		return packet{}, &rconError{502, "RESPONSE_LIMIT", "Server exceeded the session response limit."}
	}
	data := make([]byte, size)
	if _, err := io.ReadFull(s.conn, data); err != nil {
		return packet{}, err
	}
	if data[size-2] != 0 || data[size-1] != 0 {
		return packet{}, &rconError{502, "INVALID_PACKET", "Server returned invalid RCON string terminators."}
	}
	return packet{id: int32(binary.LittleEndian.Uint32(data)), kind: int32(binary.LittleEndian.Uint32(data[4:])), body: data[8 : size-2]}, nil
}
func (s *session) deadline(until time.Time) {
	if deadline, ok := s.ctx.Deadline(); ok && deadline.Before(until) {
		until = deadline
	}
	_ = s.conn.SetDeadline(until)
}
func socketFailure(ctx context.Context, err error, stage string) error {
	var failure *rconError
	if errors.As(err, &failure) {
		return failure
	}
	if ctx.Err() != nil {
		return &rconError{504, "REQUEST_TIMEOUT", "The command request timed out or the helper stopped."}
	}
	var network net.Error
	if errors.As(err, &network) && network.Timeout() {
		return &rconError{504, stage + "_TIMEOUT", "The server did not respond in time. Check the TCP port and firewall."}
	}
	if stage == "CONNECT" {
		return &rconError{502, "CONNECT_FAILED", "Connection refused or unreachable. Check the server's TCP RCON port and firewall."}
	}
	return &rconError{502, "CONNECTION_CLOSED", "The game server closed the RCON connection."}
}
func executeCommands(ctx context.Context, target, password string, commands []string) ([]commandResult, error) {
	dialer := net.Dialer{Timeout: 6 * time.Second, KeepAlive: 15 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", target)
	if err != nil {
		return nil, socketFailure(ctx, err, "CONNECT")
	}
	defer conn.Close()
	return executeSession(ctx, conn, password, commands)
}

func executeSession(ctx context.Context, conn net.Conn, password string, commands []string) ([]commandResult, error) {
	stop := context.AfterFunc(ctx, func() { _ = conn.Close() })
	defer stop()
	s := &session{conn: conn, ctx: ctx}
	seed := make([]byte, 4)
	if _, err := rand.Read(seed); err != nil {
		return nil, err
	}
	id := int32(binary.LittleEndian.Uint32(seed)&0x3fffffff) + 100
	authDeadline := time.Now().Add(6 * time.Second)
	s.deadline(authDeadline)
	if err := s.write(3, id, []byte(password)); err != nil {
		return nil, socketFailure(ctx, err, "AUTH")
	}
	for {
		result, err := s.read()
		if err != nil {
			return nil, socketFailure(ctx, err, "AUTH")
		}
		if result.kind != 2 {
			continue
		}
		if result.id == -1 {
			return nil, &rconError{401, "AUTH_FAILED", "Authentication failed. Check the RCON password before retrying."}
		}
		if result.id == id {
			break
		}
	}
	results := make([]commandResult, 0, len(commands))
	for _, command := range commands {
		id++
		result, err := s.execute(id, command)
		if err != nil {
			return nil, err
		}
		results = append(results, result)
	}
	return results, nil
}
func (s *session) execute(id int32, command string) (commandResult, error) {
	start := time.Now()
	deadline := start.Add(6 * time.Second)
	s.deadline(deadline)
	result := commandResult{Command: command}
	words := strings.Fields(command)
	transition := words[0] == "changelevel" || words[0] == "host_workshop_map" || words[0] == "ds_workshop_changelevel"
	// Only consider a level transition dispatched after its complete packet was written.
	if err := s.write(2, id, []byte(command)); err != nil {
		return result, socketFailure(s.ctx, err, "RESPONSE")
	}
	if err := s.write(0, id, nil); err != nil {
		if transition && s.ctx.Err() == nil {
			return transitionResult(command, start), nil
		}
		return result, socketFailure(s.ctx, err, "RESPONSE")
	}
	var output bytes.Buffer
	received := false
	previousEmpty := false
	for {
		waitUntil := deadline
		if received && time.Now().Add(900*time.Millisecond).Before(waitUntil) {
			waitUntil = time.Now().Add(900 * time.Millisecond)
		}
		s.deadline(waitUntil)
		p, err := s.read()
		if err != nil {
			var failure *rconError
			if errors.As(err, &failure) {
				return result, failure
			}
			if s.ctx.Err() != nil {
				return result, socketFailure(s.ctx, err, "RESPONSE")
			}
			var network net.Error
			quiet := errors.As(err, &network) && network.Timeout()
			closed := errors.Is(err, io.EOF) || isPeerDisconnect(err)
			if received && (quiet || closed) {
				break
			}
			if transition && (quiet || closed) {
				return transitionResult(command, start), nil
			}
			return result, socketFailure(s.ctx, err, "RESPONSE")
		}
		if p.id != id || p.kind != 0 {
			continue
		}
		received = true
		if previousEmpty && bytes.Equal(p.body, []byte{0, 1, 0, 0}) {
			break
		}
		previousEmpty = len(p.body) == 0
		available := 2_000_000 - output.Len()
		if len(p.body) > available {
			output.Write(p.body[:available])
			result.Truncated = true
		} else {
			output.Write(p.body)
		}
	}
	result.Response = strings.TrimRight(output.String(), "\x00")
	result.DurationMS = time.Since(start).Milliseconds()
	return result, nil
}
func transitionResult(command string, start time.Time) commandResult {
	return commandResult{Command: command, Response: "Level-transition command dispatched. The server closed or paused RCON before returning a response.", DurationMS: time.Since(start).Milliseconds()}
}
