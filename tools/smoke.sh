#!/bin/sh
# Builds and runs the smoke test under Mono. Development aid; see tools/check.sh.
set -e
cd "$(dirname "$0")/.."
mcs -target:exe -out:/tmp/aw-smoke.exe -langversion:5 -main:AgentWrangler.Tests.SmokeTest \
    -r:System.dll -r:System.Drawing.dll -r:System.Windows.Forms.dll \
    -r:System.Xml.dll -r:Microsoft.CSharp.dll -r:System.Core.dll \
    $(find src -name '*.cs') tools/smoketest/SmokeTest.cs
mono /tmp/aw-smoke.exe
