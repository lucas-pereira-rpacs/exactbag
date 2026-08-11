const express = require('express');
const router = express.Router();
const { getJobStatus, getJobs } = require('../controllers/jobController');

router.get('/', getJobs);
router.get('/:jobId', getJobStatus);

module.exports = router;