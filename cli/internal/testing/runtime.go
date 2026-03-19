package testruntime

import (
	"bytes"
	"io"

	"hm/internal/app"
)

type Result struct {
	Stdout string
	Stderr string
	Code   int
}

type Runtime struct {
	baseURL string
	run     func([]string, io.Writer, io.Writer) int
}

func NewRuntime(baseURL ...string) *Runtime {
	rt := &Runtime{run: app.Run}
	if len(baseURL) > 0 {
		rt.baseURL = baseURL[0]
	}
	return rt
}

func (r *Runtime) Run(argv []string) Result {
	if r == nil {
		r = NewRuntime()
	}
	run := r.run
	if run == nil {
		run = app.Run
	}
	var stdout, stderr bytes.Buffer
	code := run(argv, &stdout, &stderr)
	return Result{Stdout: stdout.String(), Stderr: stderr.String(), Code: code}
}
