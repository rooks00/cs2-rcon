//go:build !windows

package main

import "syscall"

const peerResetError = syscall.ECONNRESET
