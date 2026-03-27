const express = require('express');
const router = express.Router();
const prisma = require('../db');

// PATCH /api/blockplayers/:id
// Body: { isOnField, role }
router.patch('/:id', async (req, res) => {
  try {
    const { isOnField, role } = req.body;
    const bp = await prisma.blockPlayer.update({
      where: { id: parseInt(req.params.id) },
      data: { isOnField, role },
    });
    res.json(bp);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
