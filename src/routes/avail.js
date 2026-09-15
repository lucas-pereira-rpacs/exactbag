const express = require("express");
const router = express.Router();
const insuranceAvailabilityService = require("../services/insuranceAvailabilityService");

/**
 * GET /avail/insurance
 *
 * Disponibilidade de produtos ExactBag (Insurance Availability), no formato
 * compatível com a API Infotravel (schema ApiInsuranceAvail).
 *
 * Query params (todos opcionais):
 * - start:       Data início da viagem (YYYY-MM-DD)
 * - end:         Data fim da viagem (YYYY-MM-DD)
 * - occupancy:   Ocupação. Pode ser repetido (?occupancy=30&occupancy=30)
 *                ou enviado como número de passageiros (?occupancy=2)
 * - nationality: Código de nacionalidade (informativo)
 * - code:        Filtra um produto específico pelo código
 *
 * Resposta: { insuranceAvail: [ ... ] }
 */
router.get("/insurance", (req, res) => {
  try {
    const { start, end, nationality, code } = req.query;

    // occupancy pode vir como string única, número ou array (query repetida)
    let occupancy = req.query.occupancy;
    if (occupancy === undefined) occupancy = 1;

    const result = insuranceAvailabilityService.getInsuranceAvailability({
      start,
      end,
      occupancy,
      nationality,
      code,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error(
      "[avail/insurance] Erro ao montar disponibilidade:",
      error.message,
    );
    return res.status(500).json({
      error: "Falha ao obter disponibilidade",
      message:
        process.env.NODE_ENV === "production"
          ? "Internal server error"
          : error.message,
    });
  }
});

module.exports = router;
