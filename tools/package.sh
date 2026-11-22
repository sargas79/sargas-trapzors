#!/bin/sh
# Build dist/module.zip (files at the zip root) from HEAD and copy module.json next to it.
# Honors export-ignore rules in .gitattributes.
set -eu
cd "$(dirname "$0")/.."
mkdir -p dist
git archive --format=zip -o dist/module.zip HEAD
cp module.json dist/module.json
echo "Built dist/module.zip and dist/module.json"
