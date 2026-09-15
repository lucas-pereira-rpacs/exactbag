// Serviço principal de Registro Nativo — orquestra o fluxo completo
// Registro → CPV → Email → WhatsApp

const repository = require("../repositories/nativeRegistrationRepository");
const cpvPdfService = require("./cpvPdfService");
const notificationService = require("./nativeNotificationService");

/**
 * Cria registro completo e dispara o fluxo de CPV + notificações
 */
const createRegistration = async (sanitizedData, meta = {}) => {
  // 0. Deduplicação — evita envio duplo de e-mail em caso de retry/double-click
  // Duplicate protection disabled temporarily so retries can run the
  // notification flow again. Re-enable after the notification workflow is
  // moved to a durable background job.
  // const recent = await repository.findRecent(
  //   sanitizedData.passengerEmail,
  //   sanitizedData.passengerPhone,
  //   60000 // 60 segundos
  // );
  // if (recent) {
  //   console.log('[NativeRegistration] Registro duplicado detectado (email+phone <60s), retornando existente CPV:', recent.cpvNumber);
  //   return {
  //     registration: recent,
  //     cpvNumber: recent.cpvNumber,
  //     cpvGenerated: !!recent.cpvNumber,
  //     deduplicated: true
  //   };
  // }

  // 1. Gera CPV number antecipadamente
  const cpvNumber = cpvPdfService.generateCpvNumber();

  // 1b. Herda o indicador de seguro da venda do parceiro (fonte autoritativa).
  //     No fluxo de TAG física, o indicador vem do prefixo do SUN confirmado.
  let hasInsurance = !!sanitizedData.hasInsurance;
  if (sanitizedData.saleId && !sanitizedData.isPhysicalTag) {
    try {
      const sale = await repository.findSaleContext(sanitizedData.saleId);
      if (sale?.expirationDate && new Date(sale.expirationDate) <= new Date()) {
        const error = new Error("O link desta venda expirou.");
        error.code = "SALE_EXPIRED";
        throw error;
      }
      if (sale?.hasInsurance !== null && sale?.hasInsurance !== undefined) {
        hasInsurance = !!sale.hasInsurance;
      }
    } catch (err) {
      if (err.code === "SALE_EXPIRED") throw err;
      console.warn(
        "[NativeRegistration] Falha ao herdar seguro da venda:",
        err.message,
      );
    }
  }

  // 2. Salva no banco
  const registration = await repository.create({
    ...sanitizedData,
    hasInsurance,
    cpvNumber,
    status: "submitted",
    ipAddress: meta.ipAddress || null,
    userAgent: meta.userAgent || null,
  });

  // 3. Gera PDF do CPV
  let pdfResult;
  try {
    pdfResult = await cpvPdfService.generateCpvPdf(registration);
    await repository.update(registration.id, {
      status: "cpv_generated",
      cpvGeneratedAt: new Date(),
    });
  } catch (err) {
    console.error("[NativeRegistration] Erro ao gerar CPV PDF:", err.message);
    // Continua — o registro já está salvo
    return { registration, cpvGenerated: false };
  }

  // 4. Envia o CPV por e-mail (assíncrono, não bloqueia resposta)
  setImmediate(async () => {
    try {
      await notificationService.sendCpvByEmail(
        registration,
        pdfResult.pdfBuffer,
        pdfResult.isHtmlFallback,
      );
      await repository.update(registration.id, {
        status: "sent",
        emailSentAt: new Date(),
      });
    } catch (err) {
      console.error(
        "[NativeRegistration] Erro ao enviar e-mail CPV:",
        err.message,
      );
    }

    // 5. WhatsApp (opcional, não bloqueia)
    try {
      await notificationService.sendCpvByWhatsApp(registration);
      await repository.update(registration.id, {
        whatsappSentAt: new Date(),
        status: "completed",
      });
    } catch (err) {
      console.error("[NativeRegistration] Erro ao enviar WhatsApp CPV:", err);
    }
  });

  return {
    registration,
    cpvNumber,
    cpvGenerated: true,
  };
};

/**
 * Busca registro por ID
 */
const getRegistration = async (id) => {
  return repository.findById(id);
};

/**
 * Busca registro por CPV
 */
const getRegistrationByCpv = async (cpvNumber) => {
  return repository.findByCpvNumber(cpvNumber);
};

/**
 * Lista registros com paginação, filtros e ordenação
 */
const listRegistrations = async (params) => {
  return repository.findMany(params);
};

/**
 * Re-envia CPV por e-mail
 */
const resendCpvEmail = async (id) => {
  const registration = await repository.findById(id);
  if (!registration) throw new Error("Registro não encontrado");
  if (!registration.cpvNumber) throw new Error("CPV ainda não foi gerado");

  const pdfResult = await cpvPdfService.generateCpvPdf(registration);
  await notificationService.sendCpvByEmail(
    registration,
    pdfResult.pdfBuffer,
    pdfResult.isHtmlFallback,
  );

  await repository.update(id, { emailSentAt: new Date() });
  return { success: true, cpvNumber: registration.cpvNumber };
};

/**
 * Re-envia CPV por WhatsApp
 */
const resendCpvWhatsApp = async (id) => {
  const registration = await repository.findById(id);
  if (!registration) throw new Error("Registro não encontrado");
  if (!registration.cpvNumber) throw new Error("CPV ainda não foi gerado");

  await notificationService.sendCpvByWhatsApp(registration);
  await repository.update(id, { whatsappSentAt: new Date() });
  return { success: true, cpvNumber: registration.cpvNumber };
};

/**
 * Estatísticas de registros por status
 */
const getStats = async (filters) => {
  return repository.countByStatus(filters);
};

module.exports = {
  createRegistration,
  getRegistration,
  getRegistrationByCpv,
  listRegistrations,
  resendCpvEmail,
  resendCpvWhatsApp,
  getStats,
};
