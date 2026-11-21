package testruntime

import (
	"bytes"
	"time"

	"hm/internal/app"
)

type Result struct {
	Stdout string
	Stderr string
	Code   int
}

type Runtime struct {
	baseURL string
	now     func() time.Time
	loc     *time.Location
}

func NewRuntime(baseURL string) *Runtime {
	return &Runtime{baseURL: baseURL}
}

func (r *Runtime) WithClock(now func() time.Time, loc *time.Location) *Runtime {
	r.now = now
	r.loc = loc
	return r
}

func (r *Runtime) Run(argv []string) Result {
	var stdout, stderr bytes.Buffer
	code := app.Run(app.Options{BaseURL: r.baseURL, Now: r.now, Location: r.loc}, argv, &stdout, &stderr)
	return Result{Stdout: stdout.String(), Stderr: stderr.String(), Code: code}
}
