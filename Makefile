.PHONY: build test app run cli clean

build:
	swift build

test:
	swift test

app:
	scripts/make-app.sh release

run: app
	open build/Books.app

cli:
	swift build -c release --product books-cli
	@echo "binary: $$(swift build -c release --show-bin-path)/books-cli"

clean:
	rm -rf .build build
