const express = require('express');
const router = express.Router();
const prisma = require('../db');

// PATCH /api/players/:id
router.patch('/:id', async (req, res) => {
  try {
    const { name, isGKEligible } = req.body;
    const player = await prisma.player.update({
      where: { id: parseInt(req.params.id) },
      data: { name, isGKEligible },
    });
    res.json(player);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/players/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.player.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
