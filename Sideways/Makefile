.PHONY: build test app run sim clean

build:
	swift build

test:
	swift test

app:
	scripts/make-app.sh release

run: app
	open build/Sideways.app

sim:
	swift run -c release sideways-sim 2

clean:
	rm -rf .build build
