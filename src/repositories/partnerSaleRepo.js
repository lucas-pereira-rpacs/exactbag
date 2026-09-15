const partnerSales = [];

const savePartnerSale = (saleData) => {
  const newSale = {
    id: partnerSales.length + 1,
    ...saleData,
  };
  partnerSales.push(newSale);
  return newSale;
};

const getPartnerSales = () => {
  return partnerSales;
};

// 🟠 P5: Método com paginação para queries grandes
const getPartnerSalesWithPagination = (
  limit = 100,
  offset = 0,
  partnerId = null,
) => {
  let filtered = partnerSales;

  // Filtrar por partner se fornecido
  if (partnerId) {
    filtered = partnerSales.filter((s) => s.partnerId === partnerId);
  }

  const total = filtered.length;
  const paginated = filtered
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(offset, offset + limit);

  return {
    data: paginated,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + limit < total,
    },
  };
};

module.exports = {
  savePartnerSale,
  getPartnerSales,
  getPartnerSalesWithPagination,
};
