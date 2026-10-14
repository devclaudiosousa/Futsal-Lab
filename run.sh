#!/bin/sh
# Testes de lógica (Node 20+). Os testes de browser estão em tests/e2e.py (Playwright).
set -e
cd "$(dirname "$0")/.."
for t in engine onedrive excel epoca player acerto; do node tests/$t.test.mjs; done
node tests/importcs.test.mjs
node tests/tempos.test.mjs
