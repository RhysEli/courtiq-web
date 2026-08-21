const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// FR-14: real audit trail of data upload events, metric computation
// runs, and report generation actions, written by
// backend/src/services/auditLog.js from bulkImport.js/reports.js/
// analysis.js. Statistician-only, no Team Manager fallback -- every
// action this logs is technical/analysis-pipeline work (upload, compute,
// narrative), so it's grouped with that category rather than the
// shared access-granting routes it used to sit beside.
router.get('/', requireRole('Statistician'), async (req, res) => {
  try {
    const entries = await db.prepare(`
      SELECT al.id, al.action_type, al.details, al.success, al.created_at,
             u.name AS user_name, u.email AS user_email
      FROM audit_log al
      LEFT JOIN users u ON u.id = al.user_id
      ORDER BY al.created_at DESC
    `).all();
    res.json(entries);
  } catch (err) {
    console.error('list audit log failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
