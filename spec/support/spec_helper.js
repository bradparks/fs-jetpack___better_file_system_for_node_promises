// Boilerplate code for every test.

var fse = require('fs-extra');
var pathUtil = require('path');
var os = require('os');

var customMatchers = require('./jasmine_matchers');

jasmine.DEFAULT_TIMEOUT_INTERVAL = 500;

var originalCwd = process.cwd();
// The directory we will be using as CWD for tests.
var workingDir = pathUtil.join(os.tmpdir(), 'fs-jetpack-test');

var clearWorkingDir = function () {
    // Clear all contents, but don't remove the main directory
    // (you can't because it is CWD).
    fse.readdirSync('.').forEach(function (filename) {
        fse.removeSync(filename);
    });

    if (fse.readdirSync('.').length > 0) {
        throw "Clearing working directory failed!";
    }
};

module.exports.clearWorkingDir = clearWorkingDir;

module.exports.beforeEach = function () {
    jasmine.addMatchers(customMatchers);

    // Create brand new working directory
    if (fse.existsSync(workingDir)) {
        fse.removeSync(workingDir);
    }
    fse.mkdirSync(workingDir);

    // Set CWD there
    process.chdir(workingDir);

    // Better to be safe than sorry
    if (pathUtil.basename(process.cwd()) !== 'fs-jetpack-test') {
        throw "CWD switch failed!";
    }
};

module.exports.afterEach = function () {
    // Switch CWD back where we were, and clean the clutter.
    process.chdir(originalCwd);
    if (fse.existsSync(workingDir)) {
        fse.removeSync(workingDir);
    }
};