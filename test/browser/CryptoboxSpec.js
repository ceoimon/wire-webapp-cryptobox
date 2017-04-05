/*
 * Wire
 * Copyright (C) 2016 Wire Swiss GmbH
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see http://www.gnu.org/licenses/.
 *
 */

describe('cryptobox.Cryptobox', function() {

  var cryptobox = undefined;
  var Proteus = undefined;
  var store = undefined;

  beforeAll(function(done) {
    if (typeof window === 'object') {
      cryptobox = window.cryptobox;
      Proteus = window.Proteus;
      done();
    } else {
      cryptobox = require('../../dist/commonjs/wire-webapp-cryptobox');
      Proteus = require('wire-webapp-proteus');
      done();
    }
  });

  beforeEach(function() {
    store = new cryptobox.store.Cache();
  });

  describe('init', function() {
    it('initializes a Cryptobox with a given identity', function(done) {
      var initialIdentity = Proteus.keys.IdentityKeyPair.new();
      var initialFingerPrint = initialIdentity.public_key.fingerprint();

      store.save_identity(initialIdentity)
        .then(function() {
          var box = new cryptobox.Cryptobox(store);
          expect(box.identity).not.toBeDefined();
          box.init()
            .then(function() {
              expect(box.identity.public_key.fingerprint()).toBe(initialFingerPrint);
              done();
            })
            .catch(done.fail);
        })
        .catch(done.fail);
    });

    it('creates a new identity (if none is given) plus the last resort PreKey and saves these', function(done) {
      var box = new cryptobox.Cryptobox(store);
      expect(box.identity).not.toBeDefined();
      box.init()
        .then(function() {
          expect(box.identity).toBeDefined();
          return store.load_identity();
        })
        .then(function(identity) {
          expect(identity.public_key.fingerprint()).toBeDefined();
          return store.load_prekey(Proteus.keys.PreKey.MAX_PREKEY_ID);
        })
        .then(function(preKey) {
          expect(preKey.key_id).toBe(Proteus.keys.PreKey.MAX_PREKEY_ID);
          done();
        })
        .catch(done.fail);
    });

    it('returns the current version', function() {
      expect(cryptobox.Cryptobox.prototype.VERSION).toBeDefined();
    });
  });

  describe('Sessions', function() {

    var box = undefined;
    var sessionId = 'unique_identifier';

    beforeEach(function(done) {
      box = new cryptobox.Cryptobox(store);
      box.init()
        .then(function() {
          var bob = {
            identity: Proteus.keys.IdentityKeyPair.new(),
            prekey: Proteus.keys.PreKey.new(Proteus.keys.PreKey.MAX_PREKEY_ID)
          };
          bob.bundle = Proteus.keys.PreKeyBundle.new(bob.identity.public_key, bob.prekey);

          return Proteus.session.Session.init_from_prekey(box.identity, bob.bundle);
        })
        .then(function(session) {
          var cryptoBoxSession = new cryptobox.CryptoboxSession(sessionId, box.pk_store, session);
          return box.session_save(cryptoBoxSession);
        })
        .then(function() {
          done();
        })
        .catch(done.fail);
    });

    describe('session_from_prekey', function() {
      it('creates a session from a valid PreKey format', function(done) {
        var remotePreKey = {
          id: 65535,
          key: "pQABARn//wKhAFggY/Yre8URI2xF93otjO7pUJ3ZjP4aM+sNJb6pL6J+iYgDoQChAFggZ049puHgS2zw8wjJorpl+EG9/op9qEOANG7ecEU2hfwE9g=="
        };
        var sessionId = 'session_id';
        var decodedPreKeyBundleBuffer = sodium.from_base64(remotePreKey.key).buffer;

        box.session_from_prekey(sessionId, decodedPreKeyBundleBuffer)
          .then(function(session) {
            expect(session.id).toBe(sessionId);
            done();
          })
          .catch(done.fail);
      });

      it('fails for outdated PreKey formats', function(done) {
        var remotePreKey = {
          id: 65535,
          key: "hAEZ//9YIOxZw78oQCH6xKyAI7WqagtbvRZ/LaujG+T790hOTbf7WCDqAE5Dc75VfmYji6wEz976hJ2hYuODYE6pA59DNFn/KQ=="
        };
        var sessionId = 'session_id';
        var decodedPreKeyBundleBuffer = sodium.from_base64(remotePreKey.key).buffer;

        box.session_from_prekey(sessionId, decodedPreKeyBundleBuffer)
          .then(done.fail)
          .catch(function(error) {
            if (error instanceof cryptobox.InvalidPreKeyFormatError) {
              done();
            } else {
              done.fail();
            }
          });
      });
    });

    describe('session_load', function() {
      it('loads a session from the cache', function(done) {
        spyOn(box, 'load_session_from_cache').and.callThrough();
        spyOn(box.store, 'read_session').and.callThrough();
        box.session_load(sessionId)
          .then(function(session) {
            expect(session.id).toBe(sessionId);
            expect(box.load_session_from_cache.calls.count()).toBe(1);
            done();
          })
          .catch(done.fail);
      });
    });

    describe('encrypt', function() {
      it('saves the session after successful encryption', function(done) {
        spyOn(box.store, 'create_session').and.callThrough();
        box.encrypt(sessionId, 'Hello World.')
          .then(function(encryptedBuffer) {
            expect(encryptedBuffer).toBeDefined();
            expect(box.store.create_session.calls.count()).toBe(1);
            done();
          })
          .catch(done.fail);
      });
    });

  });

});