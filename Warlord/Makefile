.PHONY: build test app run sim clean

build:
	swift build

test:
	swift test

app:
	scripts/make-app.sh release

run: app
	open build/Warlord.app

sim:
	swift run -c release warlord-sim --realms 6

clean:
	rm -rf .build build
