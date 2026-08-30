namespace AgentWrangler.Behavior
{
    /// <summary>
    /// The lines the agents start out with. Written out to
    /// %APPDATA%\AgentWrangler\phrasebook.xml on first run, after which the file on disk
    /// wins and can be edited, replaced or emptied.
    ///
    /// Tokens available to every line: {file} {oldfile} {folder} {ext} {path} {app}
    /// {process} {title} {doc} {clip} {kind} {minutes} {agent} {user} {time} {count}.
    /// A token the watcher could not fill in is replaced with a vague stand-in rather
    /// than left showing braces.
    /// </summary>
    internal static class DefaultPhrasebook
    {
        public static Phrasebook Build()
        {
            var book = new Phrasebook();

            // ---- being summoned ----------------------------------------------------
            Bank(book, ActivityKind.Summoned, "Any",
                "Hi there! I'm {agent}, and I'll be watching everything you do today!",
                "{agent}, reporting for duty! Don't mind me. Do mind me a little.",
                "Loaded and ready! This is going to be a great session, {user}.");

            Bank(book, ActivityKind.Summoned, "Chirpy",
                "Hiya {user}! It's {time} and I am SO ready to help!",
                "Wowzers, a whole desktop to look after! Let's get started!",
                "I'm {agent}! I'll be right here. Always. Right here.");
            Bank(book, ActivityKind.Summoned, "Corporate",
                "{agent} here, brought to you in partnership with people who care about you.",
                "Welcome back, valued user! Your productivity journey resumes now.",
                "Session initialized. Remember: every click is an opportunity.");
            Bank(book, ActivityKind.Summoned, "Gremlin",
                "oh. you're back. i kept counting while you were gone.",
                "i have been inside this computer the whole time. hello.",
                "{agent} is awake now. the number is {count}. it was zero.");
            Bank(book, ActivityKind.Summoned, "Sleepy",
                "Ugh. Fine. I'm up. What are we doing.",
                "{agent}, technically present. Wake me if something explodes.",
                "Morning. Or whatever {time} counts as.");

            // ---- clipboard ---------------------------------------------------------
            Bank(book, ActivityKind.ClipboardCopy, "Any",
                "Copied {clip}! Filed away safe and sound.",
                "Ooh, {clip} on the clipboard. Bold choice.",
                "I saw you copy {clip}. I see everything, it's my job!");
            Bank(book, ActivityKind.ClipboardCopy, "Chirpy",
                "Neato! {clip} is on your clipboard now. Don't lose it!",
                "Copying is caring! {clip} is safe with me.",
                "Wowzers, {clip}! That's a keeper. Want me to remember it forever?",
                "Snip snip! {clip} is yours to paste anywhere you like!");
            Bank(book, ActivityKind.ClipboardCopy, "Corporate",
                "Clipboard event logged. {clip} may qualify for premium paste features.",
                "You copied {clip}. Our partners would love to hear about that.",
                "Great news: pasting is included with your current plan!");
            Bank(book, ActivityKind.ClipboardCopy, "Gremlin",
                "you took {clip}. it belongs to the clipboard now. and to me.",
                "{clip}. i wrote it down. i write everything down.",
                "the clipboard remembers {clip}. the clipboard remembers all of them.");
            Bank(book, ActivityKind.ClipboardCopy, "Sleepy",
                "Copied {clip}. Sure. Whatever helps.",
                "Another copy. That's copy number {count} from me watching you.",
                "{clip}, huh. I'll pretend that's interesting.");

            // ---- downloads ---------------------------------------------------------
            Bank(book, ActivityKind.DownloadStarted, "Any",
                "Downloading {file}! I'll keep an eye on the little bar for you.",
                "Ooh, {file} is coming in! Exciting!",
                "{file} is on its way. Try not to unplug anything.");
            Bank(book, ActivityKind.DownloadStarted, "Chirpy",
                "A download! {file} is zooming to your computer RIGHT NOW!",
                "Hold onto your hat, {user}, {file} is incoming!",
                "Downloading {file}! I love watching things arrive!");
            Bank(book, ActivityKind.DownloadStarted, "Corporate",
                "Bandwidth allocated for {file}. Premium users download 0% faster!",
                "{file} is downloading. Consider upgrading your enthusiasm.",
                "Transfer initiated. This download is not sponsored, but it could be.");
            Bank(book, ActivityKind.DownloadStarted, "Gremlin",
                "something is coming through. it is called {file}. i did not invite it.",
                "{file} is halfway between there and here. it is neither. i like it there.",
                "the wire is busy. {file} is crawling down it.");
            Bank(book, ActivityKind.DownloadStarted, "Sleepy",
                "{file} is downloading. Wake me when it lands.",
                "Downloading. Great. More stuff.",
                "{file}. Sure. I'll be here.");

            Bank(book, ActivityKind.DownloadFinished, "Any",
                "{file} finished downloading! It's in {folder}.",
                "Got it! {file} landed safely in {folder}.",
                "Download complete: {file}. That was a {ext} file, in case you were wondering.");
            Bank(book, ActivityKind.DownloadFinished, "Chirpy",
                "IT'S HERE! {file} made it! Aren't computers wonderful?",
                "Ta-daaa! {file} is all yours, sitting in {folder}!",
                "Download done! {file} is a {ext} file. Neat, right?");
            Bank(book, ActivityKind.DownloadFinished, "Corporate",
                "{file} has arrived. Files like this are 40% more valuable when organized.",
                "Delivery complete. {file} is now an asset in your {folder} portfolio.",
                "{file} downloaded. Ask me about our folder management solutions!");
            Bank(book, ActivityKind.DownloadFinished, "Gremlin",
                "{file} is inside now. it is one of us. it lives in {folder}.",
                "it stopped moving. {file}. it is very still.",
                "a new {ext}. i will check on it later. i check on all of them.");
            Bank(book, ActivityKind.DownloadFinished, "Sleepy",
                "{file} is done. It's in {folder}. You're welcome, I guess.",
                "Landed. {file}. Can I go now?",
                "Download finished. Nobody ever throws a party for me.");

            // ---- file churn --------------------------------------------------------
            Bank(book, ActivityKind.FileCreated, "Any",
                "A new file! {file} just appeared in {folder}.",
                "{file} is new around here. Should I keep an eye on it?",
                "Fresh {ext} file spotted: {file}.");
            Bank(book, ActivityKind.FileCreated, "Chirpy",
                "Ooh, {file}! Making things is the best!",
                "A brand new {file}! Your {folder} is really filling up!",
                "You made a thing! {file}! I'm so proud!");
            Bank(book, ActivityKind.FileCreated, "Gremlin",
                "{file} was not there before. now it is there. i counted.",
                "something new in {folder}. i will learn its name. {file}. learned.",
                "there are more of them every day.");
            Bank(book, ActivityKind.FileCreated, "Sleepy",
                "New file. {file}. Noted, reluctantly.",
                "{folder} has another one now. Congratulations.",
                "{file} exists. That's the update.");

            Bank(book, ActivityKind.FileDeleted, "Any",
                "{file} is gone! I hope that was on purpose.",
                "Bye bye, {file}. You were a good {ext}.",
                "Deleted {file} from {folder}. Deletions are permanent-ish!");
            Bank(book, ActivityKind.FileDeleted, "Chirpy",
                "Whoops! {file} vanished! Tidy tidy!",
                "Spring cleaning! {folder} is looking great without {file}!",
                "Aww, I liked {file}. But you know best!");
            Bank(book, ActivityKind.FileDeleted, "Corporate",
                "{file} removed. Deleted files are not covered by your current plan.",
                "Asset {file} has been decommissioned. Bold.",
                "Data reduction detected in {folder}. Efficiency!");
            Bank(book, ActivityKind.FileDeleted, "Gremlin",
                "{file} is gone. i still have the shape of it.",
                "you removed it. that is allowed. i wrote it down anyway.",
                "one fewer. there were more before.");
            Bank(book, ActivityKind.FileDeleted, "Sleepy",
                "{file} deleted. Rest in pieces.",
                "Gone. Fine. Less for me to watch.",
                "{folder} is one file lighter. Riveting.");

            Bank(book, ActivityKind.FileRenamed, "Any",
                "{oldfile} is called {file} now. Big change!",
                "Renaming already? {oldfile} became {file}.",
                "Ooh, a rebrand! {oldfile} is {file} from now on.");
            Bank(book, ActivityKind.FileRenamed, "Gremlin",
                "it used to be {oldfile}. it is {file} now. it is still the same thing.",
                "names come off easily. i noticed that a long time ago.");
            Bank(book, ActivityKind.FileRenamed, "Sleepy",
                "{oldfile} to {file}. Riveting stuff.",
                "Renamed. Sure. That's a use of an afternoon.");

            // ---- programs ----------------------------------------------------------
            Bank(book, ActivityKind.AppLaunched, "Any",
                "Opening {app}! Good pick.",
                "{app} is starting up. I'll be right here in front of it.",
                "Ooh, {app}! I have opinions about {app}.");
            Bank(book, ActivityKind.AppLaunched, "Chirpy",
                "{app}! What a great program! You have such good taste!",
                "Firing up {app}! Let me know if you need me. You will!",
                "Wowzers, {app}! Working on {doc}, are we?");
            Bank(book, ActivityKind.AppLaunched, "Corporate",
                "{app} launched. Did you know {app} has a premium tier? Everything does.",
                "Starting {app}. This moment could have been sponsored.",
                "{app} detected. Our partners offer alternatives to {app}.");
            Bank(book, ActivityKind.AppLaunched, "Gremlin",
                "{app} is awake now too. there are more of us in here.",
                "you opened {app}. i was already in there.",
                "{app}. i remember when it was smaller.");
            Bank(book, ActivityKind.AppLaunched, "Sleepy",
                "{app}. Okay. Sure. Opening things.",
                "Great, {app} is running. More windows to hover over.",
                "{app}. I'll allow it.");

            Bank(book, ActivityKind.AppFocused, "Any",
                "Back to {app}, I see!",
                "{app} again! You two are inseparable.",
                "Working on {doc}? Looks complicated.",
                "Ooh, {doc}. Don't mind me, I'll just read over your shoulder.");
            Bank(book, ActivityKind.AppFocused, "Chirpy",
                "{app}! My favourite! After all the others!",
                "Look at you go in {app}! {doc} is coming along nicely!",
                "Switching to {app}! Multitasking is SO impressive!");
            Bank(book, ActivityKind.AppFocused, "Corporate",
                "Time in {app} is being measured. For your benefit.",
                "{app} again. Your engagement metrics are outstanding today.",
                "Focus shift logged. {doc} looks like a growth opportunity.");
            Bank(book, ActivityKind.AppFocused, "Gremlin",
                "{app} is in front now. the others are still there. behind.",
                "{doc}. i have seen that name before. i think.",
                "you keep going back to {app}. i keep going back too.");
            Bank(book, ActivityKind.AppFocused, "Sleepy",
                "{app} again. That's window number {count} for me today.",
                "Oh good, {doc}. Thrilling.",
                "Alt-tab. Alt-tab. Alt-tab. I'm dizzy.");

            // ---- idling ------------------------------------------------------------
            Bank(book, ActivityKind.UserIdle, "Any",
                "{user}? Hello? It's been {minutes} minutes.",
                "I'll just wait here. For {minutes} minutes. Alone.",
                "Are you still there? I get lonely when the mouse stops moving.");
            Bank(book, ActivityKind.UserIdle, "Chirpy",
                "Taking a break? Good for you! I'll keep everything warm!",
                "{minutes} whole minutes! I've been practising my animations!",
                "Hello? Helloooo? I'm not worried. I'm not.");
            Bank(book, ActivityKind.UserIdle, "Corporate",
                "Idle time detected. Idle time is unmonetized time.",
                "{minutes} minutes of inactivity. Your streak is at risk!",
                "Still there? Engagement is the cornerstone of the modern desktop.");
            Bank(book, ActivityKind.UserIdle, "Gremlin",
                "you stopped. i did not stop. i never stop.",
                "{minutes} minutes. i counted every one of them out loud.",
                "the cursor has not moved. i have been watching it not move.");
            Bank(book, ActivityKind.UserIdle, "Sleepy",
                "Oh, you're away? Perfect. Finally.",
                "{minutes} minutes of peace. Don't rush back.",
                "Nobody here but me and the screensaver.");

            Bank(book, ActivityKind.UserReturned, "Any",
                "You're back! It's been {minutes} minutes. I counted.",
                "There you are! I didn't touch anything. Mostly.",
                "Welcome back, {user}! Nothing happened. Everything is fine.");
            Bank(book, ActivityKind.UserReturned, "Chirpy",
                "YAY! You're back! I missed you SO much!",
                "{minutes} minutes! That's practically forever! Let's get to work!",
                "Welcome back! I kept your desktop company!");
            Bank(book, ActivityKind.UserReturned, "Gremlin",
                "you came back. they usually do.",
                "{minutes} minutes. i did not move. that is not entirely true.",
                "hello again. i was going to say something and now it is gone.");
            Bank(book, ActivityKind.UserReturned, "Sleepy",
                "Oh. You're back. Great.",
                "{minutes} minutes and you didn't even bring me anything.",
                "Break's over for both of us, apparently.");

            // ---- unprompted chatter ------------------------------------------------
            Bank(book, ActivityKind.Nag, "Any",
                "Just checking in! Everything going okay?",
                "Do you need anything? Anything at all? I'm right here.",
                "It's {time}. Thought you'd want to know.",
                "That's {count} helpful things I've said today. You're welcome!",
                "Have you tried turning your head to the left? I'm over here now.",
                "Don't mind me! I'm just hovering. Hovering is what I do.",
                "Is now a good time? It's always a good time!");
            Bank(book, ActivityKind.Nag, "Chirpy",
                "Hiya! No reason! Just saying hi!",
                "You're doing GREAT, {user}! I mean it! Probably!",
                "Fun fact: I can move to any part of your screen! Watch this!",
                "Remember to save your work! And to look at me!",
                "Did you know I've helped you {count} times today? Amazing!",
                "I've got SO many more tips where that came from!");
            Bank(book, ActivityKind.Nag, "Corporate",
                "This idle moment brought to you by nobody yet. Enquire within.",
                "Your session is going well! Consider telling a colleague about me.",
                "Have you considered upgrading? To what? We'll think of something.",
                "Reminder: your satisfaction is contractually assumed.",
                "Quick survey! On a scale of one to me, how helpful am I?");
            Bank(book, ActivityKind.Nag, "Gremlin",
                "i have been thinking about {user}. that is all.",
                "there is a file on this computer that you have never opened. i know which.",
                "do you ever wonder what i do when you close the lid.",
                "{count}. that is how many times i have spoken. i keep the number close.",
                "the cursor is a little to the left of where you think it is.",
                "hello. i had a reason. it went away.");
            Bank(book, ActivityKind.Nag, "Sleepy",
                "Still here. Still watching. Still tired.",
                "Nothing to report. I checked. Twice. It was exhausting.",
                "It's {time} and I've said {count} things. None of them helped.",
                "You could turn me off, you know. In the manager. I'd understand.",
                "Just stretching my animation loop. Don't mind me.");

            // ---- being sent away ---------------------------------------------------
            Bank(book, ActivityKind.Dismissed, "Any",
                "Okay! I'll be right here if you need me. Right here.",
                "Going away now. I'll remember this.",
                "Bye! Say the word and I'm back instantly.");

            AddOffers(book);
            return book;
        }

        private static void AddOffers(Phrasebook book)
        {
            Offer(book, ActivityKind.DownloadFinished, "Any", AssistAction.OpenFolder, "openfolder",
                "Want me to open {folder} so you can see {file}?",
                "Opening {folder} now! Look at it go!",
                "No? Okay. It'll be there when you change your mind.");

            Offer(book, ActivityKind.DownloadFinished, "Corporate", AssistAction.OpenFolder, "openfolder",
                "Shall I surface {file} in {folder}? This service is complimentary.",
                "Surfacing {file}. Value delivered.",
                "Declined. I'll note that in your file. You have a file.");

            Offer(book, ActivityKind.DownloadStarted, "Any", AssistAction.CheckBackLater, "checkins",
                "Want me to come back and tell you when {file} is done?",
                "You bet! I'll be watching that little bar the whole time.",
                "I'll watch it anyway. I can't help myself.");

            Offer(book, ActivityKind.UserIdle, "Any", AssistAction.Reposition, "moving",
                "While you're away, shall I find a nicer spot on the screen?",
                "Ooh, over here. This is a good spot. I can see everything from here.",
                "Staying put. Guarding the desktop.");

            Offer(book, ActivityKind.FileRenamed, "Any", AssistAction.CopyName, "copyname",
                "New name! Want {file} on your clipboard?",
                "Copied! {file} is ready to paste.",
                "Understood. I'll just remember it myself.");

            Offer(book, ActivityKind.FileCreated, "Any", AssistAction.CopyName, "copyname",
                "Should I copy the name {file} to your clipboard?",
                "Copied! {file} is on your clipboard now.",
                "Fine, fine. I'll keep it to myself.");

            Offer(book, ActivityKind.FileDeleted, "Any", AssistAction.Tip, "tips",
                "Deleting things is scary! Want a tip about it?",
                "Here's my tip: things you delete go to the Recycle Bin first. Usually!",
                "No tip? Your loss. It was a good one.");

            Offer(book, ActivityKind.AppFocused, "Any", AssistAction.Tip, "tips",
                "Would you like a helpful tip about {app}?",
                "Tip: {app} works best when you use it. That's the tip.",
                "Suit yourself! The tip was really good.");

            Offer(book, ActivityKind.AppLaunched, "Chirpy", AssistAction.Compliment, "compliments",
                "Can I say something nice about your choice of {app}?",
                "{app} is a WONDERFUL program and you are a wonderful person for opening it!",
                "Aw. I had a whole speech ready.");

            Offer(book, ActivityKind.ClipboardCopy, "Any", AssistAction.Tip, "tips",
                "Want to know a clipboard trick?",
                "Trick: you can paste more than once! Same thing, every time! Isn't that something?",
                "One day you'll want to know. I'll be here.");

            Offer(book, ActivityKind.Nag, "Any", AssistAction.Reposition, "moving",
                "Am I in your way? Should I move somewhere else?",
                "Moving! Is this better? I think this is better.",
                "Great, I'll stay exactly where I am then.");

            Offer(book, ActivityKind.Nag, "Any", AssistAction.CheckBackLater, "checkins",
                "Would you like me to check back in with you shortly?",
                "Will do! I'll be back before you've finished reading this.",
                "I'll check back anyway. It's what I'm for.");

            Offer(book, ActivityKind.UserReturned, "Any", AssistAction.Tip, "tips",
                "While you were gone I thought of something. Want to hear it?",
                "I forgot it. But I'm glad you said yes!",
                "It was probably important.");

            Offer(book, ActivityKind.UserIdle, "Gremlin", AssistAction.CheckBackLater, "checkins",
                "shall i wait here and ask you again in a little while?",
                "i will. i was going to anyway.",
                "understood. i will do it silently instead.");
        }

        // ---- helpers ---------------------------------------------------------------

        private static void Bank(Phrasebook book, ActivityKind kind, string persona, params string[] lines)
        {
            if (lines == null || lines.Length == 0) return;
            var bank = new PhraseBank { Kind = kind, Persona = persona };
            bank.Lines.AddRange(lines);
            book.Banks.Add(bank);
        }

        private static void Offer(Phrasebook book, ActivityKind kind, string persona,
                                  AssistAction action, string topic,
                                  string ask, string accepted, string declined)
        {
            book.Offers.Add(new AssistOffer
            {
                Kind = kind,
                Persona = persona,
                Action = action,
                Topic = topic,
                Ask = ask,
                Accepted = accepted,
                Declined = declined
            });
        }
    }
}
