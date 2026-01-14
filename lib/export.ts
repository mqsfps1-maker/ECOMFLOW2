
// lib/export.ts
import { User, StockItem, StockMovement, ProdutoCombinado, WeighingBatch, OrderItem, ReturnItem, ScanLogItem, SkuLink, ProcessedData, MaterialItem, ProductionPlanItem, PlanningParameters, ResumidaItem } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export type Tab = 'vinculo' | 'completa' | 'resumida' | 'totais' | 'materiais';

const headerStyles = {
    fillColor: '#1f2937', // slate-800
    textColor: '#ffffff', // white
};

export const exportPdf = (activeTab: Tab, data: ProcessedData, skuLinks: SkuLink[] = [], stockItems: StockItem[] = [], sortMode: 'qty' | 'alpha' = 'qty') => {
    const doc = new jsPDF();
    const title = `Relatório de Importação - ${data.canal} - ${new Date().toLocaleDateString('pt-BR')}`;
    doc.text(title, 14, 15);

    let head: string[][] = [];
    let body: (string | number)[][] = [];
    let subTitle = '';
    let tableOptions: any = { startY: 25 };

    switch (activeTab) {
        case 'completa': {
            subTitle = 'Lista Completa de Pedidos';
            head = [['Status', 'Pedido', 'Rastreio', 'SKU', 'Qtd Final', 'Cor']];
            const linkedSkusMap = new Map<string, string>(skuLinks.map(link => [link.importedSku, link.masterProductSku] as [string, string]));

            const groups = new Map<string, OrderItem[]>();
            data.lists.completa.forEach(order => {
                const identifier = order.orderId || order.tracking;
                if (!identifier) return;
                const key = `${order.data}|${identifier}`;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(order);
            });

            const sortedGroups = Array.from(groups.values()).sort((a, b) => {
                const colorA = a.length > 1 ? 'Diversas' : a[0].color;
                const colorB = b.length > 1 ? 'Diversas' : b[0].color;
                return colorA.localeCompare(colorB);
            });

            sortedGroups.forEach((items) => {
                if (items.length > 1) {
                    const first = items[0];
                    const isLinked = items.every((order: OrderItem) => linkedSkusMap.has(order.sku));
                    body.push([
                        isLinked ? 'Pronto' : 'Pendente',
                        first.orderId,
                        first.tracking,
                        `Múltiplos SKUs (${items.length})`,
                        items.reduce((sum, i) => sum + i.qty_final, 0),
                        'Diversas'
                    ]);
                    items.forEach(order => {
                        body.push(['', '', '', `  - ${order.sku}`, order.qty_final, order.color]);
                    });
                } else {
                    const order = items[0];
                    const isLinked = linkedSkusMap.has(order.sku);
                    body.push([isLinked ? 'Pronto' : 'Pendente', order.orderId, order.tracking, order.sku, order.qty_final, order.color]);
                }
            });
            break;
        }
        case 'resumida': {
            subTitle = 'Lista por Produto Mestre';
            const stockMap = new Map<string, StockItem>(stockItems.map(i => [i.code.toUpperCase(), i] as [string, StockItem]));
            const skuLinkMap = new Map<string, string>(skuLinks.map(l => [l.importedSku.toUpperCase(), l.masterProductSku.toUpperCase()] as [string, string]));
            
            const distributionMap = new Map<string, ResumidaItem>();
            data.lists.completa.forEach(o => {
                const masterCode = skuLinkMap.get(o.sku.toUpperCase()) || o.sku.toUpperCase();
                const product = stockMap.get(masterCode);
                const entry: ResumidaItem = distributionMap.get(masterCode) || { sku: masterCode, color: product?.color || o.color, distribution: {}, total_units: 0 };
                entry.distribution[o.qty_final] = (entry.distribution[o.qty_final] || 0) + 1;
                entry.total_units += o.qty_final;
                distributionMap.set(masterCode, entry);
            });

            let sortedList = Array.from(distributionMap.values());
            if (sortMode === 'qty') {
                sortedList.sort((a, b) => b.total_units - a.total_units || a.sku.localeCompare(b.sku));
            } else {
                sortedList.sort((a, b) => a.sku.localeCompare(b.sku));
            }

            const resumidaSizes = Array.from(new Set(sortedList.flatMap(i => Object.keys(i.distribution).map(Number)))).sort((a, b) => a - b);
            head = [['Produto Mestre', 'Cor', ...resumidaSizes.map(s => `${s} un.`), 'Total Unidades']];
            body = sortedList.map(item => {
                const product = stockMap.get(item.sku.toUpperCase());
                return [
                    product?.name || `(N/V) ${item.sku}`,
                    item.color,
                    ...resumidaSizes.map(size => item.distribution[size] || 0),
                    item.total_units
                ];
            });
            break;
        }
        case 'vinculo':
            subTitle = 'SKUs Não Vinculados';
            head = [['SKU Importado', 'Cor Sugerida']];
            const currentLinked = new Set(skuLinks.map(l => l.importedSku.toUpperCase()));
            body = data.skusNaoVinculados
                .filter(s => !currentLinked.has(s.sku.toUpperCase()))
                .map(s => [s.sku, s.colorSugerida]);
            break;
        case 'materiais':
            subTitle = 'Lista de Materiais Necessários';
            head = [['Material', 'Quantidade', 'Unidade']];
            const materialList = data.lists.listaDeMateriais || [];
            body = materialList.map(m => [m.name, m.unit === 'kg' ? m.quantity.toFixed(3) : m.quantity, m.unit]);
            break;
        default:
            break;
    }
    
    doc.setFontSize(12);
    doc.text(subTitle, 14, 22);
    autoTable(doc, { 
        head, 
        body, 
        headStyles: headerStyles, 
        theme: 'grid',
        styles: { fontSize: 8 },
        ...tableOptions 
    });
    doc.save(`importacao_${data.canal}_${activeTab}.pdf`);
};

export const exportFinanceReport = async (payload: { period: string, canal: string, stats: any, materialList: MaterialItem[], orders: OrderItem[], taxes?: any[] }) => {
    const doc = new jsPDF();
    const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Relatório Financeiro Estratégico', 14, 20);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Período: ${payload.period} | Canal: ${payload.canal} | Gerado em: ${new Date().toLocaleString()}`, 14, 28);

    // 1. Sumário Executivo
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('1. Sumário Executivo', 14, 40);
    
    const taxTotal = payload.taxes?.reduce((s, t) => s + t.calculatedAmount, 0) || 0;

    autoTable(doc, {
        startY: 45,
        head: [['Indicador', 'Valor']],
        body: [
            ['Faturamento Bruto', fmt(payload.stats.gross)],
            ['(-) Taxas Marketplace (Comissões/Fretes)', fmt(payload.stats.fees + payload.stats.shipping)],
            ['(-) Impostos Governamentais', fmt(taxTotal)],
            ['(=) Resultado Líquido Final', fmt(payload.stats.net - taxTotal)],
            ['Total de Unidades Vendidas', payload.stats.units],
            ['Total de Pedidos Processados', payload.orders.length],
        ],
        theme: 'striped',
        headStyles: { fillColor: '#059669' }
    });

    // 2. Detalhamento de Impostos (NOVO)
    if (payload.taxes && payload.taxes.length > 0) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('2. Detalhamento de Impostos Configurados', 14, (doc as any).lastAutoTable.finalY + 15);

        autoTable(doc, {
            startY: (doc as any).lastAutoTable.finalY + 20,
            head: [['Imposto', 'Tipo', 'Valor Base', 'Total Deduzido']],
            body: payload.taxes.map(t => [
                t.name,
                t.type === 'percent' ? 'Porcentagem' : 'Fixo',
                t.type === 'percent' ? `${t.value}%` : fmt(t.value),
                fmt(t.calculatedAmount)
            ]),
            theme: 'grid',
            headStyles: { fillColor: '#8b5cf6' }
        });
    }

    // 3. Ranking de Produtos
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('3. Performance de Vendas por SKU', 14, (doc as any).lastAutoTable.finalY + 15);
    
    autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [['SKU', 'Produto', 'Qtd. Vendida (Total)', 'Receita Bruta', '% Participação']],
        body: payload.stats.ranking.slice(0, 30).map((item: any) => [
            item.code,
            item.name,
            item.qty, // Quantidade Total Vendida
            fmt(item.revenue),
            `${((item.revenue / (payload.stats.gross || 1)) * 100).toFixed(1)}%`
        ]),
        theme: 'grid',
        styles: { fontSize: 8 }
    });

    // 4. Insumos Consumidos
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('4. Insumos Necessários para esta Produção', 14, (doc as any).lastAutoTable.finalY + 15);
    
    autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 20,
        head: [['Material', 'Quantidade Estimada', 'Unidade']],
        body: payload.materialList.map(m => [m.name, m.quantity.toFixed(3), m.unit]),
        theme: 'striped',
        headStyles: { fillColor: '#3b82f6' }
    });

    doc.save(`financeiro_detalhado_${payload.canal}_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportProductionPlanToPdf = (planItems: ProductionPlanItem[], params: PlanningParameters) => {
    const doc = new jsPDF();
    const title = `Plano de Produção - ${new Date().toLocaleDateString('pt-BR')}`;
    doc.text(title, 14, 15);
    const head = [['Produto', 'Estoque Atual', 'Venda Média/dia', 'Demanda Projetada', 'Produção Necessária', 'Motivo']];
    const body = planItems.filter(item => item.requiredProduction > 0).map(item => [
        item.product.name,
        item.product.current_qty,
        item.avgDailySales.toFixed(2),
        Math.ceil(item.forecastedDemand),
        item.requiredProduction,
        item.reason
    ]);
    autoTable(doc, { head, body, startY: 60, headStyles: headerStyles });
    doc.save(`plano_de_producao_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const exportExcel = (data: ProcessedData, skuLinks: SkuLink[]) => {
    const wb = XLSX.utils.book_new();
    const linkedSkusMap = new Map(skuLinks.map(link => [link.importedSku, link.masterProductSku]));
    const completaData = data.lists.completa.map(o => ({
        'Status Vínculo': linkedSkusMap.has(o.sku) ? 'Vinculado' : 'PENDENTE',
        'Pedido': o.orderId,
        'Rastreio': o.tracking,
        'SKU Importado': o.sku,
        'SKU Mestre': linkedSkusMap.get(o.sku) || '',
        'Qtd Original': o.qty_original,
        'Multiplicador': o.multiplicador,
        'Qtd Final': o.qty_final,
        'Cor': o.color,
        'Canal': o.canal,
    }));
    const wsCompleta = XLSX.utils.json_to_sheet(completaData);
    XLSX.utils.book_append_sheet(wb, wsCompleta, 'Lista Completa');
    XLSX.writeFile(wb, `importacao_${data.canal}_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const exportOnlyUnlinked = (data: ProcessedData, skuLinks: SkuLink[]) => {
    const wb = XLSX.utils.book_new();
    const linkedSkusMap = new Map(skuLinks.map(link => [link.importedSku.toUpperCase(), link.masterProductSku]));
    const naoVinculadosData = data.skusNaoVinculados
        .filter(s => !linkedSkusMap.has(s.sku.toUpperCase()))
        .map(s => ({ 'SKU_Pendente': s.sku, 'Cor_Sugerida': s.colorSugerida }));
    if (naoVinculadosData.length > 0) {
        const ws = XLSX.utils.json_to_sheet(naoVinculadosData);
        XLSX.utils.book_append_sheet(wb, ws, 'SKUs Pendentes');
        XLSX.writeFile(wb, `skus_pendentes_${data.canal}_${new Date().toISOString().split('T')[0]}.xlsx`);
    } else {
        alert('Não há SKUs pendentes para exportar.');
    }
};

export const exportStateToSql = (state: any, setupSql: string) => {
    const json = JSON.stringify(state, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `backup_erp_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
};
