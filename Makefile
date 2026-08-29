.PHONY: setup install link hooks check prompt-snapshot

# Install this repository's dependencies and expose only its isolated launcher.
setup: install link hooks

install:
	npm install

link:
	npm link

hooks:
	git config --local core.hooksPath .githooks

check:
	npm run typecheck

prompt-snapshot:
	npm run prompt:snapshot
