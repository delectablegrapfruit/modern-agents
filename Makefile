.PHONY: build test app run cli clean

build:
	swift build

test:
	swift test

app:
	scripts/make-app.sh release

run: app
	open build/Sift.app

cli:
	swift build -c release --product sift-cli
	@echo "binary: $$(swift build -c release --show-bin-path)/sift-cli"

clean:
	rm -rf .build build
