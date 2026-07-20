@echo off
cd /d "%~dp0"
npx tsc -p tsconfig.test.json && node dist-test/tests/geometry.test.js && node dist-test/tests/physics.test.js