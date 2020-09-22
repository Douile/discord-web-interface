# Discord Web Interface
A node application allowing admins to more easily edit embeds in the browser.

## How to Use

### Requirements

Redis - Redis server must be installed and running (default port)

Node - `npm install` to install node dependencies

### Configuration

Set environment variables
```bash
PORT="8000" # Port to host web server on
CLIENT_ID="" # Discord application ID
CLIENT_SECRET="" # Discord application secret
CLIENT_REDIRECT="http://localhost:8000/api/oauth2/code" # URL to redirect to after oauth
BOT_TOKEN="" # Discord bot token
```

### Running

1. Start redis (`systemctl start redis`)
2. Set env vars
3. Start bot (`npm run-script start-discord`)
4. Start webserver (`npm run-script start-web`)
5. Navigate to website (default: `http://localhost:8000`)

## Plans

### Redis channels

Both the web server and discord bot read and write data to redis. They use 2 channels (pub/sub) to communicate with each other
```
request - Web server publishes requests here, discord bot listens for requests here
response - Discord bot publishes responses here, web server listens for responses
```
On both channels the message is a JSON encoded string with the property ID included to identify the request so that the requester can resume execution after a request (promises used to do this). In the request a "type" attribute is sent to identify what type of action it wishes to carry out. The web server uses a default timeout of _1 second_, this may need to be increased if the latency between both services is higher.

### Packaging

Original plan for packaging is to use docker. 3 images would be needed the discord bot, the web server and a redis instance.

The default redis server could be used [https://hub.docker.com/_/redis](https://hub.docker.com/_/redis).
The containers would need to be linked on a docker network and port 8000 of the web server would need to be exposed. A volume could also be used on the redis container for persistence.


While the web server doesn't support HTTPS an easy way to add it on would be reverse proxying with nginx and adding the TLS layer through that (forwarding rules need to be configured on the express instance to do this).
