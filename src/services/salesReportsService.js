/**
 * Sales Reports Service - Generate CSV reports for ExactBag managers
 * Generates sales data in CSV format for email distribution
 *
 * MINIMAL IMPLEMENTATION:
 * - No external CSV libraries (use string building)
 * - Reuse existing email gateway (SES)
 * - Store config in Partner model or env vars
 * - Support weekly and monthly reports
 */

const config = require("../config");
const prisma = config.prisma;
const emailGateway = require("../gateways/emailGateway");

const salesReportsService = {
  /**
   * Generate CSV report for given date range
   * @param {Date} startDate - Start of period
   * @param {Date} endDate - End of period
   * @param {boolean} includePartnerData - Include individual partner details
   * @returns {string} CSV formatted report
   */
  async generateSalesReport(startDate, endDate, includePartnerData = true) {
    try {
      // Carrega dados em lotes paginados para não estourar memória com tabelas grandes
      const PAGE_SIZE = 5000;
      const dateFilter = { createdAt: { gte: startDate, lte: endDate } };

      const fetchAllPaginated = async (model, args) => {
        const results = [];
        let skip = 0;
        while (true) {
          const chunk = await model.findMany({
            ...args,
            skip,
            take: PAGE_SIZE,
            orderBy: { createdAt: "asc" },
          });
          if (!chunk.length) break;
          results.push(...chunk);
          if (chunk.length < PAGE_SIZE) break;
          skip += PAGE_SIZE;
        }
        return results;
      };

      const [sales, submissions] = await Promise.all([
        fetchAllPaginated(prisma.sale, {
          where: dateFilter,
          include: {
            partner: {
              select: { id: true, partnerId: true, name: true, email: true },
            },
          },
        }),
        fetchAllPaginated(prisma.submission, {
          where: dateFilter,
          select: { saleId: true, status: true },
        }),
      ]);

      const detailedSubmissions = includePartnerData ? submissions : [];

      // Calculate metrics
      const metrics = this._calculateMetrics(sales, submissions);

      // Build CSV using array join (avoids O(n²) string concat)
      const csvLines = [];

      // Header with report info
      csvLines.push(`Relatório de Vendas ExactBag`);
      csvLines.push(
        `Período: ${startDate.toLocaleDateString("pt-BR")} a ${endDate.toLocaleDateString("pt-BR")}`,
      );
      csvLines.push(`Gerado em: ${new Date().toLocaleString("pt-BR")}`);
      csvLines.push("");

      // Summary section
      csvLines.push(`RESUMO EXECUTIVO`);
      csvLines.push(`Total de Vendas,${metrics.totalSales}`);
      csvLines.push(`Registros Completados,${metrics.completedRegistrations}`);
      csvLines.push(`Taxa de Conversão,${metrics.conversionRate}%`);
      csvLines.push(`Total de Parceiros,${metrics.totalPartners}`);
      csvLines.push(`Cancelamentos,${metrics.totalCancelled}`);
      csvLines.push("");

      // Detail section if requested
      if (includePartnerData && sales.length > 0) {
        csvLines.push(`DETALHAMENTO DE VENDAS`);
        csvLines.push(
          `Data,Parceiro,ID Parceiro,Nome do Cliente,Email do Cliente,Status,Submissão,Estorno`,
        );

        const submissionMapBySaleId = new Map();
        for (const sub of detailedSubmissions) {
          submissionMapBySaleId.set(sub.saleId, sub);
        }

        for (const sale of sales) {
          const submission = submissionMapBySaleId.get(sale.id);
          const refundLabel =
            sale.status === "cancelada" ? `${sale.refundType || "-"}` : "-";
          csvLines.push(
            `"${sale.createdAt.toLocaleDateString("pt-BR")}",` +
              `"${sale.partner.name}",` +
              `"${sale.partner.partnerId}",` +
              `"${sale.customerName}",` +
              `"${sale.customerEmail}",` +
              `"${sale.status}",` +
              `"${submission?.status || "PENDENTE"}",` +
              `"${refundLabel}"`,
          );
        }

        csvLines.push("");

        // Partner summary
        csvLines.push(`RESUMO POR PARCEIRO`);
        csvLines.push(
          `Parceiro,ID Parceiro,Total Vendas,Completadas,Taxa Conversão %`,
        );

        const partnerMetrics = this._calculatePartnerMetrics(
          sales,
          detailedSubmissions,
        );
        for (const partner of Object.values(partnerMetrics)) {
          csvLines.push(
            `"${partner.name}",` +
              `"${partner.partnerId}",` +
              `${partner.totalSales},` +
              `${partner.cancelled},` +
              `${partner.completed},` +
              `${partner.conversionRate}%`,
          );
        }
      }

      return csvLines.join("\n");
    } catch (error) {
      console.error("[SalesReports] Error generating report:", error);
      throw error;
    }
  },

  /**
   * Email report to ExactBag managers
   * @param {string} csv - CSV content
   * @param {string[]} recipients - Email addresses of managers
   * @param {string} reportType - 'weekly' or 'monthly'
   * @param {Date} endDate - End date of report period
   */
  async emailReport(
    csv,
    recipients,
    reportType = "weekly",
    endDate = new Date(),
  ) {
    try {
      if (!recipients || recipients.length === 0) {
        console.warn("[SalesReports] No recipients configured");
        return false;
      }

      // Prepare filename
      const dateStr = endDate.toISOString().split("T")[0];
      const fileName = `exactbag-sales-report-${reportType}-${dateStr}.csv`;

      // Prepare email content
      const tipoLabel = reportType === "weekly" ? "Semanal" : "Mensal";
      const emailSubject = `📊 Relatório ${tipoLabel} de Vendas — ExactBag — ${dateStr}`;

      const emailHtml = `
        <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <h2 style="color:#125ae2;">📊 Relatório ${tipoLabel} de Vendas — ExactBag</h2>
        <p><strong>Tipo:</strong> ${tipoLabel}</p>
        <p><strong>Período até:</strong> ${endDate.toLocaleDateString("pt-BR")}</p>
        <p>Segue abaixo o relatório detalhado de vendas em formato CSV.</p>
        <p><strong>Próximos passos:</strong></p>
        <ul>
          <li>Abra o CSV no Excel ou Google Sheets para análise</li>
          <li>Verifique taxas de conversão por parceiro</li>
          <li>Entre em contato com parceiros de baixa performance</li>
        </ul>
        <hr/>
        <p style="color:#999;font-size:12px;"><em>Relatório automático ExactBag — não responda este email.</em></p>
        </div>
      `;

      // Send email with CSV as file attachment
      for (const recipient of recipients) {
        await emailGateway.sendEmail({
          to: recipient,
          subject: emailSubject,
          html: emailHtml,
          attachments: [
            {
              filename: fileName,
              content: Buffer.from(csv, "utf-8"),
            },
          ],
        });
      }

      console.log(
        `[SalesReports] Report emailed to ${recipients.length} recipients`,
      );
      return true;
    } catch (error) {
      console.error("[SalesReports] Error emailing report:", error);
      throw error;
    }
  },

  /**
   * Get or create report configuration for ExactBag
   * @returns {object} Report config
   */
  async getReportConfig() {
    try {
      // Configuração via env vars — habilitado por padrão para gestores ExactBag
      return {
        enabled: process.env.REPORTS_ENABLED !== "false", // habilitado por padrão
        recipients: (
          process.env.REPORT_RECIPIENTS ||
          "diego.costa.tech@gmail.com,joao@exactbag.com.br,maufilippo@gmail.com"
        )
          .split(",")
          .filter((e) => e.trim()),
        weeklyDay: process.env.REPORT_WEEKLY_DAY || "monday", // segunda-feira
        weeklyTime: process.env.REPORT_WEEKLY_TIME || "09:00", // horário Brasília
        monthlyDay: process.env.REPORT_MONTHLY_DAY || "1", // dia 1 do mês
        monthlyTime: process.env.REPORT_MONTHLY_TIME || "09:00",
      };
    } catch (error) {
      console.error("[SalesReports] Error getting config:", error);
      return null;
    }
  },

  /**
   * Update report configuration
   * @param {object} config - New config
   */
  async updateReportConfig(config) {
    try {
      // For MVP, just log (can add database later)
      console.log("[SalesReports] Config update requested:", config);
      // TODO: Store in database when schema is ready
      return config;
    } catch (error) {
      console.error("[SalesReports] Error updating config:", error);
      throw error;
    }
  },

  /**
   * Generate and send report immediately (manual trigger)
   * @param {string} reportType - 'weekly' or 'monthly'
   */
  async generateAndSendReport(reportType = "weekly") {
    try {
      const config = await this.getReportConfig();

      if (!config.enabled) {
        console.log("[SalesReports] Reports disabled");
        return false;
      }

      // Calculate date range
      const endDate = new Date();
      let startDate = new Date();

      if (reportType === "weekly") {
        startDate.setDate(startDate.getDate() - 7);
      } else if (reportType === "monthly") {
        startDate.setMonth(startDate.getMonth() - 1);
      }

      // Generate report
      const csv = await this.generateSalesReport(startDate, endDate, true);

      // Send to recipients
      const sent = await this.emailReport(
        csv,
        config.recipients,
        reportType,
        endDate,
      );

      console.log(
        `[SalesReports] ${reportType} report generated and sent: ${sent}`,
      );
      return sent;
    } catch (error) {
      console.error(
        "[SalesReports] Error generating and sending report:",
        error,
      );
      throw error;
    }
  },

  /**
   * Get report preview (last 7 days)
   */
  async getReportPreview() {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      const csv = await this.generateSalesReport(startDate, endDate, true);
      return csv;
    } catch (error) {
      console.error("[SalesReports] Error generating preview:", error);
      throw error;
    }
  },

  // ===== PRIVATE HELPERS =====

  _calculateMetrics(sales, submissions) {
    const cancelled = sales.filter((s) => s.status === "cancelada");
    const refundIntegral = cancelled.filter(
      (s) => s.refundType === "integral",
    ).length;
    const refundParcial = cancelled.filter(
      (s) => s.refundType === "parcial",
    ).length;
    const totalRefunds = cancelled.reduce(
      (sum, s) => sum + (s.refundAmount || 0),
      0,
    );

    return {
      totalSales: sales.length,
      completedRegistrations: submissions.length,
      conversionRate:
        sales.length > 0
          ? Math.round((submissions.length / sales.length) * 100)
          : 0,
      totalPartners: new Set(sales.map((s) => s.partnerId)).size,
      totalCancelled: cancelled.length,
      refundIntegral,
      refundParcial,
    };
  },

  _calculatePartnerMetrics(sales, submissions) {
    const metrics = {};
    const salesWithSubmission = new Set(submissions.map((s) => s.saleId));

    for (const sale of sales) {
      const pid = sale.partnerId;

      if (!metrics[pid]) {
        metrics[pid] = {
          partnerId: sale.partner.partnerId,
          name: sale.partner.name,
          totalSales: 0,
          completed: 0,
          cancelled: 0,
          conversionRate: 0,
        };
      }

      metrics[pid].totalSales += 1;

      if (sale.status === "cancelada") {
        metrics[pid].cancelled += 1;
      }

      const hasSubmission = salesWithSubmission.has(sale.id);
      if (hasSubmission) {
        metrics[pid].completed += 1;
      }

      metrics[pid].conversionRate = Math.round(
        (metrics[pid].completed / metrics[pid].totalSales) * 100,
      );
    }

    return metrics;
  },
};

module.exports = salesReportsService;
