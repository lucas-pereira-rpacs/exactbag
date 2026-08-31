const dbService = require("../services/databaseService");
const notificationService = require("./notificationService");
const partnerRepository = require("../repositories/partnerRepository");
const { buildNativeRegistrationLink } = require('./nativeRegistrationLinkService');

const REGISTRATION_WINDOW_MS = 48 * 60 * 60 * 1000;

const isWithinRegistrationWindow = (outboundDate, now = new Date()) => {
  if (!outboundDate) return true;
  const tripTime = new Date(outboundDate).getTime();
  if (Number.isNaN(tripTime)) return true;
  return tripTime - now.getTime() <= REGISTRATION_WINDOW_MS;
};

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
    isManualSale: manualSaleFlag,
  } = salePayload;

  // Agenda may retry after a process restart. Resume the persisted sale instead
  // of creating a second record for the same partner business identifier.
  let customerRecord = await dbService.findSaleByPartnerAndExternalSaleId(partnerId, saleId);
  if (customerRecord?.status === 'processed') {
    console.log(`[SaleProcessing] Venda já processada; ignorando job duplicado partner=${partnerId} saleId=${saleId}`);
    return { customerRecord, formLink: customerRecord.formLink };
  }
  if (!customerRecord) {
    customerRecord = await dbService.saveCustomer({
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
      isManualSale: manualSaleFlag === true,
    });
  } else {
    console.log(`[SaleProcessing] Retomando venda incompleta partner=${partnerId} saleId=${saleId}`);
  }

  // Every sale now enters the native baggage-registration flow directly.
  const formLink = buildNativeRegistrationLink(saleId);

  const isManualSale = manualSaleFlag === true || String(saleId).toUpperCase().startsWith("MANUAL-");

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
    const passengerData = {
      name: customerName,
      email: customerEmail,
      phone: customerPhone,
      passengerName: customerName,
      passengerEmail: customerEmail,
      passengerPhone: customerPhone,
    };
    const notificationSale = {
      saleId, partnerId, roundTrip, baggageQty, hasInsurance, outboundDate, returnDate,
      reservationType: 'digital-assistance'
    };

    const deferManualRegistration =
      isManualSale && !isWithinRegistrationWindow(outboundDate);

    if (isManualSale) {
      await notificationService.sendPurchaseConfirmationNotification(passengerData, notificationSale);
    }

    if (!deferManualRegistration) {
      const registrationNotification = await notificationService.sendPurchaseNotification(
        passengerData,
        notificationSale,
        formLink,
      );

      // Prevent the 48-hour scheduler from sending a duplicate for sales
      // created inside the registration window.
      if (isManualSale && registrationNotification.success) {
        await dbService.updateSale(customerRecord.id, { vesperaSentAt: new Date() });
      }
    }
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
