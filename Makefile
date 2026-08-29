.PHONY: setup install link check

# Install this repository's dependencies and expose only its isolated launcher.
setup: install link

install:
	npm install

link:
	npm link

check:
	npm run typecheck
