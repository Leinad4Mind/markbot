'use strict';

const crypto = require('crypto');

module.exports = (function () {

  const getHasher = function (secret) {
    return crypto.createHmac('sha512', secret);
  };

  const hash = function (passcode, secret) {
    return getHasher(secret).update(new Buffer(passcode, 'utf-8')).digest('hex');
  };

  const matches = function (passcode, secret, passcodeHash) {
    return (hash(passcode, secret) == passcodeHash);
  };

  return {
    hash: hash,
    matches: matches
  };

}());
