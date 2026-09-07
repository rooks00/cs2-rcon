package main

import (
	"errors"
	"syscall"
)

// On Windows, ECONNRESET is a synthetic compatibility value, not Winsock's error.
const peerResetError = syscall.WSAECONNRESET

func isPeerDisconnect(err error) bool {
	return errors.Is(err, peerResetError) || errors.Is(err, syscall.WSAECONNABORTED) || errors.Is(err, syscall.ERROR_NETNAME_DELETED)
}
