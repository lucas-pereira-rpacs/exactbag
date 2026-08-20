const express = require('express');
const router = express.Router();
const { redirectToPrefilledForm } = require('../controllers/publicFormController');

// Link curto publico para abrir formulario pre-preenchido
// Express 5 no longer supports inline regular expressions in route paths.
// Keep the token format validation in the controller/service instead.
router.get('/:token', redirectToPrefilledForm);

module.exports = router;
