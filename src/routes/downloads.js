const express = require("express");
const router = express.Router();
const {
  downloadProduct,
  getDownloadStatus,
} = require("../controllers/downloadController");

// GET /downloads/:token - Download do produto
router.get("/:token", downloadProduct);

// GET /downloads/:token/status - Status do download
router.get("/:token/status", getDownloadStatus);

module.exports = router;
