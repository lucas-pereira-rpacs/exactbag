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
  externalCode: '',
  name: 'ExactBag',
  localTrip: false
};

const PRODUCTS = [
  {
    code: '5383656',
    name: 'ASSISTENCIA DE BAGAGEM EXACTBAG COVER - PROTEÇÃO COMPLETA COM SEGURO EXTRAVIO R$ 2.500',
    shortName: 'Proteção Completa',
    description:
      'Agente de viagem, ofereça mais tranquilidade ao seu passageiro. ' +
      'Problemas com bagagem podem acontecer em qualquer viagem: extravios, atrasos, trocas, danos ou violações, ' +
      'tanto em viagens nacionais quanto internacionais! ' +
      'Com a Assistência de Bagagem ExactBag, o passageiro viaja com uma camada extra de proteção e ' +
      'conta com uma equipe especializada para ajudar na resolução de ocorrências.',
    image: 'https://app.exactbag.com.br/native/assets/produto-protecao-completa.png',
    salePrice: 44.9,
    netPrice: 9.6,
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
      'Suporte humano especializado 24 horas por dia, 7 dias por semana.',
      'Registro digital da bagagem com fotos e informações.',
      'Identificação da bagagem antes do embarque.',
      'Acompanhamento junto às companhias aéreas.',
      'Auxílio na localização e recuperação da bagagem.',
      'Seguro por extravio de R$ 2.500,00 em caso de não localização.',
      'Após a compra, o passageiro recebe o link de ativação por WhatsApp ou e-mail.',
      'Registra sua bagagem em poucos segundos antes do embarque.',
      'Em caso de ocorrência, aciona a ExactBag e nossa equipe acompanha todo o processo junto à companhia aérea.',
      'Caso a bagagem não seja localizada dentro do prazo previsto na cobertura, o passageiro recebe a indenização contratada. Mesmo após a indenização, a ExactBag continua atuando na busca e recuperação da bagagem.',
      'Vigência: até 30 dias. Utilização: ida e volta. Cobertura: 1 bagagem, R$ 2.500,00. Atendimento: Brasil e exterior.',
      'Conforme as condições da cobertura contratada.'
    ],
    cancellationPolicy: {
      refundable: false,
      immediateFine: false,
      penalties: [
        {
          name: 'Não reembolsável após emissão do CPV',
          description:
            'O serviço não é reembolsável após a emissão do CPV. Cancelamentos antes da emissão seguem a política do parceiro.',
          price: { currency: 'BRL', amount: 0.0 }
        }
      ]
    }
  },
  {
    code: '5383657',
    name: 'ASSISTENCIA DE BAGAGEM EXACTBAG - PROTEÇÃO ESSENCIAL',
    shortName: 'Proteção Essencial',
    description:
      'Agente de viagem, ofereça mais tranquilidade ao seu passageiro. ' +
      'Problemas com bagagem podem acontecer em qualquer viagem: extravios, atrasos, trocas, danos ou violações, ' +
      'tanto em viagens nacionais quanto internacionais! ' +
      'Com a Assistência de Bagagem ExactBag, o passageiro viaja com uma camada extra de proteção e ' +
      'conta com uma equipe especializada para ajudar na resolução de ocorrências.',
    image: 'https://app.exactbag.com.br/native/assets/produto-protecao-bagagem.png',
    salePrice: 38.9,
    netPrice: 9.6,
    currency: 'BRL',
    bagCount: 1,
    coverages: [],
    usagePolicy: [
      'Suporte humano especializado 24 horas por dia, 7 dias por semana.',
      'Registro digital da bagagem com fotos e informações.',
      'Identificação da bagagem antes do embarque.',
      'Acompanhamento junto às companhias aéreas.',
      'Auxílio na localização e recuperação da bagagem.',
      'Após a compra, o passageiro recebe o link de ativação por WhatsApp ou e-mail.',
      'Registra sua bagagem em poucos segundos antes do embarque.',
      'Em caso de ocorrência, aciona a ExactBag e nossa equipe acompanha todo o processo junto à companhia aérea.',
      'A ExactBag atua ativamente para acelerar o processo de identificação e localização da bagagem, além de auxiliar nos mais diversos problemas relacionados à bagagem por meio da nossa central de atendimento 24 horas por dia, 7 dias por semana, com atendimento 100% humanizado.',
      'Vigência: até 30 dias. Utilização: ida e volta. Cobertura: 1 bagagem. Atendimento: Brasil e exterior.'
    ],
    cancellationPolicy: {
      refundable: false,
      immediateFine: false,
      penalties: [
        {
          name: 'Não reembolsável após emissão do CPV',
          description:
            'O serviço não é reembolsável após a emissão do CPV. Cancelamentos antes da emissão seguem a política do parceiro.',
          price: { currency: 'BRL', amount: 0.0 }
        }
      ]
    }
  },
  {
    code: '5383658',
    name: 'ASSISTENCIA DE BAGAGEM EXACTBAG COVER - PROTEÇÃO COMPLETA COM SEGURO EXTRAVIO R$ 2.500 - 2 BAGAGENS',
    shortName: 'Proteção Completa 2 Bagagens',
    description:
      'Agente de viagem, ofereça mais tranquilidade ao seu passageiro. ' +
      'Problemas com bagagem podem acontecer em qualquer viagem: extravios, atrasos, trocas, danos ou violações, ' +
      'tanto em viagens nacionais quanto internacionais! ' +
      'Com a Assistência de Bagagem ExactBag, o passageiro viaja com uma camada extra de proteção e ' +
      'conta com uma equipe especializada para ajudar na resolução de ocorrências.',
    image: 'https://app.exactbag.com.br/native/assets/produto-protecao-completa.png',
    salePrice: 89.8,
    netPrice: 19.2,
    currency: 'BRL',
    bagCount: 2,
    coverages: [
      {
        code: '2898',
        name: 'assistencia de bagagem com seguro',
        minPrice: 'R$ 2.500,00',
        maxPrice: 'R$ 2.500,00'
      }
    ],
    usagePolicy: [
      'Suporte humano especializado 24 horas por dia, 7 dias por semana.',
      'Registro digital das bagagens com fotos e informações.',
      'Identificação das bagagens antes do embarque.',
      'Acompanhamento junto às companhias aéreas.',
      'Auxílio na localização e recuperação das bagagens.',
      'Após a compra, o passageiro recebe o link de ativação por WhatsApp ou e-mail.',
      'Registra suas duas bagagens em poucos segundos antes do embarque.',
      'Em caso de ocorrência, aciona a ExactBag e nossa equipe acompanha todo o processo junto à companhia aérea.',
      'Caso alguma bagagem não seja localizada dentro do prazo previsto na cobertura, o passageiro recebe a indenização conforme as condições contratadas. Mesmo após a indenização, a ExactBag continua atuando na busca e recuperação da bagagem.',
      'Vigência: até 30 dias. Utilização: ida e volta. Cobertura: até 2 bagagens, R$ 2.500,00 por bagagem. Atendimento: Brasil e exterior.',
      'Conforme as condições da cobertura contratada.'
    ],
    cancellationPolicy: {
      refundable: false,
      immediateFine: false,
      penalties: [
        {
          name: 'Não reembolsável após emissão do CPV',
          description:
            'O serviço não é reembolsável após a emissão do CPV. Cancelamentos antes da emissão seguem a política do parceiro.',
          price: { currency: 'BRL', amount: 0.0 }
        }
      ]
    }
  },
  {
    code: '5383659',
    name: 'ASSISTENCIA DE BAGAGEM EXACTBAG - PROTEÇÃO ESSENCIAL - 2 BAGAGENS',
    shortName: 'Proteção Essencial 2 Bagagens',
    description:
      'Agente de viagem, ofereça mais tranquilidade ao seu passageiro. ' +
      'Problemas com bagagem podem acontecer em qualquer viagem: extravios, atrasos, trocas, danos ou violações, ' +
      'tanto em viagens nacionais quanto internacionais! ' +
      'Com a Assistência de Bagagem ExactBag, o passageiro viaja com uma camada extra de proteção e ' +
      'conta com uma equipe especializada para ajudar na resolução de ocorrências.',
    image: 'https://app.exactbag.com.br/native/assets/produto-protecao-bagagem.png',
    salePrice: 77.8,
    netPrice: 19.2,
    currency: 'BRL',
    bagCount: 2,
    coverages: [],
    usagePolicy: [
      'Suporte humano especializado 24 horas por dia, 7 dias por semana.',
      'Registro digital da bagagem com fotos e informações.',
      'Identificação das bagagens antes do embarque.',
      'Acompanhamento junto às companhias aéreas.',
      'Auxílio na localização e recuperação da bagagem.',
      'Após a compra, o passageiro recebe o link de ativação por WhatsApp ou e-mail.',
      'Registra suas duas bagagens em poucos segundos antes do embarque.',
      'Em caso de ocorrência, aciona a ExactBag e nossa equipe acompanha todo o processo junto à companhia aérea.',
      'A ExactBag atua ativamente para acelerar o processo de identificação e localização das bagagens, além de auxiliar nos mais diversos problemas relacionados às bagagens por meio da nossa central de atendimento 24 horas por dia, 7 dias por semana, com atendimento 100% humanizado.',
      'Vigência: até 30 dias. Utilização: ida e volta. Cobertura: até 2 bagagens. Atendimento: Brasil e exterior.'
    ],
    cancellationPolicy: {
      refundable: false,
      immediateFine: false,
      penalties: [
        {
          name: 'Não reembolsável após emissão do CPV',
          description:
            'O serviço não é reembolsável após a emissão do CPV. Cancelamentos antes da emissão seguem a política do parceiro.',
          price: { currency: 'BRL', amount: 0.0 }
        }
      ]
    }
  }
];

module.exports = {
  EXACTBAG_PROVIDER,
  PRODUCTS
};
