.PHONY: build test app run clean

build:
	swift build

test:
	swift test

app:
	scripts/make-app.sh release

run: app
	open "build/Audio Limiter.app"

clean:
	rm -rf .build build
