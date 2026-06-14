.PHONY: install build test run storybook

install:
	npm --prefix web install
	go mod tidy

build:
	npm --prefix web run build
	go build ./cmd/panda

test:
	npm --prefix web test
	go test ./...

run:
	go run ./cmd/panda -addr :8086

storybook:
	npm --prefix web run storybook

