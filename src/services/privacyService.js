/**
 * Privacy Service - LGPD Compliance
 * Gerencia acesso a dados, exclusão, portabilidade e consentimento
 */

const prisma = require('../config').prisma;
const fs = require('fs').promises;
const path = require('path');

// Garante que o diretório de logs existe
const CONSENT_LOG_DIR = path.join(__dirname, '../../logs/consent');

const ensureLogDir = async () => {
  try {
    await fs.mkdir(CONSENT_LOG_DIR, { recursive: true });
  } catch (error) {
    console.warn('Falha ao criar diretório de logs de consentimento:', error.message);
  }
};

// Inicializar ao carregar módulo
ensureLogDir();

const buildSubmissionWhereClause = (email) => ({
  OR: [
    {
      sale: {
        is: {
          customerEmail: email
        }
      }
    },
    {
      payload: {
        contains: email,
        mode: 'insensitive'
      }
    }
  ]
});

const applyCorrectionsToPayload = (payload, corrections) => {
  let parsed = payload;

  if (typeof payload === 'string') {
    try {
      parsed = JSON.parse(payload);
    } catch (_error) {
      return payload;
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    return payload;
  }

  const nextPayload = {
    ...parsed,
    name: corrections.name || parsed.name,
    email: corrections.email || parsed.email,
    phone: corrections.phone || parsed.phone,
    customerName: corrections.name || parsed.customerName,
    customerEmail: corrections.email || parsed.customerEmail,
    customerPhone: corrections.phone || parsed.customerPhone,
  };

  return JSON.stringify(nextPayload);
};

const privacyService = {
  /**
   * Registrar consentimento para conformidade LGPD
   * @param {string} email - Email do usuário
   * @param {object} consentData - Tipos de consentimento e valores
   * @param {string} source - De onde o consentimento veio (formulário, api, etc)
   */
  async logConsent(email, consentData, source = 'system') {
    try {
      const consentLog = {
        timestamp: new Date().toISOString(),
        email,
        source,
        consents: consentData,
        ipAddress: 'internal-log',
        userAgent: 'consent-logger'
      };

      const fileName = `consent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`;
      const filePath = path.join(CONSENT_LOG_DIR, fileName);

      await fs.writeFile(filePath, JSON.stringify(consentLog, null, 2));

      console.log(`[LGPD] Consentimento registrado para ${email} em ${filePath}`);
      return true;
    } catch (error) {
      console.error('[LGPD] Erro ao registrar consentimento:', error);
      return false;
    }
  },

  /**
   * Obter todos os dados de um usuário específico (Direito de Acesso LGPD)
   * @param {string} email - Endereço de email do usuário
   * @returns {object} Dados completos do usuário
   */
  async getDataAccess(email) {
    try {
      const [sales, directPartners, submissions, downloadTokens] = await Promise.all([
        prisma.sale.findMany({
          where: { customerEmail: email },
          include: {
            partner: true,
            submissions: true
          }
        }),
        prisma.partner.findMany({
          where: { email }
        }),
        prisma.submission.findMany({
          where: buildSubmissionWhereClause(email),
          include: {
            sale: true
          }
        }),
        prisma.downloadToken.findMany({
          where: { customerEmail: email }
        })
      ]);

      const partnerMap = new Map();
      directPartners.forEach((partner) => partnerMap.set(partner.partnerId, partner));
      sales.forEach((sale) => {
        if (sale.partner) {
          partnerMap.set(sale.partner.partnerId, sale.partner);
        }
      });
      const partners = Array.from(partnerMap.values());

      const dataAccess = {
        requestDate: new Date().toISOString(),
        requesterEmail: email,
        partners,
        sales,
        submissions,
        downloadTokens,
        summary: {
          totalPartners: partners.length,
          totalSales: sales.length,
          totalSubmissions: submissions.length,
          totalDownloadTokens: downloadTokens.length
        }
      };

      return dataAccess;
    } catch (error) {
      throw new Error(`Erro ao recuperar acesso a dados: ${error.message}`);
    }
  },

  /**
   * Exportar dados do usuário em formato estruturado (Direito de Portabilidade LGPD)
   * @param {string} email - Email do usuário
   * @param {string} format - Formato: 'json', 'csv', 'xml'
   * @returns {string} Dados formatados
   */
  async exportData(email, format = 'json') {
    try {
      const data = await this.getDataAccess(email);

      switch (format.toLowerCase()) {
        case 'csv':
          return this._convertToCSV(data);
        case 'xml':
          return this._convertToXML(data);
        case 'json':
        default:
          return JSON.stringify(data, null, 2);
      }
    } catch (error) {
      throw new Error(`Erro ao exportar dados: ${error.message}`);
    }
  },

  /**
   * Deletar todos os dados do usuário (Direito ao Esquecimento LGPD)
   * IMPORTANTE: Apenas deleta dados não exigidos legalmente
   * @param {string} email - Email do usuário
   * @param {string} reason - Motivo da deleção
   * @returns {object} Relatório de deleção
   */
  async deleteData(email, reason = '') {
    const deletionLog = {
      requestDate: new Date().toISOString(),
      email,
      reason,
      deletionReport: {
        deletedPartners: 0,
        deletedSubmissions: 0,
        retainedSales: 0,
        retainedReason: 'Obrigação fiscal (Lei Brasileira requer retenção de 5 anos)'
      }
    };

    const session = await prisma.$transaction(async (tx) => {
      const partners = await tx.partner.findMany({ where: { email } });

      const deletedSubmissions = await tx.submission.deleteMany({
        where: buildSubmissionWhereClause(email)
      });
      deletionLog.deletionReport.deletedSubmissions = deletedSubmissions.count;

      await tx.downloadToken.deleteMany({
        where: { customerEmail: email }
      });

      for (const partner of partners) {
        const recentSales = await tx.sale.count({
          where: {
            partnerId: partner.partnerId,
            createdAt: {
              gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
            }
          }
        });

        if (recentSales === 0) {
          await tx.partner.delete({ where: { id: partner.id } });
          deletionLog.deletionReport.deletedPartners += 1;
        }
      }

      const totalSales = await tx.sale.count({
        where: { customerEmail: email }
      });
      deletionLog.deletionReport.retainedSales = totalSales;

      return deletionLog;
    });

    // Registrar solicitação de deleção
    await this._logDeletionRequest(email, reason, deletionLog);

    return session;
  },

  /**
   * Corrigir/Atualizar dados do usuário (Direito de Correção LGPD)
   * @param {string} email - Email do usuário
   * @param {object} corrections - Dados a corrigir
   * @returns {object} Dados atualizados
   */
  async correctData(email, corrections) {
    try {
      const updatedData = {};

      // Update partner data if applicable
      const partners = await prisma.partner.findMany({ where: { email } });

      // Atualizar dados do parceiro se aplicável
      for (const partner of partners) {
        if (corrections.name || corrections.email) {
          const updated = await prisma.partner.update({
            where: { id: partner.id },
            data: {
              name: corrections.name || partner.name,
              email: corrections.email || partner.email
            }
          });
          updatedData.partners = updated;
        }
      }

      if (Object.keys(corrections).length > 0) {
        const salesUpdate = await prisma.sale.updateMany({
          where: { customerEmail: email },
          data: {
            customerName: corrections.name,
            customerEmail: corrections.email,
            customerPhone: corrections.phone
          }
        });
        updatedData.sales = salesUpdate.count;

        const submissions = await prisma.submission.findMany({
          where: buildSubmissionWhereClause(email)
        });

        let updatedSubmissions = 0;
        for (const submission of submissions) {
          await prisma.submission.update({
            where: { id: submission.id },
            data: {
              payload: applyCorrectionsToPayload(submission.payload, corrections)
            }
          });
          updatedSubmissions += 1;
        }

        updatedData.submissions = updatedSubmissions;

        const downloadTokens = await prisma.downloadToken.updateMany({
          where: { customerEmail: email },
          data: {
            customerName: corrections.name,
            customerEmail: corrections.email
          }
        });

        updatedData.downloadTokens = downloadTokens.count;
      }

      return {
        timestamp: new Date().toISOString(),
        email,
        correctionsApplied: corrections,
        updatedData
      };
    } catch (error) {
      throw new Error(`Erro ao corrigir dados: ${error.message}`);
    }
  },

  /**
   * Desinscrever de comunicações não essenciais
   * @param {string} email - Email do usuário
   * @param {string} optOutType - 'marketing', 'analytics', 'all'
   */
  async optOut(email, optOutType = 'marketing') {
    try {
      const partners = await prisma.partner.findMany({ where: { email } });

      const optOutData = {
        timestamp: new Date().toISOString(),
        email,
        optOutType,
        affectedPartners: partners.length
      };

      // Se descadastrar de marketing ou tudo
      if (['marketing', 'all'].includes(optOutType)) {
        for (const partner of partners) {
          await prisma.partner.update({
            where: { id: partner.id },
            data: { optOutMarketing: true }
          });
        }
      }

      // Se descadastrar de analytics ou tudo
      if (['analytics', 'all'].includes(optOutType)) {
        for (const partner of partners) {
          await prisma.partner.update({
            where: { id: partner.id },
            data: { optOutAnalytics: true }
          });
        }
      }

      return optOutData;
    } catch (error) {
      throw new Error(`Erro ao processar opt-out: ${error.message}`);
    }
  },

  /**
   * Obter histórico de consentimento (para fins de auditoria)
   * @param {string} email - Email do usuário
   * @returns {array} Histórico de consentimento
   */
  async getConsentHistory(email) {
    try {
      const files = await fs.readdir(CONSENT_LOG_DIR);
      const consentHistory = [];

      for (const file of files) {
        if (file.startsWith('consent_')) {
          const filePath = path.join(CONSENT_LOG_DIR, file);
          const content = await fs.readFile(filePath, 'utf8');
          const data = JSON.parse(content);

          if (data.email === email) {
            consentHistory.push(data);
          }
        }
      }

      return consentHistory.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      );
    } catch (error) {
      console.error('Erro ao recuperar histórico de consentimento:', error);
      return [];
    }
  },

  // ===== PRIVATE HELPERS =====

  /**
   * Converter dados para formato CSV
   */
  _convertToCSV(data) {
    const lines = [
      'Exportação de Dados ExactBag',
      `Gerado em: ${data.requestDate}`,
      `Solicitante: ${data.requesterEmail}`,
      '',
      'RESUMO',
      `Total de Parceiros: ${data.summary.totalPartners}`,
      `Total de Vendas: ${data.summary.totalSales}`,
      `Total de Envios: ${data.summary.totalSubmissions}`,
      `Total de Tokens de Download: ${data.summary.totalDownloadTokens}`,
      ''
    ];

    // Adicionar parceiros
    if (data.partners.length > 0) {
      lines.push('PARCEIROS');
      lines.push('ID,Nome,Email,Ativo,Criado em');
      data.partners.forEach(p => {
        lines.push(`${p.id},"${p.name}","${p.email}",${p.isActive},${p.createdAt}`);
      });
      lines.push('');
    }

    // Adicionar vendas
    if (data.sales.length > 0) {
      lines.push('VENDAS');
      lines.push('ID,ID Parceiro,Email Cliente,Status,Criado em');
      data.sales.forEach(s => {
        lines.push(`${s.id},${s.partnerId},"${s.customerEmail}",${s.status},${s.createdAt}`);
      });
      lines.push('');
    }

    return lines.join('\n');
  },

  /**
   * Converter dados para formato XML
   */
  _convertToXML(data) {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<dataExport>\n';
    xml += `  <requestDate>${data.requestDate}</requestDate>\n`;
    xml += `  <requesterEmail>${data.requesterEmail}</requesterEmail>\n`;
    xml += '  <summary>\n';
    xml += `    <totalPartners>${data.summary.totalPartners}</totalPartners>\n`;
    xml += `    <totalSales>${data.summary.totalSales}</totalSales>\n`;
    xml += `    <totalSubmissions>${data.summary.totalSubmissions}</totalSubmissions>\n`;
    xml += `    <totalDownloadTokens>${data.summary.totalDownloadTokens}</totalDownloadTokens>\n`;
    xml += '  </summary>\n';

    if (data.partners.length > 0) {
      xml += '  <partners>\n';
      data.partners.forEach(p => {
        xml += `    <partner>\n`;
        xml += `      <id>${p.id}</id>\n`;
        xml += `      <name>${p.name}</name>\n`;
        xml += `      <email>${p.email}</email>\n`;
        xml += `      <isActive>${p.isActive}</isActive>\n`;
        xml += `    </partner>\n`;
      });
      xml += '  </partners>\n';
    }

    xml += '</dataExport>';
    return xml;
  },

  /**
   * Registrar solicitações de deleção para trilha de auditoria
   */
  async _logDeletionRequest(email, reason, report) {
    try {
      const fileName = `deletion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.json`;
      const filePath = path.join(CONSENT_LOG_DIR, fileName);

      await fs.writeFile(filePath, JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'deletion_request',
        email,
        reason,
        report
      }, null, 2));
    } catch (error) {
      console.error('[LGPD] Erro ao registrar solicitação de deleção:', error);
    }
  }
};

module.exports = privacyService;
