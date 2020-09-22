'use strict';

/*
Discord web interface
Copyright (C) 2020  Douile

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

const CLIENT_ID = process.env.CLIENT_ID || ''; // Discord application ID
const CLIENT_SECRET = process.env.CLIENT_SECRET || ''; // Discord application secret
const CLIENT_REDIRECT = process.env.CLIENT_REDIRECT || 'http://localhost:8000/api/oauth2/code'; // URL for discord to redirect back to
const CLIENT_SCOPE = 'identify'; // Client scopes

const URL_API = 'https://discord.com/api/v6';
const URL_AUTHORIZE = `${URL_API}/oauth2/authorize`;
const URL_TOKEN = `${URL_API}/oauth2/token`;
const URL_TOKEN_REVOKE = `${URL_API}/oauth2/token/revoke`;
const URL_ME = `${URL_API}/users/@me`;

const crypto = require('crypto');
const { promisify } = require('util');

const express = require('express');
const cookieParser = require('cookie-parser');
const redis = require('redis');

const fetch = require('node-fetch');

const router = express.Router();

const redisClient = redis.createClient();
redisClient.hsetAsync = promisify(redisClient.hset).bind(redisClient);
redisClient.hgetAsync = promisify(redisClient.hget).bind(redisClient);
redisClient.hgetallAsync = promisify(redisClient.hgetall).bind(redisClient);
redisClient.hdelAsync = promisify(redisClient.hdel).bind(redisClient);
const redisResponses = redis.createClient();
redisResponses.subscribe('response');

const responseListeners = new Map();
redisResponses.on('message', function(channel, message) {
  switch (channel) {
    case 'response':
    const res = JSON.parse(message);
    if (responseListeners.has(res.id)) {
      responseListeners.get(res.id)(res);
      responseListeners.delete(res.id);
    }
    break;
  }
})

/**
* Send a request on the redis "request" channel
* @async
* @param {string} type - The type of request
* @param {string} id - The request ID
* @param {Object} [args] - Additional data to include with request
* @param {number} [timeout] - The time to wait for a response (in ms)
* @return {Promise<Object>} The response
*/
function redisRequest(type, id, args, timeout) {
  if (args === undefined) args = {};
  if (isNaN(timeout)) timeout = 1000;
  return new Promise((resolve, reject) => {
    responseListeners.set(id, resolve);
    args.type = type;
    args.id = id;
    if (redisClient.publish(['request', JSON.stringify(args)])) {
      setTimeout(function() { reject(new Error('Redis request timed out')); }, timeout);
    } else {
      reject(new Error('Unable to request guild'));
    }
  });

}

/**
* Asyncronously generate a random string with given encoding and length
* @async
* @param {number} [size] - The length of the data (default: 32)
* @param {string} [encoding] - The output encoding (default: hex)
* @returns {Promise<string>} random string
*/
function generateState(size, encoding) {
  if (isNaN(size)) size = 32;
  if (!encoding) encoding = 'hex';
  return new Promise((resolve, reject) => {
    crypto.randomBytes(size, (err, buf) => {
      if (err) return reject(err);
      resolve(buf.toString(encoding));
    })
  })
}

/**
* Convert and object to URL from encoded data
* @param {Object} object - The object to encode
* @returns {string} URL form encoded data
*/
const objToForm = function(object) {
  return Object.entries(object).map(entry => `${encodeURIComponent(entry[0])}=${encodeURIComponent(entry[1])}`).join('&');
}

/**
* Fetch a bearer token given oauth2 code
* @async
* @param {string} code - Oauth2 code
* @returns {Promise<Object>} token data response
*/
async function discordToken(code) {
  const body = {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: CLIENT_REDIRECT,
    scope: CLIENT_SCOPE
  };
  console.log(`Fetching token ${URL_TOKEN}`, body);
  const res = await fetch(URL_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: objToForm(body) });
  const data = await res.json();
  return data;
}

/**
* Revoke a discord bearer token
* @async
* @param {string} token - Bearer token
* @returns {Promise<Object>} API response
*/
async function discordTokenRevoke(token) {
  const body = {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    token: token,
    redirect_uri: CLIENT_REDIRECT,
    scope: CLIENT_SCOPE
  };
  console.log(`Revoking token ${URL_TOKEN_REVOKE}`, body);
  const res = await fetch(URL_TOKEN_REVOKE, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: objToForm(body) });
  const data = await res.json();
  return data;
}

/**
* Fetch the discord user associated with given API authorization
* @async
* @param {string} authroization - API authorization (passed directly as "Authorization" header)
* @returns {Promise{Object}} API response
*/
async function discordUser(authorization) {
  const res = await fetch(URL_ME, { headers: { 'Authorization': authorization }});
  const data = await res.json();
  return data;
}

router.use((req, res, next) => {
  res.set('Server', 'DiscordWebAPI/1.0');
  next();
});

router.use(cookieParser());

router.get('/', (req, res) => {
  res.send({ code: 200 });
});

const activeOAuth = new Set();

/**
* Wraps an asyncronous express function, if there is an error then it redirects the request to ""/?error=500&description=Application+error"
* @param {Function<Promise>} asyncFunction - Asyncronous function to wrap
* @returns {oathwrap~inner} wrapper function
*/
function oauthWrap(asyncFunction) {
  /**
  * Inner express function
  * @param {Request} req - Express request
  * @param {Response} res - Express response
  */
  const inner = function(req, res) {
    asyncFunction(req,res).then(null, function(error) {
      console.error(error);
      res.redirect(302, `/?error=500&description=Application+error`);
    });
  }
  return inner;
}

router.get('/oauth2/login', oauthWrap(async (req, res) => {
  let state;
  while (state === undefined || activeOAuth.has(state)) {
    state = await generateState();
  }
  // Add state to active oauth logins
  activeOAuth.add(state);
  // Redirect to discord for oauth2 authentication
  res.redirect(302, `${URL_AUTHORIZE}?response_type=code&client_id=${CLIENT_ID}&scope=${CLIENT_SCOPE}&state=${state}&redirect_uri=${encodeURIComponent(CLIENT_REDIRECT)}&prompt=consent`);
}));

// Handle the redirect back from discord oauth2
router.get('/oauth2/code', oauthWrap(async (req, res) => {
  res.clearCookie('user', { path: '/' }); // Clear any previous logins
  if (req.query.state !== undefined && req.query.state.length > 0 && activeOAuth.delete(req.query.state)) {
    if (req.query.error) {
      // If oauth2 errored return to homepage with error
      res.redirect(302, `/?error=${encodeURIComponent(req.query.error)}&description=${req.query.error_description}`);
    } else {
      const token = await discordToken(req.query.code); // Use oauth2 code to fetch token
      const user = await discordUser(`${token.token_type} ${token.access_token}`); // Use token to fetch user
      console.log(await discordTokenRevoke(token.access_token)); // Revoke token (no longer needed)
      const userState = await generateState(256, 'base64'); // Generate a random state token for the user
      await redisClient.hsetAsync(['sessions', userState, JSON.stringify(user) ]); // Store the state token with the user
      res.cookie('user', userState, { expires: 0, httpOnly: true, /*secure: true,*/ }); // Set state cookie (secure should be true if https is enabled)
      res.redirect(302, '/'); // Redirect back to homepage
    }
  } else {
    res.redirect(302,'/?error=400&description=Invalid+state');
  }
}));

/**
* Wrap an asyncronous express function, if there is an error send a 500 Internal error response
* @param {Function<Promise>} asyncFunction - Asyncronous function to wrap
* @returns {apiWrap~inner} wrapper function
*/
function apiWrap(asyncFunction) {
  /**
  * Inner express function
  * @param {Request} req - Express request
  * @param {Response} res - Express response
  */
  const inner = function(req, res) {
    asyncFunction(req, res).then(null, function(error) {
      console.error(error);
      res.status(500).send({ error: 500, message: 'Internal server error' });
    })
  }
  return inner;
}

/**
* Fetch user data from redis given the session cookie
* Cookie parser middleware must be enabled for this to work
* User structure {@link https://discord.com/developers/docs/resources/user#user-object-user-structure}
* @async
* @param {Request} req - Express request
* @returns {Promise<?Object>} The user or null if no user associated with session
*/
async function fetchUser(req) {
  let user = null;
  if (req.cookies !== undefined && req.cookies.user) {
    user = JSON.parse(await redisClient.hgetAsync(['sessions', req.cookies.user]));
  }
  return user;
}

// Return signed in user data
router.get('/user', apiWrap(async (req, res) => {
  const user = await fetchUser(req);
  if (user !== null) {
    res.send(user);
  } else {
    res.status(403).send({ error: 403, message: 'Unauthorized' });
  }
}));

// Logout a user (delete session)
router.post('/user/logout', apiWrap(async (req, res) => {
  if (req.cookies !== undefined && req.cookies.user) {
    const deleted = await redisClient.hdelAsync(['sessions', req.cookies.user]);
    if (deleted > 0) {
      res.send({ code: 200, message: 'Logged out' });
    } else {
      res.status(403).send({ error: 403, message: 'Unauthorized (no such session)' });
    }
  } else {
    res.status(403).send({ error: 403, message: 'Unauthorized' });
  }
}))

// Fetch guilds user has access to
router.get('/user/guilds', apiWrap(async (req, res) => {
  const user = await fetchUser(req);
  if (user !== null) {
    const owners = await redisClient.hgetallAsync('owners');
    let guilds = [];
    for (let guild in owners) {
      if (owners[guild] === user.id) guilds.push(guild);
    }
    res.send(guilds);
  } else {
    res.status(403).send({ error: 403, message: 'Unauthorized' });
  }
}));

// Fetch detailed data about a guild (if user has access)
router.get('/guild/:guild', apiWrap(async (req, res) => {
  const user = await fetchUser(req);
  if (user === null) return res.status(403).send({ error: '403', message: 'Unauthorized' });
  const owner = await redisClient.hgetAsync(['owners', req.params.guild]); // TODO: Replace with permission check
  if (owner !== user.id) return res.status(403).send({ error: '403', message: 'Unauthorized' });
  const guild = await redisRequest('guild', req.params.guild);
  if (guild.code !== undefined && guild.code !== 200) {
    res.status(guild.code);
  }
  res.send(guild);
}));

// Fetch information about a guild member (if user has access)
router.get('/guild/:guild/member', apiWrap(async (req, res) => {
  const user = await fetchUser(req);
  if (user === null) return res.status(403).send({ error: '403', message: 'Unauthorized' });
  const member = await redisRequest('member', user.id, { guild: req.params.guild });
  if (member.code !== undefined && member.code !== 200) {
    res.status(member.code);
  }
  res.send(member);
}))

router.use((req, res, next) => {
  res.status(404).send({ error: 404, message: 'Route not found'});
});


module.exports = router;
