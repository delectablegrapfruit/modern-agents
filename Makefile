.PHONY: build test app run cli clean

build:
	swift build

test:
	swift test

app:
	scripts/make-app.sh release

run: app
	open build/Winnow.app

cli:
	swift build -c release --product winnow-cli
	@echo "binary: $$(swift build -c release --show-bin-path)/winnow-cli"

clean:
	rm -rf .build build
