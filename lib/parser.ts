
// lib/parser.ts
import { OrderItem, ProcessedData, Canal, ResumidaItem, GeneralSettings, ColumnMapping } from '../types';
import { getMultiplicadorFromSku, classificarCor } from './sku';
import * as XLSX from 'xlsx';

const safeUpper = (val: any) => String(val || '').trim().toUpperCase();

export const parseExcelFile = (
    fileBuffer: ArrayBuffer, 
    fileName: string, 
    allExistingOrders: OrderItem[], 
    settings: GeneralSettings, 
    options: { importCpf: boolean, importName: boolean },
    forcedCanal?: Canal // Optional parameter to force channel
): ProcessedData => {
    // cellDates: true converte datas do Excel para objetos Date JS automaticamente
    const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    let canal: Canal;
    let mapping: ColumnMapping;
    let startRow = 0;

    if (forcedCanal) {
        canal = forcedCanal;
        if (canal === 'ML') mapping = settings.importer.ml;
        else if (canal === 'SHOPEE') mapping = settings.importer.shopee;
        else mapping = settings.importer.site;
        
        // Auto-detect header row for ML if needed, or stick to 0 for others
        // ML exports usually start at row 5 (index 4), but CSVs might start at 0
        if (canal === 'ML' && (fileName.toLowerCase().includes('vendas') || fileName.toLowerCase().includes('mercado'))) {
             startRow = 5; 
        }
    } else {
        // Fallback to filename detection
        const isML = fileName.toLowerCase().includes('vendas') || fileName.toLowerCase().includes('mercado');
        startRow = isML ? 5 : 0;
        mapping = isML ? settings.importer.ml : settings.importer.shopee;
        canal = isML ? 'ML' : 'SHOPEE';
    }
    
    // raw: false tenta formatar valores, mas preferimos raw para números para evitar problemas de locale
    const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { range: startRow, raw: false });
    
    if (jsonData.length === 0) throw new Error('A planilha está vazia.');

    const normalizeDate = (rawDate: any): string => {
        if (!rawDate) return '';
        
        if (rawDate instanceof Date) {
            const userTimezoneOffset = rawDate.getTimezoneOffset() * 60000;
            const dateAdjusted = new Date(rawDate.getTime() - userTimezoneOffset); 
            const year = dateAdjusted.getFullYear();
            const month = String(dateAdjusted.getMonth() + 1).padStart(2, '0');
            const day = String(dateAdjusted.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        let dateStr = String(rawDate).trim();
        if (dateStr.includes(' ')) {
            dateStr = dateStr.split(' ')[0];
        }
        
        const dmyMatch = dateStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
        if (dmyMatch) {
            return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
        }
        
        const ymdMatch = dateStr.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
        if (ymdMatch) {
            return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
        }
        
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
        
        return '';
    };

    const existingKeys = new Set(allExistingOrders.map(o => `${safeUpper(o.orderId)}|${safeUpper(o.sku)}`));
    let orders: OrderItem[] = [];

    const cleanMoney = (val: any): number => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        
        let str = String(val).trim();
        // Remove símbolos de moeda e espaços extras
        str = str.replace(/[R$\s\u00A0]/g, '');
        
        // Verifica formato brasileiro (1.000,00) vs formato americano (1,000.00)
        const hasComma = str.includes(',');
        const hasDot = str.includes('.');

        if (hasComma && hasDot) {
            if (str.indexOf('.') < str.indexOf(',')) {
                // Formato 1.000,00 -> Remove ponto, troca vírgula por ponto
                str = str.replace(/\./g, '').replace(',', '.');
            } else {
                // Formato 1,000.00 -> Remove vírgula
                str = str.replace(/,/g, '');
            }
        } else if (hasComma) {
            // Apenas vírgula (100,00) -> Troca por ponto
            str = str.replace(',', '.');
        }
        // Se tiver apenas ponto, assume que já é decimal (100.00) ou milhar sem decimal (1.000). 
        // Assumimos decimal se tiver 2 casas no final, senão é arriscado, mas Javascript parseFloat lida bem com "1000" e "1000.50".
        
        str = str.replace(/[^0-9.-]/g, '');
        const num = parseFloat(str);
        return isNaN(num) ? 0 : num;
    };

    const statusColumnName = mapping.statusColumn;
    const acceptedStatusValues = (mapping.acceptedStatusValues || []).map(v => v.trim().toLowerCase());

    for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        // --- FILTRO DE STATUS DA VENDA ---
        let statusParaImportacao: 'NORMAL' | 'ERRO' = 'NORMAL';
        let errorReason = undefined;

        if (statusColumnName && acceptedStatusValues.length > 0) {
            const rawStatus = String(row[statusColumnName] || '').trim().toLowerCase();
            const isAccepted = acceptedStatusValues.includes(rawStatus);
            
            if (!isAccepted) {
                statusParaImportacao = 'ERRO';
                errorReason = `Status na planilha: ${row[statusColumnName]}`;
            }
        }

        const orderId = safeUpper(row[mapping.orderId]);
        const sku = safeUpper(row[mapping.sku]);
        const qty_raw = Number(row[mapping.qty] || 0);

        if (!orderId || !sku || qty_raw <= 0) continue;
        
        // --- CÁLCULOS FINANCEIROS ---
        // Tenta ler valor total e valor unitário
        let rawTotalValue = mapping.totalValue ? cleanMoney(row[mapping.totalValue]) : 0;
        let rawPriceColumn = mapping.priceGross ? cleanMoney(row[mapping.priceGross]) : 0;
        
        // Se só tiver um, tenta inferir o outro
        if (rawTotalValue === 0 && rawPriceColumn > 0) {
            // Se temos unitário mas não total, total = unitário (assumindo que a linha representa o total daquele item)
            // Nota: Em algumas planilhas o preço unitário * quantidade = total.
            // Aqui assumimos que o valor na coluna é o valor total daquela linha de pedido se qty > 1
            // Se a planilha for "preço unitário", deveríamos multiplicar por qty_raw.
            // Por segurança em Marketplaces, geralmente a coluna é "Valor da Venda" (Total).
            // Vamos assumir: Se PriceGross existe, é o valor base.
            rawTotalValue = rawPriceColumn; 
        } else if (rawTotalValue > 0 && rawPriceColumn === 0) {
            rawPriceColumn = rawTotalValue;
        }

        const customerShipping = mapping.shippingPaidByCustomer ? Math.abs(cleanMoney(row[mapping.shippingPaidByCustomer])) : 0;
        const sellerShipping = mapping.shippingFee ? Math.abs(cleanMoney(row[mapping.shippingFee])) : 0;
        
        const fees = (mapping.fees || []).reduce((sum, f) => {
            const val = Math.abs(cleanMoney(row[f]));
            return sum + (isNaN(val) ? 0 : val);
        }, 0);

        let calculatedTotal = 0;
        let calculatedProduct = 0;

        // Lógica de Reconciliação:
        // Se temos Total (que geralmente inclui frete pago pelo cliente), o produto é Total - FreteCliente
        if (rawTotalValue > 0) {
            calculatedTotal = rawTotalValue;
            // Se o frete do cliente está embutido no total (comum), removemos para achar o valor do produto
            calculatedProduct = Math.max(0, calculatedTotal - customerShipping);
        } else {
            // Se não temos total, usamos o valor do produto capturado
            calculatedProduct = rawPriceColumn;
            calculatedTotal = calculatedProduct + customerShipping;
        }

        const calculatedNet = calculatedProduct - fees - sellerShipping;

        const mult = getMultiplicadorFromSku(sku);
        const dataVenda = normalizeDate(row[mapping.date]);
        const dataEnvio = mapping.dateShipping ? normalizeDate(row[mapping.dateShipping]) : undefined;

        orders.push({
            id: `${canal}_${Date.now()}_${i}`,
            orderId,
            tracking: safeUpper(row[mapping.tracking]),
            sku,
            qty_original: qty_raw,
            multiplicador: mult,
            qty_final: Math.round(qty_raw * mult),
            color: classificarCor(sku),
            canal,
            data: dataVenda, 
            data_prevista_envio: dataEnvio,
            status: statusParaImportacao,
            error_reason: errorReason,
            customer_name: options.importName ? String(row[mapping.customerName] || '') : undefined,
            customer_cpf_cnpj: options.importCpf ? String(row[mapping.customerCpf] || '') : undefined,
            
            price_total: calculatedTotal,
            price_gross: calculatedProduct,
            price_net: calculatedNet,
            
            platform_fees: fees,
            shipping_fee: sellerShipping,
            shipping_paid_by_customer: customerShipping,
        });
    }

    if (orders.length === 0) throw new Error('Nenhum pedido válido encontrado (verifique se a planilha não está vazia ou se o mapeamento está correto).');

    const jaSalvos = orders.filter(o => existingKeys.has(`${safeUpper(o.orderId)}|${safeUpper(o.sku)}`)).length;

    return {
        importId: `imp_${Date.now()}`,
        canal,
        lists: { completa: orders, resumida: [], totaisPorCor: [] },
        skusNaoVinculados: Array.from(new Set(orders.map(o => o.sku))).map(sku => ({ sku, colorSugerida: classificarCor(sku) })),
        idempotencia: { lancaveis: orders.length, jaSalvos },
        summary: {
            totalPedidos: new Set(orders.map(o => o.orderId)).size,
            totalPacotes: orders.length,
            totalUnidades: orders.reduce((s, o) => s + o.qty_final, 0),
            totalUnidadesBranca: 0, totalUnidadesPreta: 0, totalUnidadesEspecial: 0, totalMiudos: 0
        }
    };
};
