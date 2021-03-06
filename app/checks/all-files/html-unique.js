'use strict';

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const exists = require(__dirname + '/../../file-exists');

module.exports.find = function (folderPath, file, uniqueElems) {
  const fullPath = path.resolve(folderPath + '/' + file.path);
  let fileContents;
  let code;
  let uniqueFinds = {};

  if (!exists.check(fullPath)) return false;

  fileContents = fs.readFileSync(fullPath, 'utf8');
  code = cheerio.load(fileContents);

  uniqueElems.forEach(function (elem) {
    let result;
    let sel = (typeof elem === 'string') ? elem : elem[0];
    let key = (typeof elem === 'string') ? elem : elem[1];

    try {
      result = code(sel);
    } catch (e) {
      return uniqueFinds;
    }

    if (result.length <= 0) return uniqueFinds;

    if (sel.match(/\]$/)) {
      uniqueFinds[key] = result.attr(sel.match(/\[([^\]]+)\]$/)[1]).trim();
    } else {
      uniqueFinds[key] = result.html().trim();
    }
  });

  return uniqueFinds;
};
