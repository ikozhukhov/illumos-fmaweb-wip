#!/usr/bin/env node

var fs = require('fs');
var util = require('util');
var sax = require('sax');
var path = require('path');
var async = require('vasync');
var fmamsg = require('fmamsg');

function log(str) {
  console.log(str);
}
function ins(obj) {
  return (util.inspect(obj));
}

const BASEDIR = path.join(__dirname, '..', "msg");

function ind(num) {
  var str = "";
  for (i = 0; i < num; i++)
    str += "    ";
  return (str);
}

function expandMacros(text, patterns) {
  for (elt in patterns) {
    if (!patterns.hasOwnProperty(elt))
      continue;

    text = text.replace(new RegExp('%' + elt + '%', 'gi'), patterns[elt]);
  }
  return text;
}

module.exports.getMessage = function getMessage(msgid, macros, cb) {
  try {
    var entry = fmamsg.decode(msgid);
  } catch (errstr) {
    return cb(errstr, null);
  }

  var dict = entry.name;
  var num = entry.value;

  log("get message for: " + msgid + " dict: " + dict + " entry: " + num);

  var output = {};
  var current_name = null;
  var current_text = "";

  const files = [
    path.join(BASEDIR, "defaults.xml"),
    path.join(BASEDIR, dict, "defaults.xml"),
    path.join(BASEDIR, dict, "properties.xml"),
    path.join(BASEDIR, dict, "entry" + num + ".xml"),
    path.join(BASEDIR, dict, "en", "defaults.xml"),
    path.join(BASEDIR, dict, "en", "properties.xml"),
    path.join(BASEDIR, dict, "en", "entry" + num + ".xml")
  ];

  const HTMLPATH = path.join(BASEDIR, dict, "en");

  function fail(err) {
    cb(err, null);
  }

  function done(data) {
    cb(null, data);
  }

  var q = async.queue(function (fname, next) {
    var file = fs.createReadStream(fname);
    var xml = sax.createStream(true);

    file.on('open', function(fd) {
      log("  ... loading: " + fname);
    });
    file.on('error', function(ex) {
      log("  ... skipping, because: " + ex.message);
      next();
    });

    file.pipe(xml);

    xml.on('error', fail);
    xml.on('text', function(tag) {
      current_text += tag;
    });
    xml.on('opentag', function(tag) {
      current_text = "";
    });
    xml.on('closetag', function(tag) {
      if (tag === "name") {
        current_name = current_text;
      } else if (tag === "item") {
        output[current_name] = expandMacros(current_text, macros);
        current_name = null;
      } else if (tag === "use") {
        var file = path.join(HTMLPATH, current_text);
        try {
            output[current_name] = expandMacros(fs.readFileSync(file, 'utf8'),
                                                macros);
        } catch (e) {
          fail("could not include file: " + e);
        }
      }
    });
    xml.on('end', next);
  }, 1);

  q.drain = function() {
    done(output);
  };

  files.forEach(function (f) {
    q.push(f, function() {});
  });
}
