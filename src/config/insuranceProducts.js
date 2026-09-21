/**
 * Catálogo de produtos ExactBag para disponibilidade (Insurance Availability).
 *
 * Este catálogo é a fonte única de verdade dos produtos que o ExactBag
 * disponibiliza para parceiros (ex.: Infotravel/Infotera) cadastrarem em
 * suas plataformas. Cada item segue uma estrutura compatível com o schema
 * ApiInsuranceAvail da API Infotravel.
 *
 * Campos relevantes por produto:
 * - code:        código único do produto no ExactBag
 * - name:        nome comercial exibido ao agente/cliente
 * - description: descrição detalhada do serviço
 * - image:       URL da imagem/arte do produto
 * - salePrice:   preço de venda sugerido (BRL)
 * - netPrice:    valor neto (custo para o parceiro) em BRL
 * - coverages:   coberturas associadas (ex.: valor máximo de proteção)
 * - usagePolicy: políticas de uso / como funciona o serviço
 * - cancellationPolicy: política de cancelamento/reembolso
 */

const EXACTBAG_PROVIDER = {
  id: 26908,
  externalCode: "",
  name: "ExactBag",
  localTrip: false,
};

const PHYSICAL_TAG_PRODUCT_CODES = ["5383660", "5383661", "5383662", "5383663"];
const PHYSICAL_TAG_INSURED_PRODUCT_CODES = ["5383662", "5383663"];

const PHYSICAL_TAG_INSURANCE_COVERAGES = [
  {
    code: '2898',
    name: 'assistencia de bagagem com seguro',
    minPrice: 'R$ 2.500,00',
    maxPrice: 'R$ 2.500,00'
  }
];

const COMPLETE_PROTECTION_ONE_BAG_PRODUCT = {
  code: "5383656",
  name: "ASSISTENCIA DE BAGAGEM EXACTBAG COVER - PROTEÇÃO COMPLETA COM SEGURO EXTRAVIO R$ 2.500",
  shortName: "Proteção Completa",
  description:
    "Agente de viagem, ofereça mais tranquilidade ao seu passageiro. " +
    "Problemas com bagagem podem acontecer em qualquer viagem: extravios, atrasos, trocas, danos ou violações, " +
    "tanto em viagens nacionais quanto internacionais! " +
    "Com a Assistência de Bagagem ExactBag, o passageiro viaja com uma camada extra de proteção e " +
    "conta com uma equipe especializada para ajudar na resolução de ocorrências." + 
    "Seguro garantido pela Now Seguros - SUSEP Processo SUSEP 15414.646978/ 2026-75",
  image:
    "https://app.exactbag.com.br/native/assets/produto-protecao-completa.png",
  salePrice: 44.9,
  netPrice: 9.6,
  currency: "BRL",
  bagCount: 1,
  coverages: [
    {
      code: "2898",
      name: "assistencia de bagagem com seguro",
      minPrice: "R$ 2.500,00",
      maxPrice: "R$ 2.500,00",
    },
  ],
  usagePolicy: [
    "Suporte humano especializado 24 horas por dia, 7 dias por semana.",
    "Registro digital da bagagem com fotos e informações.",
    "Identificação da bagagem antes do embarque.",
    "Acompanhamento junto às companhias aéreas.",
    "Auxílio na localização e recuperação da bagagem.",
    "Seguro por extravio de R$ 2.500,00 em caso de não localização.",
    "Após a compra, o passageiro recebe o link de ativação por WhatsApp ou e-mail.",
    "Registra sua bagagem em poucos segundos antes do embarque.",
    "Em caso de ocorrência, aciona a ExactBag e nossa equipe acompanha todo o processo junto à companhia aérea.",
    "Caso a bagagem não seja localizada dentro do prazo previsto na cobertura, o passageiro recebe a indenização contratada. Mesmo após a indenização, a ExactBag continua atuando na busca e recuperação da bagagem.",
    "Vigência: até 30 dias. Utilização: ida e volta. Cobertura: 1 bagagem, R$ 2.500,00. Atendimento: Brasil e exterior.",
    "Conforme as condições da cobertura contratada.",
  ],
  cancellationPolicy: {
    refundable: true,
    hoursBeforeService: 48,
    immediateFine: false,
    penalties: [
      {
        name: "Não reembolsável dentro de 48 horas da utilização",
        description:
          "O serviço é reembolsável para cancelamentos realizados com pelo menos 48 horas de antecedência da data de utilização. Cancelamentos realizados dentro das 48 horas anteriores à utilização não são reembolsáveis.",
        price: { currency: "BRL", amount: 0 },
      },
    ],
  },
};

const COMPLETE_PROTECTION_TWO_BAGS_PRODUCT = {
  code: "5383658",
  name: "ASSISTENCIA DE BAGAGEM EXACTBAG COVER - PROTEÇÃO COMPLETA COM SEGURO EXTRAVIO R$ 2.500 - 2 BAGAGENS",
  shortName: "Proteção Completa 2 Bagagens",
  description:
    "Agente de viagem, ofereça mais tranquilidade ao seu passageiro. " +
    "Problemas com bagagem podem acontecer em qualquer viagem: extravios, atrasos, trocas, danos ou violações, " +
    "tanto em viagens nacionais quanto internacionais! " +
    "Com a Assistência de Bagagem ExactBag, o passageiro viaja com uma camada extra de proteção e " +
    "conta com uma equipe especializada para ajudar na resolução de ocorrências." + 
    "Seguro garantido pela Now Seguros - SUSEP Processo SUSEP 15414.646978/ 2026-75",
  image:
    "https://app.exactbag.com.br/native/assets/produto-protecao-completa-x2.png",
  salePrice: 89.8,
  netPrice: 19.2,
  currency: "BRL",
  bagCount: 2,
  coverages: [
    {
      code: "2898",
      name: "assistencia de bagagem com seguro",
      minPrice: "R$ 2.500,00",
      maxPrice: "R$ 2.500,00",
    },
  ],
  usagePolicy: [
    "Suporte humano especializado 24 horas por dia, 7 dias por semana.",
    "Registro digital das bagagens com fotos e informações.",
    "Identificação das bagagens antes do embarque.",
    "Acompanhamento junto às companhias aéreas.",
    "Auxílio na localização e recuperação das bagagens.",
    "Após a compra, o passageiro recebe o link de ativação por WhatsApp ou e-mail.",
    "Registra suas duas bagagens em poucos segundos antes do embarque.",
    "Em caso de ocorrência, aciona a ExactBag e nossa equipe acompanha todo o processo junto à companhia aérea.",
    "Caso alguma bagagem não seja localizada dentro do prazo previsto na cobertura, o passageiro recebe a indenização conforme as condições contratadas. Mesmo após a indenização, a ExactBag continua atuando na busca e recuperação da bagagem.",
    "Vigência: até 30 dias. Utilização: ida e volta. Cobertura: até 2 bagagens, R$ 2.500,00 por bagagem. Atendimento: Brasil e exterior.",
    "Conforme as condições da cobertura contratada.",
  ],
  cancellationPolicy: {
    refundable: true,
    hoursBeforeService: 48,
    immediateFine: false,
    penalties: [
      {
        name: "Não reembolsável dentro de 48 horas da utilização",
        description:
          "O serviço é reembolsável para cancelamentos realizados com pelo menos 48 horas de antecedência da data de utilização. Cancelamentos realizados dentro das 48 horas anteriores à utilização não são reembolsáveis.",
        price: { currency: "BRL", amount: 0 },
      },
    ],
  },
};

const ESSENTIAL_PROTECTION_ONE_BAG_PRODUCT = {
  code: "5383657",
  name: "ASSISTENCIA DE BAGAGEM EXACTBAG - PROTEÇÃO ESSENCIAL",
  shortName: "Proteção Essencial",
  description:
    "Agente de viagem, ofereça mais tranquilidade ao seu passageiro. " +
    "Problemas com bagagem podem acontecer em qualquer viagem: extravios, atrasos, trocas, danos ou violações, " +
    "tanto em viagens nacionais quanto internacionais! " +
    "Com a Assistência de Bagagem ExactBag, o passageiro viaja com uma camada extra de proteção e " +
    "conta com uma equipe especializada para ajudar na resolução de ocorrências.",
  image:
    "https://app.exactbag.com.br/native/assets/produto-protecao-bagagem.png",
  salePrice: 38.9,
  netPrice: 9.6,
  currency: "BRL",
  bagCount: 1,
  coverages: [],
  usagePolicy: [
    "Suporte humano especializado 24 horas por dia, 7 dias por semana.",
    "Registro digital da bagagem com fotos e informações.",
    "Identificação da bagagem antes do embarque.",
    "Acompanhamento junto às companhias aéreas.",
    "Auxílio na localização e recuperação da bagagem.",
    "Após a compra, o passageiro recebe o link de ativação por WhatsApp ou e-mail.",
    "Registra sua bagagem em poucos segundos antes do embarque.",
    "Em caso de ocorrência, aciona a ExactBag e nossa equipe acompanha todo o processo junto à companhia aérea.",
    "A ExactBag atua ativamente para acelerar o processo de identificação e localização da bagagem, além de auxiliar nos mais diversos problemas relacionados à bagagem por meio da nossa central de atendimento 24 horas por dia, 7 dias por semana, com atendimento 100% humanizado.",
    "Vigência: até 30 dias. Utilização: ida e volta. Cobertura: 1 bagagem. Atendimento: Brasil e exterior.",
  ],
  cancellationPolicy: {
    refundable: true,
    hoursBeforeService: 48,
    immediateFine: false,
    penalties: [
      {
        name: "Não reembolsável dentro de 48 horas da utilização",
        description:
          "O serviço é reembolsável para cancelamentos realizados com pelo menos 48 horas de antecedência da data de utilização. Cancelamentos realizados dentro das 48 horas anteriores à utilização não são reembolsáveis.",
        price: { currency: "BRL", amount: 0 },
      },
    ],
  },
};

const ESSENTIAL_PROTECTION_TWO_BAGS_PRODUCT = {
  code: "5383659",
  name: "ASSISTENCIA DE BAGAGEM EXACTBAG - PROTEÇÃO ESSENCIAL - 2 BAGAGENS",
  shortName: "Proteção Essencial 2 Bagagens",
  description:
    "Agente de viagem, ofereça mais tranquilidade ao seu passageiro. " +
    "Problemas com bagagem podem acontecer em qualquer viagem: extravios, atrasos, trocas, danos ou violações, " +
    "tanto em viagens nacionais quanto internacionais! " +
    "Com a Assistência de Bagagem ExactBag, o passageiro viaja com uma camada extra de proteção e " +
    "conta com uma equipe especializada para ajudar na resolução de ocorrências.",
  image:
    "https://app.exactbag.com.br/native/assets/produto-protecao-bagagem-x2.png",
  salePrice: 77.8,
  netPrice: 19.2,
  currency: "BRL",
  bagCount: 2,
  coverages: [],
  usagePolicy: [
    "Suporte humano especializado 24 horas por dia, 7 dias por semana.",
    "Registro digital da bagagem com fotos e informações.",
    "Identificação das bagagens antes do embarque.",
    "Acompanhamento junto às companhias aéreas.",
    "Auxílio na localização e recuperação da bagagem.",
    "Após a compra, o passageiro recebe o link de ativação por WhatsApp ou e-mail.",
    "Registra suas duas bagagens em poucos segundos antes do embarque.",
    "Em caso de ocorrência, aciona a ExactBag e nossa equipe acompanha todo o processo junto à companhia aérea.",
    "A ExactBag atua ativamente para acelerar o processo de identificação e localização das bagagens, além de auxiliar nos mais diversos problemas relacionados às bagagens por meio da nossa central de atendimento 24 horas por dia, 7 dias por semana, com atendimento 100% humanizado.",
    "Vigência: até 30 dias. Utilização: ida e volta. Cobertura: até 2 bagagens. Atendimento: Brasil e exterior.",
  ],
  cancellationPolicy: {
    refundable: true,
    hoursBeforeService: 48,
    immediateFine: false,
    penalties: [
      {
        name: "Não reembolsável dentro de 48 horas da utilização",
        description:
          "O serviço é reembolsável para cancelamentos realizados com pelo menos 48 horas de antecedência da data de utilização. Cancelamentos realizados dentro das 48 horas anteriores à utilização não são reembolsáveis.",
        price: { currency: "BRL", amount: 0 },
      },
    ],
  },
};

const TAG_ESSENTIAL_ONE_TAG_PRODUCT = {
  code: '5383660',
  name: 'TAG EXACTBAG ESSENCIAL x1 BAGAGEM - IDENTIFICAÇÃO E ASSISTÊNCIA PARA SUA BAGAGEM',
  shortName: 'Tag ExactBag Essencial x1 Bagagem',
  description: `
  Identificação e assistência para sua bagagem \n
  A TAG ExactBag Essencial oferece identificação física, registro digital com fotos e informações da bagagem e suporte humano especializado 24/7, em viagens nacionais e internacionais. O passageiro retira a TAG nas lojas conveniadas da Protec Bag, ativa o serviço pelo QR Code e registra sua bagagem antes de cada embarque ou despacho.\n
  Em caso de atraso, extravio ou outros problemas, a equipe ExactBag acompanha ativamente o processo junto à companhia aérea, cruzando informações para auxiliar na localização e recuperação da bagagem. \n
  Retirada: Guarulhos (GRU), Viracopos (VCP), Curitiba (CWB), Recife (REC), Porto Alegre (POA), Florianópolis (FLN), João Pessoa (JPA), Londrina (LDB), Rio de Janeiro (SDU) e Rio de Janeiro (GIG). \n
  Vigência: até 12 meses | Utilização: ilimitada | Atendimento: Brasil e exterior | Seguro ou indenização por extravio: não incluso.
  `,
  image: 'https://app.exactbag.com.br/native/assets/tag-exactbag-essencial-x1.png',
  salePrice: 79.9,
  netPrice: 55.93,
  currency: 'BRL',
  bagCount: 1,
  coverages: [],
  usagePolicy: [
    'Uma TAG de identificação física exclusiva ExactBag.',
    'Registro digital da bagagem com fotos e informações.',
    'Identificação da bagagem antes do embarque.',
    'Suporte humano especializado 24 horas por dia, 7 dias por semana.',
    'Acompanhamento junto às companhias aéreas.',
    'Auxílio na localização e recuperação da bagagem.',
    'Retirada da TAG nas lojas conveniadas, consulte a descrição.',
    'Após retirar a TAG, leia o QR Code no verso e registre as informações solicitadas.',
    'Vigência: até 12 meses. Utilização: ilimitada durante o período de validade. Atendimento: Brasil e exterior.',
    'Seguro extravio: não incluso.'
  ],
  cancellationPolicy: {
    refundable: true,
    hoursBeforeService: 48,
    immediateFine: false,
    penalties: [
      {
        name: 'Não reembolsável dentro de 48 horas da utilização',
        description:
          'O serviço é reembolsável para cancelamentos realizados com pelo menos 48 horas de antecedência da data de utilização. Cancelamentos realizados dentro das 48 horas anteriores à utilização não são reembolsáveis.',
        price: { currency: 'BRL', amount: 0 }
      }
    ]
  }
};

const TAG_ESSENTIAL_TWO_TAGS_PRODUCT = {
  code: '5383662',
  name: 'TAG EXACTBAG ESSENCIAL X2 - IDENTIFICAÇÃO E ASSISTÊNCIA PARA SUA BAGAGEM',
  shortName: 'Tag ExactBag Essencial X2',
  description: `Identificação e assistência para suas bagagens \n
  O ExactBag Essencial oferece 2 TAGs para identificação física das bagagens, registro digital com fotos e informações de cada bagagem e suporte humano especializado 24/7, em viagens nacionais e internacionais. O passageiro retira as TAGs nas lojas conveniadas da Protec Bag, ativa o serviço pelo QR Code e registra suas bagagens antes de cada embarque ou despacho.\n
  Em caso de atraso, extravio ou outros problemas, a equipe ExactBag acompanha ativamente o processo junto à companhia aérea, cruzando informações para auxiliar na localização e recuperação das bagagens. \n
  Retirada: Guarulhos (GRU), Viracopos (VCP), Curitiba (CWB), Recife (REC), Porto Alegre (POA), Florianópolis (FLN), João Pessoa (JPA), Londrina (LDB), Rio de Janeiro (SDU) e Rio de Janeiro (GIG). \n
  Vigência: até 12 meses | Utilização: ilimitada | Quantidade: 2 TAGs | Atendimento: Brasil e exterior | Seguro ou indenização por extravio: não incluso.`,
  image: 'https://app.exactbag.com.br/native/assets/tag-exactbag-essencial-x2.png',
  salePrice: 159.8,
  netPrice: 111.86,
  currency: 'BRL',
  bagCount: 2,
  coverages: PHYSICAL_TAG_INSURANCE_COVERAGES,
  usagePolicy: [
    'Duas TAGs de identificação física exclusivas ExactBag.',
    'Registro digital das bagagens com fotos e informações.',
    'Identificação das bagagens antes do embarque.',
    'Suporte humano especializado 24 horas por dia, 7 dias por semana.',
    'Acompanhamento junto às companhias aéreas.',
    'Auxílio na localização e recuperação das bagagens.',
    'Retirada da TAG nas lojas conveniadas, consulte a descrição.',
    'Após retirar as TAGs, leia o QR Code no verso e registre as informações solicitadas.',
    'Vigência: até 12 meses. Utilização: ilimitada durante o período de validade. Atendimento: Brasil e exterior.',
    'Seguro extravio de R$ 2.500,00 em caso de não localização, conforme as condições da cobertura contratada.'
  ],
  cancellationPolicy: {
    refundable: true,
    hoursBeforeService: 48,
    immediateFine: false,
    penalties: [
      {
        name: 'Não reembolsável dentro de 48 horas da utilização',
        description:
          'O serviço é reembolsável para cancelamentos realizados com pelo menos 48 horas de antecedência da data de utilização. Cancelamentos realizados dentro das 48 horas anteriores à utilização não são reembolsáveis.',
        price: { currency: 'BRL', amount: 0 }
      }
    ]
  }
};

const TAG_COVER_ONE_TAG_PRODUCT = {
  code: '5383661',
  name: 'TAG EXACTBAG COVER X1 - PROTEÇÃO COMPLETA COM SEGURO EXTRAVIO R$ 2.500',
  shortName: 'Tag ExactBag Cover X1',
  description: `
  Proteção completa com seguro extravio de R$ 2.500 \n 
  A TAG ExactBag Cover combina identificação física, registro digital com fotos e informações da bagagem e suporte humano especializado 24/7, em viagens nacionais e internacionais. O passageiro retira a TAG nas lojas conveniadas da Protec Bag, ativa o serviço pelo QR Code e registra sua bagagem antes de cada embarque ou despacho. \n
  Em caso de atraso, extravio ou outros problemas, a equipe ExactBag acompanha ativamente o processo junto à companhia aérea, cruzando informações para auxiliar na localização e recuperação da bagagem.\n
  Se a bagagem não for localizada dentro do prazo previsto na cobertura, o passageiro recebe indenização de R$ 2.500,00, conforme as condições contratadas. Mesmo após a indenização, a ExactBag continua atuando na busca e recuperação da bagagem junto à companhia aérea.\n
  Retirada: Guarulhos (GRU), Viracopos (VCP), Curitiba (CWB), Recife (REC), Porto Alegre (POA), Florianópolis (FLN), João Pessoa (JPA), Londrina (LDB), Rio de Janeiro (SDU) e Rio de Janeiro (GIG). \n
  Vigência: até 12 meses | Utilização: ilimitada | Atendimento: Brasil e exterior | Cobertura: Seguro extravio de R$ 2.500,00*.\n
  Conforme condições da cobertura contratada. \n Seguro garantido pela Now Seguros - SUSEP Processo SUSEP 15414.646978/ 2026-75`,
  image: 'https://app.exactbag.com.br/native/assets/tag-exactbag-cover-x1.png',
  salePrice: 99.9,
  netPrice: 69.93,
  currency: 'BRL',
  bagCount: 1,
  coverages: [
    {
      code: '2898',
      name: 'assistencia de bagagem com seguro',
      minPrice: 'R$ 2.500,00',
      maxPrice: 'R$ 2.500,00'
    }
  ],
  usagePolicy: [
    'Uma TAG de identificação física exclusiva ExactBag.',
    'Registro digital da bagagem com fotos e informações.',
    'Identificação da bagagem antes do embarque.',
    'Suporte humano especializado 24 horas por dia, 7 dias por semana.',
    'Acompanhamento junto às companhias aéreas.',
    'Auxílio na localização e recuperação da bagagem.',
    'Seguro extravio de R$ 2.500,00 em caso de não localização, conforme as condições da cobertura contratada.',
    'Retirada da TAG nas lojas conveniadas, consulte a descrição.',
    'Após retirar a TAG, leia o QR Code no verso e registre as informações solicitadas.',
    'Vigência: até 12 meses. Utilização: ilimitada durante o período de validade. Atendimento: Brasil e exterior.'
  ],
  cancellationPolicy: {
    refundable: true,
    hoursBeforeService: 48,
    immediateFine: false,
    penalties: [
      {
        name: 'Não reembolsável dentro de 48 horas da utilização',
        description:
          'O serviço é reembolsável para cancelamentos realizados com pelo menos 48 horas de antecedência da data de utilização. Cancelamentos realizados dentro das 48 horas anteriores à utilização não são reembolsáveis.',
        price: { currency: 'BRL', amount: 0 }
      }
    ]
  }
};

const TAG_COVER_TWO_TAGS_PRODUCT = {
  code: '5383663',
  name: 'TAG EXACTBAG COVER X2 - PROTEÇÃO COMPLETA COM SEGURO EXTRAVIO R$ 2.500',
  shortName: 'Tag ExactBag Cover X2',
  description: `Proteção completa com seguro extravio de R$ 2.500 \n
  O ExactBag Cover oferece 2 TAGs e combina identificação física, registro digital com fotos e informações de cada bagagem e suporte humano especializado 24/7, em viagens nacionais e internacionais. O passageiro retira as TAGs nas lojas conveniadas da Protec Bag, ativa o serviço pelo QR Code e registra suas bagagens antes de cada embarque ou despacho.\n
  Em caso de atraso, extravio ou outros problemas, a equipe ExactBag acompanha ativamente o processo junto à companhia aérea, cruzando informações para auxiliar na localização e recuperação das bagagens. \n
  Se uma bagagem não for localizada dentro do prazo previsto na cobertura, o passageiro recebe indenização de R$ 2.500,00, conforme as condições contratadas. Mesmo após a indenização, a ExactBag continua atuando na busca e recuperação da bagagem junto à companhia aérea. \n
  Retirada: Guarulhos (GRU), Viracopos (VCP), Curitiba (CWB), Recife (REC), Porto Alegre (POA), Florianópolis (FLN), João Pessoa (JPA), Londrina (LDB), Rio de Janeiro (SDU) e Rio de Janeiro (GIG).  \n
  Vigência: até 12 meses | Utilização: ilimitada | Quantidade: 2 TAGs | Atendimento: Brasil e exterior | Cobertura: Seguro extravio de R$ 2.500,00*.\n
  *Conforme condições da cobertura contratada. \n Seguro garantido pela Now Seguros - SUSEP Processo SUSEP 15414.646978/ 2026-75.
  `,
  image: 'https://app.exactbag.com.br/native/assets/tag-exactbag-cover-x2.png',
  salePrice: 199.8,
  netPrice: 139.86,
  currency: 'BRL',
  bagCount: 2,
  coverages: PHYSICAL_TAG_INSURANCE_COVERAGES,
  usagePolicy: [
    'Duas TAGs de identificação física exclusivas ExactBag.',
    'Registro digital das bagagens com fotos e informações.',
    'Identificação das bagagens antes do embarque.',
    'Suporte humano especializado 24 horas por dia, 7 dias por semana.',
    'Acompanhamento junto às companhias aéreas.',
    'Auxílio na localização e recuperação das bagagens.',
    'Seguro extravio de R$ 2.500,00 em caso de não localização, conforme as condições da cobertura contratada.',
    'Retirada da TAG nas lojas conveniadas, consulte a descrição.',
    'Após retirar as TAGs, leia o QR Code no verso e registre as informações solicitadas.',
    'Vigência: até 12 meses. Utilização: ilimitada durante o período de validade. Atendimento: Brasil e exterior.'
  ],
  cancellationPolicy: {
    refundable: true,
    hoursBeforeService: 48,
    immediateFine: false,
    penalties: [
      {
        name: 'Não reembolsável dentro de 48 horas da utilização',
        description:
          'O serviço é reembolsável para cancelamentos realizados com pelo menos 48 horas de antecedência da data de utilização. Cancelamentos realizados dentro das 48 horas anteriores à utilização não são reembolsáveis.',
        price: { currency: 'BRL', amount: 0 }
      }
    ]
  }
};

const PRODUCTS = [
  COMPLETE_PROTECTION_ONE_BAG_PRODUCT,
  ESSENTIAL_PROTECTION_ONE_BAG_PRODUCT,
  COMPLETE_PROTECTION_TWO_BAGS_PRODUCT,
  ESSENTIAL_PROTECTION_TWO_BAGS_PRODUCT,
  TAG_ESSENTIAL_ONE_TAG_PRODUCT,
  TAG_COVER_ONE_TAG_PRODUCT,
  TAG_ESSENTIAL_TWO_TAGS_PRODUCT,
  TAG_COVER_TWO_TAGS_PRODUCT,
];

module.exports = {
  EXACTBAG_PROVIDER,
  PHYSICAL_TAG_PRODUCT_CODES,
  PHYSICAL_TAG_INSURED_PRODUCT_CODES,
  PRODUCTS,
};
