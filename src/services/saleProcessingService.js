const dbService = require("../services/databaseService");
const notificationService = require("./notificationService");
const partnerRepository = require("../repositories/partnerRepository");
const {
  buildNativeRegistrationLink,
} = require("./nativeRegistrationLinkService");
const { PHYSICAL_TAG_PRODUCT_CODES } = require("../config/insuranceProducts");

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
    productCode,
    isManualSale: manualSaleFlag,
  } = salePayload;
  const isPhysicalTag = PHYSICAL_TAG_PRODUCT_CODES.includes(
    String(productCode || ""),
  );

  // Agenda may retry after a process restart. Resume the persisted sale instead
  // of creating a second record for the same partner business identifier.
  let customerRecord = await dbService.findSaleByPartnerAndExternalSaleId(
    partnerId,
    saleId,
  );
  if (customerRecord?.status === "processed") {
    console.log(
      `[SaleProcessing] Venda já processada; ignorando job duplicado partner=${partnerId} saleId=${saleId}`,
    );
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
    console.log(
      `[SaleProcessing] Retomando venda incompleta partner=${partnerId} saleId=${saleId}`,
    );
  }

  // Every sale now enters the native baggage-registration flow directly.
  const formLink = buildNativeRegistrationLink(saleId);

  const isManualSale =
    manualSaleFlag === true ||
    String(saleId).toUpperCase().startsWith("MANUAL-");

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
      saleId,
      partnerId,
      roundTrip,
      baggageQty,
      hasInsurance,
      outboundDate,
      returnDate,
      productCode,
      reservationType: isPhysicalTag ? "physical-tag" : "digital-assistance",
    };

    const deferRegistration =
      !isPhysicalTag && !isWithinRegistrationWindow(outboundDate);

    if (deferRegistration) {
      // For trips more than 48 hours away, send only the confirmation now.
      // The registration/link notification is sent by the 48-hour scheduler.
      await notificationService.sendPurchaseConfirmationNotification(
        passengerData,
        notificationSale,
      );
    } else if (isPhysicalTag) {
      // Physical-tag products use the confirmation email with airport/store
      // instructions and do not enter the digital registration flow.
      await notificationService.sendPurchaseConfirmationNotification(
        passengerData,
        notificationSale,
      );
    } else {
      // For trips within the 48-hour window, send the registration now and
      // skip the confirmation so the passenger receives only the actionable
      // message.
      const registrationNotification =
        await notificationService.sendPurchaseNotification(
          passengerData,
          notificationSale,
          formLink,
        );

      // Prevent the 48-hour scheduler from sending a duplicate for sales
      // created inside the registration window.
      if (registrationNotification.success) {
        await dbService.updateSale(customerRecord.id, {
          vesperaSentAt: new Date(),
        });
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
