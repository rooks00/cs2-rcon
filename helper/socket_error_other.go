//go:build !windows

package main

import (
	"errors"
	"syscall"
)

const peerResetError = syscall.ECONNRESET

func isPeerDisconnect(err error) bool { return errors.Is(err, peerResetError) }
