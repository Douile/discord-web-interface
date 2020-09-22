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

const BOT_TOKEN = process.env.BOT_TOKEN || ''; // Discord bot token

const { promisify } = require('util');

const discord = require('discord.js');
const redis = require('redis');

const redisClient = redis.createClient();
redisClient.hsetAsync = promisify(redisClient.hset).bind(redisClient);
redisClient.hdelAsync = promisify(redisClient.hdel).bind(redisClient);
redisClient.hmsetAsync = promisify(redisClient.hmset).bind(redisClient);

const redisRequestHandler = redis.createClient();
redisRequestHandler.subscribe('request');

const client = new discord.Client();

function _redis404(requestID) {
  return function() {
    redis404(requestID);
  }
}

/**
* Publish a "404" response with given requestID
* @param {string} requestID - RequestID to respond with 404 to
*/
function redis404(requestID) {
  return redisClient.publish('response', JSON.stringify({ id: requestID, code: 404 }));
}

/**
* A web interface request object
* @typedef {Object} WebInterfaceRequest
* @property {string} type - The type of request (guild, member, message)
* @property {string} id - The ID of the request to send back with response
*/

/**
* Handle messages sent to the redis "request" channel
* Message from web interface should be JSON encoded object {@link WebInterfaceRequest}
* @param {string} channel - The channel name
* @param {string|number} message - The associated message
*/
redisRequestHandler.on('message', function(channel, message) {
  if (channel !== 'request') return;

  const request = JSON.parse(message);

  switch(request.type) {
    case 'guild':
    if (client.guilds.cache.has(request.id)) {
      const guild = client.guilds.cache.get(request.id);
      redisClient.publish('response', JSON.stringify({ id: guild.id, name: guild.name, icon: guild.icon, owner: guild.ownerID,
        channels: Array.from(guild.channels.cache.values()).map(channel => {return {id: channel.id, name: channel.name, type: channel.type}})
      }));
    } else {
      redis404(request.id);
    }
    break;
    case 'member':
    if (client.guilds.cache.has(request.guild)) {
      const guild = client.guilds.cache.get(request.guild);
      guild.members.fetch(request.id).then((member) => {
        redisClient.publish('response', JSON.stringify({ id: member.id, deleted: member.deleted, permissions: member.permissions.bitfield,
          roles: Array.from(member.roles.cache.values()).map(role => {return {id: role.id, name: role.name, position: role.rawPosition, permissions: role.permissions.bitfield}})
        }));
      }).catch(_redis404(request.id));
    } else {
      redis404(request.id);
    }
    break;
  }
})

/**
* Update the redis store with the latest guild data from discord
*/
async function syncGuilds() {
  await redisClient.hmsetAsync('owners', Array.from(client.guilds.cache.values()).reduce((acc, guild) => acc.concat([guild.id, guild.ownerID]), []));
}

client.on('ready', function() {
  syncGuilds().then(null, console.error);
});

client.on('guildCreate', async function(guild) {
  await redisClient.hsetAsync(['owners', guild.id, guild.ownerID]);
});

client.on('guildUpdate', async function(oldGuild, newGuild) {
  if (oldGuild.owner_id !== newGuild.owner_id) {
    await redisClient.hsetAsync(['owners', newGuild.id, newGuild.ownerID]);
  }
})

client.on('guildDelete', async function(guild) {
  await redisClient.hdelAsync(['owners', guild.id]);
})

client.login(BOT_TOKEN);
