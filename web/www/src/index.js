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

/*******************************************************************************
***** Global
*******************************************************************************/

class PageChangeEvent extends Event {
  constructor(typeArg, eventInit) {
    super(typeArg, eventInit);
    this.page = eventInit.page;
  }
}

function createElement(tagName, attrs, content) {
  const el = document.createElement(tagName);
  if (attrs !== undefined) {
    for (let key in attrs) {
      if (attrs[key] !== undefined) el.setAttribute(key, attrs[key]);
    }
  }
  if (content !== undefined) {
    el.innerText = content;
  }
  return el;
}

Object.defineProperty(window, 'page', {
  get: function() {
    let parts = location.pathname.substring(1).split('/');
    let page = '/';
    if (parts.length > 0) {
      page = '/'+parts.splice(0, 1)[0];
    }
    return {page, parts};
  }
});

HTMLElement.prototype.clearChildren = function() {
  this.innerHTML = '';
};

function isOfBaseType(object, constructor) {
  if (object === undefined || object === null) return false;
  return object.__proto__.constructor === constructor;
}

function textSelector(parent, selector, defaultValue) {
  const el = parent.querySelector(selector);
  if (el === null) return defaultValue;
  if (el.value.length > 0) return el.value;
  return defaultValue;
}

function readMessageFromEditor(editor) {
  return {
    content: textSelector(editor, '.editor--content'),
    embed: {
      title: textSelector(editor, '.editor--title'),
      description: textSelector(editor, '.editor--description'),
      url: undefined,
      color: undefined,
      timestamp: undefined,
      footer: {
        'icon_url': undefined,
        text: textSelector(editor, '.editor--footer-text')
      },
      thumbnail: {
        url: undefined
      },
      image: {
        url: undefined
      },
      author: {
        name: textSelector(editor, '.editor--author-name'),
        url: undefined,
        icon_url: undefined
      },
      fields: Array.from(editor.querySelectorAll('.editor--field')).map(field => {
        return {
          name: textSelector(field, '.editor--field-name'),
          value: textSelector(field, '.editor--field-value'),
          inline: undefined
        };
      }).filter(field => {
        return field.name !== undefined && field.value !== undefined;
      })
    }
  };
}

function createMessage(message) {
  const root = createElement('div', { class: 'message' });
  root.appendChild(createElement('div', { class: 'message--content' }, message.content));

  if (isOfBaseType(message.embed, Object)) {
    const embed = root.appendChild(createElement('div', { class: 'embed' }));
    embed.appendChild(createElement('div', { class: 'embed--pill' }));
    const embedRich = embed.appendChild(createElement('div', { class: 'embed--rich' }));
    const embedContent = embedRich.appendChild(createElement('div', { class: 'embed--content' }));
    const embedContentInner = embedContent.appendChild(createElement('div', { class: 'embed--content--inner' }));

    if (!isOfBaseType(message.embed.author, Object)) message.embed.author = {};
    if (message.embed.author.name !== undefined || message.embed.author.icon_url !== undefined) {
      const embedAuthor = embedContentInner.appendChild(createElement('div', { class: 'embed--author' }));
      embedAuthor.appendChild(createElement('img', { class: 'embed--author-icon', src: message.embed.author['icon_url'] }));
      embedAuthor.appendChild(createElement('a', { class: 'embed--author-name', href: message.embed.author.url }, message.embed.author.name ));
    }

    embedContentInner.appendChild(createElement('a', { class: 'embed--title', src: message.embed.url }, message.embed.title ));
    embedContentInner.appendChild(createElement('div', { class: 'embed--description' }, message.embed.description));

    if (!isOfBaseType(message.embed.fields, Array)) message.embed.fields = [];
    if (message.embed.fields.length > 0) {
      const embedFields = embedContentInner.appendChild(createElement('div', { class: 'embed--fields' }));
      for (let fieldData of message.embed.fields) {
        const field = embedFields.appendChild(createElement('div', { class: 'embed--field' }));
        if (fieldData.inline) field.classList.add('embed--field__inline');
        field.appendChild(createElement('div', { class: 'embed--field-name' }, fieldData.name ));
        field.appendChild(createElement('div', { class: 'embed--field-value' }, fieldData.value ));
      }
    }


    if (!isOfBaseType(message.embed.thumbnail, Object)) message.embed.thumbnail = {};
    embedContent.appendChild(createElement('img', { class: 'embed--rich-thumb', src: message.embed.thumbnail.url }));

    if (!isOfBaseType(message.embed.image, Object)) message.embed.image = {};
    if (message.embed.image.url !== undefined) {
      const embedImage = embedRich.appendChild(createElement('a', { class: 'embed--thumb', href: message.embed.image.url }));
      embedImage.appendChild('img', { src: message.embed.image.url });
    }

    if (!isOfBaseType(message.embed.footer, Object)) message.embed.footer = {};
    if (message.embed.footer.text !== undefined || message.embed.footer.icon_url !== undefined) {
      const embedFooter = embedRich.appendChild(createElement('div', { class: 'embed--footer' }));
      embedFooter.appendChild(createElement('img', { class: 'embed--footer-icon', src: message.embed.footer.icon_url }));
      embedFooter.appendChild(createElement('span', { class: 'embed--fototer-text' }, message.embed.footer.text ));
    }
  }

  return root;
}

/*******************************************************************************
***** Anonymous
*******************************************************************************/

(function() {

let globalGuilds;

function navigateLocal(path) {
  history.pushState({}, undefined, path);
  handleLocationUpdate();
}

function handleLocationUpdate() {
  const page = window.page;
  if (document.querySelector(`section[data-page="${page.page}"]`) !== null) {
    document.documentElement.setAttribute('data-page', page.page);
  } else {
    history.replaceState(null, '', '/');
    document.documentElement.setAttribute('data-page', '/');
  }
  let cancelled = window.dispatchEvent(new PageChangeEvent('pagechange', { page: page }));
  // TODO: Handle cancelation
}


async function init() {
  handleLocationUpdate();
  await initPageHome();
}

async function logout() {
  await fetch('/api/user/logout', { method: 'POST' });
  globalGuilds = undefined;
  await initPageHome();
}

async function initPageHome() {
  const res = await fetch('/api/user');
  const user = await res.json();
  if (res.ok) {
    console.log(user);
    document.getElementById('login-button').innerText = 'Logged in';
    document.getElementById('user-name').innerText = user.username;
    document.getElementById('user-id').innerText = user.id;
    await fetchGuilds();
  } else {
    console.error(user);
    document.getElementById('login-button').innerText = 'Login';
    document.getElementById('user-name').innerText = '';
    document.getElementById('user-id').innerText = '';
    document.getElementById('guilds').clearChildren();
  }
}

async function initPageGuild(guildID) {
  if (globalGuilds === undefined) {
    await fetchGuilds();
    if (globalGuilds === undefined) {
      navigateLocal('/');
      return; // No access to guilds
    }
  }
  if (!(guildID in globalGuilds)) {
    navigateLocal('/');
    return;
  }

  const guildData = globalGuilds[guildID];
  console.log(guildData);
  document.getElementById('guild-name').innerText = guildData.name;
  document.getElementById('guild-id').innerText = guildData.id;

  const parent = document.getElementById('channels');
  parent.clearChildren();
  for (let channel of guildData.channels) {
    if (channel.type === 'text') {
      const el = createElement('div', { class: 'channel', 'data-channel': channel.id, 'data-guild': guildData.id }, `#${channel.name}`);
      parent.appendChild(el);
    }
  }
}

async function initPageChannel(guildID, channelID) {
  if (globalGuilds === undefined) {
    await fetchGuilds();
    if (globalGuilds === undefined) {
      navigateLocal('/');
      return; // No access to guilds
    }
  }
  if (!(guildID in globalGuilds)) {
    navigateLocal('/');
    return;
  }

  const guild = globalGuilds[guildID];
  const channel = guild.channels.find(channel => channel.id === channelID);

  if (channel === undefined) {
    navigateLocal('/');
    return;
  }

  document.getElementById('channel-name').innerText = channel.name;
  document.getElementById('channel-id').innerText = channel.id;
}

async function initPageMessage(guildID, channelID, messageID) {
  updateEditor();
}

async function fetchGuilds() {
  const res = await fetch('/api/user/guilds');
  const guilds = await res.json();
  if (res.ok) {
    let promises = [];
    const parent = document.getElementById('guilds');
    parent.clearChildren();
    for (let guild of guilds) {
      const el = createElement('div', { class: 'guild', 'data-guild': guild });
      el.appendChild(createElement('img', { class: 'guild--icon', src: '' }));
      el.appendChild(createElement('span', { class: 'guild--name' }, guild));
      el.appendChild(createElement('span', { class: 'guild--channels'}, '0 channels'));
      parent.appendChild(el);
      promises.push(fetchGuild(guild, el));
    }
    let res = await Promise.all(promises);

    // Update global guild cache
    let guildOutput = {};
    for (let guild of res) {
      if (guild !== undefined && guild !== null && guild.__proto__.constructor === Object) {
        guildOutput[guild.id] = guild;
      }
    }
    globalGuilds = guildOutput;

  } else {
    console.error(guilds);
  }
}

async function fetchGuild(guild, el) {
  const res = await fetch(`/api/guild/${guild}`);
  let guildData;
  if (res.ok) {
    guildData = await res.json();
    el.querySelector('.guild--icon').src = `https://cdn.discordapp.com/icons/${guildData.id}/${guildData.icon}.png`;
    el.querySelector('.guild--name').innerText = guildData.name;
    el.querySelector('.guild--channels').innerText = `${guildData.channels.length} channels`;
  }
  return guildData;
}

window.addEventListener('popstate', handleLocationUpdate);

window.addEventListener('pagechange', function(e) {
  switch(e.page.page) {
    case '/guild':
    if (e.page.parts.length > 0) {
      initPageGuild.apply(null, e.page.parts).then(null, console.error);
    } else {
      navigateLocal('/');
    }
    break;
    case '/channel':
    if (e.page.parts.length > 1) {
      initPageChannel.apply(null, e.page.parts).then(null, console.error);
    } else {
      navigateLocal('/');
    }
    break;
    case '/message':
    if (e.page.parts.length > 2) {
      initPageMessage.apply(null, e.page.parts).then(null, console.error);
    } else {
      navigateLocal('/');
    }
  }
});

init().then(null, console.error);

window.addEventListener('click', function(e) {
  for (let className of e.target.classList) {
    let target = e.target;
    switch(className) {
      case 'guild--name':
      case 'guild--channels':
      target = target.parentElement;
      case 'guild': {
        const guildID = target.getAttribute('data-guild');
        if (guildID !== null) {
          navigateLocal(`/guild/${guildID}`);
        }
        return;
      }

      case 'channel': {
        const channelID = target.getAttribute('data-channel');
        const guildID = target.getAttribute('data-guild');
        if (channelID !== null && guildID !== null) {
          navigateLocal(`/channel/${guildID}/${channelID}`);
        }
        return;
      }

      case 'button-back':
      history.back();
      break;

      case 'button-logout':
      logout().then(null, console.error);
      break;

      case 'button-new-message': {
        const parts = page.parts;
        if (parts.length > 1) {
          navigateLocal(`/message/${page.parts[0]}/${page.parts[1]}/new`);
        }
        return;
      }

      case 'button-new-field': {
        const template = document.querySelector('template#template-embed-field');
        target.parentElement.parentElement.insertBefore(template.content.cloneNode(true), target.parentElement);
        return;
      }
    }
  }
}, { passive: true });

document.documentElement.addEventListener('load', function(e) {
  if (e.target && e.target.tagName === 'IMG') {
    e.target.setAttribute('data-loaded', 'true');
  }
}, { passive: true, capture: true }, true);

document.documentElement.addEventListener('loadstart', function(e) {
  if (e.target && e.target.tagName === 'IMG') {
    e.target.removeAttribute('data-loaded');
  }
}, { passive: true, capture: true }, true);

const editor = document.querySelector('.editor');
const editorOutput = document.querySelector('.editor-output');
function updateEditor() {
  const message = readMessageFromEditor(editor);
  const output = createMessage(message);
  editorOutput.clearChildren();
  editorOutput.appendChild(output);
}

editor.addEventListener('change', updateEditor, { passive: true, capture: true }, true);
editor.addEventListener('keyup', updateEditor, { passive: true, capture: true }, true);

})();
