#!/usr/local/bin/node

const google = require('googleapis');
const googleAuth = require('google-auth-library');
const wanakana = require('wanakana');
const request = require('request');
const fs = require('fs');

var OAuth2 = google.auth.OAuth2;

const sheet_id = process.argv[2];
if (!sheet_id) {
  console.log('Please provide a sheet_id:');
  console.log('  node index.js SHEET_ID');
  process.exit(1);
}

// Bearer token for Quizlet
const access_token = process.env.ACCESS_TOKEN;

// Authorize google client library
const tokens = JSON.parse(fs.readFileSync('credentials.json'));
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
var authClient = new OAuth2(
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
);
authClient.credentials = tokens;

google.options({auth: authClient});
const sheets = google.sheets('v4');
const drive = google.drive('v3');

// Can set this to 'only_me' to make sets private.
const visibility = 'public';

// Get or create a file for the requested spreadsheet, stored in Google Drive
// in your `appDataFolder`, to map sheet tab IDs to Quizlet set IDs.
function getOrCreateMetadata() {
  return new Promise(function(resolve, reject) {
  console.log('looking...');
    drive.files.list({
      spaces: 'appDataFolder',
      q: `name = "${sheet_id}"`,
      pageSize: 100
    }, function(err, res) {
      if (err) return reject(err);

      if (res.files.length > 0) {
        console.log('found existing metadata file');
        drive.files.get({
          fileId: res.files[0].id,
          alt: 'media'
        }, function(err, res) {
          if (err) return reject(err);
          console.log('retrieved metadata contents');
          resolve(res);
        })

      } else {
        console.log('creating metadata file...');
        drive.files.create({
          resource: {
            name: sheet_id,
            parents: ['appDataFolder']
          },
          media: {
            mimeType: 'application/json',
            body: '{}'
          }
        }, function(err, file) {
          if (err) return reject(err);
          console.log('created metadata file');
          resolve({});
        });
      }
    })
  });
}

// Update metadata in Google Drive's appDataFolder
function updateSheetMetadata(metadata, sheet_id) {
  return new Promise(function(resolve, reject) {
    // Search for the file again by name to get the fileId
    // (so we don't have to save it)
    drive.files.list({
      spaces: 'appDataFolder',
      q: `name = "${sheet_id}"`,
      pageSize: 100
    }, function(err, res) {
      if (err) return reject(err);

      console.log('saving metadata...');
      if (res.files.length > 0) {
        drive.files.update({
          fileId: res.files[0].id,
          media: {
            mimeType: 'application/json',
            body: JSON.stringify(metadata)
          }
        }, function(err, file) {
          if (err) return reject(err);
          console.log('metadata saved');
          resolve({});
        });
      }
    });
  });
}

// Lookup a set id by tab id in the sheet metadata.
// If one isn't found, then create a new set.
function getOrCreateSetId(metadata, set_name) {
  return new Promise(function(resolve, reject) {
    if (metadata[set_name]) {
      console.log(`Found existing set id for tab ${set_name}`);
      return resolve(metadata[set_name]);

    } else {
      // create the set first

      console.log("Creating new set...");
      request.post({
        url: `https://api.quizlet.com/2.0/sets`,
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/javascript'
        },
        form: {
          title: `tab id ${set_name}`,
          visibility: visibility,
          whitespace: 1,
          lang_terms: 'ja',
          lang_definitions: 'en',
          definitions: ['', ''],
          terms: ['', ''],
        }
      }, function(err, resp, body) {
        if (err) return reject(err);
        let set_id = JSON.parse(body).set_id;
        metadata[set_name] = set_id;
        console.log(`Created set ${set_id} for tab ${set_name}`);
        return resolve(set_id);
      });
    }
  });
}

// Update a Quizlet set with the given data. If it fails, create the set.
function updateSet(metadata, set_name, data) {
  return new Promise(function(resolve, reject) {
    getOrCreateSetId(metadata, set_name).then(function(set_id) {
      let set_data = {
        whitespace: 1,
        lang_definitions: 'en',
      };

      Object.assign(set_data, data)

      console.log(`Updating set ${set_id}: ${set_name}`);
      request.put({
        url: `https://api.quizlet.com/2.0/sets/${set_id}`,
        headers: {
          Authorization: `Bearer ${access_token}`
        },
        form: set_data
      }, function(err, resp, body) {
        if (err) return reject(err);
        let response = JSON.parse(body);

        if (response.http_code == 404 || response.http_code == 410) {
          // Set not found. Cached set ID may have been deleted.
          // Clear metadata cache for tab, and try creating one more time.
          console.log('set not found');
          metadata[set_name] = null;
          getOrCreateSetId(metadata, set_name).then(function(set_id) {
            request.put({
              url: `https://api.quizlet.com/2.0/sets/${set_id}`,
              headers: {
                Authorization: `Bearer ${access_token}`
              },
              form: set_data
            }, function(err, resp, body) {
              if (err) return reject(err);
              resolve();
            });
          });
        } else {
          console.log(`Updated set ${set_id}`);
          return resolve();
        }
      });
    });
  });
}

// Run the script
// 1. Get set metadata
// 2. Look up sheets
// 3. Loop over each sheet and fetch columns A and B
// 4. Run through Wanakana to get romaji and kana versions of terms
// 5. Update or create two Quizlet sets for each tab
// 6. Save set metadata
getOrCreateMetadata().then(function(metadata) {
  sheets.spreadsheets.get({
    spreadsheetId: sheet_id,
  }, function(err, response) {
    let sheet_promises = [];
    response.sheets.forEach(function(sheet) {
      sheet_promises.push(new Promise(function(resolve,reject) {
        var tab_id = sheet.properties.sheetId;
        var tab_name = sheet.properties.title;

        console.log('fetching', `${tab_name}!A:B`)
        sheets.spreadsheets.values.get({
          spreadsheetId: sheet_id,
          range: `${tab_name}!A:B`
        }, function(err, response) {
          if (err) return reject(err);

          let data = [];
          response.values.forEach(function(row) {
            let romaji = row[0];
            let definition = row[1];
            let kana = wanakana.toKana(romaji);
            data.push({
              romaji: romaji.toLowerCase(),
              definition: definition,
              kana: kana
            });
          })

          terms = data.map(function(i) {return i.romaji});
          terms_kana = data.map(function(i) {return i.kana});
          definitions = data.map(function(i) {return i.definition});

          Promise.all([
            updateSet(metadata, tab_id, {
              title: tab_name,
              lang_terms: 'ja-ro',
              definitions: definitions,
              terms: terms,
            }),
            updateSet(metadata, tab_id + ':kana', {
              title: tab_name + ' (Kana)',
              lang_terms: 'ja',
              definitions: definitions,
              terms: terms_kana,
            })
          ]).then(resolve, reject);
        });
      }));
     })

    Promise.all(sheet_promises).then(function(results) {
      updateSheetMetadata(metadata, sheet_id);
    }, function(reason) {
      console.log('error', reason)
      process.exit(1);
    });
  })

}, function(reason) {
  console.log('error', reason);
  process.exit(1);
});
