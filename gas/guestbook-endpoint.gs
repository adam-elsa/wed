// Google Apps Script Web App — the 3D venue's guest book (Buku Tamu) for the Adam & Elsa wedding site.
//
// A separate Sheet from the RSVP one (gas/rsvp-endpoint.gs): this is the list of who came to the
// virtual wedding, written at the lobby's reception desk before going on to the ballroom.
//
// SETUP (one-time, from your own Google account):
// 1. Create a new, blank Google Sheet (e.g. "Buku Tamu Virtual Adam & Elsa").
//    File > Settings > Time zone: Jakarta (GMT+7).
// 2. Extensions > Apps Script. Delete any starter code and paste this whole file. Save.
// 3. Deploy > New deployment > select type "Web app".
//    - Execute as: Me
//    - Who has access: Anyone
//    Google asks you to authorise it the first time (it only touches this Sheet).
// 4. Copy the deployment URL (ends in /exec) and paste it into GUESTBOOK_ENDPOINT_URL in script.js.
// 5. Re-deploy (Deploy > Manage deployments > edit > new version) any time you change this file.
//
// The "Buku Tamu" tab and its header row are created on the first entry. There is no doGet:
// the names are never served back to the public.

const SHEET_NAME = 'Buku Tamu';
const HEADER = ['Waktu', 'Nama', 'Nama di Undangan'];

// Stop guest input like "=HYPERLINK(...)" from being run as a Sheet formula.
function safeCell(value) {
  const s = String(value == null ? '' : value).slice(0, 200);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function doPost(e) {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADER);
    sheet.setFrozenRows(1);
  }
  const data = JSON.parse(e.postData.contents);
  if (!data.name) return reply('empty');
  sheet.appendRow([new Date(), safeCell(data.name), safeCell(data.invited)]);
  return reply('success');
}

function reply(result) {
  return ContentService
    .createTextOutput(JSON.stringify({ result: result }))
    .setMimeType(ContentService.MimeType.JSON);
}
