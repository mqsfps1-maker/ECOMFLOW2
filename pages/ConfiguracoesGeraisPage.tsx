
import React, { useState, ReactNode, useMemo } from 'react';
import { GeneralSettings, User, ToastMessage, StockItem, ExpeditionRule, UserRole, UserSetor, ColumnMapping } from '../types';
import { ArrowLeft, Database, Save, AlertTriangle, RefreshCw, Truck, Download, Plus, Trash2, Settings2, FileSpreadsheet, DollarSign, Package, Users, UserPlus, Mail, KeyRound, Loader2, Edit3, UploadCloud, CheckSquare, Square, QrCode, Building, Terminal, History, Calendar, Filter, Info, Globe } from 'lucide-react';
import * as XLSX from 'xlsx';
import { syncDatabase } from '../lib/supabaseClient';
import ConfirmDbResetModal from '../components/ConfirmDbResetModal';
import ConfirmClearHistoryModal from '../components/ConfirmClearHistoryModal';

interface ConfiguracoesGeraisPageProps {
    setCurrentPage: (page: string) => void;
    generalSettings: GeneralSettings;
    onSaveGeneralSettings: (settings: GeneralSettings) => void;
    currentUser: User | null;
    onBackupData: () => void;
    onResetDatabase: (adminPassword: string) => Promise<{ success: boolean; message?: string }>;
    onClearScanHistory: (adminPassword: string) => Promise<{ success: boolean; message?: string }>;
    addToast: (message: string, type: ToastMessage['type']) => void;
    stockItems: StockItem[];
    users: User[];
}

export const ConfiguracoesGeraisPage: React.FC<ConfiguracoesGeraisPageProps> = (props) => {
    const { setCurrentPage, generalSettings, onSaveGeneralSettings, addToast, stockItems, users, onBackupData, onResetDatabase, onClearScanHistory } = props;
    const [settings, setSettings] = useState<GeneralSettings>(generalSettings);
    const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
    const [sampleData, setSampleData] = useState<any[]>([]); // Armazena dados da planilha para extração de valores únicos
    
    const [isResetModalOpen, setIsResetModalOpen] = useState(false);
    const [isClearHistoryModalOpen, setIsClearHistoryModalOpen] = useState(false);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        
        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            
            const isML = file.name.toLowerCase().includes('vendas') || file.name.toLowerCase().includes('mercado');
            const startRow = isML ? 5 : 0;

            // Extrai cabeçalhos
            const headers = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, range: startRow })[0] || [];
            setDetectedHeaders(headers);

            // Extrai dados (limitado a 1000 linhas para performance)
            const data = XLSX.utils.sheet_to_json(sheet, { range: startRow });
            setSampleData(data.slice(0, 1000));

            addToast(`${headers.length} colunas detectadas. Configure os filtros abaixo.`, 'info');
        } catch (error) {
            addToast('Erro ao ler planilha.', 'error');
        }
    };

    const updateMapping = (canal: 'ml' | 'shopee' | 'site', field: keyof ColumnMapping, value: any) => {
        setSettings(prev => ({
            ...prev,
            importer: {
                ...prev.importer,
                [canal]: { ...prev.importer[canal], [field]: value }
            }
        }));
    };

    const toggleStatusValue = (canal: 'ml' | 'shopee' | 'site', value: string) => {
        setSettings(prev => {
            const currentValues = prev.importer[canal].acceptedStatusValues || [];
            // Normaliza para comparação e armazenamento
            const valueTrimmed = value.trim();
            
            const newValues = currentValues.includes(valueTrimmed)
                ? currentValues.filter(v => v !== valueTrimmed)
                : [...currentValues, valueTrimmed];

            return {
                ...prev,
                importer: {
                    ...prev.importer,
                    [canal]: { ...prev.importer[canal], acceptedStatusValues: newValues }
                }
            };
        });
    };

    const toggleFeeColumn = (canal: 'ml' | 'shopee' | 'site', header: string) => {
        setSettings(prev => {
            const currentFees = prev.importer[canal].fees || [];
            const newFees = currentFees.includes(header) 
                ? currentFees.filter(f => f !== header) 
                : [...currentFees, header];
            
            return { 
                ...prev, 
                importer: { 
                    ...prev.importer, 
                    [canal]: { ...prev.importer[canal], fees: newFees } 
                } 
            };
        });
    };

    const Section: React.FC<{title: string, icon: ReactNode, children: ReactNode}> = ({title, icon, children}) => (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm mb-8">
            <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3 uppercase tracking-tighter">{icon} {title}</h2>
            {children}
        </div>
    );

    const MapRow = ({ label, field, canal }: { label: string, field: keyof ColumnMapping, canal: 'ml' | 'shopee' | 'site' }) => (
        <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-gray-400 uppercase">{label}</label>
            <select 
                value={settings.importer[canal][field] as string} 
                onChange={e => updateMapping(canal, field, e.target.value)}
                className="p-2 border rounded-xl text-xs bg-gray-50 focus:ring-2 focus:ring-blue-500 font-bold"
            >
                <option value="">-- Selecione --</option>
                {detectedHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                {settings.importer[canal][field] && !detectedHeaders.includes(settings.importer[canal][field] as string) && (
                    <option value={settings.importer[canal][field] as string}>{settings.importer[canal][field] as string} (Salvo)</option>
                )}
            </select>
        </div>
    );

    const FeeSelector = ({ canal }: { canal: 'ml' | 'shopee' | 'site' }) => (
        <div className="mt-4">
            <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block">Taxas e Descontos a Abater (Múltiplos)</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-3 border rounded-2xl bg-slate-50 border-slate-100">
                {detectedHeaders.length > 0 ? detectedHeaders.map(h => (
                    <button 
                        key={h} 
                        onClick={() => toggleFeeColumn(canal, h)} 
                        className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left ${settings.importer[canal].fees?.includes(h) ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}
                    >
                        <div className="flex-shrink-0">
                            {settings.importer[canal].fees?.includes(h) ? <CheckSquare size={18}/> : <Square size={18} className="text-slate-300"/>}
                        </div>
                        <span className="text-[11px] font-bold uppercase truncate">{h}</span>
                    </button>
                )) : (
                    <div className="col-span-full py-6 text-center">
                        <p className="text-xs text-slate-400 font-medium uppercase italic">Suba uma planilha de exemplo para listar as colunas de taxas.</p>
                    </div>
                )}
            </div>
        </div>
    );

    const StatusFilterSettings = ({ canal }: { canal: 'ml' | 'shopee' | 'site' }) => {
        const statusCol = settings.importer[canal].statusColumn;
        const savedValues = settings.importer[canal].acceptedStatusValues || [];

        // Calcula valores únicos encontrados na planilha para a coluna selecionada
        const uniqueValuesInFile = useMemo(() => {
            if (!statusCol || sampleData.length === 0) return [];
            const values = new Set<string>();
            sampleData.forEach(row => {
                const val = row[statusCol];
                if (val) values.add(String(val).trim());
            });
            return Array.from(values).sort();
        }, [statusCol, sampleData]);

        // Combina valores salvos (para não perder o que já foi configurado) com os encontrados no arquivo
        const allDisplayValues = Array.from(new Set([...savedValues, ...uniqueValuesInFile])).sort();

        return (
            <div className="mt-6 p-4 bg-purple-50 rounded-2xl border border-purple-100">
                <h4 className="text-xs font-black text-purple-800 uppercase mb-3 flex items-center gap-2">
                    <Filter size={14}/> Filtro de Validação de Venda
                </h4>
                <div className="space-y-4">
                    <MapRow label="Coluna de Status na Planilha" field="statusColumn" canal={canal} />
                    
                    {statusCol ? (
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block">Selecione os Status Válidos (Venda Concluída)</label>
                            {allDisplayValues.length > 0 ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto bg-white p-2 rounded-xl border border-purple-100">
                                    {allDisplayValues.map(val => (
                                        <button 
                                            key={val} 
                                            onClick={() => toggleStatusValue(canal, val)}
                                            className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-all ${savedValues.includes(val) ? 'bg-purple-600 border-purple-600 text-white' : 'bg-gray-50 border-gray-100 text-gray-600 hover:bg-gray-100'}`}
                                        >
                                            {savedValues.includes(val) ? <CheckSquare size={16}/> : <Square size={16}/>}
                                            <span className="text-xs font-bold truncate">{val}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="p-4 bg-white rounded-xl border border-dashed border-gray-300 text-center">
                                    <p className="text-xs text-gray-400 italic">Nenhum valor encontrado nesta coluna na planilha de exemplo. <br/>Suba uma planilha acima para carregar as opções.</p>
                                </div>
                            )}
                            <p className="text-[9px] text-purple-600 mt-2 font-medium flex items-center gap-1">
                                <Info size={12}/> Apenas linhas com os status marcados serão contabilizadas no financeiro. O restante será considerado cancelado ou devolvido.
                            </p>
                        </div>
                    ) : (
                        <p className="text-xs text-gray-400 italic">Selecione a coluna de status acima para configurar os valores.</p>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="max-w-6xl mx-auto pb-32">
            <div className="flex items-center gap-4 mb-8">
                <button onClick={() => setCurrentPage('configuracoes')} className="p-3 bg-white border rounded-2xl shadow-sm hover:bg-gray-50"><ArrowLeft size={24}/></button>
                <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Painel de Administração Global</h1>
            </div>

            <Section title="Preferências do Sistema" icon={<Settings2 className="text-purple-500" />}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="text-xs font-black text-gray-500 uppercase mb-2 block flex items-center gap-2"><Calendar size={16}/> Fonte de Data Padrão</label>
                        <p className="text-[10px] text-gray-400 mb-3 leading-relaxed">Define qual data será usada para filtros em Pedidos, Financeiro e Dashboard.</p>
                        <div className="flex bg-slate-100 p-1 rounded-xl">
                            <button 
                                onClick={() => setSettings(s => ({ ...s, dateSource: 'sale_date' }))}
                                className={`flex-1 py-3 rounded-lg text-xs font-black uppercase transition-all ${settings.dateSource === 'sale_date' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                Data da Venda (Planilha)
                            </button>
                            <button 
                                onClick={() => setSettings(s => ({ ...s, dateSource: 'import_date' }))}
                                className={`flex-1 py-3 rounded-lg text-xs font-black uppercase transition-all ${settings.dateSource === 'import_date' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                            >
                                Data de Importação (Sistema)
                            </button>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-black text-gray-500 uppercase mb-2 block flex items-center gap-2"><DollarSign size={16}/> Comportamento de Taxas</label>
                        <label className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl cursor-pointer border hover:bg-slate-100 transition-all">
                            <div className="pt-0.5">
                                <input 
                                    type="checkbox" 
                                    checked={settings.isRepeatedValue || false} 
                                    onChange={(e) => setSettings(s => ({ ...s, isRepeatedValue: e.target.checked }))}
                                    className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                            </div>
                            <div>
                                <span className="font-bold text-slate-800 text-sm">Valores de Frete/Taxas se repetem nas linhas?</span>
                                <p className="text-[10px] text-slate-500 mt-1 leading-snug">
                                    Se marcado, o sistema entenderá que em pedidos com múltiplos itens, o valor da taxa e frete na planilha é o <strong>total do pedido</strong> repetido em cada linha, e descontará apenas uma vez.
                                    <br/><strong className="text-orange-600">Recomendado para Shopee.</strong>
                                </p>
                            </div>
                        </label>
                    </div>
                </div>
            </Section>

            <Section title="Mapeamento de Planilhas" icon={<FileSpreadsheet className="text-emerald-500" />}>
                <div className="p-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 mb-8 text-center">
                    <input type="file" id="sample-upload" className="hidden" onChange={handleFileUpload} />
                    <label htmlFor="sample-upload" className="cursor-pointer flex flex-col items-center gap-2">
                        <UploadCloud size={48} className="text-slate-400" />
                        <p className="font-black text-slate-700 uppercase">Subir Planilha de Exemplo (ML ou Shopee)</p>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Para extrair e selecionar as colunas e status dinamicamente</p>
                    </label>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Mercado Livre */}
                    <div className="space-y-6">
                        <h3 className="font-black text-yellow-600 uppercase text-sm border-b pb-2 flex items-center gap-2">
                            <span className="w-3 h-3 bg-yellow-400 rounded-full"></span> Mercado Livre
                        </h3>
                        <div className="grid grid-cols-1 gap-4">
                            <MapRow label="ID Pedido" field="orderId" canal="ml" />
                            <MapRow label="SKU" field="sku" canal="ml" />
                            <MapRow label="Quantidade" field="qty" canal="ml" />
                            <MapRow label="Rastreio" field="tracking" canal="ml" />
                            <MapRow label="Data da Venda" field="date" canal="ml" />
                            <MapRow label="Prev. Envio" field="dateShipping" canal="ml" />
                            <MapRow label="Valor Acordado (Produto)" field="priceGross" canal="ml" />
                            <MapRow label="Valor Total (Bruto)" field="totalValue" canal="ml" />
                            <MapRow label="Nome Cliente" field="customerName" canal="ml" />
                            <MapRow label="Frete Pago pelo Cliente" field="shippingPaidByCustomer" canal="ml" />
                            <MapRow label="Custo de Envio (Saída)" field="shippingFee" canal="ml" />
                        </div>
                        <FeeSelector canal="ml" />
                        <StatusFilterSettings canal="ml" />
                    </div>

                    {/* Shopee */}
                    <div className="space-y-6">
                        <h3 className="font-black text-orange-600 uppercase text-sm border-b pb-2 flex items-center gap-2">
                            <span className="w-3 h-3 bg-orange-500 rounded-full"></span> Shopee
                        </h3>
                        <div className="grid grid-cols-1 gap-4">
                            <MapRow label="ID Pedido" field="orderId" canal="shopee" />
                            <MapRow label="SKU" field="sku" canal="shopee" />
                            <MapRow label="Quantidade" field="qty" canal="shopee" />
                            <MapRow label="Rastreio" field="tracking" canal="shopee" />
                            <MapRow label="Data da Venda" field="date" canal="shopee" />
                            <MapRow label="Prev. Envio" field="dateShipping" canal="shopee" />
                            <MapRow label="Valor Acordado (Produto)" field="priceGross" canal="shopee" />
                            <MapRow label="Valor Total (Bruto)" field="totalValue" canal="shopee" />
                            <MapRow label="Nome Cliente" field="customerName" canal="shopee" />
                            <MapRow label="Frete Pago pelo Cliente" field="shippingPaidByCustomer" canal="shopee" />
                            <MapRow label="Custo de Envio (Saída)" field="shippingFee" canal="shopee" />
                        </div>
                        <FeeSelector canal="shopee" />
                        <StatusFilterSettings canal="shopee" />
                    </div>

                    {/* Site / Outros */}
                    <div className="space-y-6">
                        <h3 className="font-black text-blue-600 uppercase text-sm border-b pb-2 flex items-center gap-2">
                            <Globe size={14} className="text-blue-500" /> Site / Outros
                        </h3>
                        <div className="grid grid-cols-1 gap-4">
                            <MapRow label="ID Pedido" field="orderId" canal="site" />
                            <MapRow label="SKU" field="sku" canal="site" />
                            <MapRow label="Quantidade" field="qty" canal="site" />
                            <MapRow label="Rastreio" field="tracking" canal="site" />
                            <MapRow label="Data da Venda" field="date" canal="site" />
                            <MapRow label="Prev. Envio" field="dateShipping" canal="site" />
                            <MapRow label="Valor Acordado (Produto)" field="priceGross" canal="site" />
                            <MapRow label="Valor Total (Bruto)" field="totalValue" canal="site" />
                            <MapRow label="Nome Cliente" field="customerName" canal="site" />
                            <MapRow label="Frete Pago pelo Cliente" field="shippingPaidByCustomer" canal="site" />
                            <MapRow label="Custo de Envio (Saída)" field="shippingFee" canal="site" />
                        </div>
                        <FeeSelector canal="site" />
                        <StatusFilterSettings canal="site" />
                    </div>
                </div>
            </Section>

            <Section title="Manutenção do Banco de Dados" icon={<Terminal className="text-slate-800" />}>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <button onClick={async () => { addToast('Sincronizando...', 'info'); await syncDatabase(); addToast('Sincronização concluída.', 'success'); }} className="flex flex-col items-center justify-center p-6 bg-blue-50 border border-blue-200 rounded-2xl hover:bg-blue-100 transition-all gap-2 group">
                        <RefreshCw className="text-blue-600 group-hover:rotate-180 transition-transform duration-700" size={32}/>
                        <span className="font-black text-blue-900 text-[10px] uppercase">Sincronizar Banco</span>
                    </button>
                    <button onClick={onBackupData} className="flex flex-col items-center justify-center p-6 bg-emerald-50 border border-emerald-200 rounded-2xl hover:bg-emerald-100 transition-all gap-2 group">
                        <Download className="text-emerald-600 group-hover:translate-y-1 transition-transform" size={32}/>
                        <span className="font-black text-emerald-900 text-[10px] uppercase">Backup SQL</span>
                    </button>
                    <button onClick={() => setIsClearHistoryModalOpen(true)} className="flex flex-col items-center justify-center p-6 bg-orange-50 border border-orange-200 rounded-2xl hover:bg-orange-100 transition-all gap-2 group">
                        <History size={32} className="text-orange-600"/>
                        <span className="font-black text-orange-900 text-[10px] uppercase">Limpar Bipagens</span>
                    </button>
                    <button onClick={() => setIsResetModalOpen(true)} className="flex flex-col items-center justify-center p-6 bg-red-50 border border-red-200 rounded-2xl hover:bg-red-100 transition-all gap-2 group">
                        <AlertTriangle className="text-red-600" size={32}/>
                        <span className="font-black text-red-900 text-[10px] uppercase">Reset de Fábrica</span>
                    </button>
                </div>
            </Section>

            <div className="fixed bottom-8 right-8 z-50">
                <button onClick={() => onSaveGeneralSettings(settings)} className="bg-blue-600 text-white px-12 py-5 rounded-2xl font-black text-xl shadow-2xl shadow-blue-200 hover:scale-105 active:scale-95 transition-all flex items-center gap-3">
                    <Save size={28}/> SALVAR TUDO
                </button>
            </div>

            <ConfirmDbResetModal isOpen={isResetModalOpen} onClose={() => setIsResetModalOpen(false)} onConfirmReset={onResetDatabase} />
            <ConfirmClearHistoryModal isOpen={isClearHistoryModalOpen} onClose={() => setIsClearHistoryModalOpen(false)} onConfirmClear={onClearScanHistory} />
        </div>
    );
};
