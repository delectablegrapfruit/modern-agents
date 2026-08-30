# Agent Wrangler

A Windows 7 desktop program that manages Microsoft Agent character files and turns them
into a roster of assistants that live on top of every window, narrate what you are doing,
wander around the screen, and keep offering to help whether or not you want any.

It assumes **DoubleAgent** is installed and running in the background as the Agent server.

The behaviour is modelled on the desktop assistants in *Hypnospace Outlaw*: cheerful,
omnipresent, and calibrated to be irritating. How irritating is a dial, per agent.

---

## What it does

**Manages agent files**

* Scans the usual places for `.acs` / `.acf` characters — `%WINDIR%\msagent\chars`,
  DoubleAgent's own folders, anything listed in the registry, plus folders you add.
* Imports character files into a library folder of its own, renames them, deletes them,
  and shows them in Explorer.
* *Probes* a character — loads it briefly through the Agent server to read its real name,
  description and full animation list, then unloads it. Probe results are cached and fill
  the animation pickers in the behaviour editor.

**Runs several agents at once**

* Any number of characters can be on screen together, each with its own settings, timers
  and personality. They avoid standing on top of each other when they move.
* One character file can back more than one agent: **Duplicate** makes a second, separately
  configured agent from the same file.

**Notices what you are doing**

| Watcher | What it sees |
|---|---|
| Clipboard | Anything copied, and what kind of thing it was |
| Files | Files appearing, vanishing and being renamed in the folders you nominate |
| Downloads | Partial-download extensions (`.crdownload`, `.part`, …) appearing and being renamed, which is how it distinguishes "started" from "finished" |
| Foreground window | Programs being opened and switched to, and the document name in the title bar |
| Idle | When you stop touching the machine, and when you come back |

**Pesters you about it**

Each agent has a **pester level from 0 to 10** that drives every rate at once:

| Level | | Unprompted remarks | Reacts to an event | Moves | Quiet time between lines |
|---|---|---|---|---|---|
| 0 | Muzzled | never | never | never | — |
| 1 | Barely there | every ~18 min | 12% | every ~6 min | 145 s |
| 3 | Chatty | every ~6 min | 31% | every ~2½ min | 52 s |
| 5 | Clingy | every ~2 min | 51% | every ~55 s | 19 s |
| 7 | Overbearing | every ~45 s | 71% | every ~21 s | 7 s |
| 8 | Relentless | every ~26 s | 80% | every ~13 s | 4 s |
| 10 | Total saturation | every ~9 s | always | every ~5 s | 1.5 s |

Intervals are geometric — the top of the dial is where the numbers move fastest — and every
one is jittered by ±45%, so nothing arrives on a metronome. From level 9 an agent stops
waiting for its own sentences to finish. A hard floor of 0.75 s between lines applies at
every level, because the engine ticks four times a second and would otherwise say four
things in one.

A **master dial** in the bottom bar scales the whole roster at once: 5 is neutral, 10
roughly doubles every agent, 0 muzzles all of them.

**Per-agent settings**

* Personality — *Chirpy*, *Corporate*, *Gremlin* or *Sleepy*, each with its own bank of lines
* Movement — *Stay*, *Wander*, *Follow cursor*, *Perch* (home corner) or *Orbit* the active window; plus speed and home corner
* Which activities it is allowed to comment on, individually
* Whether it may interrupt with offers of help
* Whether it talks over its own unfinished sentences
* Whether it reads copied text back out loud (off by default)
* Whether its prompts steal focus from what you are typing
* Whether the **"No thanks"** button dodges your pointer
* Which animations it plays for greeting, big news and resting

**Getting rid of them**

* **Ctrl+Alt+Shift+H** — panic: everyone off screen instantly, still loaded, one keypress from coming back
* **Ctrl+Alt+Shift+A** — bring the manager window back
* **Muzzle everyone** — they stay on screen but stop talking and moving
* Closing the manager window leaves it running in the tray; **Exit** on the tray menu quits properly

---

## Requirements

* Windows 7 (or later)
* .NET Framework 4.0 or newer
* **DoubleAgent**, installed and registered as the Agent server

Speech is optional. Without a SAPI voice installed, the agents still say everything in
word balloons — which is how Microsoft Agent has always behaved.

The Agent server is reached by late binding, so there are no interop assemblies to build
or ship. The program tries `Agent.Control.2`, `Agent.Control`, `DoubleAgent.Control.2`,
`DoubleAgent.Control` and `DoubleAgentCtl.Control` in that order; the Diagnostics tab shows
which one answered, its CLSID and the module registered behind it, and lets you name a
different ProgID if your installation registers something else.

## Building

No Visual Studio needed. From a command prompt in the repository root:

```
build.bat
```

That uses the C# compiler already present at
`%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe` and writes `build\AgentWrangler.exe`.

`AgentWrangler.csproj` is also provided if you would rather open it in Visual Studio.

### Why it builds 32-bit

`build.bat` passes `/platform:x86`. DoubleAgent and the original Microsoft Agent are
in-process 32-bit COM servers, and a 64-bit process cannot load one. A 32-bit build runs
under WOW64 on 64-bit Windows without any trouble. If your Agent server is 64-bit, change
`/platform:x86` to `/platform:anycpu` in `build.bat`.

## Where things are kept

Everything lives under `%APPDATA%\AgentWrangler`:

| File | |
|---|---|
| `settings.xml` | Agents, behaviour settings, folder lists, cached probe results |
| `phrasebook.xml` | Every line the agents can say — written on first run, yours to edit |
| `agentwrangler.log` | What happened, including every failed call to the Agent server |
| `Characters\` | Character files imported through the manager |

### Editing the phrasebook

`phrasebook.xml` is plain XML. A bank of lines is chosen by activity and personality;
`Persona="Any"` makes a bank shared by everyone.

```xml
<Bank Kind="DownloadFinished" Persona="Gremlin">
  <Line>{file} is inside now. it is one of us. it lives in {folder}.</Line>
</Bank>
```

Tokens: `{file}` `{oldfile}` `{folder}` `{ext}` `{path}` `{app}` `{process}` `{title}`
`{doc}` `{clip}` `{minutes}` `{agent}` `{user}` `{time}` `{count}`. A token the watcher
could not fill in becomes a vague stand-in rather than showing braces. Use
**Reload phrasebook** on the Diagnostics tab to pick up edits without restarting.

If the file is missing or unreadable, the built-in lines are used and a note goes in the log.

---

## Notes on what it can and cannot do

**It never reads your clipboard unless an agent is set to quote it.** With
*"Reads copied text back out loud"* off — the default — the only thing that leaves the
clipboard is the fact that it changed and what kind of content it holds. When it is on,
text is flattened to a single line and truncated to 60 characters.

**Nothing leaves the machine.** There is no network code in this program.

**The things an agent can offer to do are deliberately trivial and harmless**: open a
folder in Explorer, copy a file name to the clipboard, give you a useless tip, move itself,
or promise to come back. An assistant that interrupts every few seconds — with a "No"
button that may be running away from your pointer — has no business being able to launch a
program or open a file you just downloaded, so it cannot.

**Interaction is through the prompt windows, not the character itself.** Clicking a
character does nothing. Microsoft Agent delivers clicks through a COM connection point
whose event IDs vary between implementations; rather than guess at them, the program uses
its own always-on-top prompt windows, which also gives the Yes/No/Never buttons somewhere
to live.

**Agents are unloaded when the program exits.** If Agent Wrangler is killed rather than
closed, a character can be left on screen with nothing driving it; restarting and exiting
cleanly clears it.

## Layout of the source

```
src/
  Program.cs          entry point, single instance, STA
  AppHost.cs          owns everything and the order it starts and stops in
  Diagnostics.cs      log to memory and disk
  Agents/             the COM layer: server connection, one character, the roster
  Behavior/           activity events, the pester curve, the phrasebook, the engine
  Watchers/           clipboard, files, foreground window, idle
  Library/            finding and cataloguing .acs files
  Config/             settings and per-agent profiles, persisted as XML
  Ui/                 manager window, behaviour editor, prompt windows, theme
```

The pester engine runs entirely on the UI thread, once every 250 ms, because the Agent
control is apartment-threaded. Watchers raise events on whatever thread Windows gives them
and hand them to the engine through a lock-protected queue.

`tools/` holds two development aids for working on this from a non-Windows machine:
`check.sh` type-checks the sources with Mono's compiler, and `smoke.sh` runs the checks in
`tools/smoketest/` over the parts that need neither Windows nor a COM server — the pester
curve, token substitution, phrasebook coverage, and the XML round trip every setting
depends on. Neither is needed to build or run the program.
