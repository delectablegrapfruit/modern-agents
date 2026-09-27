.PHONY: build test check sim sheet app run clean

build:
	swift build

test:
	swift test

# The balance bars CI holds the game to (ronin-sim --help lists them); the same commands as its Linux job.
check:
	swift run -c release ronin-sim --mode all --stages 1-20 --seeds 10 --check
	swift run -c release ronin-sim --mode all --stages 1-25 --seeds 4 --perfect --check
	swift run -c release ronin-sim --campaign --mode all --check
	swift run -c release ronin-sim --mode all --stages 26-60 --seeds 2 --perfect --check

sim:
	swift run -c release ronin-sim

sheet:
	mkdir -p build
	swift run ronin-sheet build/figures.svg all
	swift run ronin-sheet build/dead.svg dead
	swift run ronin-sheet build/ragdoll.svg ragdoll

app:
	scripts/make-app.sh release

run: app
	open build/Ronin.app

clean:
	rm -rf .build build
