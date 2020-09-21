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

const PORT = process.env.PORT || 8000;

const path = require('path');

const express = require('express');

const app = express();

app.use((req, res, next) => {
  console.log(`[${req.ip}] ${req.hostname} ${req.path}`);
  next();
})
app.use('/api', require('./api.js'));

app.use('/', express.static(path.join(__dirname, 'www')));

app.use((req, res, next) => {
  res.sendFile(path.join(__dirname, 'www', 'index.html'));
})

app.disable('x-powered-by');

app.listen(PORT);
console.log(`Listening on 0.0.0.0:${PORT}`);
