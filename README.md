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

**Per-agent settings**, grouped into sections that each reset on their own:

* **Personality** — *Chirpy*, *Corporate*, *Gremlin*, *Sleepy*, *Bureaucrat* or *Fan*, each with its own bank of lines
* **Pestering** — the 0–10 level, a quiet-time override, and whether it talks over its own unfinished sentences
* **Movement** — see below; plus speed and home corner
* **Appearance and voice** — drawn size from 25% to 300% of the character's own, which installed speech voice to use, and the animations for greeting, big news and resting
* **Habits** — whether it may interrupt with offers, whether it reads copied text aloud (off by default), whether prompts steal focus, and whether the decline buttons dodge your pointer
* **Reacts to** — every activity, individually

**Movement styles** do genuinely different things:

| | |
|---|---|
| Stay put | Placed in its home corner once and never moves again |
| Wander | Walks to an unrelated part of the screen every so often |
| Perch in a corner | Lives in its home corner, leaving for the odd excursion and returning |
| Follow the pointer | Shadows the mouse continuously |
| Orbit the window | Circles the window you are working in |

The first three are scheduled hops, and the Agent server animates the character across the
gap. The last two are integrated frame by frame at about 25 fps: the character accelerates
towards where it wants to be and eases off as it arrives, so following the pointer speeds
up and slows down rather than starting and stopping, and an orbit is a continuous circle
rather than a series of jumps. A character's requests are serialized by the Agent server,
so movement pauses while an agent is speaking and picks up from wherever it ended up.

**Hold still while I am typing**, on the Setup tab and **on by default**, stops every agent
moving while the caret is in a text field — a character walking through the sentence you
are writing is the one interruption that actually costs you something. They carry on
talking; only movement is held. Detection is the caret reported for the foreground window,
falling back to the focused control's window class for applications that draw their own
text cursor.

**Dialogue** cycles by default: every line in a bank is used **twice** before any of them
comes round again, and never twice in a row — including across the join between one cycle
and the next. The cycle is **shared by the whole roster**, so two agents with the same
personality work through the same sequence instead of both repeating the openers.
*Random lines instead of a full rotation* on the Setup tab turns that off in favour of
independent sampling.

**Getting rid of them**

* **Ctrl+Alt+Shift+H** — panic: everyone off screen instantly, still loaded, one keypress from coming back
* **Ctrl+Alt+Shift+A** — bring the manager window back
* **Muzzle everyone** — they stay on screen but stop talking and moving
* **Hold still while I am typing** — movement pauses whenever a text field has the caret
* The **Pestering** dial at the bottom scales every agent's own level rather than setting a
  floor: 5 leaves them as configured, 10 roughly doubles them, 0 silences the lot
* Closing the manager window leaves it running in the tray; **Exit** on the tray menu quits properly

---

## Installation

Two of these steps need administrator rights and two do not. Agent Wrangler itself does
not — see [Administrator access](#administrator-access) below.

### 1. Check for the .NET Framework — *administrator, if missing*

Windows 7 SP1 ships with .NET 3.5.1, which is not enough. You have version 4 already if
this folder exists:

```
%WINDIR%\Microsoft.NET\Framework\v4.0.30319
```

If it does not, install the **.NET Framework 4** (or any later 4.x — 4.8 is the last one
that supports Windows 7). Its installer asks for administrator rights itself.

### 2. Install DoubleAgent — *administrator*

DoubleAgent is the Agent server that actually draws the characters, speaks and animates
them. Agent Wrangler is only the manager; without a server it will start, catalogue files
and let you edit behaviour, but nothing will appear on screen.

Run DoubleAgent's installer and let it register itself as the Microsoft Agent replacement.
Registering a COM server writes under `HKEY_CLASSES_ROOT`, so its installer asks for
administrator rights. **This is the step people expect Agent Wrangler to need
administrator rights for — the requirement belongs to DoubleAgent's installer, once.**

To check it took: start Agent Wrangler and look at the top right of the window. It should
read *Connected via Agent.Control.2*. The **Diagnostics** tab shows the ProgID, the CLSID
and the DLL registered behind it, so you can confirm DoubleAgent is answering rather than
something else.

### 3. Put some characters where it can find them — *no administrator*

Agent Wrangler looks in `%WINDIR%\msagent\chars`, DoubleAgent's own character folders,
anything the registry points at, and any folder you add on the **Folders** tab.

The easy route needs no rights at all: **Import file…** copies a `.acs` into
`%APPDATA%\AgentWrangler\Characters`, which is yours to write to. Dropping characters
into `%WINDIR%\msagent\chars` by hand works too, but that folder is protected, so
Explorer will ask for administrator access when you copy into it.

### 4. Build it — *no administrator*

From a command prompt in the repository root:

```
build.bat
```

That uses the C# compiler already present at
`%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe` — no Visual Studio needed — and
writes `build\AgentWrangler.exe`. It is a single self-contained executable; there is
nothing to install and nothing to register. Copy it wherever you like.

`AgentWrangler.csproj` is also provided if you would rather open it in Visual Studio.

### 5. Run it — *no administrator*

Double-click `AgentWrangler.exe`. On first run it creates `%APPDATA%\AgentWrangler`,
writes a starter `settings.xml` and `phrasebook.xml`, and scans for characters.

Then:

1. Pick an agent in the list on the left.
2. **Inspect** it — this loads the character briefly to read its real name, size and
   animation list, which fill the pickers on the Behaviour tab.
3. On the **Behaviour** tab, choose a personality and set the pester level.
4. **Summon**. The character appears and starts narrating.
5. Tick *Summon this agent when the manager starts* to have it come back next time, and
   **Start when I log in** on the Setup tab to have the manager itself start with Windows.

Everything else — duplicating an agent, importing, renaming or deleting character files —
is on **More...** and on the right-click menu of the agent list.

If nothing appears, the Setup tab lists every ProgID that was tried and why each one
failed.

## Administrator access

**Agent Wrangler runs as a normal user and asks for nothing at startup.** Its settings,
log, phrasebook and imported characters all live under `%APPDATA%`; the only registry key
it writes is the per-user `Run` key; and connecting to the Agent server, watching the
clipboard, hooking foreground-window changes and registering hotkeys all work unelevated.

One thing does need administrator rights: **renaming or deleting a character file that
lives in a protected folder** — `%WINDIR%\msagent\chars` and `Program Files`, where most
characters are installed.

Those two operations are tried normally first. If Windows refuses, the program
automatically re-runs just that one operation through a short-lived elevated copy of
itself, so the consent prompt appears by itself at the moment it is needed and nothing
else runs with extra rights. The confirmation dialog tells you in advance when a file is
somewhere that will require it, and the Diagnostics tab marks each character folder
`[writable]` or `[protected]`.

If you would rather have the whole session elevated — to clear out several protected
characters without answering a prompt each time — use **Run as administrator** on the
Diagnostics tab or the tray menu. It restarts the program elevated.

The elevated helper is deliberately narrow: it accepts only `.acs` and `.acf` files, will
not move a file out of its own folder, will not overwrite an existing file, and does
nothing else. Reaching it costs a consent prompt either way, so it grants no rights the
caller did not already have.

### Why it does not simply request administrator rights at startup

Marking the program `requireAdministrator` would be simpler, and it is the wrong trade:

* Windows 7 will not launch an elevated program from the `Run` key, so **Start when I log
  in** would silently stop working.
* An elevated process cannot accept files dragged from an unelevated Explorer window.
* Everything the program does for hours at a time — watching, talking, moving — needs no
  rights at all. Only two menu items do.

If you want it anyway, change `asInvoker` to `requireAdministrator` in `src/app.manifest`
and rebuild. Expect the login setting to stop working.

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

### Why it builds 32-bit

`build.bat` passes `/platform:x86`. DoubleAgent and the original Microsoft Agent are
in-process 32-bit COM servers, and a 64-bit process cannot load one. A 32-bit build runs
under WOW64 on 64-bit Windows without any trouble. If your Agent server is 64-bit, change
`/platform:x86` to `/platform:anycpu` in `build.bat`.

## Where things are kept

Everything lives under `%APPDATA%\AgentWrangler`:

| File | |
|---|---|
| `settings.xml` | Agents, behaviour settings, folder lists, cached character details |
| `phrasebook.xml` | Every line the agents can say — written on first run, yours to edit |
| `agentwrangler.log` | What happened, including every failed call to the Agent server |
| `Characters\` | Character files imported through the manager |

To uninstall: delete the executable, delete that folder, and untick **Start when I log in**
first (or remove the `AgentWrangler` value from
`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`). Nothing else is written anywhere.

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
could not fill in becomes a vague stand-in rather than showing braces. Use **Reload lines**
on the Setup tab to pick up edits without restarting.

If the file is missing or unreadable, the built-in lines are used and a note goes in the log.

---

## Notes on what it can and cannot do

**It never reads your clipboard unless an agent is set to quote it.** With
*"Reads copied text back out loud"* off — the default — the only thing that leaves the
clipboard is the fact that it changed and what kind of content it holds. When it is on,
text is flattened to a single line and truncated to 60 characters.

**Nothing leaves the machine.** There is no network code in this program.

**The things an agent can offer to do are deliberately trivial and harmless**: open a
folder in Explorer, copy or suggest a file name, read out a file's size, count what is in a
folder, add a folder to the watch list, give you a useless tip, move itself, promise to
come back, go quiet for a minute, or turn its own pestering down a notch. An assistant that
interrupts every few seconds — with decline buttons that may be running away from your
pointer — has no business being able to launch a program or open a file you just
downloaded, so it cannot.

**Declining an offer declines that offer, and nothing more.** Neither *No thanks* nor
*Never ask* removes anything from circulation.

**Picking a voice is best-effort.** Installed voices are listed through SAPI and applied to
the character's speech mode. A character or server that will not accept the change keeps
the voice it was authored with, and the log says so.

**Interaction is through the prompt windows, not the character itself.** Clicking a
character does nothing. Microsoft Agent delivers clicks through a COM connection point
whose event IDs vary between implementations; rather than guess at them, the program uses
its own always-on-top prompt windows, which also gives the Yes/No/Never buttons somewhere
to live.

**Agents are unloaded when the program exits.** If Agent Wrangler is killed rather than
closed, a character can be left on screen with nothing driving it; restarting and exiting
cleanly clears it.

**It runs as a normal user**, and asks Windows for administrator rights only for the two
file operations that genuinely need them. See [Administrator access](#administrator-access).

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
curve, token substitution, phrasebook coverage, the XML round trip every setting depends
on, the guards on the elevated file helper, the line rotation, the movement integrator,
the text-field heuristic, per-section resets, and the splitter sizing rules. Neither is needed to build or run the
program.

Neither substitutes for running it on Windows. Mono compiles the sources but does not share
the .NET Framework's runtime validation: `SplitContainer` on Mono silently accepts a
minimum size larger than the control's current width, where the .NET Framework throws — a
difference that once stopped the program from starting at all while every check here
passed. Anything touching COM, the Win32 hooks or Windows Forms' own argument checking has
to be tried on the real thing.
