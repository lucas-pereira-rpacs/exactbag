const express = require('express');
const router = express.Router();
const { redirectToPrettyPrefilledForm } = require('../controllers/publicFormController');

// Link amigavel: /form/joao-silva
router.get('/:slug', redirectToPrettyPrefilledForm);

module.exports = router;