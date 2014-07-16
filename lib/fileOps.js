// Simple operations on a file: read, write, append.

"use strict";

var fs = require('fs');
var Q = require('q');
var mkdirp = require('mkdirp');
var pathUtil = require('path');

// Temporary file extensions used for "safe" file overwriting.
var newExt = ".__new__";
var bakExt = ".__bak__";

function isValidReturnType(type) {
    return ['utf8', 'buf', 'json', 'jsonWithDates'].indexOf(type) !== -1;
}

// Matches strings generated by Date.toJSON() which is called to serialize date to JSON.
function jsonDateParser(key, value) {
    var reISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*))(?:Z|(\+|-)([\d|:]*))?$/;
    if (typeof value === 'string') {
        if (reISO.exec(value)) {
            return new Date(value);
        }
    }
    return value;
};

function normalizeDataToWrite(data, options) {
    // if this crazy "if" is true we are sure the passed thing is simple object
    if (Buffer.isBuffer(data) === false &&
            typeof data === 'object' &&
            data != null) {
        data = JSON.stringify(data, null, options.jsonIndent || 0);
    }
    
    return data;
}

function normalizeOptions(options) {
    return options || {};
}

//---------------------------------------------------------
// SYNC
//---------------------------------------------------------

// Reading the file in "safe" mode.
function readSafeSync(path, options) {
    var data;
    
    // try to read normal path
    try {
        data = fs.readFileSync(path, options);
    } catch (err) {
        if (err.code === 'ENOENT') {
            try {
                // if normal path doesn't exist read the BAK path in hope it exists
                data = fs.readFileSync(path + bakExt, options);
            } catch (err2) {
                // no backup either, so file apparently doesn't exist
                return null;
            }
        } else {
            throw err; // nothing of interest for us here, rethrow original error
        }
    }
    
    return data;
}

function read(path, returnAs, options) {
    options = options || {};
    options.returnAs = returnAs;
    
    if (!isValidReturnType(options.returnAs)) {
        options.returnAs = 'utf8';
    }
    
    var encoding = 'utf8';
    if (options.returnAs === 'buf') {
        encoding = null;
    }
    
    var data;
    if (options.safe === true) {
        data = readSafeSync(path, { encoding: encoding });
    } else {
        try {
            data = fs.readFileSync(path, { encoding: encoding });
        } catch (err) {
            if (err.code === 'ENOENT') {
                // if file doesn't exist just return null, no need to raise error
                data = null;
            } else {
                // otherwise rethrow event
                throw err;
            }
        }
    }
    
    if (options.returnAs === 'json') {
        data = JSON.parse(data);
    } else if (options.returnAs === 'jsonWithDates') {
        data = JSON.parse(data, jsonDateParser);
    }
    
    return data;
}

// Like normal fs.writeFileSync, but with mkdirp.
function writeFileSync(path, data, options) {
    try {
        fs.writeFileSync(path, data, options);
    } catch (err) {
        if (err.code === 'ENOENT') {
            // Means parent directory doesn't exist, so create it and try again.
            mkdirp.sync(pathUtil.dirname(path));
            fs.writeFileSync(path, data, options);
        } else {
            throw err;
        }
    }
}

// Writing the file in "safe" mode.
function writeSafeSync(path, data, options) {
    // we are assuming there is file on given path, and we don't want
    // to touch it until we are sure our data has been saved correctly,
    // so write the data into NEW file
    writeFileSync(path + newExt, data, options);
    
    // then rename existing file to BAK (will serve as backup, our operation still could fail)
    var bakFileSet = false;
    try {
        fs.renameSync(path, path + bakExt);
        bakFileSet = true;
    } catch(err) {
        // existing/previous file really doesn't exist, no problemo, carry on
    }
    
    // next rename NEW file to real path
    fs.renameSync(path + newExt, path);
    
    // and finally if bak file exists it is no longer needed
    if (bakFileSet) {
        fs.unlinkSync(path + bakExt);
    }
}

function write(path, data, options) {
    options = normalizeOptions(options);
    data = normalizeDataToWrite(data, options);
    
    if (options.safe === true) {
        writeSafeSync(path, data, { mode: options.mode })
    } else {
        writeFileSync(path, data, { mode: options.mode });
    }
}

function append(path, data, options) {
    try {
        fs.appendFileSync(path, data, options);
    } catch (err) {
        if (err.code === 'ENOENT') {
            // parent directory doesn't exist, so just create it and write the file
            writeFileSync(path, data, options);
        } else {
            throw err;
        }
    }
}

//---------------------------------------------------------
// ASYNC
//---------------------------------------------------------

var qUnlink = Q.denodeify(fs.unlink);
var qReadFile = Q.denodeify(fs.readFile);
var qRename = Q.denodeify(fs.rename);
var qWriteFile = Q.denodeify(fs.writeFile);
var qAppendFile = Q.denodeify(fs.appendFile);
var qMkdirp = Q.denodeify(mkdirp);

// Reading the file in "safe" mode.
function readSafeAsync(path, options) {
    var deferred = Q.defer();
    
    qReadFile(path, options)
    .then(deferred.resolve, function (err) {
        if (err.code === 'ENOENT') {
            // try to read backup file if main file does not exist
            qReadFile(path + bakExt, options)
            .then(deferred.resolve, function (err2) {
                // no backup either, so file apparently doesn't exist
                deferred.resolve(null);
            });
        } else {
            deferred.reject(err);
        }
    });
    
    return deferred.promise;
}

function readAsync(path, returnAs, options) {
    var deferred = Q.defer();
    options = options || {};
    options.returnAs = returnAs;
    
    if (!isValidReturnType(options.returnAs)) {
        options.returnAs = 'utf8';
    }
    
    var encoding = 'utf8';
    if (options.returnAs === 'buf') {
        encoding = null;
    }
    
    if (options.safe === true) {
        readSafeAsync(path, { encoding: encoding })
        .then(dataReady, deferred.reject);
    } else {
        qReadFile(path, { encoding: encoding })
        .then(dataReady, function (err) {
            if (err.code === 'ENOENT') {
                // if file doesn't exist just return null, no need to raise error
                deferred.resolve(null);
            } else {
                // otherwise rethrow event
                deferred.reject(err);
            }
        });
    }
    
    function dataReady(data) {
        // Make final parsing of data before returning.
        if (options.returnAs === 'json') {
            data = JSON.parse(data);
        } else if (options.returnAs === 'jsonWithDates') {
            data = JSON.parse(data, jsonDateParser);
        }
        deferred.resolve(data);
    }
    
    return deferred.promise;
}

// Like normal fs.writeFile, but with mkdirp.
var writeFileAsync = function (path, data, options) {
    var deferred = Q.defer();
    
    qWriteFile(path, data, options)
    .then(deferred.resolve)
    .catch(function (err) {
        // First attempt to write a file ended with error.
        // Check if this is not due to nonexistent parent directory.
        if (err.code === 'ENOENT') {
            // Parent directory doesn't exist, so create it and try again.
            qMkdirp(pathUtil.dirname(path))
            .then(function () {
                return qWriteFile(path, data, options);
            })
            .then(deferred.resolve, deferred.reject);
        } else {
            // Nope, some other error, throw it.
            deferred.reject(err);
        }
    });
    
    return deferred.promise;
};

// Writing the file in "safe" mode.
function writeSafeAsync(path, data, options) {
    var deferred = Q.defer();
    var bakFileSet = false;
    
    // we are assuming there is file on given path, and we don't want
    // to touch it until we are sure our data has been saved correctly,
    // so write the data into NEW file
    writeFileAsync(path + newExt, data, options)
    .then(function () {
        // then rename existing file to BAK (will serve as backup, our operation still could fail)
        qRename(path, path + bakExt)
        .then(function () {
            bakFileSet = true;
            step2();
        }, function (err) {
            // existing/previous file really doesn't exist, no problemo, carry on
            step2();
        });
    });
    
    function step2() {
        // next rename NEW file to real path
        qRename(path + newExt, path)
        .then(function () {
            if (bakFileSet) {
                // and finally if bak file exists it is no longer needed
                qUnlink(path + bakExt)
                .then(deferred.resolve, deferred.reject);
            } else {
                // or finish otherwise
                deferred.resolve();
            }
        }, deferred.reject);
    }
    
    return deferred.promise;
}

function writeAsync(path, data, options) {
    var deferred = Q.defer();
    
    options = normalizeOptions(options);
    data = normalizeDataToWrite(data, options);
    
    if (options.safe === true) {
        writeSafeAsync(path, data, { mode: options.mode })
        .then(deferred.resolve, deferred.reject);
    } else {
        writeFileAsync(path, data, { mode: options.mode })
        .then(deferred.resolve, deferred.reject);
    }
    
    return deferred.promise;
}

function appendAsync(path, data, options) {
    var deferred = Q.defer();
    
    qAppendFile(path, data, options)
    .then(deferred.resolve, function (err) {
        
        if (err.code === 'ENOENT') {
            // if parent directory doesn't exist create it
            mkdirp(pathUtil.dirname(path), function (err) {
                if (err) {
                    // something went wrong with directory creation
                    deferred.reject(err);
                } else {
                    // retry
                    appendAsync(path, data, options)
                    .then(deferred.resolve, deferred.reject);
                }
            });
        } else {
            deferred.reject(err);
        }
        
    });
    
    return deferred.promise;
}

//---------------------------------------------------------
// API
//---------------------------------------------------------

module.exports.read = read;
module.exports.write = write;
module.exports.append = append;

module.exports.readAsync = readAsync;
module.exports.writeAsync = writeAsync;
module.exports.appendAsync = appendAsync;