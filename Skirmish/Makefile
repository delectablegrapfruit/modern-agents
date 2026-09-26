.PHONY: build test sim app run clean

build:
	swift build

test:
	swift test

sim:
	swift run -c release skirmish-sim

app:
	scripts/make-app.sh release

run: app
	open build/Skirmish.app

clean:
	rm -rf .build build
