@echo off
REM ---------------------------------------------------------------------------
REM  Builds Agent Wrangler with the C# compiler that ships with the .NET
REM  Framework, so no copy of Visual Studio is needed. Windows 7 with .NET
REM  Framework 4.0 or later already has everything this script uses.
REM
REM  Output: build\AgentWrangler.exe
REM ---------------------------------------------------------------------------
setlocal enabledelayedexpansion

set FRAMEWORK=%WINDIR%\Microsoft.NET\Framework\v4.0.30319
set CSC=%FRAMEWORK%\csc.exe

if not exist "%CSC%" (
    echo.
    echo ERROR: Could not find the C# compiler at:
    echo        %CSC%
    echo.
    echo Install the .NET Framework 4 Client Profile ^(or later^) and try again.
    exit /b 1
)

if not exist "build" mkdir build

REM csc has no recursive wildcard, so collect the sources into a response file.
if exist "build\sources.rsp" del "build\sources.rsp"
for /r "%~dp0src" %%F in (*.cs) do echo "%%F">>"build\sources.rsp"

if not exist "build\sources.rsp" (
    echo ERROR: No source files found under src\.
    exit /b 1
)

echo Compiling Agent Wrangler...

REM /platform:x86 is deliberate. DoubleAgent and the original Microsoft Agent are
REM in-process 32-bit COM servers, and a 64-bit process cannot load one. Running
REM 32-bit under WOW64 works on every edition of Windows 7. If you know your Agent
REM server is 64-bit, change this to /platform:anycpu.
"%CSC%" /nologo /target:winexe /platform:x86 /optimize+ /warn:4 ^
    /out:build\AgentWrangler.exe ^
    /win32manifest:"%~dp0src\app.manifest" ^
    /reference:System.dll ^
    /reference:System.Core.dll ^
    /reference:System.Drawing.dll ^
    /reference:System.Windows.Forms.dll ^
    /reference:System.Xml.dll ^
    /reference:Microsoft.CSharp.dll ^
    @build\sources.rsp

if errorlevel 1 (
    echo.
    echo BUILD FAILED.
    exit /b 1
)

del "build\sources.rsp"

echo.
echo Built build\AgentWrangler.exe
echo Run it with DoubleAgent installed and the Agent server available.
endlocal
