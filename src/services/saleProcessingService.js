const dbService = require("../services/databaseService");
const formGateway = require("../gateways/formGateway");
const notificationService = require("./notificationService");
const partnerRepository = require("../repositories/partnerRepository");

const processPartnerSale = async (salePayload) => {
  const {
    customerName,
    customerEmail,
    customerPhone,
    saleId,
    partnerId,
    roundTrip,
    baggageQty,
    hasInsurance,
    expirationDate,
    outboundDate,
    returnDate,
  } = salePayload;

  // Salva o cliente no BD
  const customerRecord = await dbService.saveCustomer({
    name: customerName,
    email: customerEmail,
    phone: customerPhone,
    saleId,
    partnerId,
    roundTrip,
    baggageQty,
    hasInsurance,
    expirationDate,
    outboundDate,
    returnDate,
  });

  // Prepara dados enriquecidos com todos os campos necessários para gateways
  // Usa valores originais do payload como fallback
  const enrichedData = {
    id: customerRecord.id,
    name: customerName,
    email: customerEmail,
    phone: customerPhone,
    saleId: saleId,
    roundTrip: roundTrip || false,
    baggageQty: baggageQty || 1,
    outboundDate: outboundDate,
    returnDate: returnDate,
  };

  // Gera link pré-preenchido.
  // Não-fatal: se JotForm não estiver configurado (ex.: vendas manuais do dashboard),
  // usa a página de registro nativa como fallback para que email e WhatsApp ainda disparem.
  const base = process.env.APP_BASE_URL || "https://app.exactbag.com.br";
  const nativeFormUrl = new URL("/registrodebagagem", base);
  nativeFormUrl.searchParams.set("saleId", String(saleId));
  const nativeFormLink = nativeFormUrl.toString();
  const isManualSale = String(saleId).toUpperCase().startsWith("MANUAL-");
  let formLink = isManualSale ? nativeFormLink : null;

  try {
    if (!isManualSale) {
      await formGateway.createPrefilledSubmission(enrichedData);
      formLink = nativeFormLink;
    }
  } catch (err) {
    formLink = nativeFormLink;
    console.warn(
      `[SaleProcessing] Form gateway falhou para saleId=${saleId}: ${err.message}. ` +
        `Notificações continuam com link padrão: ${formLink}`,
    );
  }

  // Persiste o link antes de chamar gateways de comunicação. Assim, uma falha
  // de e-mail/WhatsApp não deixa a venda manual com formLink nulo.
  await dbService.updateSale(customerRecord.id, { formLink });

  // Verifica se parceiro está em modo sandbox
  const partner = await partnerRepository.findByPartnerId(partnerId);
  const isSandbox = partner?.isSandbox || false;

  if (isSandbox) {
    console.log(
      `[SaleProcessing] 🏖️ SANDBOX: Notificações suprimidas para parceiro ${partnerId} (sale ${saleId})`,
    );
  } else {
    await notificationService.sendPurchaseConfirmationNotification(
      { name: customerName, email: customerEmail, phone: customerPhone },
      { saleId, partnerId, roundTrip, baggageQty, hasInsurance, outboundDate, returnDate },
    );
  }

  // Atualiza a venda com status final, formLink e marca welcome como enviado
  await dbService.updateSale(customerRecord.id, {
    status: "processed",
    formLink,
    welcomeSentAt: new Date(),
    updatedAt: new Date(),
  });

  return { customerRecord, formLink };
};

module.exports = {
  processPartnerSale,
};
