const express = require("express");
const router = express.Router();
const costEstimator = require("../services/costEstimatorService");

/**
 * Exemplo: /cost-estimate?emails=100000&whatsapp=50000
 */
router.get("/estimate", (req, res) => {
  const emailsPerMonth = Number(req.query.emails || 0);
  const whatsappMessagesPerMonth = Number(req.query.whatsapp || 0);

  if (emailsPerMonth < 0 || whatsappMessagesPerMonth < 0) {
    return res
      .status(400)
      .json({ success: false, error: "Parâmetros devem ser não negativos" });
  }

  const details = costEstimator.estimateMonthlyCost({
    emailsPerMonth,
    whatsappMessagesPerMonth,
  });

  res.json({ success: true, details });
});

module.exports = router;
