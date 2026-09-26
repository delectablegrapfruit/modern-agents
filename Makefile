.PHONY: build test sim app run clean

build:
	swift build

test:
	swift test

sim:
	swift run -c release ronin-sim

app:
	scripts/make-app.sh release

run: app
	open build/Ronin.app

clean:
	rm -rf .build build
