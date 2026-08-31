const dbService = require("../services/databaseService");
const formGateway = require("../gateways/formGateway");
const notificationService = require("./notificationService");
const partnerRepository = require("../repositories/partnerRepository");

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
    isManualSale: manualSaleFlag === true,
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
  const isManualSale = manualSaleFlag === true || String(saleId).toUpperCase().startsWith("MANUAL-");
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
