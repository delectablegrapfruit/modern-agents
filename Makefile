.PHONY: build test sim sheet app run clean

build:
	swift build

test:
	swift test

sim:
	swift run -c release ronin-sim

sheet:
	mkdir -p build
	swift run ronin-sheet build/figures.svg all

app:
	scripts/make-app.sh release

run: app
	open build/Ronin.app

clean:
	rm -rf .build build
