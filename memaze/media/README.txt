MEMAZE - YOUR MEDIA
===================

This folder is where Memaze gets everything that makes it yours.
Drop your own files into the sub-folders:

  player/       you: shown in the middle of the screen
  background/   what is shown behind the maze
  win/          plays when you reach the goal
  lose/         plays when you touch the edge or run out of time
  goal/         sits on the goal
  music/        background music

Any kind of file works in any folder - a video as the player is fine.
Leave a folder empty and the game uses its built-in default.


SUPPORTED FORMATS
-----------------

Images   PNG, JPG/JPEG, GIF, APNG, WebP, AVIF, SVG, BMP, ICO
         Animated GIF / APNG / WebP play as animations.
         Transparency is kept (PNG, GIF, APNG, WebP, AVIF, SVG), so a cut-out
         picture of your cat shows just the cat.

Videos   MP4, M4V, WebM, MOV, OGV
         Ordinary videos show as a rectangle. To keep a transparent
         background use:
           - WebM with an alpha channel (VP8 or VP9)  - Chrome, Edge, Firefox
           - MOV with HEVC-with-alpha                   - Safari (Mac, iPhone)

Audio    MP3, OGG/OGA, OPUS, WAV, M4A, AAC, FLAC  (normally in music/)

Other file types, and files whose names start with a dot, are ignored.
Uploads through the browser are limited to 1 GB per file.


LIVE UPDATES
------------

While serve.py is running (double-click Memaze.command on a Mac or
memaze.bat on Windows) the game notices new, changed and deleted files in
these folders within a few seconds - no restart or reload needed.
Files you add or remove from inside the game end up in these same folders.

Your media files are ignored by git (see .gitignore), so they are never
committed or shared by accident.
