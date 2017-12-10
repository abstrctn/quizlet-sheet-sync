# Quizlet Sheet Sync

This is a set of helper scripts for taking source vocabulary terms and definitions stored in a Google Spreadsheet and uploading them to Quizlet as study sets.

While Quizlet has easy ways to import vocabulary from a sources like spreadsheets and CSV files, there is no simple way to continually update sets from an external data source like a Google Sheet. This script lets you keep using Sheets as the primary mechanism for editing and adding to your sets.

It assumes the terms are in romaji, with lowercase used for Hirigana and uppercase for Katakana. Using the Wanakana node library, it creates a duplicate set of study sets using Kana (Quizlet doesn't let you define terms in multiple character sets).

After authorizing Google and Quizlet, you can run the script against a Google Spreadsheet ID. Every tab in the spreadsheet should have at least two columns, with column A containing romaji words and B containing their definitions. The sets take their titles from the spreadsheet tabs.

Examples:
* [Spreadsheet](https://docs.google.com/spreadsheets/d/1icfsh65_1dCcBFHBlaISUdicT_fi7WxFvt-S5U9Ytq8/edit#gid=825944134) (These are probably not all correct!)
* [Quizlet Set](https://quizlet.com/252052538/time-kana-flash-cards/)

## Authorizing services

To run this script, we need to authenticate against both Google (to access your spreadsheet and save some metadata in your Google Drive folder) and Quizlet (to create your study sets).

## Getting an authorization token for Google

Instead of running through oauth on each request, this library expects you to proivde a finished set of credential tokens in `credentials.json`.

To get these, you'll need a Client ID and Client Secret from a Google OAuth2 service account, which will allow you to create a set of credentials authorized by your Google account to read your Sheets data.

Run the following script and follow the instructions to authorize your account. The script will write out `credentials.json` to your directory.

```bash
yarn install
CLIENT_ID="***" CLIENT_SECRET="***" node auth.js
```

These credentials contain a refresh token that can be used long term, unless it's invalidated by Google.

## Getting an authorization token for Quizlet

Log in to your Quizlet account and go to the [Developer Dashboard](https://quizlet.com/api-dashboard).

Then, create an API application (you can call it whatever you want), which will give you another Client ID and Secret Key. You'll need to enter a "Redirect URL" for your app, which you can make `http://localhost` since we won't actually be deploying this app.

Once authorized, Bearer tokens are valid for 10 years by default, so you only need to run through the OAuth process once and save your token somewhere secure.

Open this URL in a browser, replacing `CLIENT_ID` with the ID you just created: `https://quizlet.com/authorize?response_type=code&client_id=CLIENT_ID&scope=read%20write_set%20write_group&state=anything`

After authorizing your account, you'll be redirected to `http://localhost` which will fail, but the URL should have a `code` querystring parameter. 

We need to make one more request to get a long-lived Bearer token. We'll use `curl` for this example, but you can also follow the instructions on [this page](https://quizlet.com/api/2.0/docs/authorization-code-flow).

```bash
curl https://api.quizlet.com/oauth/token \
  -F "grant_type=authorization_code" \
  -F "code=CODE" \
  -u CLIENT_ID:CLIENT_SECRET \
  -X POST
```

You should receive a JSON object with an `access_token=***`. Save that as `ACCESS_TOKEN` in your .env file or keep it handy. You'll need to set it as an environmental variable when running the script.

## Running

For a given Google Spreadsheet, crab it's ID from the URL. The ID is the part of the URL between `d/` and `/edit`: `https://docs.google.com/spreadsheets/d/******/edit`

```bash
ACCESS_TOKEN="***" node index.js SHEET_ID
```

When it's done, go back to Quizlet and you should see two new study sets for each tab in your spreadsheet.

### What it's doing

The script keeps track of which spreadsheet tabs created each study set by adding a file to your Google Drive's `[appDataFolder](https://developers.google.com/drive/v3/web/appdata)` for each Spreadsheet you convert. This maps each tab ID to the Quizlet set ID.

Not all edge cases are handled, but this means you add new tabs at any time, rename them, etc., and existing sets will be updated accordingly.

## TODO
* Attempt to delete sets when a tab is removed from a spreadsheet
* Possible to run this as an Apps Script within a Spreadsheet to update sets automatically?

## Authors
* [Michael Strickland](https://twitter.com/moriogawa)
