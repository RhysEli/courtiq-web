const db = require('../db');

// FR-14: single write path for the audit_log table, called from
// bulkImport.js, reports.js, and analysis.js at the point each real
// action finishes (success or failure) -- see call sites for exact
// placement. A failure to WRITE the audit entry must never break the
// real action being logged (e.g. a file upload must still succeed even
// if this insert fails), so every failure here is swallowed and just
// logged to the console rather than thrown.
async function logAction(userId, actionType, details, success) {
  try {
    await db.prepare(`
      INSERT INTO audit_log (user_id, action_type, details, success)
      VALUES (?, ?, ?, ?)
    `).run(userId || null, actionType, details || null, success);
  } catch (err) {
    console.error('audit log write failed:', err);
  }
}

module.exports = { logAction };
