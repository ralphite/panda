.PHONY: install build test run storybook release

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
	go run ./cmd/panda

storybook:
	npm --prefix web run storybook

release:
	npm --prefix web run build
	rm -rf dist
	mkdir -p dist
	@for p in darwin/amd64 darwin/arm64 linux/amd64 linux/arm64 windows/amd64 windows/arm64; do \
		os=$${p%/*}; arch=$${p#*/}; \
		if [ "$$os" = windows ]; then ext=.exe; else ext=; fi; \
		echo "  panda-$$os-$$arch$$ext"; \
		CGO_ENABLED=0 GOOS=$$os GOARCH=$$arch go build -o dist/panda-$$os-$$arch$$ext ./cmd/panda; \
	done

