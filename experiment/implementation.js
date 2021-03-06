/* eslint-disable object-shorthand */

// Get various parts of the WebExtension framework that we need.
var { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");

// You probably already know what this does.
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

// ChromeUtils.import() works in experiments for core resource urls as it did
// in legacy add-ons. However, chrome:// urls that point to add-on resources no
// longer work, as the "chrome.manifest" file is no longer supported, which
// defined the root path for each add-on. Instead, ChromeUtils.import() needs
// a url generated by 
// 
// let url = context.extension.rootURI.resolve("path/to/file.jsm")
//
// Instead of taking the extension object from the context, you may generate
// the extension object from a given add-on ID as shown in the example below.
// This allows to import a JSM without context, for example inside another JSM.
//
var { ExtensionParent } = ChromeUtils.import("resource://gre/modules/ExtensionParent.jsm");
var extension = ExtensionParent.GlobalManager.getExtension("experiment@sample.extensions.thunderbird.net");
var { myModule } = ChromeUtils.import(extension.rootURI.resolve("modules/myModule.jsm"));

// This is the important part. It implements the functions and events defined in schema.json.
// The variable must have the same name you've been using so far, "myapi" in this case.
var myapi = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      // Again, this key must have the same name.
      myapi: {

        // A function.
        sayHello: async function(name) {
          myModule.incValue();
          Services.wm.getMostRecentWindow("mail:3pane").alert("Hello " + name + "! I counted <" + myModule.getValue() + "> clicks so far.");
        },

        // An event. Most of this is boilerplate you don't need to worry about, just copy it.
        onToolbarClick: new ExtensionCommon.EventManager({
          context,
          name: "myapi.onToolbarClick",
          // In this function we add listeners for any events we want to listen to, and return a
          // function that removes those listeners. To have the event fire in your extension,
          // call fire.async.
          register(fire) {
            function callback(event, id, x, y) {
              return fire.async(id, x, y);
            }

            windowListener.add(callback);
            return function() {
              windowListener.remove(callback);
            };
          },
        }).api(),

      },
    };
  }

  onShutdown(isAppShutdown) {
    // This function is called if the extension is disabled or removed, or Thunderbird closes.
    // We usually do not have to do any cleanup, if Thunderbird is shutting down entirely
    if (isAppShutdown) {
      return;
    }
    console.log("Goodbye world!");

    // Unload the JSM we imported above. This will cause Thunderbird to forget about the JSM, and
    // load it afresh next time `import` is called. (If you don't call `unload`, Thunderbird will
    // remember this version of the module and continue to use it, even if your extension receives
    // an update.) You should *always* unload JSMs provided by your extension.
    Cu.unload(extension.rootURI.resolve("modules/myModule.jsm"));

    // Thunderbird might still cache some of your JavaScript files and even if JSMs have been unloaded,
    // the last used version could be reused on next load, ignoring any changes. Get around this issue
    // by invalidating the caches (this is identical to restarting TB with the -purgecaches parameter):
    Services.obs.notifyObservers(null, "startupcache-invalidate", null);    
  }
};

// A helpful class for listening to windows opening and closing.
// (This file had a lowercase E in Thunderbird 65 and earlier.)
var { ExtensionSupport } = ChromeUtils.import("resource:///modules/ExtensionSupport.jsm");

// This object is just what we're using to listen for toolbar clicks. The implementation isn't
// what this example is about, but you might be interested as it's a common pattern. We count the
// number of callbacks waiting for events so that we're only listening if we need to be.
var windowListener = new class extends ExtensionCommon.EventEmitter {
  constructor() {
    super();
    this.callbackCount = 0;
  }

  handleEvent(event) {
    let toolbar = event.target.closest("toolbar");
    windowListener.emit("toolbar-clicked", toolbar.id, event.clientX, event.clientY);
  }

  add(callback) {
    this.on("toolbar-clicked", callback);
    this.callbackCount++;

    if (this.callbackCount == 1) {
      ExtensionSupport.registerWindowListener("experimentListener", {
        chromeURLs: [
          "chrome://messenger/content/messenger.xhtml",
          "chrome://messenger/content/messenger.xul",
        ],
        onLoadWindow: function(window) {
          let toolbox = window.document.getElementById("mail-toolbox");
          toolbox.addEventListener("click", windowListener.handleEvent);
        },
      });
    }
  }

  remove(callback) {
    this.off("toolbar-clicked", callback);
    this.callbackCount--;

    if (this.callbackCount == 0) {
      for (let window of ExtensionSupport.openWindows) {
        if ([
          "chrome://messenger/content/messenger.xhtml",
          "chrome://messenger/content/messenger.xul",
        ].includes(window.location.href)) {
          let toolbox = window.document.getElementById("mail-toolbox");
          toolbox.removeEventListener("click", this.handleEvent);
        }
      }
      ExtensionSupport.unregisterWindowListener("experimentListener");
    }
  }
};
