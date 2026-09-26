.PHONY: build test sim app run clean

build:
	swift build

test:
	swift test

sim:
	swift run -c release onslaught-sim

app:
	scripts/make-app.sh release

run: app
	open build/Onslaught.app

clean:
	rm -rf .build build
