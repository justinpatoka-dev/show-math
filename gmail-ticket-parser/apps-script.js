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
  BATCH_SIZE: 100,
  // Maximum emails to pull on first run (set high for historical)
  MAX_INITIAL: 5000,
  // Temp folder in Google Drive for PDF conversion
  TEMP_FOLDER_NAME: '_ticket-parser-temp'
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
  parsed.getRange('A1:I1').setValues([['Email ID', 'Email Date', 'Venue', 'Artist', 'Show Date', 'Ticket Count', 'Ticket Type', 'Source Platform', 'Parsed Date']]);
  parsed.getRange('A1:I1').setFontWeight('bold');
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
 * Parse unparsed emails using Claude via Netlify function.
 * Now extracts text from attachments (PDF, CSV, Excel) and download links.
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
  let extractedCount = 0;

  for (let i = 0; i < data.length; i++) {
    const [emailId, date, from, subject, body, hasAttachment, processed] = data[i];

    if (processed === 'Yes') continue;
    if (processedCount >= CONFIG.BATCH_SIZE) break;

    try {
      // Build the full content: body + attachment text + download link text
      let fullContent = body || '';

      // Extract attachment text if the email has attachments
      if (hasAttachment === 'Yes') {
        const attachmentText = extractAttachmentText(emailId);
        if (attachmentText) {
          fullContent += '\n\n--- ATTACHMENT CONTENT ---\n' + attachmentText;
          extractedCount++;
        }
      }

      // Extract download link content from body
      const linkText = extractDownloadLinkText(body);
      if (linkText) {
        fullContent += '\n\n--- DOWNLOADED REPORT CONTENT ---\n' + linkText;
        extractedCount++;
      }

      const result = callClaudeParse(from, subject, fullContent.substring(0, 8000));

      if (result && result.is_ticket_count) {
        parsed.appendRow([
          emailId,
          date,  // Email date from Raw Emails
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
      // Still mark as processed to avoid retrying broken emails forever
      raw.getRange(i + 2, 7).setValue('Error');
      processedCount++;
    }
  }

  logAction('Parse Emails', 'Processed ' + processedCount + ' emails (' + extractedCount + ' had attachments/links extracted)');
  SpreadsheetApp.getUi().alert('Parsed ' + processedCount + ' emails (' + extractedCount + ' had attachments/links extracted). Check the "Parsed Counts" sheet.');
}

// =====================================================
// ATTACHMENT EXTRACTION
// =====================================================

/**
 * Get the original Gmail message by ID and extract text from its attachments.
 * Supports: PDF, CSV, TSV, TXT, XLS, XLSX
 */
function extractAttachmentText(emailId) {
  let msg;
  try {
    msg = GmailApp.getMessageById(emailId);
  } catch (e) {
    logAction('Attachment Warning', 'Could not fetch message ' + emailId + ': ' + e.message);
    return null;
  }

  const attachments = msg.getAttachments();
  if (!attachments || attachments.length === 0) return null;

  const textParts = [];

  for (const att of attachments) {
    const name = att.getName().toLowerCase();
    const mimeType = att.getContentType();

    try {
      if (name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt') || mimeType === 'text/csv' || mimeType === 'text/plain' || mimeType === 'text/tab-separated-values') {
        // Text-based files: read directly
        const text = att.getDataAsString();
        textParts.push('[File: ' + att.getName() + ']\n' + text.substring(0, 4000));

      } else if (name.endsWith('.pdf') || mimeType === 'application/pdf') {
        // PDF: upload to Drive, convert to Google Doc, extract text
        const text = extractTextFromPdfBlob(att);
        if (text) {
          textParts.push('[File: ' + att.getName() + ']\n' + text.substring(0, 4000));
        }

      } else if (name.endsWith('.xlsx') || name.endsWith('.xls') || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || mimeType === 'application/vnd.ms-excel') {
        // Excel: upload to Drive, convert to Google Sheet, extract text
        const text = extractTextFromSpreadsheetBlob(att);
        if (text) {
          textParts.push('[File: ' + att.getName() + ']\n' + text.substring(0, 4000));
        }
      }
      // Skip images, .ics, .vcf, and other non-text attachments
    } catch (e) {
      logAction('Attachment Error', 'Failed to extract ' + att.getName() + ': ' + e.message);
    }
  }

  return textParts.length > 0 ? textParts.join('\n\n') : null;
}

/**
 * Convert a PDF blob to text via Google Drive OCR conversion.
 */
function extractTextFromPdfBlob(blob) {
  const folder = getOrCreateTempFolder();
  let file = null;
  let docFile = null;

  try {
    // Upload PDF to Drive with OCR conversion to Google Doc
    const resource = {
      title: 'temp-ticket-pdf-' + Date.now(),
      mimeType: 'application/pdf',
      parents: [{ id: folder.getId() }]
    };

    file = Drive.Files.insert(resource, blob, {
      ocr: true,
      ocrLanguage: 'en',
      convert: true
    });

    // Open the converted Google Doc and get its text
    const doc = DocumentApp.openById(file.id);
    const text = doc.getBody().getText();

    return text || null;
  } finally {
    // Clean up temp files
    try { if (file) Drive.Files.remove(file.id); } catch (e) { /* ignore */ }
  }
}

/**
 * Convert an Excel blob to text via Google Sheets conversion.
 */
function extractTextFromSpreadsheetBlob(blob) {
  const folder = getOrCreateTempFolder();
  let file = null;

  try {
    // Upload to Drive, converting to Google Sheets
    file = Drive.Files.insert(
      {
        title: 'temp-ticket-xls-' + Date.now(),
        mimeType: blob.getContentType(),
        parents: [{ id: folder.getId() }]
      },
      blob,
      { convert: true }
    );

    // Open as spreadsheet and read all data
    const ss = SpreadsheetApp.openById(file.id);
    const sheets = ss.getSheets();
    const textParts = [];

    for (const sheet of sheets) {
      const data = sheet.getDataRange().getValues();
      const rows = data.map(row => row.join('\t'));
      textParts.push(rows.join('\n'));
    }

    return textParts.join('\n\n') || null;
  } finally {
    try { if (file) Drive.Files.remove(file.id); } catch (e) { /* ignore */ }
  }
}

/**
 * Get or create a temp folder in Drive for file conversions.
 */
function getOrCreateTempFolder() {
  const folders = DriveApp.getFoldersByName(CONFIG.TEMP_FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(CONFIG.TEMP_FOLDER_NAME);
}

// =====================================================
// DOWNLOAD LINK EXTRACTION
// =====================================================

/**
 * Scan email body for download/report links, fetch them, and extract text.
 * Looks for URLs containing report/download/ticket keywords.
 */
function extractDownloadLinkText(body) {
  if (!body) return null;

  // Find URLs in the body
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;
  const urls = body.match(urlRegex);
  if (!urls) return null;

  // Keywords that suggest a link points to a ticket report
  const reportKeywords = /report|download|ticket|audit|count|export|pdf|csv|box.?office|settlement/i;

  // Domains to skip (social media, unsubscribe, marketing, etc.)
  const skipDomains = /facebook\.com|twitter\.com|instagram\.com|youtube\.com|linkedin\.com|mailto:|unsubscribe|manage.*preferences|email.*settings|opt.?out|google\.com\/maps/i;

  const textParts = [];

  for (const url of urls) {
    // Skip non-report links
    if (skipDomains.test(url)) continue;
    if (!reportKeywords.test(url) && !reportKeywords.test(body.substring(Math.max(0, body.indexOf(url) - 100), body.indexOf(url) + url.length + 100))) continue;

    try {
      const response = UrlFetchApp.fetch(url, {
        muteHttpExceptions: true,
        followRedirects: true,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      const responseCode = response.getResponseCode();
      if (responseCode !== 200) continue;

      const contentType = response.getHeaders()['Content-Type'] || '';

      if (contentType.includes('text/html') || contentType.includes('text/plain')) {
        // HTML or text page — grab the text
        let text = response.getContentText();
        // Strip HTML tags for a rough text extraction
        text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        text = text.replace(/<[^>]+>/g, ' ');
        text = text.replace(/\s+/g, ' ').trim();
        if (text.length > 50) {
          textParts.push('[Downloaded from: ' + url.substring(0, 80) + ']\n' + text.substring(0, 4000));
        }

      } else if (contentType.includes('pdf')) {
        // PDF download — convert via Drive
        const blob = response.getBlob().setName('temp-download-' + Date.now() + '.pdf');
        const text = extractTextFromPdfBlob(blob);
        if (text) {
          textParts.push('[Downloaded PDF from: ' + url.substring(0, 80) + ']\n' + text.substring(0, 4000));
        }

      } else if (contentType.includes('csv') || contentType.includes('spreadsheet') || contentType.includes('excel')) {
        // CSV or spreadsheet download
        const text = response.getContentText();
        if (text.length > 10) {
          textParts.push('[Downloaded file from: ' + url.substring(0, 80) + ']\n' + text.substring(0, 4000));
        }
      }

    } catch (e) {
      // Link fetch failed — skip silently
    }

    // Only process first 3 matching links per email to stay within time limits
    if (textParts.length >= 3) break;
  }

  return textParts.length > 0 ? textParts.join('\n\n') : null;
}

// =====================================================
// CLAUDE API CALL
// =====================================================

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
// RE-PARSE: Process previously failed/missed emails
// =====================================================

/**
 * Reset all "Yes" processed emails back to "No" so they get re-parsed
 * with the new attachment/link extraction. Only use this once after
 * updating to this new version.
 */
function resetProcessedEmails() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const raw = ss.getSheetByName(CONFIG.RAW_SHEET);
  if (!raw) return;

  const lastRow = raw.getLastRow();
  if (lastRow < 2) return;

  const processedCol = raw.getRange(2, 7, lastRow - 1, 1);
  const values = processedCol.getValues();
  let resetCount = 0;

  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === 'Yes' || values[i][0] === 'Error') {
      values[i][0] = 'No';
      resetCount++;
    }
  }

  processedCol.setValues(values);
  logAction('Reset', 'Reset ' + resetCount + ' emails for re-processing');
  SpreadsheetApp.getUi().alert('Reset ' + resetCount + ' emails. Run "Parse with Claude" to re-process them with attachment/link extraction.');
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
    .addItem('Reset for Re-Parse', 'resetProcessedEmails')
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
