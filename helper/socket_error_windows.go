package main

import "syscall"

// On Windows, ECONNRESET is a synthetic compatibility value, not Winsock's error.
const peerResetError = syscall.WSAECONNRESET
