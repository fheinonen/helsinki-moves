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
	run func([]string, io.Writer, io.Writer) int
}

func NewRuntime() *Runtime {
	return &Runtime{run: app.Run}
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
