#!/bin/sh
# Syntax/type check the sources with Mono's compiler. This is a development aid only --
# the real build is build.bat, which uses the .NET Framework compiler shipped with Windows.
set -e
cd "$(dirname "$0")/.."
mcs -target:winexe -out:/tmp/AgentWrangler.exe \
    -langversion:5 \
    -r:System.dll -r:System.Drawing.dll -r:System.Windows.Forms.dll \
    -r:System.Xml.dll -r:Microsoft.CSharp.dll -r:System.Core.dll \
    $(find src -name '*.cs') "$@"
echo "check: OK"
