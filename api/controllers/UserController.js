/**
 * UserController
 *
 * @module		:: Controller
 * @description	:: Get and update information about currently logged in user.
 */
var async = require('async');
var _ = require('underscore');
var tagUtils = require('../services/utils/tag');

/**
 * Gets all the information about a user.
 *
 * @param userId: the id of the user to query
 * @param reqId: the requester's id
 */
var getUser = function (userId, reqId, cb) {
  User.findOneById(userId, function (err, user) {
    if (err) { return cb(err, null); }
    tagUtils.assemble({ userId: userId }, function (err, tags) {
      if (err) { return cb(err, null); }
      for (i in tags) {
        delete tags[i].projectId;
        delete tags[i].taskId;
        delete tags[i].updatedAt;
        delete tags[i].deletedAt;
        delete tags[i].userId;
      }
      user.tags = tags;
      Like.countByTargetId(userId, function (err, likes) {
        if (err) { return cb(err, null); }
        user.likeCount = likes;
        user.like = false;
        user.isOwner = false;
        Like.findOne({ where: { userId: reqId, targetId: userId }}, function (err, like) {
          if (err) { return cb(err, null); }
          if (like) { user.like = true; }
          sails.log.debug('User Get:', user);
          // stop here if the requester id is not the same as the user id
          if (userId != reqId) {
            return cb(null, user);
          }
          // Look up which providers the user has authorized
          UserAuth.findByUserId(userId, function (err, auths) {
            if (err) { return cb(err, null); }
            user.auths = [];
            for (var i = 0; i < auths.length; i++) {
              user.auths.push(auths[i].provider);
            }
            // Look up the user's email addresses
            UserEmail.findByUserId(userId, function (err, emails) {
              if (err) { return cb(err, null); }
              user.isOwner = true;
              user.emails = [];
              if (emails) { user.emails = emails; }
              return cb(null, user);
            });
          });
        });
      });
    });
  });
};

var update = function (req, res) {
  var user = req.user[0];
  var params = _.extend(req.body || {}, req.params);
  sails.log.debug(params);
  if (params.name) { user.name = params.name; }
  if (params.username) { user.username = params.username; }
  if (params.email) { user.email = params.email; }
  if (params.photoId) { user.photoId = params.photoId; }
  if (params.photoUrl) { user.photoUrl = params.photoUrl; }
  if (params.title) { user.title = params.title; }
  if (params.bio) { user.bio = params.bio; }
  // The main user object is being updated
  if (user) {
    sails.log.debug('User Update:', user);
    user.save(function (err) {
      if (err) { return res.send(400, {message:'Error while saving user.'}) }
      // Check if a userauth was removed
      if (params.auths) {
        var checkAuth = function(auth, done) {
          if (_.contains(params.auths, auth.provider)) {
            return done();
          }
          auth.destroy(done);
        };

        UserAuth.findByUserId(req.user[0].id, function (err, auths) {
          if (err) { return res.send(400, {message:'Error finding authorizations.'}); }
          async.each(auths, checkAuth, function(err) {
            if (err) { return res.send(400, {message:'Error finding authorizations.'}); }
            user.auths = params.auths;
            return res.send(user);
          });
        });
      } else {
        res.send(user);
      }
    });
  }
};

module.exports = {

  /**
   * Check if a given username already exists
   *
   * @params :id of the username to test, eg:
   *         user/username/:id such as user/username/foo
   */
  username: function (req, res) {
    User.findOneByUsername(req.route.params.id, function (err, user) {
      if (err) { return res.send(400, {message:'Error looking up username.'}); }
      if (user && req.user[0].id != user.id) return res.send(true);
      return res.send(false);
    });
  },

  info: function (req, res) {
    var reqId = null;
    if (req.user) {
      reqId = req.user[0].id;
    }
    getUser(req.route.params.id, reqId, function (err, user) {
      // prune out any info you don't want to be public here.
      if (err) { return res.send(400, { message: err }); }
      sails.log.debug('User Get:', user);
      res.send(user);
    });
  },

  find: function(req, res) {
    // If the user is not logged in, return null object
    if (!req.user) {
      return res.send(403, null);
    }
    var reqId = null;
    var userId = req.user[0].id;
    if (req.user) {
      reqId = req.user[0].id;
    }
    if (req.route.params.id) {
      userId = req.route.params.id;
    }
    getUser(userId, reqId, function (err, user) {
      // this will only be shown to logged in users.
      if (err) { return res.send(400, { message: err }); }
      sails.log.debug('User Get:', user);
      res.send(user);
    });
  },

  update: function (req, res) {
    return update(req, res);
  },

  photo: function(req, res) {
    if (req.route.params.id) {
      User.findOneById(req.route.params.id, function (err, user) {
        if (err || !user) { return res.redirect('/images/default-user-icon-profile.png'); }
        if (user.photoId) {
          return res.redirect(307, '/api/file/get/' + user.photoId);
        } else if (user.photoUrl) {
          return res.redirect(307, user.photoUrl);
        } else {
          return res.redirect(307, '/images/default-user-icon-profile.png');
        }
      });
    }
  }
};
