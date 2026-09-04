/*
 * Books.app — native macOS shell for the offline Books web app.
 *
 * One NSWindow with a unified (transparent) title bar hosting a WKWebView that loads
 * Contents/Resources/app/index.html from disk. The program is written against the
 * Objective-C runtime through dlopen/dlsym, so it cross-compiles from any host with
 * `zig cc` — no Xcode, no macOS SDK, no frameworks at link time.
 *
 * Native responsibilities (everything else is the web app itself):
 *   • menu bar (Books / File / Edit / View / Window) with the standard shortcuts
 *   • NSOpenPanel for <input type=file> (WKUIDelegate) and File ▸ Add to Library…
 *   • Finder "Open With" / drag onto Dock icon → files are handed to the page
 *   • NSSavePanel for exports, window drag / zoom from HTML chrome
 *   • quit when the last window closes
 *
 * Build: see macos/build.sh
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <stdint.h>
#include <dlfcn.h>

typedef struct objc_object *id;
typedef struct objc_selector *SEL;
typedef id Class;
typedef void (*IMP)(void);
#if defined(__aarch64__)
typedef bool BOOL;
#define BOOL_ENC "B"
#else
typedef signed char BOOL;
#define BOOL_ENC "c"
#endif
typedef struct { double x, y, w, h; } CGRect;
typedef struct { double w, h; } CGSize;
typedef struct { double x, y; } CGPoint;
typedef void *CGEventRef;
typedef struct { void *isa; int flags; int reserved; void (*invoke)(void *, ...); void *descriptor; } BlockLiteral;

static id (*objc_msgSend_)(id, SEL, ...);
static id (*objc_getClass_)(const char *);
static SEL (*sel_registerName_)(const char *);
static Class (*objc_allocateClassPair_)(Class, const char *, size_t);
static void (*objc_registerClassPair_)(Class);
static BOOL (*class_addMethod_)(Class, SEL, IMP, const char *);
static void *(*objc_autoreleasePoolPush_)(void);

#define S(name) sel_registerName_(name)
#define C(name) objc_getClass_(name)

/* ---- typed message helpers ------------------------------------------------------------ */
static id call0(id o, const char *s) { return ((id (*)(id, SEL))objc_msgSend_)(o, S(s)); }
static id call1(id o, const char *s, id a) { return ((id (*)(id, SEL, id))objc_msgSend_)(o, S(s), a); }
static id call2(id o, const char *s, id a, id b) { return ((id (*)(id, SEL, id, id))objc_msgSend_)(o, S(s), a, b); }
static void callv0(id o, const char *s) { ((void (*)(id, SEL))objc_msgSend_)(o, S(s)); }
static void callv1(id o, const char *s, id a) { ((void (*)(id, SEL, id))objc_msgSend_)(o, S(s), a); }
static void call_bool(id o, const char *s, BOOL b) { ((void (*)(id, SEL, BOOL))objc_msgSend_)(o, S(s), b); }
static void call_long(id o, const char *s, long v) { ((void (*)(id, SEL, long))objc_msgSend_)(o, S(s), v); }
static void call_ulong(id o, const char *s, unsigned long v) { ((void (*)(id, SEL, unsigned long))objc_msgSend_)(o, S(s), v); }
static long ret_long(id o, const char *s) { return ((long (*)(id, SEL))objc_msgSend_)(o, S(s)); }
static unsigned long ret_ulong(id o, const char *s) { return ((unsigned long (*)(id, SEL))objc_msgSend_)(o, S(s)); }
static BOOL ret_bool(id o, const char *s) { return ((BOOL (*)(id, SEL))objc_msgSend_)(o, S(s)); }
static BOOL responds(id o, const char *s) { return o && ((BOOL (*)(id, SEL, SEL))objc_msgSend_)(o, S("respondsToSelector:"), S(s)); }
static BOOL is_kind(id o, const char *cls) { return o && ((BOOL (*)(id, SEL, id))objc_msgSend_)(o, S("isKindOfClass:"), C(cls)); }
static id nsstr(const char *utf8) { return ((id (*)(id, SEL, const char *))objc_msgSend_)(C("NSString"), S("stringWithUTF8String:"), utf8 ? utf8 : ""); }
static const char *cstr(id s) { return s ? ((const char *(*)(id, SEL))objc_msgSend_)(s, S("UTF8String")) : ""; }
static id at(id array, unsigned long i) { return ((id (*)(id, SEL, unsigned long))objc_msgSend_)(array, S("objectAtIndex:"), i); }
static id new_obj(const char *cls) { return call0(call0(C(cls), "alloc"), "init"); }
static id nsarray(id *items, unsigned long n) { return ((id (*)(id, SEL, id *, unsigned long))objc_msgSend_)(C("NSArray"), S("arrayWithObjects:count:"), items, n); }
static void invoke_block_id(id block, id arg) { if (block) ((void (*)(void *, id))((BlockLiteral *)block)->invoke)(block, arg); }

/* ---- state ---------------------------------------------------------------------------- */
static id g_app, g_window, g_webview, g_delegate, g_pending;
static bool g_ready = false;
static bool g_selftest = false; /* BOOKS_SELFTEST=1: load the page, open a sample book, report and exit (used by CI) */

/* CoreGraphics (only used by the self-test to synthesize real scroll-wheel events) */
static CGEventRef (*CGEventCreateScrollWheelEvent_)(void *, uint32_t, uint32_t, int32_t, ...);
static void (*CGEventSetLocation_)(CGEventRef, CGPoint);
static void (*CGEventSetFlags_)(CGEventRef, uint64_t);
static uint32_t (*CGMainDisplayID_)(void);
static CGRect (*CGDisplayBounds_)(uint32_t);
static void (*CFRelease_)(const void *);
static void load_coregraphics(void) {
  void *cg = dlopen("/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics", RTLD_NOW);
  void *cf = dlopen("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation", RTLD_NOW);
  if (!cg || !cf) return;
  CGEventCreateScrollWheelEvent_ = (CGEventRef (*)(void *, uint32_t, uint32_t, int32_t, ...))dlsym(cg, "CGEventCreateScrollWheelEvent");
  CGEventSetLocation_ = (void (*)(CGEventRef, CGPoint))dlsym(cg, "CGEventSetLocation");
  CGEventSetFlags_ = (void (*)(CGEventRef, uint64_t))dlsym(cg, "CGEventSetFlags");
  CGMainDisplayID_ = (uint32_t (*)(void))dlsym(cg, "CGMainDisplayID");
  CGDisplayBounds_ = (CGRect (*)(uint32_t))dlsym(cg, "CGDisplayBounds");
  CFRelease_ = (void (*)(const void *))dlsym(cf, "CFRelease");
}

static void eval_js(const char *js) { ((void (*)(id, SEL, id, void *))objc_msgSend_)(g_webview, S("evaluateJavaScript:completionHandler:"), nsstr(js), NULL); }
static void selftest_exit(int code, const char *prefix, const char *detail) {
  FILE *out = code ? stderr : stdout;
  fprintf(out, "%s%s\n", prefix, detail ? detail : "");
  fflush(stdout); fflush(stderr);
  exit(code);
}

/* Read files and hand them to the page as base64 (App.receiveFiles). */
static void send_files(id paths) {
  unsigned long n = ret_ulong(paths, "count");
  if (!n) return;
  id list = new_obj("NSMutableArray");
  for (unsigned long i = 0; i < n; i++) {
    id path = at(paths, i);
    id data = call1(C("NSData"), "dataWithContentsOfFile:", path);
    if (!data) continue;
    id b64 = ((id (*)(id, SEL, unsigned long))objc_msgSend_)(data, S("base64EncodedStringWithOptions:"), 0);
    id keys[] = { nsstr("name"), nsstr("data") };
    id vals[] = { call0(path, "lastPathComponent"), b64 };
    id dict = ((id (*)(id, SEL, id *, id *, unsigned long))objc_msgSend_)(C("NSDictionary"), S("dictionaryWithObjects:forKeys:count:"), vals, keys, 2);
    callv1(list, "addObject:", dict);
  }
  id json = ((id (*)(id, SEL, id, unsigned long, id *))objc_msgSend_)(C("NSJSONSerialization"), S("dataWithJSONObject:options:error:"), list, 0, NULL);
  if (!json) return;
  id jsonStr = ((id (*)(id, SEL, id, unsigned long))objc_msgSend_)(call0(C("NSString"), "alloc"), S("initWithData:encoding:"), json, 4 /* UTF-8 */);
  id js = new_obj("NSMutableString");
  callv1(js, "appendString:", nsstr("window.App && App.receiveFiles && App.receiveFiles("));
  callv1(js, "appendString:", jsonStr);
  callv1(js, "appendString:", nsstr(");"));
  ((void (*)(id, SEL, id, void *))objc_msgSend_)(g_webview, S("evaluateJavaScript:completionHandler:"), js, NULL);
}
static void flush_pending(void) {
  if (!g_ready || !g_pending || !ret_ulong(g_pending, "count")) return;
  send_files(g_pending);
  callv0(g_pending, "removeAllObjects");
}
static void queue_files(id paths) {
  unsigned long n = ret_ulong(paths, "count");
  for (unsigned long i = 0; i < n; i++) callv1(g_pending, "addObject:", at(paths, i));
  flush_pending();
}

static id open_panel(BOOL multiple) {
  id panel = call0(C("NSOpenPanel"), "openPanel");
  call_bool(panel, "setAllowsMultipleSelection:", multiple);
  call_bool(panel, "setCanChooseFiles:", 1);
  call_bool(panel, "setCanChooseDirectories:", 0);
  callv1(panel, "setMessage:", nsstr("Add EPUB, Kindle (MOBI/AZW3), PDF or text files to your library"));
  callv1(panel, "setPrompt:", nsstr("Add"));
  id types[] = { nsstr("epub"), nsstr("mobi"), nsstr("azw"), nsstr("azw3"), nsstr("prc"), nsstr("pdf"), nsstr("txt"), nsstr("text"), nsstr("md"), nsstr("markdown") };
  if (responds(panel, "setAllowedFileTypes:")) callv1(panel, "setAllowedFileTypes:", nsarray(types, 10));
  long result = ret_long(panel, "runModal");
  return result == 1 /* NSModalResponseOK */ ? call0(panel, "URLs") : NULL;
}

/* ---- delegate methods ----------------------------------------------------------------- */
static BOOL dg_terminate_after_last_window(id self, SEL _cmd, id sender) { (void)self; (void)_cmd; (void)sender; return 1; }
static BOOL dg_secure_state(id self, SEL _cmd, id app) { (void)self; (void)_cmd; (void)app; return 1; }
static void dg_did_finish_launching(id self, SEL _cmd, id note) {
  (void)self; (void)_cmd; (void)note;
  callv1(g_window, "makeKeyAndOrderFront:", NULL);
  call_bool(g_app, "activateIgnoringOtherApps:", 1);
}
static void dg_open_files(id self, SEL _cmd, id app, id filenames) {
  (void)self; (void)_cmd;
  queue_files(filenames);
  call_long(app, "replyToOpenOrPrint:", 0 /* NSApplicationDelegateReplySuccess */);
}
static void dg_add_to_library(id self, SEL _cmd, id sender) {
  (void)self; (void)_cmd; (void)sender;
  id urls = open_panel(1);
  if (!urls) return;
  id paths = new_obj("NSMutableArray");
  unsigned long n = ret_ulong(urls, "count");
  for (unsigned long i = 0; i < n; i++) callv1(paths, "addObject:", call0(at(urls, i), "path"));
  queue_files(paths);
}
/* WKUIDelegate: <input type=file> */
static void dg_run_open_panel(id self, SEL _cmd, id webView, id params, id frame, id completion) {
  (void)self; (void)_cmd; (void)webView; (void)frame;
  BOOL multiple = responds(params, "allowsMultipleSelection") ? ret_bool(params, "allowsMultipleSelection") : 1;
  invoke_block_id(completion, open_panel(multiple));
}
/* Self-test only: deliver a real scroll-wheel event (mouse notch semantics: line units, no precise deltas) to the
   web view, exactly as AppKit would for a physical mouse. dy/dx are wheel notches (negative dy = scroll down,
   negative dx = tilt right); shift adds the ⇧ modifier. */
static id wheel_event_at(int dy, int dx, bool shift, CGPoint cgLocation) {
  CGEventRef ev = CGEventCreateScrollWheelEvent_(NULL, 1 /* kCGScrollEventUnitLine */, 2, (int32_t)dy, (int32_t)dx);
  if (!ev) return NULL;
  CGEventSetLocation_(ev, cgLocation);
  CGEventSetFlags_(ev, shift ? (uint64_t)0x20000 /* kCGEventFlagMaskShift */ : 0);
  id nsev = call1(C("NSEvent"), "eventWithCGEvent:", ev);
  if (CFRelease_) CFRelease_(ev);
  return nsev;
}
static void post_wheel(int dy, int dx, bool shift) {
  if (!CGEventCreateScrollWheelEvent_ || !CGEventSetLocation_ || !CGEventSetFlags_ || !CGMainDisplayID_ || !CGDisplayBounds_) {
    fprintf(stderr, "SELFTEST: CoreGraphics is unavailable; cannot synthesize wheel events\n"); return;
  }
  CGRect display = CGDisplayBounds_(CGMainDisplayID_());
  CGPoint inWindow = { 600, 400 }; /* a point well inside the book, in window coordinates */
  /* AppKit gives a windowless event's location in screen coordinates and WebKit reads it as view coordinates, so
     aim for the screen point that equals the window point. If AppKit attached our window instead, re-aim so the
     window-relative location lands on the same spot. */
  CGPoint cg = { inWindow.x, display.h - inWindow.y };
  id nsev = wheel_event_at(dy, dx, shift, cg);
  if (nsev && call0(nsev, "window")) {
    CGPoint scr = ((CGPoint (*)(id, SEL, CGPoint))objc_msgSend_)(g_window, S("convertPointToScreen:"), inWindow);
    CGPoint cg2 = { scr.x, display.h - scr.y };
    nsev = wheel_event_at(dy, dx, shift, cg2);
  }
  if (!nsev) { fprintf(stderr, "SELFTEST: could not create an NSEvent for the wheel\n"); return; }
  double evDy = ((double (*)(id, SEL))objc_msgSend_)(nsev, S("deltaY")), evDx = ((double (*)(id, SEL))objc_msgSend_)(nsev, S("deltaX"));
  CGPoint loc = ((CGPoint (*)(id, SEL))objc_msgSend_)(nsev, S("locationInWindow"));
  printf("SELFTEST: wheel event deltaY %g deltaX %g shift %d at (%g, %g) window %s\n", evDy, evDx, shift ? 1 : 0, loc.x, loc.y, call0(nsev, "window") ? "attached" : "none"); fflush(stdout);
  callv1(g_webview, "scrollWheel:", nsev);
}

/* WKScriptMessageHandler: window.webkit.messageHandlers.books.postMessage({type, ...}) */
static void dg_script_message(id self, SEL _cmd, id controller, id message) {
  (void)self; (void)_cmd; (void)controller;
  id body = call0(message, "body");
  id type = NULL, name = NULL, content = NULL;
  if (is_kind(body, "NSDictionary")) {
    type = call1(body, "objectForKey:", nsstr("type"));
    name = call1(body, "objectForKey:", nsstr("name"));
    content = call1(body, "objectForKey:", nsstr("content"));
  } else if (is_kind(body, "NSString")) type = body;
  const char *t = cstr(type);
  if (!strcmp(t, "ready")) {
    g_ready = true; flush_pending();
    if (g_selftest) {
      id books = is_kind(body, "NSDictionary") ? call1(body, "objectForKey:", nsstr("books")) : NULL;
      printf("SELFTEST: page ready (%ld books in library)\n", books ? ret_long(books, "integerValue") : -1L); fflush(stdout);
      eval_js("window.App && App.selfTest && App.selfTest();");
    }
  }
  else if (!strcmp(t, "selftest")) {
    id ok = is_kind(body, "NSDictionary") ? call1(body, "objectForKey:", nsstr("ok")) : NULL;
    id detail = is_kind(body, "NSDictionary") ? call1(body, "objectForKey:", nsstr("detail")) : NULL;
    bool pass = ok && ret_bool(ok, "boolValue");
    if (g_selftest) selftest_exit(pass ? 0 : 1, pass ? "SELFTEST OK: " : "SELFTEST FAIL: ", cstr(detail));
  }
  else if (!strcmp(t, "selftestWheel") && g_selftest && is_kind(body, "NSDictionary")) {
    id dy = call1(body, "objectForKey:", nsstr("dy")), dx = call1(body, "objectForKey:", nsstr("dx")), shift = call1(body, "objectForKey:", nsstr("shift"));
    post_wheel(dy ? (int)ret_long(dy, "integerValue") : 0, dx ? (int)ret_long(dx, "integerValue") : 0, shift ? ret_bool(shift, "boolValue") : false);
  }
  else if (!strcmp(t, "dragWindow")) { id ev = call0(g_app, "currentEvent"); if (ev && responds(g_window, "performWindowDragWithEvent:")) callv1(g_window, "performWindowDragWithEvent:", ev); }
  else if (!strcmp(t, "zoomWindow")) callv1(g_window, "performZoom:", NULL);
  else if (!strcmp(t, "minimize")) callv1(g_window, "performMiniaturize:", NULL);
  else if (!strcmp(t, "close")) callv1(g_window, "performClose:", NULL);
  else if (!strcmp(t, "toggleFullScreen")) callv1(g_window, "toggleFullScreen:", NULL);
  else if (!strcmp(t, "pickFiles")) dg_add_to_library(self, _cmd, NULL);
  else if (!strcmp(t, "saveFile") && is_kind(content, "NSString")) {
    id panel = call0(C("NSSavePanel"), "savePanel");
    if (is_kind(name, "NSString")) callv1(panel, "setNameFieldStringValue:", name);
    if (ret_long(panel, "runModal") == 1) {
      id url = call0(panel, "URL");
      ((BOOL (*)(id, SEL, id, BOOL, unsigned long, id *))objc_msgSend_)(content, S("writeToURL:atomically:encoding:error:"), url, 1, 4, NULL);
    }
  }
}

/* WKNavigationDelegate / timer hooks used by the self-test */
static void dg_did_finish_navigation(id self, SEL _cmd, id webView, id navigation) { (void)self; (void)_cmd; (void)webView; (void)navigation; if (g_selftest) { printf("SELFTEST: index.html loaded\n"); fflush(stdout); } }
static void dg_navigation_failed(id self, SEL _cmd, id webView, id navigation, id error) {
  (void)self; (void)_cmd; (void)webView; (void)navigation;
  if (g_selftest) selftest_exit(2, "SELFTEST FAIL: navigation failed: ", cstr(call0(error, "localizedDescription")));
}
static void dg_process_terminated(id self, SEL _cmd, id webView) { (void)self; (void)_cmd; (void)webView; if (g_selftest) selftest_exit(3, "SELFTEST FAIL: web content process terminated", NULL); }
static void dg_selftest_timeout(id self, SEL _cmd, id timer) { (void)self; (void)_cmd; (void)timer; selftest_exit(1, "SELFTEST FAIL: timed out waiting for the page", NULL); }
/* NSWindowDelegate: tell the page when the window enters / leaves native full screen so the reader can hide its chrome. */
static void dg_did_enter_fullscreen(id self, SEL _cmd, id note) { (void)self; (void)_cmd; (void)note; eval_js("window.App && App.setNativeFullscreen && App.setNativeFullscreen(true);"); }
static void dg_did_exit_fullscreen(id self, SEL _cmd, id note) { (void)self; (void)_cmd; (void)note; eval_js("window.App && App.setNativeFullscreen && App.setNativeFullscreen(false);"); }

static Class make_delegate_class(void) {
  Class cls = objc_allocateClassPair_(C("NSObject"), "BooksShellDelegate", 0);
  class_addMethod_(cls, S("applicationShouldTerminateAfterLastWindowClosed:"), (IMP)dg_terminate_after_last_window, BOOL_ENC "@:@");
  class_addMethod_(cls, S("applicationSupportsSecureRestorableState:"), (IMP)dg_secure_state, BOOL_ENC "@:@");
  class_addMethod_(cls, S("applicationDidFinishLaunching:"), (IMP)dg_did_finish_launching, "v@:@");
  class_addMethod_(cls, S("application:openFiles:"), (IMP)dg_open_files, "v@:@@");
  class_addMethod_(cls, S("addToLibrary:"), (IMP)dg_add_to_library, "v@:@");
  class_addMethod_(cls, S("webView:runOpenPanelWithParameters:initiatedByFrame:completionHandler:"), (IMP)dg_run_open_panel, "v@:@@@@?");
  class_addMethod_(cls, S("userContentController:didReceiveScriptMessage:"), (IMP)dg_script_message, "v@:@@");
  class_addMethod_(cls, S("webView:didFinishNavigation:"), (IMP)dg_did_finish_navigation, "v@:@@");
  class_addMethod_(cls, S("webView:didFailProvisionalNavigation:withError:"), (IMP)dg_navigation_failed, "v@:@@@");
  class_addMethod_(cls, S("webView:didFailNavigation:withError:"), (IMP)dg_navigation_failed, "v@:@@@");
  class_addMethod_(cls, S("webViewWebContentProcessDidTerminate:"), (IMP)dg_process_terminated, "v@:@");
  class_addMethod_(cls, S("selftestTimeout:"), (IMP)dg_selftest_timeout, "v@:@");
  class_addMethod_(cls, S("windowDidEnterFullScreen:"), (IMP)dg_did_enter_fullscreen, "v@:@");
  class_addMethod_(cls, S("windowDidExitFullScreen:"), (IMP)dg_did_exit_fullscreen, "v@:@");
  objc_registerClassPair_(cls);
  return cls;
}

/* ---- menu bar ------------------------------------------------------------------------- */
static id add_item(id menu, const char *title, const char *action, const char *key, unsigned long mods, id target) {
  id item = ((id (*)(id, SEL, id, SEL, id))objc_msgSend_)(call0(C("NSMenuItem"), "alloc"), S("initWithTitle:action:keyEquivalent:"), nsstr(title), action ? S(action) : NULL, nsstr(key));
  if (mods) call_ulong(item, "setKeyEquivalentModifierMask:", mods);
  if (target) callv1(item, "setTarget:", target);
  callv1(menu, "addItem:", item);
  return item;
}
static void add_separator(id menu) { callv1(menu, "addItem:", call0(C("NSMenuItem"), "separatorItem")); }
static id add_submenu(id mainMenu, const char *title) {
  id item = new_obj("NSMenuItem");
  id menu = call1(call0(C("NSMenu"), "alloc"), "initWithTitle:", nsstr(title));
  callv1(item, "setSubmenu:", menu);
  callv1(mainMenu, "addItem:", item);
  return menu;
}
static void build_menu(void) {
  const unsigned long CMD = 1UL << 20, OPT = 1UL << 19, CTRL = 1UL << 18;
  id mainMenu = new_obj("NSMenu");
  id appMenu = add_submenu(mainMenu, "Books");
  add_item(appMenu, "About Books", "orderFrontStandardAboutPanel:", "", 0, NULL);
  add_separator(appMenu);
  add_item(appMenu, "Hide Books", "hide:", "h", 0, NULL);
  add_item(appMenu, "Hide Others", "hideOtherApplications:", "h", CMD | OPT, NULL);
  add_item(appMenu, "Show All", "unhideAllApplications:", "", 0, NULL);
  add_separator(appMenu);
  add_item(appMenu, "Quit Books", "terminate:", "q", 0, NULL);
  id fileMenu = add_submenu(mainMenu, "File");
  add_item(fileMenu, "Add to Library…", "addToLibrary:", "o", 0, g_delegate);
  add_separator(fileMenu);
  add_item(fileMenu, "Close Window", "performClose:", "w", 0, NULL);
  id editMenu = add_submenu(mainMenu, "Edit");
  add_item(editMenu, "Undo", "undo:", "z", 0, NULL);
  add_item(editMenu, "Redo", "redo:", "Z", 0, NULL);
  add_separator(editMenu);
  add_item(editMenu, "Cut", "cut:", "x", 0, NULL);
  add_item(editMenu, "Copy", "copy:", "c", 0, NULL);
  add_item(editMenu, "Paste", "paste:", "v", 0, NULL);
  add_item(editMenu, "Select All", "selectAll:", "a", 0, NULL);
  id viewMenu = add_submenu(mainMenu, "View");
  add_item(viewMenu, "Enter Full Screen", "toggleFullScreen:", "f", CMD | CTRL, NULL);
  id windowMenu = add_submenu(mainMenu, "Window");
  add_item(windowMenu, "Minimize", "performMiniaturize:", "m", 0, NULL);
  add_item(windowMenu, "Zoom", "performZoom:", "", 0, NULL);
  add_separator(windowMenu);
  add_item(windowMenu, "Bring All to Front", "arrangeInFront:", "", 0, NULL);
  callv1(g_app, "setMainMenu:", mainMenu);
  callv1(g_app, "setWindowsMenu:", windowMenu);
}

/* ---- main ----------------------------------------------------------------------------- */
static void *need(void *handle, const char *sym) {
  void *p = dlsym(handle, sym);
  if (!p) { fprintf(stderr, "Books: missing symbol %s\n", sym); exit(1); }
  return p;
}

int main(void) {
  void *objc = dlopen("/usr/lib/libobjc.A.dylib", RTLD_NOW);
  if (!objc) { fprintf(stderr, "Books: cannot load the Objective-C runtime\n"); return 1; }
  objc_msgSend_ = (id (*)(id, SEL, ...))need(objc, "objc_msgSend");
  objc_getClass_ = (id (*)(const char *))need(objc, "objc_getClass");
  sel_registerName_ = (SEL (*)(const char *))need(objc, "sel_registerName");
  objc_allocateClassPair_ = (Class (*)(Class, const char *, size_t))need(objc, "objc_allocateClassPair");
  objc_registerClassPair_ = (void (*)(Class))need(objc, "objc_registerClassPair");
  class_addMethod_ = (BOOL (*)(Class, SEL, IMP, const char *))need(objc, "class_addMethod");
  objc_autoreleasePoolPush_ = (void *(*)(void))need(objc, "objc_autoreleasePoolPush");
  if (!dlopen("/System/Library/Frameworks/AppKit.framework/AppKit", RTLD_NOW)) { fprintf(stderr, "Books: cannot load AppKit\n"); return 1; }
  if (!dlopen("/System/Library/Frameworks/WebKit.framework/WebKit", RTLD_NOW)) { fprintf(stderr, "Books: cannot load WebKit\n"); return 1; }
  if (getenv("BOOKS_SELFTEST")) load_coregraphics();
  objc_autoreleasePoolPush_();
  g_selftest = getenv("BOOKS_SELFTEST") != NULL;
  if (g_selftest) { printf("SELFTEST: starting Books shell\n"); fflush(stdout); }

  g_app = call0(C("NSApplication"), "sharedApplication");
  call_long(g_app, "setActivationPolicy:", 0 /* NSApplicationActivationPolicyRegular */);
  g_pending = new_obj("NSMutableArray");
  g_delegate = call0(call0((id)make_delegate_class(), "alloc"), "init");
  callv1(g_app, "setDelegate:", g_delegate);
  build_menu();

  id bundle = call0(C("NSBundle"), "mainBundle");
  id appDir = call1(call0(bundle, "resourcePath"), "stringByAppendingPathComponent:", nsstr("app"));
  id indexPath = call1(appDir, "stringByAppendingPathComponent:", nsstr("index.html"));

  CGRect frame = { 0, 0, 1280, 820 };
  unsigned long style = 1 /* titled */ | 2 /* closable */ | 4 /* miniaturizable */ | 8 /* resizable */ | (1UL << 15) /* full-size content view */;
  g_window = ((id (*)(id, SEL, CGRect, unsigned long, unsigned long, BOOL))objc_msgSend_)(call0(C("NSWindow"), "alloc"), S("initWithContentRect:styleMask:backing:defer:"), frame, style, 2 /* buffered */, 0);
  callv1(g_window, "setTitle:", nsstr("Books"));
  call_long(g_window, "setTitleVisibility:", 1 /* NSWindowTitleHidden */);
  call_bool(g_window, "setTitlebarAppearsTransparent:", 1);
  call_bool(g_window, "setReleasedWhenClosed:", 0);
  call_bool(g_window, "setMovableByWindowBackground:", 0);
  CGSize minSize = { 720, 480 };
  ((void (*)(id, SEL, CGSize))objc_msgSend_)(g_window, S("setMinSize:"), minSize);
  callv1(g_window, "setBackgroundColor:", call0(C("NSColor"), "windowBackgroundColor"));
  callv1(g_window, "setDelegate:", g_delegate);

  id config = new_obj("WKWebViewConfiguration");
  id prefs = call0(config, "preferences");
  if (responds(prefs, "_setAllowFileAccessFromFileURLs:")) call_bool(prefs, "_setAllowFileAccessFromFileURLs:", 1);
  if (responds(prefs, "_setDeveloperExtrasEnabled:")) call_bool(prefs, "_setDeveloperExtrasEnabled:", 1);
  if (responds(prefs, "setElementFullscreenEnabled:")) call_bool(prefs, "setElementFullscreenEnabled:", 1);
  id ucc = call0(config, "userContentController");
  call2(ucc, "addScriptMessageHandler:name:", g_delegate, nsstr("books"));
  id script = ((id (*)(id, SEL, id, long, BOOL))objc_msgSend_)(call0(C("WKUserScript"), "alloc"), S("initWithSource:injectionTime:forMainFrameOnly:"), nsstr("window.__BOOKS_SHELL__ = 'macos';"), 0 /* at document start */, 1);
  callv1(ucc, "addUserScript:", script);
  g_webview = ((id (*)(id, SEL, CGRect, id))objc_msgSend_)(call0(C("WKWebView"), "alloc"), S("initWithFrame:configuration:"), frame, config);
  call_ulong(g_webview, "setAutoresizingMask:", 2 /* width sizable */ | 16 /* height sizable */);
  callv1(g_webview, "setUIDelegate:", g_delegate);
  callv1(g_webview, "setNavigationDelegate:", g_delegate);
  callv1(call0(g_window, "contentView"), "addSubview:", g_webview);

  id defaults = call0(C("NSUserDefaults"), "standardUserDefaults");
  BOOL hasSavedFrame = call1(defaults, "objectForKey:", nsstr("NSWindow Frame BooksMainWindow")) != NULL;
  ((BOOL (*)(id, SEL, id))objc_msgSend_)(g_window, S("setFrameAutosaveName:"), nsstr("BooksMainWindow"));
  if (!hasSavedFrame) callv0(g_window, "center");

  id indexURL = call1(C("NSURL"), "fileURLWithPath:", indexPath);
  id dirURL = ((id (*)(id, SEL, id, BOOL))objc_msgSend_)(C("NSURL"), S("fileURLWithPath:isDirectory:"), appDir, 1);
  call2(g_webview, "loadFileURL:allowingReadAccessToURL:", indexURL, dirURL);

  if (g_selftest) ((id (*)(id, SEL, double, id, SEL, id, BOOL))objc_msgSend_)(C("NSTimer"), S("scheduledTimerWithTimeInterval:target:selector:userInfo:repeats:"), 120.0, g_delegate, S("selftestTimeout:"), NULL, 0);

  callv1(g_window, "makeKeyAndOrderFront:", NULL);
  call_bool(g_app, "activateIgnoringOtherApps:", 1);
  callv0(g_app, "run");
  return 0;
}
