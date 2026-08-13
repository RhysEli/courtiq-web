const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// FR-14: real audit trail of data upload events, metric computation
// runs, and report generation actions, written by
// backend/src/services/auditLog.js from bulkImport.js/reports.js/
// analysis.js. Admin/oversight feature, so restricted the same way as
// the other FR-11 management routes.
router.get('/', requireRole('Statistician', 'Team Manager'), async (req, res) => {
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
