#!/usr/bin/env node

const google = require('googleapis');
const readline = require('readline');
const fs = require('fs');
var OAuth2 = google.auth.OAuth2;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

var oauth2Client = new OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  "urn:ietf:wg:oauth:2.0:oob"
);

// generate a url that asks permissions for Google+ and Google Calendar scopes
var scopes = [
  'https://www.googleapis.com/auth/plus.me',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.appdata'
];

var url = oauth2Client.generateAuthUrl({
  // 'online' (default) or 'offline' (gets refresh_token)
  access_type: 'offline',

  // If you only need one scope you can pass it as a string
  scope: scopes,

  // Optional property that passes state parameters to redirect URI
  // state: 'foo'
});

console.log('Paste following URL into a web browser');
console.log(url);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Provide Key from web page ', function(answer) {
  rl.close();

  oauth2Client.getToken(answer, function (err, tokens) {
    // Now tokens contains an access_token and an optional refresh_token. Save them.
    if (err) { return console.log(err); }
    
    fs.writeFileSync('credentials.json', JSON.stringify(tokens));
    console.log('Credentials written to credentials.json');
  });

});

