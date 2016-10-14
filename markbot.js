'use strict';

const
  electron = require('electron'),
  app = electron.app,
  Menu = electron.Menu,
  BrowserWindow = electron.BrowserWindow,
  shell = electron.shell,
  fs = require('fs'),
  path = require('path'),
  util = require('util'),
  https = require('https'),
  crypto = require('crypto'),
  mkdirp = require('mkdirp'),
  markbotFileGenerator = require('./lib/markbot-file-generator'),
  passcode = require('./lib/passcode'),
  locker = require('./lib/locker'),
  requirementsFinder = require('./lib/requirements-finder'),
  lockMatcher = require('./lib/lock-matcher'),
  exists = require('./lib/file-exists'),
  naming = require('./lib/checks/naming-conventions'),
  restrictFileTypes = require('./lib/checks/restrict-file-types'),
  git = require('./lib/checks/git'),
  html = require('./lib/checks/html'),
  htmlUnique = require('./lib/checks/html-unique'),
  css = require('./lib/checks/css'),
  js = require('./lib/checks/javascript'),
  screenshots = require('./lib/checks/screenshots'),
  functionality = require('./lib/checks/functionality-tests'),
  liveWebsite = require('./lib/checks/live-website')
  ;

const MARKBOT_DEVELOP_MENU = !!process.env.MARKBOT_DEVELOP_MENU || false;
const MARKBOT_LOCK_PASSCODE = process.env.MARKBOT_LOCK_PASSCODE || false;
const appMenu = require('./lib/menu');
const MARKBOT_FILE = '.markbot.yml';
const MARKBOT_LOCK_FILE = '.markbot.lock';
const NOT_CHEATER = true;

let
  appPkg = require('./package.json'),
  config = require('./config.json'),
  markbotFile = {},
  mainWindow,
  debugWindow,
  differWindow,
  listener,
  menuCallbacks = {},
  menuOptions = {
    openRepo: false,
    runChecks: false,
    revealFolder: false,
    viewLocal: false,
    viewLive: false,
    signOut: false,
    signOutUsername: false,
    showDevelop: false,
    developMenuItems: false
  },
  markbotFilePath,
  markbotLockFilePath,
  currentFolderPath,
  markbotLockFileLocker,
  actualFilesLocker,
  isCheater = {
    cheated: false,
    matches: {}
  }
;

const updateAppMenu = function () {
  menuOptions.showDevelop = (MARKBOT_DEVELOP_MENU && MARKBOT_LOCK_PASSCODE && passcode.matches(MARKBOT_LOCK_PASSCODE, config.secret, config.passcodeHash));
  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenu.getMenuTemplate(app, listener, menuCallbacks, menuOptions)));
};

const createMainWindow = function () {
  mainWindow = new BrowserWindow({
    width: 800,
    minWidth: 600,
    height: 600,
    minHeight: 550,
    titleBarStyle: 'hidden-inset'
  });

  mainWindow.loadURL('file://' + __dirname + '/frontend/index.html');

  mainWindow.on('closed', function () {
    if (differWindow) differWindow.destroy();
    if (debugWindow) debugWindow.destroy();

    mainWindow = null;
  });

  listener = mainWindow.webContents;
};

const createDebugWindow = function () {
  debugWindow = new BrowserWindow({
    width: 600,
    minWidth: 600,
    height: 300,
    minHeight: 300,
    show: false
  });

  debugWindow.on('close', function (e) {
    e.preventDefault();
    debugWindow.hide();
  })

  debugWindow.loadURL('file://' + __dirname + '/frontend/debug.html');
};

const createWindows = function () {
  createMainWindow();
  createDebugWindow();
};

const initializeInterface = function () {
  let repoOrFolder = (markbotFile.repo) ? markbotFile.repo : currentFolderPath.split(/[\\\/]/).pop();

  mainWindow.setRepresentedFilename(currentFolderPath);
  mainWindow.setTitle(repoOrFolder + ' — Markbot');

  menuOptions.runChecks = true;
  menuOptions.revealFolder = true;
  menuOptions.viewLocal = 'file://' + path.resolve(currentFolderPath + '/' + 'index.html');
  menuOptions.developMenuItems = true;

  if (markbotFile.repo) {
    menuOptions.viewLive = `http://{{username}}.github.io/${repoOrFolder}/`;
    menuOptions.ghIssues = `http://github.com/{{username}}/${repoOrFolder}/issues`;
  }
};

const checkForCheating = function () {
  markbotLockFileLocker = locker.new(config.passcodeHash);
  actualFilesLocker = locker.new(config.passcodeHash);

  markbotLockFileLocker.read(markbotLockFilePath);
  requirementsFinder.lock(listener, actualFilesLocker, currentFolderPath, markbotFile);
  isCheater = lockMatcher.match(markbotLockFileLocker.getLocks(), actualFilesLocker.getLocks());

  if (isCheater.cheated) {
    listener.send('debug', 'CHEATER!');

    for (let match in isCheater.matches) {
      if (!isCheater.matches[match].equal) listener.send('debug', `&nbsp;&nbsp;┖ \`${match}\` is different — expecting: \`${isCheater.matches[match].expectedHash.slice(0, 7)}\`… actual: \`${isCheater.matches[match].actualHash.slice(0, 7)}\`…`);
    };
  }
};

const hasFilesToCheck = function () {
  const noHtmlFiles = (typeof markbotFile.html === 'undefined' || markbotFile.html.length < 1);
  const noCssFiles = (typeof markbotFile.css === 'undefined' || markbotFile.css.length < 1);
  const noJsFiles = (typeof markbotFile.js === 'undefined' || markbotFile.js.length < 1);

  if (noHtmlFiles && noCssFiles && noJsFiles) {
    listener.send('app:file-missing');

    setTimeout(function () {
      listener.send('alert', 'There are no HTML, CSS or Javascript files for Markbot to check');
    }, 75);

    return false;
  }

  return true;
};

const startChecks = function () {
  let markbotGroup = `markbot-${Date.now()}`;
  let repoOrFolder = (markbotFile.repo) ? markbotFile.repo : currentFolderPath.split(/[\\\/]/).pop();

  listener.send('app:file-exists', repoOrFolder);

  if (markbotFile.canvasCourse) listener.send('app:with-canvas');

  listener.send('check-group:new', markbotGroup, 'Markbot file');

  if (markbotFile.internalTemplate) {
    listener.send('check-group:item-new', markbotGroup, 'file', 'Not found');
    listener.send('check-group:item-complete', markbotGroup, 'file', 'Not found');
    listener.send('check-group:item-new', markbotGroup, 'settings', 'Using default settings');
    listener.send('check-group:item-complete', markbotGroup, 'settings', 'Using default settings');
  } else {
    listener.send('check-group:item-new', markbotGroup, 'file', 'Exists');
    listener.send('check-group:item-complete', markbotGroup, 'file', 'Exists');
  }

  if (markbotFile.naming || markbotFile.restrictFileTypes) {
    let group = `naming-${Date.now()}`;

    listener.send('check-group:new', group, 'Naming & files');

    if (markbotFile.naming) naming.check(listener, currentFolderPath, group);
    if (markbotFile.restrictFileTypes) restrictFileTypes.check(listener, currentFolderPath, group);
  }

  if (markbotFile.commits || markbotFile.git) {
    let group = `git-${Date.now()}`;

    if (!markbotFile.git && markbotFile.commits) {
      markbotFile.git = {
        numCommits: markbotFile.commits
      };
    }

    listener.send('check-group:new', group, 'Git & GitHub');
    git.check(listener, currentFolderPath, markbotFile.git, config.ignoreCommitEmails, group);
  }

  if (markbotFile.liveWebsite && markbotFile.repo) {
    let group = `live-website-${Date.now()}`;

    listener.send('check-group:new', group, 'Live website');
    liveWebsite.check(listener, currentFolderPath, group, markbotFile.repo, menuOptions.signOutUsername);
  }

  let uniqueGroup = `html-unique-${Date.now()}`;
  let htmlUniqueId = 'html-unique';
  let htmlUniqueLabel = 'HTML unique content';

  if (markbotFile.allFiles && markbotFile.allFiles.html && markbotFile.allFiles.html.unique) {
    listener.send('check-group:new', uniqueGroup, 'All files');
    listener.send('check-group:item-new', uniqueGroup, htmlUniqueId, htmlUniqueLabel);
    listener.send('check-group:item-computing', uniqueGroup, htmlUniqueId, htmlUniqueLabel);
  }

  if (markbotFile.html) {
    let uniqueCapture = {};
    let uniqueErrors = [];

    markbotFile.html.forEach(function (file) {
      let group = `html-${file.path}-${Date.now()}`;

      listener.send('check-group:new', group, file.path);

      if (isCheater.matches[file.path]) {
        html.check(listener, currentFolderPath, file, group, isCheater.matches[file.path].equal);
      } else {
        html.check(listener, currentFolderPath, file, group, NOT_CHEATER);
      }

      if (markbotFile.allFiles && markbotFile.allFiles.html && markbotFile.allFiles.html.unique) {
        let uniqueFinds = htmlUnique.find(currentFolderPath, file, markbotFile.allFiles.html.unique);

        if (uniqueFinds === false) uniqueErrors.push(`The \`${file.path}\` file cannot be found`);

        for (let uniq in uniqueFinds) {
          if (!uniqueCapture[uniq]) uniqueCapture[uniq] = {};
          if (!uniqueCapture[uniq][uniqueFinds[uniq]]) uniqueCapture[uniq][uniqueFinds[uniq]] = [];
          uniqueCapture[uniq][uniqueFinds[uniq]].push(file.path);
        }
      }
    });

    if (markbotFile.allFiles && markbotFile.allFiles.html && markbotFile.allFiles.html.unique) {
      for (let uniq in uniqueCapture) {
        for (let content in uniqueCapture[uniq]) {
          if (uniqueCapture[uniq][content].length > 1) {
            uniqueErrors.push(`These files share the same \`${uniq}\` but they all should be unique: \`${uniqueCapture[uniq][content].join('`, `')}\``);
          }
        }
      }

      listener.send('check-group:item-complete', uniqueGroup, htmlUniqueId, htmlUniqueLabel, uniqueErrors);
    }
  }

  if (markbotFile.css) {
    markbotFile.css.forEach(function (file) {
      let group = `css-${file.path}-${Date.now()}`;

      listener.send('check-group:new', group, file.path);

      if (isCheater.matches[file.path]) {
        css.check(listener, currentFolderPath, file, group, isCheater.matches[file.path].equal);
      } else {
        css.check(listener, currentFolderPath, file, group, NOT_CHEATER);
      }
    });
  }

  if (markbotFile.js) {
    markbotFile.js.forEach(function (file) {
      let group = `js-${file.path}-${Date.now()}`;

      listener.send('check-group:new', group, file.path);

      if (isCheater.matches[file.path]) {
        js.check(listener, currentFolderPath, file, group, isCheater.matches[file.path].equal);
      } else {
        js.check(listener, currentFolderPath, file, group, NOT_CHEATER);
      }
    });
  }

  if (markbotFile.screenshots) {
    let group = `screenshots-${Date.now()}`;

    listener.send('check-group:new', group, 'Screenshots');

    markbotFile.screenshots.forEach(function (file) {
      screenshots.check(listener, currentFolderPath, file, group);
    });
  }

  if (markbotFile.functionality) {
    let group = `functionality-${Date.now()}`;

    listener.send('check-group:new', group, 'Functionality');

    markbotFile.functionality.forEach(function (file) {
      functionality.check(listener, currentFolderPath, file, group);
    });
  }
};

const handleMarkbotFile = function (mf) {
  markbotFile = mf;

  if (mf.inheritFileNotFound) listener.send('debug', `Inherited Markbot file “${mf.inherit}” not found`);

  initializeInterface();
  updateAppMenu();
  checkForCheating();

  if (hasFilesToCheck()) startChecks();
};

menuCallbacks.showDebugWindow = function () {
  debugWindow.show();
};

app.on('ready', function () {
  createWindows();
  updateAppMenu();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindows();
});

app.on('open-file', function (e, path) {
  e.preventDefault();
  listener.send('app:file-dropped', path);
});

exports.newDebugGroup = function (label) {
  debugWindow.webContents.send('__markbot-debug-group', label);
};

exports.debug = function (args) {
  debugWindow.webContents.send('__markbot-debug', ...args);
};

exports.revealFolder = function () {
  if (currentFolderPath) {
    shell.showItemInFolder(currentFolderPath);
  }
};
menuCallbacks.revealFolder = exports.revealFolder;

exports.disableFolderMenuFeatures = function () {
  menuOptions.runChecks = false;
  menuOptions.revealFolder = false;
  menuOptions.viewLocal = false;
  menuOptions.viewLive = false;
  menuOptions.ghIssues = false;
  updateAppMenu();
};
menuCallbacks.disableFolderMenuFeatures = exports.disableFolderMenuFeatures;

exports.disableSignOut = function () {
  menuOptions.openRepo = false;
  menuOptions.signOut = false;
  menuOptions.signOutUsername = false;
  updateAppMenu();
};

exports.enableSignOut = function (username) {
  menuOptions.openRepo = true;
  menuOptions.signOut = true;
  menuOptions.signOutUsername = username;
  updateAppMenu();
};

exports.copyReferenceScreenshots = function () {
  markbotFile.screenshots.forEach(function (file) {
    if (!file.sizes) return;

    mkdirp.sync(path.resolve(currentFolderPath + '/' + screenshots.REFERENCE_SCREENSHOT_FOLDER));

    file.sizes.forEach(function (width) {
      fs.rename(
        screenshots.getScreenshotPath(currentFolderPath, file.path, width),
        screenshots.getScreenshotPath(currentFolderPath, file.path, width, true)
      );
    });
  });
};
menuCallbacks.copyReferenceScreenshots = exports.copyReferenceScreenshots;

exports.lockRequirements = function () {
  actualFilesLocker.save(markbotLockFilePath);
};
menuCallbacks.lockRequirements = exports.lockRequirements;

exports.onFileDropped = function(filePath) {
  markbotFilePath = path.resolve(filePath + '/' + MARKBOT_FILE);
  markbotLockFilePath = path.resolve(filePath + '/' + MARKBOT_LOCK_FILE);
  currentFolderPath = filePath;

  if (exists.check(markbotFilePath)) {
    markbotFileGenerator.get(markbotFilePath, handleMarkbotFile)
  } else {
    markbotFileGenerator.buildFromFolder(filePath, handleMarkbotFile);
  }
};

exports.showDifferWindow = function (imgs, width) {
  let js = `setImages('${imgs}')`;

  if (!differWindow) {
    differWindow = new BrowserWindow({
      width: 320,
      height: 400,
      minWidth: 320,
      maxHeight: 2000,
      show: false
    });

    differWindow.loadURL(`file://${__dirname}/frontend/differ.html`);

    differWindow.on('close', function (e) {
      e.preventDefault();
      differWindow.hide();
      e.returnValue = false;
    });

    differWindow.on('closed', function () {
      differWindow = null;
    });
  }

  differWindow.setSize(width, 400);
  differWindow.setMaximumSize(width, 2000);
  differWindow.webContents.executeJavaScript(js);
  differWindow.show();
};

exports.submitToCanvas = function (ghUsername, cb) {
  let
    getVars = [
      util.format('gh_repo=%s', encodeURI(markbotFile.repo)),
      util.format('gh_username=%s', encodeURI(ghUsername)),
      util.format('canvas_course=%s', markbotFile.canvasCourse),
      util.format('markbot_version=%s', appPkg.version),
      util.format('cheater=%d', (isCheater.cheated) ? 1 : 0)
    ],
    hash = crypto.createHash('sha512'),
    sig = hash.update(getVars.join('&') + config.passcodeHash, 'utf8').digest('hex')
    ;

  getVars.push(`sig=${sig}`);
  listener.send('debug', getVars.join('&'));

  https.get(util.format(config.proxyUrl, getVars.join('&')), function (res) {
    res.on('data', function (data) {
      cb(false, JSON.parse(data.toString('utf8')));
    });
  }).on('error', function (e) {
    cb(true);
  });
};
