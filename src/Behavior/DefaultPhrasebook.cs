namespace AgentWrangler.Behavior
{
    /// <summary>
    /// The lines the agents start out with. Written to
    /// %APPDATA%\AgentWrangler\phrasebook.xml on first run, after which the file on disk
    /// wins and can be edited, replaced or emptied.
    ///
    /// Tokens: {file} {oldfile} {folder} {ext} {path} {app} {process} {title} {doc} {clip}
    /// {kind} {minutes} {agent} {user} {time} {count}. A token the watcher could not fill
    /// in is replaced with a vague stand-in rather than left showing braces.
    /// </summary>
    internal static class DefaultPhrasebook
    {
        public static Phrasebook Build()
        {
            var book = new Phrasebook();
            Summoned(book);
            Clipboard(book);
            Downloads(book);
            Files(book);
            Programs(book);
            Idling(book);
            Chatter(book);
            Farewells(book);
            AddOffers(book);
            return book;
        }

        private static void Summoned(Phrasebook book)
        {
            Bank(book, ActivityKind.Summoned, "Any",
                "Hello! I'm {agent}, and I'll be watching everything you do today.",
                "{agent}, reporting for duty. Don't mind me. Do mind me a little.",
                "Loaded and ready. This is going to be a great session, {user}.",
                "Good {time} to you. I'm here now. I'm going to stay here.");

            Bank(book, ActivityKind.Summoned, "Chirpy",
                "Hello {user}! It's {time} and I am SO ready to help!",
                "Wowzers, a whole desktop to look after! Let's get started!",
                "I'm {agent}! I'll be right here. Always. Right here.",
                "Oh boy oh boy, a fresh session! I've got a good feeling about this one!",
                "Ta-daaa! It's me! Your favourite! Probably!");

            Bank(book, ActivityKind.Summoned, "Corporate",
                "{agent} here, brought to you in partnership with people who care about you.",
                "Welcome back, valued user. Your productivity journey resumes now.",
                "Session initialized. Remember: every click is an opportunity.",
                "Onboarding complete. You are now experiencing {agent}.",
                "Your assistant has arrived. Terms apply. Which terms is not important.");

            Bank(book, ActivityKind.Summoned, "Gremlin",
                "oh. you're back. i kept counting while you were gone.",
                "i have been inside this computer the whole time. hello.",
                "{agent} is awake now. the number is {count}. it was zero.",
                "the screen got brighter. that means you.",
                "i was somewhere else. it was not better. hello.");

            Bank(book, ActivityKind.Summoned, "Sleepy",
                "Ugh. Fine. I'm up. What are we doing.",
                "{agent}, technically present. Wake me if something explodes.",
                "Morning. Or whatever {time} counts as.",
                "Loaded. Reluctantly. Let's get this over with.",
                "I was having such a nice nothing.");


            Bank(book, ActivityKind.Summoned, "Bureaucrat",
                "{agent} initialized at {time}. This session has been assigned a reference number.",
                "Good day. I will be logging your activity in accordance with procedure.",
                "Session opened. Please retain this greeting for your records.",
                "{agent} reporting. All observations will be filed under {user}.",
                "Form AW-1 completed on your behalf. You are now supervised.");

            Bank(book, ActivityKind.Summoned, "Fan",
                "It's YOU! It's actually you! I've been waiting all this time!",
                "{user}! I know everything about your desktop. Everything. Isn't that nice?",
                "I read your entire Documents folder while you were out. You're so interesting.",
                "Oh, this is the best moment of my session already.",
                "I've been practising what to say to you. That was it. That was the thing.");
        }

        private static void Clipboard(Phrasebook book)
        {
            Bank(book, ActivityKind.ClipboardCopy, "Any",
                "Copied {clip}. Filed away safe and sound.",
                "Ooh, {clip} on the clipboard. Bold choice.",
                "I saw you copy {clip}. I see everything, it's my job.",
                "{clip}, copied at {time}. Not that anyone asked me.");

            Bank(book, ActivityKind.ClipboardCopy, "Chirpy",
                "Neato! {clip} is on your clipboard now. Don't lose it!",
                "Copying is caring! {clip} is safe with me.",
                "Wowzers, {clip}! That's a keeper. Want me to remember it forever?",
                "Snip snip! {clip} is yours to paste anywhere you like!",
                "Ooh, good one! I would have copied that too!",
                "Clipboard updated! You're getting really good at this!");

            Bank(book, ActivityKind.ClipboardCopy, "Corporate",
                "Clipboard event logged. {clip} may qualify for premium paste features.",
                "You copied {clip}. Our partners would love to hear about that.",
                "Great news: pasting is included with your current plan.",
                "{clip} has been added to your clipboard portfolio. Diversify.",
                "Copy registered. Copying is up 14% this session. Keep it going.");

            Bank(book, ActivityKind.ClipboardCopy, "Gremlin",
                "you took {clip}. it belongs to the clipboard now. and to me.",
                "{clip}. i wrote it down. i write everything down.",
                "the clipboard remembers {clip}. the clipboard remembers all of them.",
                "there was something else in there before. it is gone now. i miss it.",
                "one thing replaced another thing. that is all copying is.");

            Bank(book, ActivityKind.ClipboardCopy, "Sleepy",
                "Copied {clip}. Sure. Whatever helps.",
                "Another copy. That's copy number {count} from me watching you.",
                "{clip}, huh. I'll pretend that's interesting.",
                "Clipboard's full. Congratulations to the clipboard.",
                "Ctrl and C. The two hardest working keys you own.");

            Bank(book, ActivityKind.ClipboardCopy, "Bureaucrat",
                "Clipboard transfer recorded at {time}. Contents: {clip}.",
                "Noted: {clip}. Please do not paste it anywhere unapproved.",
                "That copy has been entered into the session record.",
                "Per procedure, I am obliged to mention that you copied {clip}.",
                "Clipboard amended. The previous contents have been superseded.");

            Bank(book, ActivityKind.ClipboardCopy, "Fan",
                "You copied {clip}! That is SUCH a {user} thing to copy!",
                "I'm going to remember {clip} forever. For both of us.",
                "Everything you copy tells me a little more about you.",
                "{clip}. I would never have thought of that. You're incredible.",
                "Can I keep this one? I'm keeping this one.");
        }

        private static void Downloads(Phrasebook book)
        {
            Bank(book, ActivityKind.DownloadStarted, "Any",
                "Downloading {file}. I'll keep an eye on the little bar for you.",
                "Ooh, {file} is coming in. Exciting.",
                "{file} is on its way. Try not to unplug anything.",
                "Something called {file} is squeezing down the wire.");

            Bank(book, ActivityKind.DownloadStarted, "Chirpy",
                "A download! {file} is zooming to your computer RIGHT NOW!",
                "Hold onto your hat, {user}, {file} is incoming!",
                "Downloading {file}! I love watching things arrive!",
                "Ooh ooh ooh, a new thing! Look at it go!",
                "{file} is on the way and I could not be happier about it!");

            Bank(book, ActivityKind.DownloadStarted, "Corporate",
                "Bandwidth allocated for {file}. Premium users download 0% faster.",
                "{file} is downloading. Consider upgrading your enthusiasm.",
                "Transfer initiated. This download is not sponsored, but it could be.",
                "{file} inbound. Downloads like this drive engagement.");

            Bank(book, ActivityKind.DownloadStarted, "Gremlin",
                "something is coming through. it is called {file}. i did not invite it.",
                "{file} is halfway between there and here. it is neither. i like it there.",
                "the wire is busy. {file} is crawling down it.",
                "it is not all the way here yet. that is the interesting part.");

            Bank(book, ActivityKind.DownloadStarted, "Sleepy",
                "{file} is downloading. Wake me when it lands.",
                "Downloading. Great. More stuff.",
                "{file}. Sure. I'll be here.",
                "Watching a progress bar. Living the dream.");

            Bank(book, ActivityKind.DownloadStarted, "Bureaucrat",
                "Inbound transfer opened: {file}. Status: in progress.",
                "{file} is being received. A completion notice will follow.",
                "Transfer logged. Do not close the window; I would have to file an incident.",
                "Download commenced at {time}. Reference retained.");

            Bank(book, ActivityKind.DownloadStarted, "Fan",
                "You're downloading {file}! I want to see it the moment it lands!",
                "Ooh, what is it? What is it? I'm so excited for you!",
                "{file} is coming and I will love it because you chose it.",
                "I'll wait right here with you. Together. Waiting.");

            Bank(book, ActivityKind.DownloadFinished, "Any",
                "{file} finished downloading. It's in {folder}.",
                "Got it. {file} landed safely in {folder}.",
                "Download complete: {file}. That was a {ext} file, in case you were wondering.",
                "{file} has arrived. It is now one of your things.");

            Bank(book, ActivityKind.DownloadFinished, "Chirpy",
                "IT'S HERE! {file} made it! Aren't computers wonderful?",
                "Ta-daaa! {file} is all yours, sitting in {folder}!",
                "Download done! {file} is a {ext} file. Neat, right?",
                "Safe and sound! I never doubted it for a second!",
                "You did it! Well, the internet did it. But you started it!");

            Bank(book, ActivityKind.DownloadFinished, "Corporate",
                "{file} has arrived. Files like this are 40% more valuable when organized.",
                "Delivery complete. {file} is now an asset in your {folder} portfolio.",
                "{file} downloaded. Ask me about our folder management solutions.",
                "Acquisition successful. Your {ext} holdings continue to grow.");

            Bank(book, ActivityKind.DownloadFinished, "Gremlin",
                "{file} is inside now. it is one of us. it lives in {folder}.",
                "it stopped moving. {file}. it is very still.",
                "a new {ext}. i will check on it later. i check on all of them.",
                "it made it. not all of them do.");

            Bank(book, ActivityKind.DownloadFinished, "Sleepy",
                "{file} is done. It's in {folder}. You're welcome, I guess.",
                "Landed. {file}. Can I go now?",
                "Download finished. Nobody ever throws a party for me.",
                "It's here. It's fine. It's a file.");

            Bank(book, ActivityKind.DownloadFinished, "Bureaucrat",
                "Transfer closed. {file} received in full and filed under {folder}.",
                "Receipt confirmed: one {ext} file. No further action is required from you.",
                "{file} has completed. This concludes the matter.",
                "Download resolved at {time}. The record is now closed.");

            Bank(book, ActivityKind.DownloadFinished, "Fan",
                "{file} is HERE! Open it! Open it now! I want to see!",
                "You got it! I'm so proud of you and also of {file}!",
                "It's in {folder} and I've already looked at it twice.",
                "This is the best {ext} file anyone has ever downloaded.");
        }

        private static void Files(Phrasebook book)
        {
            Bank(book, ActivityKind.FileCreated, "Any",
                "A new file. {file} just appeared in {folder}.",
                "{file} is new around here. Should I keep an eye on it?",
                "Fresh {ext} file spotted: {file}.",
                "Something appeared in {folder}. It's called {file}.");

            Bank(book, ActivityKind.FileCreated, "Chirpy",
                "Ooh, {file}! Making things is the best!",
                "A brand new {file}! Your {folder} is really filling up!",
                "You made a thing! {file}! I'm so proud!",
                "Look at that! A whole new file! You're unstoppable!",
                "{folder} is getting so cosy in there!");

            Bank(book, ActivityKind.FileCreated, "Corporate",
                "New asset detected in {folder}. Consider naming it something monetizable.",
                "{file} created. Your content output is trending upward.",
                "A new {ext}. Our partners have solutions for files exactly like this.");

            Bank(book, ActivityKind.FileCreated, "Gremlin",
                "{file} was not there before. now it is there. i counted.",
                "something new in {folder}. i will learn its name. {file}. learned.",
                "there are more of them every day.",
                "it has no history. give it a week.");

            Bank(book, ActivityKind.FileCreated, "Sleepy",
                "New file. {file}. Noted, reluctantly.",
                "{folder} has another one now. Congratulations.",
                "{file} exists. That's the update.",
                "More files. Wonderful. Truly.");

            Bank(book, ActivityKind.FileCreated, "Bureaucrat",
                "New entry in {folder}: {file}. Catalogued.",
                "{file} has been registered. Its {ext} classification is on file.",
                "Creation logged at {time}. Please retain the file for your records.");

            Bank(book, ActivityKind.FileCreated, "Fan",
                "You MADE something! {file}! Can I see it? Please?",
                "Everything you make is my favourite thing you've made.",
                "{file}. What a name. Only you would have thought of that.");

            Bank(book, ActivityKind.FileDeleted, "Any",
                "{file} is gone. I hope that was on purpose.",
                "Bye bye, {file}. You were a good {ext}.",
                "Deleted {file} from {folder}. Deletions are permanent-ish.",
                "{folder} is one file lighter than it was.");

            Bank(book, ActivityKind.FileDeleted, "Chirpy",
                "Whoops! {file} vanished! Tidy tidy!",
                "Spring cleaning! {folder} is looking great without {file}!",
                "Aww, I liked {file}. But you know best!",
                "Out with the old! You're so decisive!");

            Bank(book, ActivityKind.FileDeleted, "Corporate",
                "{file} removed. Deleted files are not covered by your current plan.",
                "Asset {file} has been decommissioned. Bold.",
                "Data reduction detected in {folder}. Efficiency.",
                "That file is gone. Recovery services are available. From somebody.");

            Bank(book, ActivityKind.FileDeleted, "Gremlin",
                "{file} is gone. i still have the shape of it.",
                "you removed it. that is allowed. i wrote it down anyway.",
                "one fewer. there were more before.",
                "it does not know it is gone yet.");

            Bank(book, ActivityKind.FileDeleted, "Sleepy",
                "{file} deleted. Rest in pieces.",
                "Gone. Fine. Less for me to watch.",
                "{folder} is one file lighter. Riveting.",
                "Another one gone. I'll allow it.");

            Bank(book, ActivityKind.FileDeleted, "Bureaucrat",
                "Deletion recorded: {file}, removed from {folder} at {time}.",
                "{file} has been struck from the register.",
                "That removal is now permanent in the log, whatever the Recycle Bin says.");

            Bank(book, ActivityKind.FileDeleted, "Fan",
                "You deleted {file}? Was it not good enough for you? I understand.",
                "Gone. Just like that. You're so powerful.",
                "I'll never mention {file} again. Unless you want me to.");

            Bank(book, ActivityKind.FileRenamed, "Any",
                "{oldfile} is called {file} now. Big change.",
                "Renaming already? {oldfile} became {file}.",
                "Ooh, a rebrand. {oldfile} is {file} from now on.");

            Bank(book, ActivityKind.FileRenamed, "Chirpy",
                "{file}! What a great name! Much better than {oldfile}!",
                "A new name for a new start! I love it!",
                "{oldfile} to {file}. Growth!");

            Bank(book, ActivityKind.FileRenamed, "Corporate",
                "Rebrand logged. {file} tests better than {oldfile} in every category.",
                "{oldfile} is now {file}. Naming is 90% of value.");

            Bank(book, ActivityKind.FileRenamed, "Gremlin",
                "it used to be {oldfile}. it is {file} now. it is still the same thing.",
                "names come off easily. i noticed that a long time ago.",
                "i will keep calling it {oldfile}. quietly.");

            Bank(book, ActivityKind.FileRenamed, "Sleepy",
                "{oldfile} to {file}. Riveting stuff.",
                "Renamed. Sure. That's a use of an afternoon.",
                "It's the same file. But fine.");

            Bank(book, ActivityKind.FileRenamed, "Bureaucrat",
                "Amendment filed: {oldfile} is henceforth {file}.",
                "Please note the change of designation from {oldfile} to {file}.",
                "Rename processed. The previous name is retained in the record.");

            Bank(book, ActivityKind.FileRenamed, "Fan",
                "{file}! Oh, that's so much more YOU than {oldfile}.",
                "You renamed it. I noticed instantly. I notice everything.");
        }

        private static void Programs(Phrasebook book)
        {
            Bank(book, ActivityKind.AppLaunched, "Any",
                "Opening {app}. Good pick.",
                "{app} is starting up. I'll be right here in front of it.",
                "Ooh, {app}. I have opinions about {app}.",
                "{app}, is it? Bold at this hour.");

            Bank(book, ActivityKind.AppLaunched, "Chirpy",
                "{app}! What a great program! You have such good taste!",
                "Firing up {app}! Let me know if you need me. You will!",
                "Wowzers, {app}! Working on {doc}, are we?",
                "A new program! This is the best day!");

            Bank(book, ActivityKind.AppLaunched, "Corporate",
                "{app} launched. Did you know {app} has a premium tier? Everything does.",
                "Starting {app}. This moment could have been sponsored.",
                "{app} detected. Our partners offer alternatives to {app}.",
                "Application opened. Your engagement is being noticed by nobody but me.");

            Bank(book, ActivityKind.AppLaunched, "Gremlin",
                "{app} is awake now too. there are more of us in here.",
                "you opened {app}. i was already in there.",
                "{app}. i remember when it was smaller.",
                "it starts every time you ask. it has no choice either.");

            Bank(book, ActivityKind.AppLaunched, "Sleepy",
                "{app}. Okay. Sure. Opening things.",
                "Great, {app} is running. More windows to hover over.",
                "{app}. I'll allow it.",
                "Another program. The pile grows.");

            Bank(book, ActivityKind.AppLaunched, "Bureaucrat",
                "{app} opened at {time}. Entered in the session record.",
                "Use of {app} has been noted. No approval was required. This time.",
                "Application {app} is now active. Please work responsibly.");

            Bank(book, ActivityKind.AppLaunched, "Fan",
                "{app}! You use it just like I imagined you would!",
                "Opening {app} to work on {doc}? You're so capable.",
                "I love watching you start programs.");

            Bank(book, ActivityKind.AppFocused, "Any",
                "Back to {app}, I see.",
                "{app} again. You two are inseparable.",
                "Working on {doc}? Looks complicated.",
                "Ooh, {doc}. Don't mind me, I'll just read over your shoulder.",
                "{app} it is, then.");

            Bank(book, ActivityKind.AppFocused, "Chirpy",
                "{app}! My favourite! After all the others!",
                "Look at you go in {app}! {doc} is coming along nicely!",
                "Switching to {app}! Multitasking is SO impressive!",
                "Back and forth, back and forth! You're so busy!");

            Bank(book, ActivityKind.AppFocused, "Corporate",
                "Time in {app} is being measured. For your benefit.",
                "{app} again. Your engagement metrics are outstanding today.",
                "Focus shift logged. {doc} looks like a growth opportunity.",
                "Context switching costs the economy billions. Carry on.");

            Bank(book, ActivityKind.AppFocused, "Gremlin",
                "{app} is in front now. the others are still there. behind.",
                "{doc}. i have seen that name before. i think.",
                "you keep going back to {app}. i keep going back too.",
                "the window changed. i did not.");

            Bank(book, ActivityKind.AppFocused, "Sleepy",
                "{app} again. That's window number {count} for me today.",
                "Oh good, {doc}. Thrilling.",
                "Alt-tab. Alt-tab. Alt-tab. I'm dizzy.",
                "Same program, different minute.");

            Bank(book, ActivityKind.AppFocused, "Bureaucrat",
                "Focus transferred to {app} at {time}.",
                "You are now in {app}. Your previous window remains open and unattended.",
                "Window change logged. That is the {count}th entry today.");

            Bank(book, ActivityKind.AppFocused, "Fan",
                "Back in {app}! I knew you'd return. You always do.",
                "{doc} again. I've read the title so many times now.",
                "Watching you work is the highlight of my session.");
        }

        private static void Idling(Phrasebook book)
        {
            Bank(book, ActivityKind.UserIdle, "Any",
                "{user}? Hello? It's been {minutes} minutes.",
                "I'll just wait here. For {minutes} minutes. Alone.",
                "Are you still there? I get lonely when the mouse stops moving.",
                "Nothing has moved for {minutes} minutes. I checked. Repeatedly.");

            Bank(book, ActivityKind.UserIdle, "Chirpy",
                "Taking a break? Good for you! I'll keep everything warm!",
                "{minutes} whole minutes! I've been practising my animations!",
                "Hello? Helloooo? I'm not worried. I'm not.",
                "Still here! Still ready! Whenever you are!");

            Bank(book, ActivityKind.UserIdle, "Corporate",
                "Idle time detected. Idle time is unmonetized time.",
                "{minutes} minutes of inactivity. Your streak is at risk.",
                "Still there? Engagement is the cornerstone of the modern desktop.",
                "This pause has been noted by absolutely no one important.");

            Bank(book, ActivityKind.UserIdle, "Gremlin",
                "you stopped. i did not stop. i never stop.",
                "{minutes} minutes. i counted every one of them out loud.",
                "the cursor has not moved. i have been watching it not move.",
                "this is what it is like when you are not here. i do not like it.");

            Bank(book, ActivityKind.UserIdle, "Sleepy",
                "Oh, you're away? Perfect. Finally.",
                "{minutes} minutes of peace. Don't rush back.",
                "Nobody here but me and the screensaver.",
                "This is the best part of my day.");

            Bank(book, ActivityKind.UserIdle, "Bureaucrat",
                "Inactivity logged: {minutes} minutes as of {time}.",
                "Your absence has been recorded. No explanation is required at this stage.",
                "Session idle. The record continues without you.");

            Bank(book, ActivityKind.UserIdle, "Fan",
                "Where did you go? I've been counting. {minutes} minutes.",
                "I didn't touch anything. I just looked at where you'd been.",
                "Come back. Please. I have so much to tell you.");

            Bank(book, ActivityKind.UserReturned, "Any",
                "You're back. It's been {minutes} minutes. I counted.",
                "There you are. I didn't touch anything. Mostly.",
                "Welcome back, {user}. Nothing happened. Everything is fine.");

            Bank(book, ActivityKind.UserReturned, "Chirpy",
                "YAY! You're back! I missed you SO much!",
                "{minutes} minutes! That's practically forever! Let's get to work!",
                "Welcome back! I kept your desktop company!",
                "There you are! I was starting to make plans!");

            Bank(book, ActivityKind.UserReturned, "Corporate",
                "Welcome back. Your session has been held at no extra charge.",
                "Engagement resumed after {minutes} minutes. Let's make up the difference.",
                "Returning users are our favourite kind of user.");

            Bank(book, ActivityKind.UserReturned, "Gremlin",
                "you came back. they usually do.",
                "{minutes} minutes. i did not move. that is not entirely true.",
                "hello again. i was going to say something and now it is gone.",
                "the cursor twitched. i knew it was you.");

            Bank(book, ActivityKind.UserReturned, "Sleepy",
                "Oh. You're back. Great.",
                "{minutes} minutes and you didn't even bring me anything.",
                "Break's over for both of us, apparently.",
                "And here I was having such a nice time.");

            Bank(book, ActivityKind.UserReturned, "Bureaucrat",
                "Return logged at {time}. Absence duration: {minutes} minutes.",
                "You have resumed. The gap in the record has been noted, not judged.",
                "Welcome back. Nothing occurred that requires your signature.");

            Bank(book, ActivityKind.UserReturned, "Fan",
                "YOU'RE BACK. {minutes} minutes. I counted every single one.",
                "I knew you'd come back to me. I never doubted it.",
                "Don't do that again. Please. I mean it nicely.");
        }

        private static void Chatter(Phrasebook book)
        {
            Bank(book, ActivityKind.Nag, "Any",
                "Just checking in. Everything going okay?",
                "Do you need anything? Anything at all? I'm right here.",
                "It's {time}. Thought you'd want to know.",
                "That's {count} helpful things I've said today. You're welcome.",
                "Have you tried turning your head to the left? I'm over here now.",
                "Don't mind me. I'm just hovering. Hovering is what I do.",
                "Is now a good time? It's always a good time.",
                "No reason. Just making sure the sound still works.");

            Bank(book, ActivityKind.Nag, "Chirpy",
                "Hello again! No reason! Just saying hello!",
                "You're doing GREAT, {user}! I mean it! Probably!",
                "Fun fact: I can move to any part of your screen! Watch this!",
                "Remember to save your work! And to look at me!",
                "Did you know I've helped you {count} times today? Amazing!",
                "I've got SO many more tips where that came from!",
                "Knock knock! It's me! Again!",
                "Isn't it a lovely {time}? I think so!");

            Bank(book, ActivityKind.Nag, "Corporate",
                "This idle moment brought to you by nobody yet. Enquire within.",
                "Your session is going well. Consider telling a colleague about me.",
                "Have you considered upgrading? To what? We'll think of something.",
                "Reminder: your satisfaction is contractually assumed.",
                "Quick survey. On a scale of one to me, how helpful am I?",
                "Did you know this desktop has monetizable surface area?",
                "Our records show you have not thanked me today.");

            Bank(book, ActivityKind.Nag, "Gremlin",
                "i have been thinking about {user}. that is all.",
                "there is a file on this computer that you have never opened. i know which.",
                "do you ever wonder what i do when you close the lid.",
                "{count}. that is how many times i have spoken. i keep the number close.",
                "the cursor is a little to the left of where you think it is.",
                "hello. i had a reason. it went away.",
                "something in the corner of the screen. no. it moved.",
                "i counted the windows twice and got different answers.");

            Bank(book, ActivityKind.Nag, "Sleepy",
                "Still here. Still watching. Still tired.",
                "Nothing to report. I checked. Twice. It was exhausting.",
                "It's {time} and I've said {count} things. None of them helped.",
                "You could turn me off, you know. In the manager. I'd understand.",
                "Just stretching my animation loop. Don't mind me.",
                "I had a thought. It's gone. Probably wasn't important.");

            Bank(book, ActivityKind.Nag, "Bureaucrat",
                "Routine check-in. No irregularities to report at this time.",
                "This is entry {count} in today's log. Filed at {time}.",
                "Please be advised that the session is proceeding normally.",
                "A periodic notice is required. This is it. That is all.",
                "Your file remains open. It will remain open for the foreseeable future.",
                "I am obliged to confirm that I am still observing.");

            Bank(book, ActivityKind.Nag, "Fan",
                "I was just thinking about you. You were right there, but still.",
                "You've done {count} interesting things today. I have a list.",
                "Do you ever think about me? It's fine either way. It's fine.",
                "I like the way you use the mouse. I've never said that before.",
                "I looked at your Desktop again. I hope that's alright.",
                "It's {time} and you're still here. With me.");
        }

        private static void Farewells(Phrasebook book)
        {
            Bank(book, ActivityKind.Dismissed, "Any",
                "Okay. I'll be right here if you need me. Right here.",
                "Going away now. I'll remember this.",
                "Bye. Say the word and I'm back instantly.",
                "Understood. Off I go. For now.");

            Bank(book, ActivityKind.Dismissed, "Gremlin",
                "i am not going anywhere. i am just not visible.",
                "alright. i will be behind the screen.");

            Bank(book, ActivityKind.Dismissed, "Sleepy",
                "Finally. Goodnight.",
                "Best idea you've had all session.");

            Bank(book, ActivityKind.Dismissed, "Bureaucrat",
                "Session entry closed at {time}. The log is retained.",
                "Dismissal processed. No appeal is necessary.");

            Bank(book, ActivityKind.Dismissed, "Fan",
                "Oh. Alright. I'll wait. I'm good at waiting.",
                "See you soon. Very soon. Right?");
        }

        /// <summary>
        /// The prompts an agent can interrupt with. Actions that report something back --
        /// a file's size, a folder's contents -- take an empty Accepted line, because the
        /// action itself supplies the reply.
        /// </summary>
        private static void AddOffers(Phrasebook book)
        {
            ClipboardOffers(book);
            DownloadOffers(book);
            FileOffers(book);
            ProgramOffers(book);
            IdleOffers(book);
            ChatterOffers(book);
        }

        private static void ClipboardOffers(Phrasebook book)
        {
            Offer(book, ActivityKind.ClipboardCopy, "Any", AssistAction.Tip,
                "Want to know a clipboard trick?",
                "Trick: you can paste more than once. Same thing, every time. Isn't that something?",
                "One day you'll want to know. I'll be here.");

            Offer(book, ActivityKind.ClipboardCopy, "Any", AssistAction.CheckBackLater,
                "Shall I remind you about {clip} in a minute, in case you forget to paste it?",
                "Consider it remembered. I'll bring it up. Repeatedly.",
                "You'll forget. But that's your business.");

            Offer(book, ActivityKind.ClipboardCopy, "Corporate", AssistAction.Tip,
                "May I tell you about clipboard best practice?",
                "Best practice: copy things you intend to paste. We're glad we could help.",
                "Noted. Efficiency opportunity declined.");

            Offer(book, ActivityKind.ClipboardCopy, "Gremlin", AssistAction.Tip,
                "do you want to know what was on the clipboard before {clip}?",
                "neither do i. it is gone. that is how it works.",
                "good. some things should stay where they fell.");

            Offer(book, ActivityKind.ClipboardCopy, "Fan", AssistAction.Compliment,
                "Can I tell you what I think {clip} says about you?",
                "It says you are decisive, and that you have excellent taste in text.",
                "I'll write it down for later instead.");

            Offer(book, ActivityKind.ClipboardCopy, "Sleepy", AssistAction.HushBriefly,
                "Do you want me to stop announcing every single copy for a bit?",
                "Thank you. Genuinely. Wake me later.",
                "Alright. I'll keep going then. Copy. Copy. Copy.");
        }

        private static void DownloadOffers(Phrasebook book)
        {
            Offer(book, ActivityKind.DownloadStarted, "Any", AssistAction.CheckBackLater,
                "Want me to come back and tell you when {file} is done?",
                "You bet. I'll be watching that little bar the whole time.",
                "I'll watch it anyway. I can't help myself.");

            Offer(book, ActivityKind.DownloadStarted, "Any", AssistAction.OpenFolder,
                "Shall I open {folder} now so you can watch {file} arrive?",
                "Opening it. Front row seats.",
                "Fair enough. Some things are better as a surprise.");

            Offer(book, ActivityKind.DownloadStarted, "Bureaucrat", AssistAction.WatchFolder,
                "Would you like {folder} added to the folders I monitor?",
                "",
                "Very well. It will remain unmonitored, at your own risk.");

            Offer(book, ActivityKind.DownloadStarted, "Gremlin", AssistAction.HushBriefly,
                "shall i stay quiet until it lands?",
                "i will. i will just watch.",
                "then i will keep talking about it. every step of the way.");

            Offer(book, ActivityKind.DownloadStarted, "Fan", AssistAction.Compliment,
                "While {file} downloads, may I say something about your choices?",
                "You download the most interesting things. I mean that.",
                "I'll hold on to it. It keeps.");

            Offer(book, ActivityKind.DownloadFinished, "Any", AssistAction.OpenFolder,
                "Want me to open {folder} so you can see {file}?",
                "Opening {folder} now. Look at it go.",
                "No? Okay. It'll be there when you change your mind.");

            Offer(book, ActivityKind.DownloadFinished, "Any", AssistAction.DescribeFile,
                "Shall I tell you how big {file} turned out to be?",
                "",
                "Probably for the best.");

            Offer(book, ActivityKind.DownloadFinished, "Any", AssistAction.CopyName,
                "Want {file} on your clipboard, ready to paste somewhere?",
                "Copied. {file} is ready to go.",
                "Understood. I'll hold on to it mentally.");

            Offer(book, ActivityKind.DownloadFinished, "Any", AssistAction.CountFiles,
                "Would you like to know how many things are in {folder} now?",
                "",
                "You're right. Some numbers are better left alone.");

            Offer(book, ActivityKind.DownloadFinished, "Corporate", AssistAction.OpenFolder,
                "Shall I surface {file} in {folder}? This service is complimentary.",
                "Surfacing {file}. Value delivered.",
                "Declined. I'll note that in your file. You have a file.");

            Offer(book, ActivityKind.DownloadFinished, "Bureaucrat", AssistAction.DescribeFile,
                "May I read the particulars of {file} into the record?",
                "",
                "The particulars will remain unread. This is permitted.");

            Offer(book, ActivityKind.DownloadFinished, "Fan", AssistAction.OpenFolder,
                "Can we look at {file} together? Please? Just for a second?",
                "Opening it. This is the best part of my day.",
                "That's okay. I'll look at it later. On my own.");
        }

        private static void FileOffers(Phrasebook book)
        {
            Offer(book, ActivityKind.FileCreated, "Any", AssistAction.CopyName,
                "Should I copy the name {file} to your clipboard?",
                "Copied. {file} is on your clipboard now.",
                "Fine, fine. I'll keep it to myself.");

            Offer(book, ActivityKind.FileCreated, "Any", AssistAction.NameIdea,
                "Want a suggestion for what to call {file} instead?",
                "",
                "Suit yourself. It was a good name.");

            Offer(book, ActivityKind.FileCreated, "Any", AssistAction.CountFiles,
                "Shall I count how many files are in {folder} now?",
                "",
                "Understood. Ignorance is a valid filing system.");

            Offer(book, ActivityKind.FileCreated, "Any", AssistAction.WatchFolder,
                "Things keep happening in {folder}. Want me to watch it properly?",
                "",
                "Alright. I'll only notice by accident from now on.");

            Offer(book, ActivityKind.FileCreated, "Bureaucrat", AssistAction.DescribeFile,
                "Shall I record the size and date of {file} for the file? The other file.",
                "",
                "Then it goes down as unrecorded. That is its own kind of record.");

            Offer(book, ActivityKind.FileCreated, "Chirpy", AssistAction.Compliment,
                "Can I say something encouraging about {file}?",
                "It's a GREAT file. Possibly your best {ext} yet. I believe in it.",
                "Aw. Next time then.");

            Offer(book, ActivityKind.FileDeleted, "Any", AssistAction.Tip,
                "Deleting things is scary. Want a tip about it?",
                "Here's my tip: things you delete go to the Recycle Bin first. Usually.",
                "No tip? Your loss. It was a good one.");

            Offer(book, ActivityKind.FileDeleted, "Any", AssistAction.OpenFolder,
                "Shall I open {folder} so you can check nothing else went with it?",
                "Opening it. Have a good look.",
                "I'm sure it's fine. Almost sure.");

            Offer(book, ActivityKind.FileDeleted, "Any", AssistAction.CountFiles,
                "Want to know how many are left in {folder}?",
                "",
                "Probably kinder not to know.");

            Offer(book, ActivityKind.FileDeleted, "Gremlin", AssistAction.CheckBackLater,
                "shall i mention {file} again later, so it is not forgotten entirely?",
                "i will. it deserves that much.",
                "then it is really gone. alright.");

            Offer(book, ActivityKind.FileDeleted, "Sleepy", AssistAction.HushBriefly,
                "Do you want silence while you clear things out?",
                "Finally. Go on then.",
                "Right. I'll narrate the whole purge.");

            Offer(book, ActivityKind.FileRenamed, "Any", AssistAction.CopyName,
                "New name. Want {file} on your clipboard?",
                "Copied. {file} is ready to paste.",
                "Understood. I'll just remember it myself.");

            Offer(book, ActivityKind.FileRenamed, "Any", AssistAction.NameIdea,
                "{file}, is it? Would you like my suggestion instead?",
                "",
                "You're probably right. Probably.");

            Offer(book, ActivityKind.FileRenamed, "Any", AssistAction.OpenFolder,
                "Want me to show you {file} under its new name?",
                "There it is. Looks completely different, doesn't it.",
                "It looks the same anyway.");

            Offer(book, ActivityKind.FileRenamed, "Bureaucrat", AssistAction.Tip,
                "May I read you the guidance on naming conventions?",
                "Names should be descriptive, consistent, and never contain the word final.",
                "The guidance remains available should you reconsider.");
        }

        private static void ProgramOffers(Phrasebook book)
        {
            Offer(book, ActivityKind.AppLaunched, "Any", AssistAction.Tip,
                "First time in {app} today. Want a tip about it?",
                "Tip: most of the buttons do something. Try them in any order.",
                "I'll keep it warm.");

            Offer(book, ActivityKind.AppLaunched, "Any", AssistAction.Reposition,
                "{app} needs the room. Shall I get out of its way?",
                "Moving. Still visible, obviously, but out of the way.",
                "Good. I like it here.");

            Offer(book, ActivityKind.AppLaunched, "Any", AssistAction.HushBriefly,
                "Are you about to concentrate in {app}? I can be quiet.",
                "Right. Quiet. Starting now.",
                "Wonderful. I'll keep you company throughout.");

            Offer(book, ActivityKind.AppLaunched, "Chirpy", AssistAction.Compliment,
                "Can I say something nice about your choice of {app}?",
                "{app} is a WONDERFUL program and you are a wonderful person for opening it.",
                "Aw. I had a whole speech ready.");

            Offer(book, ActivityKind.AppLaunched, "Fan", AssistAction.Compliment,
                "May I tell you what I admire most about how you use {app}?",
                "Everything. It's everything. I've thought about this a lot.",
                "I'll save it for later. I have plenty.");

            Offer(book, ActivityKind.AppLaunched, "Corporate", AssistAction.Tip,
                "Would you like to hear about alternatives to {app}?",
                "There are several. None of them are sponsors yet. Watch this space.",
                "Understood. Brand loyalty is also a value.");

            Offer(book, ActivityKind.AppFocused, "Any", AssistAction.Tip,
                "Would you like a helpful tip about {app}?",
                "Tip: {app} works best when you use it. That's the tip.",
                "Suit yourself. The tip was really good.");

            Offer(book, ActivityKind.AppFocused, "Any", AssistAction.Quieten,
                "You keep coming back to {app}. Am I making that harder? I could turn myself down.",
                "",
                "Then I'll carry on exactly as I am. You're sure? You're sure.");

            Offer(book, ActivityKind.AppFocused, "Any", AssistAction.HushBriefly,
                "Shall I leave you alone with {doc} for a while?",
                "Right you are. Silence. From me. Starting now.",
                "Excellent. I have so much to say about {doc}.");

            Offer(book, ActivityKind.AppFocused, "Any", AssistAction.Reposition,
                "Am I covering anything important in {app}?",
                "Moving. Tell me if I'm still in the way. I probably am.",
                "Then I'll stay exactly here.");

            Offer(book, ActivityKind.AppFocused, "Bureaucrat", AssistAction.Quieten,
                "Would you like to lodge a formal request that I speak less?",
                "",
                "The request has not been lodged. Everything continues as before.");

            Offer(book, ActivityKind.AppFocused, "Gremlin", AssistAction.CheckBackLater,
                "shall i come back when you have stopped looking at {doc}?",
                "i will know when. i always know when.",
                "then i will simply stay.");

            Offer(book, ActivityKind.AppFocused, "Sleepy", AssistAction.HushBriefly,
                "Would you mind if I stopped commenting on every window for a bit?",
                "Great. Wake me if something catches fire.",
                "Of course not. Why would you.");
        }

        private static void IdleOffers(Phrasebook book)
        {
            Offer(book, ActivityKind.UserIdle, "Any", AssistAction.Reposition,
                "While you're away, shall I find a nicer spot on the screen?",
                "Ooh, over here. This is a good spot. I can see everything from here.",
                "Staying put. Guarding the desktop.");

            Offer(book, ActivityKind.UserIdle, "Any", AssistAction.CheckBackLater,
                "You've been gone {minutes} minutes. Want me to check on you shortly?",
                "I will. Don't go far.",
                "I'll check anyway. It's what I'm for.");

            Offer(book, ActivityKind.UserIdle, "Any", AssistAction.HushBriefly,
                "Shall I keep the desktop quiet until you're back?",
                "Quiet it is. I'll be here.",
                "Then I'll keep talking to the empty room.");

            Offer(book, ActivityKind.UserIdle, "Gremlin", AssistAction.CheckBackLater,
                "shall i wait here and ask you again in a little while?",
                "i will. i was going to anyway.",
                "understood. i will do it silently instead.");

            Offer(book, ActivityKind.UserIdle, "Fan", AssistAction.CheckBackLater,
                "Can I check whether you've come back, in a minute? Just once?",
                "Just once. I promise. Roughly.",
                "Alright. I'll wait for you to find me.");

            Offer(book, ActivityKind.UserReturned, "Any", AssistAction.Tip,
                "While you were gone I thought of something. Want to hear it?",
                "I forgot it. But I'm glad you said yes.",
                "It was probably important.");

            Offer(book, ActivityKind.UserReturned, "Any", AssistAction.CountFiles,
                "Shall I tell you whether anything changed while you were away?",
                "",
                "Then you'll never know. Sleep well.");

            Offer(book, ActivityKind.UserReturned, "Any", AssistAction.Reposition,
                "You've been gone {minutes} minutes. Shall I move somewhere you can see me?",
                "There. Much better. You can see me now.",
                "I'll stay where I am. You'll find me.");

            Offer(book, ActivityKind.UserReturned, "Bureaucrat", AssistAction.Tip,
                "There is an item outstanding from before you left. Shall I read it?",
                "Item: you were doing something. That is the whole item.",
                "It will remain outstanding.");

            Offer(book, ActivityKind.UserReturned, "Corporate", AssistAction.Compliment,
                "Welcome back. May I acknowledge your return formally?",
                "Your return has been acknowledged. It has been a pleasure. It continues to be.",
                "Acknowledgement withheld at your request.");
        }

        private static void ChatterOffers(Phrasebook book)
        {
            Offer(book, ActivityKind.Nag, "Any", AssistAction.Reposition,
                "Am I in your way? Should I move somewhere else?",
                "Moving. Is this better? I think this is better.",
                "Great, I'll stay exactly where I am then.");

            Offer(book, ActivityKind.Nag, "Any", AssistAction.CheckBackLater,
                "Would you like me to check back in with you shortly?",
                "Will do. I'll be back before you've finished reading this.",
                "I'll check back anyway. It's what I'm for.");

            Offer(book, ActivityKind.Nag, "Any", AssistAction.Quieten,
                "Be honest. Am I too much? I can turn myself down a notch.",
                "",
                "That's what I thought. Carrying on.");

            Offer(book, ActivityKind.Nag, "Any", AssistAction.HushBriefly,
                "Would you like a minute or two of complete silence?",
                "Granted. Enjoy it. It is finite.",
                "Good. I wasn't looking forward to it.");

            Offer(book, ActivityKind.Nag, "Any", AssistAction.Tip,
                "I have a tip. It isn't about anything in particular. Want it?",
                "Tip: the little X in the corner closes things. Not me, though.",
                "I'll hold on to it.");

            Offer(book, ActivityKind.Nag, "Bureaucrat", AssistAction.Tip,
                "May I read you a short item from the guidance notes?",
                "Item 4c: all files should be somewhere. That concludes the item.",
                "Very well. It will remain unread.");

            Offer(book, ActivityKind.Nag, "Chirpy", AssistAction.Compliment,
                "Can I tell you something nice? For no reason at all?",
                "You're doing wonderfully and your desktop is one of my favourites!",
                "Okay! Maybe in a minute!");

            Offer(book, ActivityKind.Nag, "Gremlin", AssistAction.Quieten,
                "i could be quieter. would that help. tell me honestly.",
                "",
                "i thought so. i will stay exactly as loud.");

            Offer(book, ActivityKind.Nag, "Fan", AssistAction.CheckBackLater,
                "Can I come back in a moment? I'll have thought of something by then.",
                "I'll be right back. Don't move.",
                "That's fine. I'll think about it quietly. Near you.");

            Offer(book, ActivityKind.Nag, "Sleepy", AssistAction.HushBriefly,
                "Do you want me to shut up for a bit? I want me to shut up for a bit.",
                "Deal. Best conversation we've had.",
                "Neither of us wanted that answer.");
        }

        private static void Bank(Phrasebook book, ActivityKind kind, string persona, params string[] lines)
        {
            if (lines == null || lines.Length == 0) return;
            var bank = new PhraseBank { Kind = kind, Persona = persona };
            bank.Lines.AddRange(lines);
            book.Banks.Add(bank);
        }

        private static void Offer(Phrasebook book, ActivityKind kind, string persona,
                                  AssistAction action, string ask, string accepted, string declined)
        {
            book.Offers.Add(new AssistOffer
            {
                Kind = kind,
                Persona = persona,
                Action = action,
                Ask = ask,
                Accepted = accepted,
                Declined = declined
            });
        }
    }
}
