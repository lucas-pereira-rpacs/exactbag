const express = require('express');
const router = express.Router();
const { redirectToPrefilledForm } = require('../controllers/publicFormController');

// Link curto publico para abrir formulario pre-preenchido
router.get('/:token([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)', redirectToPrefilledForm);

module.exports = router;