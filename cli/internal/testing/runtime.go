package testruntime

import (
	"bytes"

	"hm/internal/app"
)

type Result struct {
	Stdout string
	Stderr string
	Code   int
}

type Runtime struct {
	baseURL string
}

func NewRuntime(baseURL ...string) *Runtime {
	rt := &Runtime{}
	if len(baseURL) > 0 {
		rt.baseURL = baseURL[0]
	}
	return rt
}

func (r *Runtime) Run(argv []string) Result {
	if r == nil {
		r = NewRuntime()
	}
	var stdout, stderr bytes.Buffer
	code := app.Run(app.Options{BaseURL: r.baseURL}, argv, &stdout, &stderr)
	return Result{Stdout: stdout.String(), Stderr: stderr.String(), Code: code}
}
