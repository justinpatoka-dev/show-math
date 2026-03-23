// =====================================================
// Gmail Ticket Count Parser — Google Apps Script
// Paste this into Extensions → Apps Script in your Google Sheet
// =====================================================

// Configuration
const CONFIG = {
  // Gmail search queries for ticket count emails
  SEARCH_QUERIES: [
    'subject:"ticket count"',
    'subject:"ticket audit"',
    'subject:"box office"',
    'subject:"ticket counts"'
  ],
  // Sheet names
  RAW_SHEET: 'Raw Emails',
  PARSED_SHEET: 'Parsed Counts',
  LOG_SHEET: 'Log',
  // Your Netlify function URL for Claude parsing
  PARSE_URL: 'https://jovial-marshmallow-41f592.netlify.app/.netlify/functions/parse-ticket-email',
  // How many emails to process per run (to avoid timeout)
  BATCH_SIZE: 50,
  // Maximum emails to pull on first run (set high for historical)
  MAX_INITIAL: 5000
};

// =====================================================
// MAIN FUNCTIONS
// =====================================================

/**
 * First-time setup: creates sheets and headers
 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Create Raw Emails sheet
  let raw = ss.getSheetByName(CONFIG.RAW_SHEET);
  if (!raw) {
    raw = ss.insertSheet(CONFIG.RAW_SHEET);
  }
  raw.getRange('A1:G1').setValues([['Email ID', 'Date', 'From', 'Subject', 'Body (first 2000 chars)', 'Has Attachment', 'Processed']]);
  raw.getRange('A1:G1').setFontWeight('bold');
  raw.setFrozenRows(1);

  // Create Parsed Counts sheet
  let parsed = ss.getSheetByName(CONFIG.PARSED_SHEET);
  if (!parsed) {
    parsed = ss.insertSheet(CONFIG.PARSED_SHEET);
  }
  parsed.getRange('A1:H1').setValues([['Email ID', 'Venue', 'Artist', 'Show Date', 'Ticket Count', 'Ticket Type', 'Source Platform', 'Parsed Date']]);
  parsed.getRange('A1:H1').setFontWeight('bold');
  parsed.setFrozenRows(1);

  // Create Log sheet
  let log = ss.getSheetByName(CONFIG.LOG_SHEET);
  if (!log) {
    log = ss.insertSheet(CONFIG.LOG_SHEET);
  }
  log.getRange('A1:C1').setValues([['Timestamp', 'Action', 'Details']]);
  log.getRange('A1:C1').setFontWeight('bold');
  log.setFrozenRows(1);

  // Remove default Sheet1 if it exists and is empty
  const sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && sheet1.getLastRow() === 0) {
    ss.deleteSheet(sheet1);
  }

  logAction('Setup', 'Sheets created successfully');
  SpreadsheetApp.getUi().alert('Setup complete! Now run "Pull Emails" to fetch ticket count emails.');
}

/**
 * Pull emails from Gmail matching our search queries
 */
function pullEmails() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const raw = ss.getSheetByName(CONFIG.RAW_SHEET);

  if (!raw) {
    SpreadsheetApp.getUi().alert('Run Setup first!');
    return;
  }

  // Get existing email IDs to avoid duplicates
  const existingIds = new Set();
  if (raw.getLastRow() > 1) {
    const ids = raw.getRange(2, 1, raw.getLastRow() - 1, 1).getValues();
    ids.forEach(row => existingIds.add(row[0]));
  }

  let newCount = 0;
  const newRows = [];

  for (const query of CONFIG.SEARCH_QUERIES) {
    let start = 0;
    let hasMore = true;

    while (hasMore && newCount < CONFIG.MAX_INITIAL) {
      const threads = GmailApp.search(query, start, 100);

      if (threads.length === 0) {
        hasMore = false;
        break;
      }

      for (const thread of threads) {
        const messages = thread.getMessages();

        for (const msg of messages) {
          const msgId = msg.getId();

          if (existingIds.has(msgId)) continue;
          existingIds.add(msgId);

          const body = msg.getPlainBody() || '';
          const hasAttachment = msg.getAttachments().length > 0;

          newRows.push([
            msgId,
            msg.getDate(),
            msg.getFrom(),
            msg.getSubject(),
            body.substring(0, 2000),
            hasAttachment ? 'Yes' : 'No',
            'No'  // Not yet processed by Claude
          ]);

          newCount++;

          if (newCount >= CONFIG.MAX_INITIAL) break;
        }
        if (newCount >= CONFIG.MAX_INITIAL) break;
      }

      start += 100;
      if (threads.length < 100) hasMore = false;
    }
  }

  // Write new rows to sheet
  if (newRows.length > 0) {
    raw.getRange(raw.getLastRow() + 1, 1, newRows.length, 7).setValues(newRows);
  }

  logAction('Pull Emails', 'Found ' + newCount + ' new emails');
  SpreadsheetApp.getUi().alert('Done! Found ' + newCount + ' new ticket count emails.');
}

/**
 * Parse unparsed emails using Claude via Netlify function
 */
function parseEmails() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const raw = ss.getSheetByName(CONFIG.RAW_SHEET);
  const parsed = ss.getSheetByName(CONFIG.PARSED_SHEET);

  if (!raw || !parsed) {
    SpreadsheetApp.getUi().alert('Run Setup first!');
    return;
  }

  const lastRow = raw.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert('No emails to parse. Run "Pull Emails" first.');
    return;
  }

  const data = raw.getRange(2, 1, lastRow - 1, 7).getValues();
  let processedCount = 0;

  for (let i = 0; i < data.length; i++) {
    const [emailId, date, from, subject, body, hasAttachment, processed] = data[i];

    if (processed === 'Yes') continue;
    if (processedCount >= CONFIG.BATCH_SIZE) break;

    try {
      const result = callClaudeParse(from, subject, body);

      if (result && result.is_ticket_count) {
        parsed.appendRow([
          emailId,
          result.venue || '',
          result.artist || '',
          result.show_date || '',
          result.ticket_count || '',
          result.ticket_type || '',
          result.source_platform || '',
          new Date()
        ]);
      }

      // Mark as processed
      raw.getRange(i + 2, 7).setValue('Yes');
      processedCount++;

      // Small delay to avoid rate limiting
      Utilities.sleep(500);

    } catch (e) {
      logAction('Parse Error', 'Email ' + emailId + ': ' + e.message);
    }
  }

  logAction('Parse Emails', 'Processed ' + processedCount + ' emails');
  SpreadsheetApp.getUi().alert('Parsed ' + processedCount + ' emails. Check the "Parsed Counts" sheet.');
}

/**
 * Call the Netlify function to parse an email with Claude
 */
function callClaudeParse(from, subject, body) {
  const payload = {
    from: from,
    subject: subject,
    body: body
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(CONFIG.PARSE_URL, options);
  const code = response.getResponseCode();

  if (code !== 200) {
    throw new Error('API returned ' + code + ': ' + response.getContentText().substring(0, 200));
  }

  return JSON.parse(response.getContentText());
}

/**
 * Run both pull and parse in sequence
 */
function pullAndParse() {
  pullEmails();
  parseEmails();
}

// =====================================================
// AUTOMATION
// =====================================================

/**
 * Set up daily trigger to automatically pull and parse
 */
function setupDailyTrigger() {
  // Remove existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'pullAndParse') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new daily trigger at 7 AM
  ScriptApp.newTrigger('pullAndParse')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();

  logAction('Trigger', 'Daily trigger set for 7 AM');
  SpreadsheetApp.getUi().alert('Daily trigger set! Emails will be pulled and parsed every morning at 7 AM.');
}

// =====================================================
// MENU & LOGGING
// =====================================================

/**
 * Add custom menu to the spreadsheet
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Ticket Parser')
    .addItem('1. Setup Sheets', 'setup')
    .addItem('2. Pull Emails', 'pullEmails')
    .addItem('3. Parse with Claude', 'parseEmails')
    .addSeparator()
    .addItem('Pull & Parse (both)', 'pullAndParse')
    .addSeparator()
    .addItem('Set Up Daily Automation', 'setupDailyTrigger')
    .addToUi();
}

/**
 * Write to the log sheet
 */
function logAction(action, details) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = ss.getSheetByName(CONFIG.LOG_SHEET);
  if (log) {
    log.appendRow([new Date(), action, details]);
  }
}
