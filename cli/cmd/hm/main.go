package main

import (
	"io"
	"os"

	"hm/internal/app"
)

func main() {
	os.Exit(run(os.Args[1:], os.Getenv("HM_API_URL"), os.Stdout, os.Stderr))
}

func run(argv []string, baseURL string, stdout, stderr io.Writer) int {
	return app.Run(app.Options{BaseURL: baseURL}, argv, stdout, stderr)
}
