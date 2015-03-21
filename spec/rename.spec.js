"use strict";

describe('rename |', function () {

    var fse = require('fs-extra');
    var pathUtil = require('path');
    var helper = require('./support/spec_helper');
    var jetpack = require('..');

    beforeEach(helper.beforeEach);
    afterEach(helper.afterEach);

    it("renames file", function (done) {

        var preparations = function () {
            helper.clearWorkingDir();
            fse.outputFileSync('a/b.txt', 'abc');
        };

        var expectations = function () {
            expect('a/b.txt').not.toExist();
            expect('a/x.txt').toBeFileWithContent('abc');
        };

        // SYNC
        preparations();
        jetpack.rename('a/b.txt', 'x.txt');
        expectations();

        // ASYNC
        preparations();
        jetpack.renameAsync('a/b.txt', 'x.txt')
        .then(function () {
            expectations();
            done();
        });
    });

    it("renames directory", function (done) {

        var preparations = function () {
            helper.clearWorkingDir();
            fse.outputFileSync('a/b/c.txt', 'abc');
        };

        var expectations = function () {
            expect('a/b').not.toExist();
            expect('a/x').toBeDirectory();
        };

        // SYNC
        preparations();
        jetpack.rename('a/b', 'x');
        expectations();

        // ASYNC
        preparations();
        jetpack.renameAsync('a/b', 'x')
        .then(function () {
            expectations();
            done();
        });
    });

});
