const express = require('express');
const router = express.Router();
const prisma = require('../db');

// PATCH /api/blocks/:id/assignments
// Body: { assignments: [{ playerId, isOnField, role }] }
router.patch('/:id/assignments', async (req, res) => {
  try {
    const blockId = parseInt(req.params.id);
    const { assignments } = req.body;

    const results = await Promise.all(
      assignments.map(({ playerId, isOnField, role }) =>
        prisma.blockPlayer.upsert({
          where: { blockId_playerId: { blockId, playerId } },
          update: { isOnField, role },
          create: { blockId, playerId, isOnField, role },
        })
      )
    );

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
