package main

import (
	"os"

	"hm/internal/app"
)

func main() {
	os.Exit(app.Run(app.Options{BaseURL: os.Getenv("HM_API_URL")}, os.Args[1:], os.Stdout, os.Stderr))
}
