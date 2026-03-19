package testruntime

import (
	"bytes"
	"time"

	"hm/internal/api"
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

func NewRuntime(baseURL ...string) *Runtime {
	rt := &Runtime{}
	if len(baseURL) > 0 {
		rt.baseURL = baseURL[0]
	}
	return rt
}

func (r *Runtime) BaseURL() string {
	if r == nil || r.baseURL == "" {
		return api.DefaultBaseURL
	}
	return r.baseURL
}

func (r *Runtime) WithClock(now func() time.Time, loc *time.Location) *Runtime {
	if r == nil {
		r = NewRuntime()
	}
	r.now = now
	r.loc = loc
	return r
}

func (r *Runtime) Run(argv []string) Result {
	if r == nil {
		r = NewRuntime()
	}
	var stdout, stderr bytes.Buffer
	code := app.Run(app.Options{BaseURL: r.BaseURL(), Now: r.now, Location: r.loc}, argv, &stdout, &stderr)
	return Result{Stdout: stdout.String(), Stderr: stderr.String(), Code: code}
}
